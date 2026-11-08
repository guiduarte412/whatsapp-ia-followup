const crypto = require('crypto');
const express = require('express');
const { getLeadFlexivel, upsertLead, appendConversa, getPausado, getConfig, getWhatsappPorId, numeroEstaBloqueado, bloquearNumero } = require('../db/store');
const { avisarConsultor, enviarMensagem, formatarAvisoLead, foiEnviadaPorNos, escolhaDoLead } = require('../services/whatsapp');
const { responderConversa } = require('../services/claude');
const { extrairTexto } = require('../services/media');
const { pediuParaParar, respostaDeDespedida } = require('../services/optout');

const router = express.Router();

// O teto de respostas automaticas seguidas vem da tela de Configuracoes.
// E uma trava de seguranca: garante que uma conversa real nao fica
// indefinidamente so com a IA, mesmo que ela ache que da pra continuar.

function normalizarTelefone(valor) {
  return (valor || '').toString().replace(/\D/g, '');
}

// Quanto esperar antes de responder, pra juntar as mensagens que o lead
// manda em sequencia. 12s cobre o caso comum (digitar a frase seguinte) sem
// deixar a pessoa olhando pro vazio - no WhatsApp, responder depois de 10 ou
// 15 segundos e normal; responder em 1 segundo e que denuncia robo.
const SEGUNDOS_PARA_JUNTAR_MENSAGENS = Number(process.env.SEGUNDOS_PARA_JUNTAR_MENSAGENS || 12);

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function normalizarTexto(valor) {
  return (valor || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

// O que a IA foi descobrindo sobre o lead ao longo da conversa (que bem ele
// quer, pra quando, se aceita a incerteza da contemplacao).
//
// Mescla campo a campo, so preenchendo o que ainda estava vazio ou o que
// veio novo - nunca apaga com null. Sem isso, a resposta em que a IA so
// confirma o prazo zeraria o bem que o lead informou la atras, e voce
// receberia o aviso sem a informacao que ja tinha sido conquistada.
function mesclarQualificacao(anterior, nova) {
  if (!nova) return anterior || null;
  const base = anterior || {};
  return {
    bem: nova.bem || base.bem || null,
    prazo: nova.prazo || base.prazo || null,
    aceitaIncerteza: nova.aceitaIncerteza !== null && nova.aceitaIncerteza !== undefined
      ? nova.aceitaIncerteza
      : (base.aceitaIncerteza ?? null),
  };
}

// Versao legivel da qualificacao, pro aviso que chega no seu WhatsApp. Com
// isso voce chega na ligacao sabendo com quem vai falar, em vez de so
// receber "lead quer falar com voce". Devolve string vazia quando nao ha
// nada descoberto, pra nao poluir o aviso com rotulo sem conteudo.
function textoQualificacao(qualificacao) {
  if (!qualificacao) return '';
  const linhas = [];
  if (qualificacao.bem) linhas.push(`Interesse: ${qualificacao.bem}`);
  if (qualificacao.prazo) linhas.push(`Prazo: ${qualificacao.prazo}`);
  if (qualificacao.aceitaIncerteza === true) linhas.push('Entende que a contemplação não tem prazo certo: sim');
  if (qualificacao.aceitaIncerteza === false) linhas.push('Entende que a contemplação não tem prazo certo: ainda não aceitou bem');
  return linhas.length ? `\n\n${linhas.join('\n')}` : '';
}

// Configure essa URL como "webhook de mensagens recebidas" no painel da Z-API.
// O formato exato do payload pode variar por versao da Z-API - confira a
// documentacao atual e ajuste os campos abaixo se necessario.
//
// Com mais de um numero conectado, CADA instancia da Z-API aponta pra sua
// propria URL (/webhooks/whatsapp/wa-1, /webhooks/whatsapp/wa-2, ...). E
// assim que o sistema sabe por qual numero a resposta chegou, sem depender
// do formato do payload. A URL sem apelido continua valendo pra quem tem um
// numero so.
// Esta rota fica FORA da protecao de sessao (a Z-API nao tem como mandar
// token), entao quem descobrir a URL consegue injetar mensagem falsa no
// historico de um lead, fazer a IA responder gastando credito ou encerrar
// atendimento. Defina ZAPI_WEBHOOK_SEGREDO no Railway e acrescente
// "?segredo=<valor>" na URL que voce cola na Z-API pra fechar essa porta.
// Sem a variavel definida, nada muda - quem ja esta rodando continua
// funcionando sem precisar reconfigurar nada com pressa.
// Registra o "nao me manda mais mensagem": bloqueia o numero pra sempre,
// encerra o atendimento e avisa voce. O bloqueio gruda no numero, entao
// reimportar a planilha depois nao traz a pessoa de volta.
//
// "despedida" e a mensagem de confirmacao. Quando o pedido veio pelo texto,
// o proprio sistema escreve; quando quem percebeu foi a IA, ela ja
// respondeu e nao se manda nada a mais - ninguem que pediu pra parar quer
// receber duas mensagens por causa disso.
async function registrarDescadastro({ lead, telefone, textoRecebido, conexao, despedida }) {
  bloquearNumero(telefone, { motivo: textoRecebido, origem: 'pedido_do_lead' });
  upsertLead(telefone, { status: 'encerrado', motivoEncerramento: 'optout' });

  if (despedida) {
    try {
      await enviarMensagem(telefone, despedida, conexao);
      appendConversa(telefone, { de: 'ia', texto: despedida });
    } catch (erro) {
      console.error(`Nao consegui mandar a confirmacao de descadastro pra ${telefone}:`, erro.message);
    }
  }

  console.log(`Lead ${telefone} pediu pra parar de receber - numero bloqueado.`);

  await avisarConsultor(formatarAvisoLead({
    nome: lead.nome,
    telefone,
    contexto: `Pediu pra não receber mais mensagens: "${textoRecebido}"\n`
      + 'Bloqueei esse número: ele não entra mais na esteira nem se voltar numa planilha. '
      + 'Se a pessoa mudar de ideia, dá pra liberar em Configurações > Bloqueios.',
  }), conexao).catch(() => {});
}

// --- Evento repetido da Z-API ---
//
// A Z-API reenvia o mesmo evento quando nao recebe o 200 dela em tempo - e
// este handler segura a resposta DE PROPOSITO (o debounce espera o lead
// terminar de digitar, 12s por padrao). Ou seja: a retentativa aqui nao e
// excecao, e o comportamento esperado do provedor.
//
// Sem esta trava, o mesmo messageId era processado duas vezes e o resultado
// media exatamente o que a trava de respostas existe pra evitar:
//   - duas respostas pro lead pela mesma mensagem dele;
//   - a mensagem dele duplicada no historico que a IA le depois;
//   - no caso simultaneo, as duas chamadas leem respostasAutomaticas ANTES
//     de qualquer uma gravar, entao saem duas mensagens e o contador sobe
//     so uma - o teto de 5 respostas passa a valer menos do que diz.
//
// Sao duas travas, uma em cima da outra:
//   - esta, em memoria: pega o reenvio de qualquer numero (ate de fora da
//     base) e o evento SEM id;
//   - a do lead (eventoJaVistoNoLead, mais abaixo): grava o messageId no
//     proprio lead, no db.json, e por isso sobrevive a deploy/reinicio e
//     nao tem prazo de validade.
const eventosVistos = new Map(); // chave -> { quando, janela }
const JANELA_EVENTO_MS = 10 * 60 * 1000;

// Evento sem id (webhook antigo): a "impressao digital" e o payload inteiro.
// Um reenvio da Z-API e byte a byte igual ao original; duas mensagens de
// verdade quase sempre diferem em algum campo (horario, por exemplo). A
// janela e curta de proposito: o reenvio chega em segundos (o handler segura
// a resposta pelo debounce), e uma janela longa arriscaria engolir um "sim"
// legitimo repetido muito depois.
const JANELA_SEM_ID_MS = 2 * 60 * 1000;

function chaveDoEvento(payload) {
  const id = payload?.messageId || payload?.id;
  if (id) return { chave: `id:${id}`, janela: JANELA_EVENTO_MS };
  const impressao = crypto.createHash('sha1').update(JSON.stringify(payload || {})).digest('hex');
  return { chave: `sem-id:${impressao}`, janela: JANELA_SEM_ID_MS };
}

function eventoJaProcessado(payload) {
  const { chave, janela } = chaveDoEvento(payload);

  const agora = Date.now();
  for (const [outra, registro] of eventosVistos) {
    if (agora - registro.quando > registro.janela) eventosVistos.delete(outra);
  }

  if (eventosVistos.has(chave)) return true;
  // Marca ANTES de qualquer await: no reenvio simultaneo as duas chamadas
  // chegam juntas, e uma marcacao feita depois de esperar nao pegaria a
  // outra.
  eventosVistos.set(chave, { quando: agora, janela });
  return false;
}

// Trava persistente: os ultimos messageIds recebidos ficam gravados no
// lead. Sem isso, um deploy do Railway no meio do debounce (ou uma
// retentativa depois dos 10 min da trava em memoria) fazia o mesmo evento
// ser processado de novo: segunda resposta pro lead e a mensagem dele
// duplicada no historico. So vale pra evento COM id - a impressao digital do
// evento sem id nao pode ficar gravada pra sempre.
const MAX_EVENTOS_POR_LEAD = 100;

function eventoJaVistoNoLead(lead, payload) {
  const id = payload?.messageId || payload?.id;
  if (!id) return false;
  const vistos = Array.isArray(lead.eventosRecebidos) ? lead.eventosRecebidos : [];
  if (vistos.includes(String(id))) return true;
  // Sincrono (load + save), entao tambem acontece antes de qualquer await.
  upsertLead(lead.phone, { eventosRecebidos: [...vistos, String(id)].slice(-MAX_EVENTOS_POR_LEAD) });
  return false;
}

// O handler espera o debounce e depois a Claude - sao segundos em que voce
// pode encerrar a conversa no painel, apertar "Pausar" ou bloquear o numero.
// Sem reconferir, a IA respondia mesmo assim e ainda gravava "conversa_ia"
// por cima do "encerrado". Devolve o motivo pra NAO responder, ou null.
function motivoParaNaoResponder(telefone) {
  const atual = getLeadFlexivel(telefone);
  if (!atual) return 'lead removido';
  if (getPausado()) return 'sistema pausado';
  if (numeroEstaBloqueado(atual.phone)) return 'numero bloqueado';
  if (atual.status === 'human_handoff' || atual.status === 'encerrado') return `status ${atual.status}`;
  return null;
}

function segredoConfere(req) {
  const esperado = process.env.ZAPI_WEBHOOK_SEGREDO;
  if (!esperado) return true;
  return req.query?.segredo === esperado || req.headers['x-webhook-segredo'] === esperado;
}

router.post(['/whatsapp', '/whatsapp/:whatsappId'], express.json(), async (req, res) => {
  if (!segredoConfere(req)) {
    console.warn('Webhook recusado: segredo ausente ou incorreto.');
    return res.status(401).json({ erro: 'nao autorizado' });
  }

  const payload = req.body;

  // Log do payload cru - se algo nao bater, da pra ver o formato real nos
  // logs do Railway (Deployments -> View Logs) e ajustar os campos abaixo.
  console.log('Webhook WhatsApp recebido:', JSON.stringify(payload));

  // A Z-API manda mais coisa nessa mesma URL do que mensagem de lead:
  // confirmacao de entrega, "visto por", status da conexao. Esses avisos
  // tambem trazem "phone", entao sem esse filtro eles entravam como se
  // fossem mensagem, a IA respondia a um evento que ninguem escreveu e
  // ainda gastava credito. So o callback de mensagem recebida segue adiante;
  // se o campo nao vier (formato antigo), mantem o comportamento de antes.
  if (payload?.type && payload.type !== 'ReceivedCallback') {
    return res.status(200).json({ ok: true, ignorado: payload.type });
  }

  // Reenvio do mesmo evento: responde 200 (senao a Z-API reenvia de novo) e
  // nao processa nada. Vem depois do filtro de tipo de proposito, pra
  // confirmacao de entrega nao ocupar a lista.
  if (eventoJaProcessado(payload)) {
    console.log('Evento repetido da Z-API ignorado (messageId ja processado).');
    return res.status(200).json({ ok: true, repetido: true });
  }

  const telefoneRecebido = normalizarTelefone(payload?.phone || payload?.from);
  if (!telefoneRecebido) return res.status(400).json({ erro: 'telefone nao encontrado no payload' });

  const lead = getLeadFlexivel(telefoneRecebido);
  if (!lead) {
    console.log(`Nenhum lead encontrado pro telefone ${telefoneRecebido} - mensagem ignorada.`);
    return res.status(200).json({ ok: true }); // mensagem de numero fora do fluxo, ignora
  }

  const telefoneLead = lead.phone;

  if (eventoJaVistoNoLead(lead, payload)) {
    console.log(`Evento repetido da Z-API ignorado (messageId ja gravado no lead ${telefoneLead}).`);
    return res.status(200).json({ ok: true, repetido: true });
  }

  // Responde SEMPRE pelo numero que recebeu a mensagem - e o numero que a
  // pessoa esta vendo na tela dela. So se a URL nao disser qual e (webhook
  // antigo, sem apelido) e que cai no numero que foi fixado no lead.
  const conexao = getWhatsappPorId(req.params.whatsappId) || getWhatsappPorId(lead.whatsappId);

  // Botao de emergencia ligado: registra a mensagem do lead pra nao perder
  // nada, mas nao deixa a IA responder. Voce assume manualmente enquanto
  // estiver pausado.
  if (getPausado()) {
    const textoSimplesPausa = payload?.text?.message || payload?.message || '[mensagem recebida]';
    if (payload?.fromMe !== true) {
      appendConversa(telefoneLead, { de: 'lead', texto: textoSimplesPausa });
      console.log(`Sistema pausado - mensagem do lead ${telefoneLead} registrada sem resposta automatica.`);
    }
    return res.status(200).json({ ok: true, pausado: true });
  }

  // "fromMe: true" quer dizer que a mensagem saiu do proprio numero
  // conectado - tanto faz se foi a IA respondendo automaticamente quanto
  // voce digitando manualmente no seu celular. Melhor esforco pra
  // distinguir: se o texto bate com a ultima mensagem que a propria IA
  // registrou pra esse lead, e so o eco do que ja mandamos - ignora. Se
  // for diferente, e voce escrevendo por fora - encerra o atendimento
  // automatico (voce assumiu). Isso e deteccao por aproximacao; se preferir
  // uma forma garantida, use o botao "Assumir conversa" na pagina do lead.
  // Usa so o texto simples aqui (sem processar midia) - nao vale a pena
  // gastar com leitura de imagem/audio so pra essa comparacao.
  if (payload?.fromMe === true) {
    const textoSimples = payload?.text?.message || payload?.message || '';
    const ultimaDaIA = [...(lead.conversa || [])].reverse().find((m) => m.de === 'ia');
    // Duas checagens, e nao uma: o registro em memoria (feito no instante do
    // envio) pega o eco que chega antes da gravacao no historico; a
    // comparacao com o historico pega o eco de uma mensagem enviada antes do
    // ultimo reinicio, quando esse registro ja se perdeu.
    const ehEcoDaIA = foiEnviadaPorNos(textoSimples)
      || (ultimaDaIA && normalizarTexto(ultimaDaIA.texto) === normalizarTexto(textoSimples));

    // So fecha automaticamente quando da pra comparar com uma mensagem da
    // IA conhecida e ela for diferente. Sem essa mensagem de referencia
    // (ultimaDaIA ausente), e mais seguro nao fechar sozinho do que
    // arriscar fechar por engano.
    if (ultimaDaIA && !ehEcoDaIA && ['sequence_active', 'aguardando_resposta', 'conversa_ia', 'cold_nurture'].includes(lead.status)) {
      appendConversa(telefoneLead, { de: 'ia', texto: textoSimples });
      upsertLead(telefoneLead, { status: 'encerrado', motivoEncerramento: 'assumido_manualmente' });
      console.log(`Lead ${telefoneLead} encerrado - mensagem manual detectada do numero conectado.`);
    }
    return res.status(200).json({ ok: true });
  }

  // Converte o que chegou (texto, imagem, figurinha ou audio) num texto
  // que o resto do sistema ja sabe processar. Protegido por try/catch
  // proprio - um erro aqui nao pode derrubar o processo inteiro.
  let textoRecebido;
  try {
    textoRecebido = await extrairTexto(payload);
  } catch (erro) {
    console.error(`Erro extraindo texto da mensagem do lead ${telefoneLead}:`, erro.message);
    textoRecebido = '[não foi possível processar essa mensagem]';
  }

  // Audio chegou mas ainda nao da pra transcrever (falta configurar a
  // OPENAI_API_KEY no Railway) - avisa direto em vez de deixar a IA
  // "adivinhar" uma resposta sem saber o que foi dito.
  if (textoRecebido === null) {
    try {
      appendConversa(telefoneLead, { de: 'lead', texto: '[áudio recebido - transcrição não configurada ainda]' });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `Lead mandou uma mensagem de voz (${payload?.audio?.seconds || '?'}s), mas a transcrição automática ainda não está configurada (falta OPENAI_API_KEY no Railway). Ouça manualmente pelo WhatsApp por enquanto.`,
      }), conexao);
    } catch (erro) {
      // Se ate o aviso falhar (Z-API fora do ar, etc), so loga - nao pode
      // derrubar o processo por causa de uma promise sem catch.
      console.error(`Erro avisando sobre audio nao transcrito do lead ${telefoneLead}:`, erro.message);
    }
    return res.status(200).json({ ok: true });
  }

  // Numero que ja pediu pra sair e volta a escrever: registra e avisa voce,
  // mas nao responde nada automatico. Se ele quer voltar a conversar, quem
  // decide isso e voce, liberando o numero em Configuracoes > Bloqueios.
  if (numeroEstaBloqueado(telefoneLead)) {
    appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
    await avisarConsultor(formatarAvisoLead({
      nome: lead.nome,
      telefone: telefoneLead,
      contexto: `Mandou mensagem, mas esse número está bloqueado a pedido dele: "${textoRecebido}"\n`
        + 'Não respondi nada automático. Se quiser retomar, libere em Configurações > Bloqueios.',
    }), conexao).catch(() => {});
    return res.status(200).json({ ok: true, bloqueado: true });
  }

  // Respondeu: a esteira acabou pra esse lead, entao a 2a tentativa que
  // estava marcada perde a validade agora. Nao basta o status mudar - o
  // proximoEnvioEm continuaria gravado, e ai o cartao no quadro anunciaria
  // uma "2a msg" que nunca vai sair. Pior: se a 2a tentativa for desligada e
  // religada depois, todo lead com data velha pendurada viraria elegivel de
  // uma vez e a fila inteira dispararia junta.
  //
  // Vale tambem pra quem escreve ANTES da abertura sair: se a pessoa ja
  // puxou conversa, mandar a mensagem de abertura depois nao faz sentido.
  if (lead.proximoEnvioEm) upsertLead(telefoneLead, { proximoEnvioEm: null });

  // --- A escolha do lead entre as duas opcoes ---
  //
  // Clicou no botao (ou digitou 1 / 2). Resolvido aqui, antes da IA: quem
  // escolheu sair nao espera um modelo concordar, e quem pediu pra falar com
  // voce quer falar com VOCE - nao com a automacao.
  const escolha = escolhaDoLead(payload, textoRecebido);

  if (escolha === 'parar') {
    appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
    await registrarDescadastro({
      lead,
      telefone: telefoneLead,
      textoRecebido,
      conexao,
      despedida: respostaDeDespedida(lead.nome),
    });
    return res.status(200).json({ ok: true, descadastrado: true });
  }

  if (escolha === 'falar') {
    appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
    // A IA nao entra: a conversa e sua daqui pra frente.
    upsertLead(telefoneLead, { status: 'human_handoff', proximoEnvioEm: null });
    await avisarConsultor(formatarAvisoLead({
      nome: lead.nome,
      telefone: telefoneLead,
      contexto: 'Pediu pra falar com você. A IA não respondeu nada - '
        + 'é só chamar a pessoa no WhatsApp pra continuar daqui.',
    }), conexao).catch(() => {});
    console.log(`Lead ${telefoneLead} escolheu falar com o consultor - passado pra humano.`);
    return res.status(200).json({ ok: true, querFalar: true });
  }

  // Pedido de descadastro escrito com todas as letras. Resolvido aqui, antes
  // da IA: quem pediu pra parar nao precisa esperar um modelo concordar, e
  // nao ha por que gastar credito interpretando "me tira dessa lista".
  if (pediuParaParar(textoRecebido)) {
    appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
    await registrarDescadastro({
      lead,
      telefone: telefoneLead,
      textoRecebido,
      conexao,
      despedida: respostaDeDespedida(lead.nome),
    });
    return res.status(200).json({ ok: true, descadastrado: true });
  }

  try {
    // Se ja esta com humano ou ja foi encerrado, a IA nao interfere mais -
    // so avisa que chegou mensagem nova (exceto se ja encerrado, ai so
    // registra sem incomodar - o atendimento por aqui acabou).
    if (lead.status === 'human_handoff' || lead.status === 'encerrado') {
      appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
      if (lead.status === 'human_handoff') {
        await avisarConsultor(formatarAvisoLead({
          nome: lead.nome,
          telefone: telefoneLead,
          contexto: `Nova mensagem: "${textoRecebido}"`,
        }), conexao);
      }
      return res.status(200).json({ ok: true });
    }

    // Ate responder, o lead fica em 'aguardando_resposta' (mensagem da
    // esteira ja enviada) ou 'sequence_active' (ainda na fila de envio -
    // acontece se ele escrever antes da mensagem sair).
    appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });

    // Espera um pouco antes de responder.
    //
    // No WhatsApp ninguem escreve um paragrafo: manda "bom dia", depois
    // "to querendo trocar o trator", depois "mas queria ver condicao". Sao
    // tres webhooks, e sem esta espera a IA responde tres vezes - gastando
    // 3 das 5 respostas num pensamento so, e soando robotica justamente por
    // ser rapida demais.
    //
    // Como funciona: espera, rele a conversa, e se chegou mensagem nova do
    // lead nesse meio tempo, esta chamada desiste. Quem responde e o webhook
    // da ULTIMA mensagem, que ja enxerga as tres juntas no historico. O
    // ultimo a chegar sempre responde, entao ninguem fica sem resposta.
    await esperar(SEGUNDOS_PARA_JUNTAR_MENSAGENS * 1000);

    const depoisDaEspera = getLeadFlexivel(telefoneLead);
    if (!depoisDaEspera) return res.status(200).json({ ok: true });

    const ultimaDoLead = [...(depoisDaEspera.conversa || [])].reverse().find((m) => m.de === 'lead');
    if (ultimaDoLead && normalizarTexto(ultimaDoLead.texto) !== normalizarTexto(textoRecebido)) {
      console.log(`Lead ${telefoneLead} mandou outra mensagem enquanto eu esperava - deixo a resposta pra ela.`);
      return res.status(200).json({ ok: true, juntadoComAProxima: true });
    }

    const motivoDepoisDaEspera = motivoParaNaoResponder(telefoneLead);
    if (motivoDepoisDaEspera) {
      console.log(`Lead ${telefoneLead}: nao respondo (${motivoDepoisDaEspera}) - mudou enquanto eu esperava.`);
      return res.status(200).json({ ok: true, naoRespondido: motivoDepoisDaEspera });
    }

    const leadAtualizado = depoisDaEspera;
    const respostasAutomaticas = (leadAtualizado.respostasAutomaticas || 0) + 1;
    const maxRespostas = getConfig().maxRespostasAutomaticas;

    if (respostasAutomaticas > maxRespostas) {
      upsertLead(telefoneLead, { status: 'human_handoff' });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `Passou de ${maxRespostas} respostas automáticas seguidas. Assuma a conversa por aqui.`,
      }), conexao);
      return res.status(200).json({ ok: true });
    }

    // A Claude fora do ar (depois das retentativas do claude.js) nao pode
    // virar silencio: antes, o erro caia no catch geral, que so gravava log -
    // o lead ficava sem resposta, parado em "aguardando_resposta", e voce nao
    // sabia. E a retentativa da Z-API nao salvava, porque a trava de evento
    // repetido ja tinha marcado o messageId. Agora a conversa passa pra voce.
    let resultado;
    try {
      resultado = await responderConversa({
        leadNome: leadAtualizado.nome,
        historicoConversa: leadAtualizado.conversa,
        conexao,
      });
    } catch (erroIA) {
      upsertLead(telefoneLead, { status: 'human_handoff', motivoEncerramento: 'falha_da_ia' });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `A IA não conseguiu responder (${erroIA.message}). Nada foi enviado pro lead - assuma a conversa.\nÚltima mensagem do lead: "${textoRecebido}"`,
      }), conexao).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    // A chamada da Claude leva alguns segundos: reconfere antes de mandar.
    const motivoDepoisDaIA = motivoParaNaoResponder(telefoneLead);
    if (motivoDepoisDaIA) {
      console.log(`Lead ${telefoneLead}: resposta da IA descartada (${motivoDepoisDaIA}) - mudou enquanto a IA pensava.`);
      return res.status(200).json({ ok: true, naoRespondido: motivoDepoisDaIA });
    }

    // Manda a resposta pro lead em qualquer um dos casos - a IA sempre
    // deixa uma mensagem educada antes de encaminhar ou encerrar, nunca
    // some sem responder. Usa telefoneRecebido pra enviar (formato que a
    // Z-API acabou de confirmar).
    if (resultado.resposta) {
      try {
        await enviarMensagem(telefoneRecebido, resultado.resposta, conexao);
        appendConversa(telefoneLead, { de: 'ia', texto: resultado.resposta });
      } catch (erroEnvio) {
        // Se nao conseguir mandar a resposta, o lead fica sem retorno - isso
        // e grave o suficiente pra avisar direto, em vez de so registrar log.
        upsertLead(telefoneLead, { status: 'human_handoff', respostasAutomaticas });
        await avisarConsultor(formatarAvisoLead({
          nome: lead.nome,
          telefone: telefoneLead,
          contexto: `A IA tentou responder mas o envio falhou: ${erroEnvio.message}\nAssuma essa conversa manualmente.\nÚltima mensagem do lead: "${textoRecebido}"`,
        }), conexao).catch(() => {});
        return res.status(200).json({ ok: true });
      }
    }

    // A IA entendeu como pedido de saída algo que a checagem por texto não
    // pegou ("prefiro não receber mais contato sobre isso"). A despedida
    // dela já foi enviada acima, então aqui só registra o bloqueio.
    if (resultado.descadastrar) {
      await registrarDescadastro({
        lead,
        telefone: telefoneLead,
        textoRecebido,
        conexao,
        despedida: null,
      });
      return res.status(200).json({ ok: true, descadastrado: true });
    }

    // O que a IA descobriu nesta troca. Mescla com o que ja estava
    // guardado em vez de sobrescrever: se nesta mensagem ela so confirmou o
    // prazo, isso nao pode apagar o bem que o lead informou tres mensagens
    // atras.
    const qualificacao = mesclarQualificacao(lead.qualificacao, resultado.qualificacao);

    if (resultado.horarioConfirmado) {
      // O proprio consultor (a IA falando por ele) ja aprovou um horario -
      // encerra o atendimento automatico e sai da lista de leads ativos.
      upsertLead(telefoneLead, { status: 'encerrado', motivoEncerramento: 'horario_confirmado', respostasAutomaticas, qualificacao });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `Horário confirmado com o lead: ${resultado.resumoParaConsultor || resultado.resposta}`
          + `${textoQualificacao(qualificacao)}\nAtendimento automático encerrado - adicione na sua agenda.`,
      }), conexao);
    } else if (resultado.encaminharHumano) {
      upsertLead(telefoneLead, { status: 'human_handoff', respostasAutomaticas, qualificacao, motivoEncerramento: 'encaminhado_pela_ia' });
      const contexto = resultado.resumoParaConsultor || resultado.motivo || 'a IA identificou que é hora de assumir';
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `${contexto}${textoQualificacao(qualificacao)}\nÚltima mensagem do lead: "${textoRecebido}"`,
      }), conexao);
    } else if (respostasAutomaticas >= maxRespostas) {
      // Gastou todas as respostas sem qualificar nem agendar. Antes isso
      // caia em "conversa_ia" e o lead ficava parado sem ninguem saber:
      // o teto e verificado ANTES de chamar a IA, entao ele nunca mais
      // seria atendido, e tambem nunca aparecia como seu.
      upsertLead(telefoneLead, { status: 'human_handoff', respostasAutomaticas, qualificacao, motivoEncerramento: 'limite_de_respostas' });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `A IA usou as ${maxRespostas} respostas e a conversa não chegou a agendamento.`
          + `${textoQualificacao(qualificacao)}\nÚltima mensagem do lead: "${textoRecebido}"`,
      }), conexao);
    } else {
      upsertLead(telefoneLead, { status: 'conversa_ia', respostasAutomaticas, qualificacao });
    }

    res.status(200).json({ ok: true });
  } catch (erro) {
    // Se algo quebrar no meio do processo (Claude API fora do ar, Z-API
    // rejeitando o envio, etc), loga o erro em vez de deixar cair em
    // silencio - senao voce nunca saberia que a conversa travou.
    console.error(`Erro processando resposta do lead ${telefoneLead}:`, erro.message);
    res.status(200).json({ ok: true }); // responde 200 pra Z-API nao ficar reenviando
  }
});

module.exports = router;
