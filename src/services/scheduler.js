const cron = require('node-cron');
const { getLead, getLeadsParaEnvio, upsertLead, appendConversa, getPausado, getConfig, montarMensagemDeAbertura, montarMensagemDeFollowup, followupEstaAtivo, getWhatsappPorId, numeroEstaBloqueado, contarDestinatariosHoje, diaEmBrasilia } = require('../db/store');
const { enviarMensagemComOpcoes, avisarConsultor, formatarAvisoLead } = require('./whatsapp');

// A esteira tem no maximo DUAS mensagens: a abertura e, pra quem nao
// respondeu, uma segunda tentativa. O texto das duas e sorteado entre as que
// voce cadastrou na tela de Configuracoes - o codigo nao escreve nem inventa
// nada. Se voce cadastrou mais de uma, cada lead recebe uma delas, sorteada;
// isso e de proposito, mandar o texto identico pra centenas de numeros e o
// padrao que o WhatsApp associa a spam.
//
// A 2a tentativa so existe se voce cadastrar mensagens de follow-up. Sem
// elas, o sistema manda uma mensagem e para, como sempre fez.
//
// O objetivo dessas mensagens e abrir a conversa e levar a pessoa a agendar
// com voce. Se ela responder, quem assume dali em diante e a IA de conversa
// (whatsapp-webhook.js), que segue ate marcar o horario. Depois da 2a
// tentativa sem resposta, o sistema para de vez - nao existe 3a.

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function dentroDoHorarioPermitido() {
  // O servidor (Railway) roda em UTC por padrao, nao no horario de Brasilia.
  // Usar getHours() direto pegaria a hora errada - aqui calcula a hora
  // especificamente no fuso do Brasil, nao importa onde o servidor roda.
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date())
  );
  const { inicio, fim } = getConfig().horarios;
  return hora >= Number(inicio) && hora < Number(fim);
}

// Pausa sorteada entre um envio e o proximo. Sem ela, importar uma planilha
// de 200 linhas faria 200 mensagens sairem emendadas assim que o horario
// sorteado de cada uma vencesse - que e exatamente o comportamento que
// derruba numero no WhatsApp.
function sortearIntervaloMs() {
  const { intervaloMinSegundos, intervaloMaxSegundos } = getConfig().horarios;
  const minimo = Math.max(0, Number(intervaloMinSegundos) || 0);
  const maximo = Math.max(minimo, Number(intervaloMaxSegundos) || minimo);
  return (minimo + Math.random() * (maximo - minimo)) * 1000;
}

// Quantas mensagens esse lead pode receber no total: a abertura e, se voce
// cadastrou mensagens de follow-up, mais uma. Nunca mais que isso.
function totalDeTentativas(whatsappId = null) {
  return followupEstaAtivo(whatsappId) ? 2 : 1;
}

// Ja passou a hora sorteada desse lead e ele ainda tem tentativa disponivel?
function estaNaHoraDeEnviar(lead) {
  if ((lead.attemptsSent || 0) >= totalDeTentativas(lead.whatsappId)) return false;
  if (!lead.proximoEnvioEm) return false;
  return Date.now() >= new Date(lead.proximoEnvioEm).getTime();
}

// Quando mandar a 2a tentativa, contando a partir de agora (o instante em
// que a abertura saiu). Sorteado dentro da faixa configurada pelo mesmo
// motivo do atraso inicial: se todo mundo recebesse o follow-up exatamente
// 48h depois, os disparos voltariam a sair em bloco.
function sortearMomentoDoFollowup() {
  const { followupHorasMin, followupHorasMax } = getConfig().horarios;
  const minimo = Math.max(0, Number(followupHorasMin) || 0);
  const maximo = Math.max(minimo, Number(followupHorasMax) || minimo);
  const horas = minimo + Math.random() * (maximo - minimo);
  return new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
}

// A pausa entre envios e POR NUMERO, nao global. Com tres numeros
// cadastrados o sistema manda tres vezes mais rapido no total, sem que
// nenhum deles acelere - que e exatamente o motivo de ter mais de um.
// Guarda o instante do ultimo envio de cada conexao.
const ultimoEnvioPorNumero = new Map();

async function aguardarAVezDoNumero(chave) {
  const anterior = ultimoEnvioPorNumero.get(chave);
  if (anterior) {
    const faltam = anterior + sortearIntervaloMs() - Date.now();
    if (faltam > 0) await esperar(faltam);
  }
  ultimoEnvioPorNumero.set(chave, Date.now());
}

// Envia a mensagem da vez - abertura ou 2a tentativa, conforme o que esse
// lead ja recebeu. Devolve true se a mensagem realmente saiu; e isso que diz
// ao ciclo se vale a pena esperar antes do proximo lead.
// Quem ainda esta esperando a mensagem da esteira (mesma regra do
// getLeadsParaEnvio).
function estaNaFila(lead) {
  return lead.status === 'sequence_active'
    || (lead.status === 'aguardando_resposta' && Boolean(lead.proximoEnvioEm));
}

async function processarLead(leadDaFila) {
  // A fila e lida UMA vez no inicio do ciclo, e o ciclo segura 60-180s entre
  // um envio e outro. Nesse meio tempo o lead pode ter respondido (o webhook
  // tira ele da fila e passa pra conversa_ia), ou voce encerrou no painel.
  // Trabalhar com a foto velha mandava a abertura pra quem ja estava
  // conversando e ainda gravava "aguardando_resposta" por cima do status
  // novo. Por isso rele o lead aqui, na hora de mandar.
  const lead = getLead(leadDaFila.phone);
  if (!lead || !estaNaFila(lead) || !estaNaHoraDeEnviar(lead)) {
    console.log(`Lead ${leadDaFila.phone} saiu da fila durante o ciclo - nada enviado.`);
    return false;
  }

  // O lead pode ter sido bloqueado DEPOIS de entrar na fila - pediu pra
  // parar respondendo a outra conversa, ou voce bloqueou na mao no painel.
  // A mensagem dele ja esta agendada, entao sem essa checagem ela sairia
  // assim mesmo, que e exatamente o que o bloqueio existe pra impedir.
  if (numeroEstaBloqueado(lead.phone)) {
    upsertLead(lead.phone, {
      status: 'encerrado',
      motivoEncerramento: 'optout',
      proximoEnvioEm: null,
    });
    console.log(`Lead ${lead.phone} saiu da esteira sem receber nada - número bloqueado.`);
    return false;
  }

  const conexao = getWhatsappPorId(lead.whatsappId);

  // Qual das duas mensagens e a vez desse lead. Sai pelo MESMO numero que
  // abriu a conversa (lead.whatsappId), senao a 2a tentativa chegaria de um
  // numero diferente do primeiro - do lado de la, duas pessoas cobrando.
  const ehFollowup = (lead.attemptsSent || 0) >= 1;
  const mensagem = ehFollowup
    ? montarMensagemDeFollowup(lead.nome, { whatsappId: lead.whatsappId })
    : montarMensagemDeAbertura(lead.nome, { whatsappId: lead.whatsappId });

  // Nenhuma mensagem cadastrada em Configuracoes. O sistema NAO inventa um
  // texto pra cobrir o buraco - prefere nao mandar nada e avisar voce.
  // So vale pra abertura: pro follow-up, "sem mensagem cadastrada" quer
  // dizer que voce nao quer 2a tentativa, e nao ha nada pra avisar.
  if (!mensagem) {
    if (ehFollowup) {
      upsertLead(lead.phone, { proximoEnvioEm: null });
      return false;
    }
    if (!lead.avisoSemMensagemEnviado) {
      upsertLead(lead.phone, { avisoSemMensagemEnviado: true });
      await avisarConsultor(
        'Tem lead esperando, mas nenhuma mensagem está cadastrada em Configurações > Mensagens.\n' +
        'Enquanto não houver pelo menos uma, nada é enviado.',
        conexao
      ).catch(() => {});
    }
    return false;
  }

  // Vai como texto, com as duas opcoes (parar / falar com voce) escritas no
  // fim pra pessoa responder 1 ou 2. O texto que ela recebeu de fato volta
  // aqui pra entrar no historico certo.
  let enviado;
  try {
    enviado = await enviarMensagemComOpcoes(lead.phone, mensagem, conexao);
  } catch (erro) {
    // Nao deixa a falha passar em silencio esperando o proximo ciclo pra
    // sempre - avisa uma vez (nao repete a cada ciclo) que esse lead esta
    // com envio travado, pra voce poder investigar (Z-API caiu, numero
    // invalido, etc).
    if (!lead.avisoFalhaEnviado) {
      upsertLead(lead.phone, { avisoFalhaEnviado: true });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: lead.phone,
        contexto: `O envio automático está falhando pra esse lead: ${erro.message}\nVai continuar tentando sozinho, mas vale conferir.`,
      }), conexao).catch(() => {}); // se ate o aviso falhar, nao trava o resto do agendador
    }
    throw erro;
  }

  appendConversa(lead.phone, { de: 'ia', texto: enviado.texto });

  const tentativasFeitas = (lead.attemptsSent || 0) + 1;

  // Agenda a 2a tentativa aqui, no instante em que a 1a saiu, em vez de
  // decidir depois "faz tempo que mandei, mando de novo". A diferenca
  // aparece no dia em que voce cadastra as mensagens de follow-up: com data
  // marcada, so os leads novos entram no ciclo de duas mensagens; sem ela,
  // todo lead antigo que nunca respondeu viraria elegivel de uma vez e o
  // sistema dispararia a fila inteira de surpresa.
  const agendarFollowup = tentativasFeitas < totalDeTentativas(lead.whatsappId);

  // O lead pode ter respondido ENQUANTO o envio acima estava em andamento.
  // Se ele ja nao esta mais esperando, registra que a mensagem saiu, mas
  // nao mexe no status nem agenda 2a tentativa pra quem ja esta conversando.
  const depoisDoEnvio = getLead(lead.phone) || lead;
  const aindaEsperando = depoisDoEnvio.status === 'sequence_active' || depoisDoEnvio.status === 'aguardando_resposta';
  const mudancaDeEstado = aindaEsperando
    ? { proximoEnvioEm: agendarFollowup ? sortearMomentoDoFollowup() : null, status: 'aguardando_resposta' }
    : {};

  // Mensagem entregue: sai da fila de envio e passa a esperar a resposta.
  // Nao avisa voce aqui - isso e o caminho normal, o aviso so faz sentido
  // quando tem algo pra voce fazer.
  upsertLead(lead.phone, {
    attemptsSent: tentativasFeitas,
    mensagensEnviadas: [...(depoisDoEnvio.mensagensEnviadas || []), enviado.texto],
    // Carimbo de quando cada mensagem saiu. E com isso que o teto diario
    // conta pessoas por dia - sem a data, "quantos contatei hoje" nao tem
    // resposta. Guarda so os ultimos 10: o lead recebe no maximo duas
    // mensagens da esteira, entao essa lista nunca deveria crescer, e o
    // corte evita que um lead reimportado varias vezes vire um array
    // enorme dentro do db.json.
    enviosEm: [...(depoisDoEnvio.enviosEm || []), new Date().toISOString()].slice(-10),
    avisoFalhaEnviado: false,
    ...mudancaDeEstado,
  });

  return true;
}

// Um ciclo pode durar bem mais que os 15 min entre um tick e outro, porque
// a pausa entre envios segura de proposito. Sem essa trava, o tick seguinte
// comecaria por cima do anterior e os dois mandariam ao mesmo tempo - de
// volta a rajada que a pausa existe pra evitar. Quem sobrar fica pro
// proximo ciclo: o lead continua 'sequence_active' com a hora ja vencida.
let cicloEmAndamento = false;

// Quais numeros ja avisaram "bati o teto" neste ciclo. So pra nao repetir a
// mesma linha no log uma vez por lead da fila - com 200 leads esperando,
// seriam 200 linhas identicas escondendo o resto.
const avisoDeLimiteDado = new Set();

async function rodarCiclo() {
  if (cicloEmAndamento) return;
  cicloEmAndamento = true;
  avisoDeLimiteDado.clear();

  try {
    const leads = getLeadsParaEnvio();
    let enviados = 0;

    for (const lead of leads) {
      // Reavaliado a cada lead, nao so no inicio: um ciclo longo pode
      // atravessar o fim da janela de horario, e voce pode apertar "Pausar
      // envios" no meio dele.
      if (getPausado()) break;
      if (!dentroDoHorarioPermitido()) break;

      // Lead que ja gastou todas as tentativas mas continua com data
      // marcada: acontece quando a 2a tentativa e desligada depois de ja
      // ter agendado gente. Limpar aqui resolve dois problemas de uma vez -
      // o cartao para de anunciar uma mensagem que nao vai sair, e religar
      // a 2a tentativa mais tarde nao dispara de uma vez a fila inteira de
      // leads com data vencida.
      if (lead.proximoEnvioEm && (lead.attemptsSent || 0) >= totalDeTentativas(lead.whatsappId)) {
        upsertLead(lead.phone, { proximoEnvioEm: null });
        continue;
      }

      if (!estaNaHoraDeEnviar(lead)) continue;

      // Teto diario POR NUMERO. Checado aqui, lead a lead, e nao uma vez no
      // inicio do ciclo: o proprio ciclo vai estourando o teto conforme
      // manda, e um ciclo longo pode comecar com folga e acabar sem.
      //
      // O lead nao perde a vez - ele continua com a data vencida e e o
      // primeiro a sair amanha, quando a contagem zera.
      const limite = Number(getConfig().horarios.limiteDiarioDestinatarios) || 0;
      if (limite > 0) {
        const jaContatados = contarDestinatariosHoje(lead.whatsappId || null);
        const esseLeadJaContaHoje = (lead.enviosEm || []).some(
          (quando) => diaEmBrasilia(new Date(quando)) === diaEmBrasilia()
        );
        // Lead que ja recebeu hoje (caso da 2a tentativa no mesmo dia) nao
        // consome uma vaga nova - ele ja esta dentro da conta.
        if (!esseLeadJaContaHoje && jaContatados >= limite) {
          if (!avisoDeLimiteDado.has(lead.whatsappId || 'padrao')) {
            avisoDeLimiteDado.add(lead.whatsappId || 'padrao');
            console.log(`Teto diário atingido (${jaContatados}/${limite}) no número ${lead.whatsappId || 'padrão'} - o resto da fila fica pra amanhã.`);
          }
          continue;
        }
      }

      // Espera so o que faltar pro NUMERO desse lead poder mandar de novo.
      // Se o lead anterior saiu por outro numero, nao ha espera nenhuma.
      await aguardarAVezDoNumero(lead.whatsappId || 'padrao');

      // A espera acima dura 60-180s - e o momento mais provavel de voce
      // apertar "Pausar". Conferir so antes dela deixava sair mais uma
      // mensagem depois da pausa. Mesma coisa pro fim da janela de horario.
      if (getPausado()) break;
      if (!dentroDoHorarioPermitido()) break;

      try {
        if (await processarLead(lead)) enviados += 1;
      } catch (erro) {
        console.error(`Erro processando lead ${lead.phone}:`, erro.message);
      }
    }

    if (enviados) console.log(`Ciclo concluído: ${enviados} mensagem(ns) enviada(s).`);
  } finally {
    cicloEmAndamento = false;
  }
}

function iniciar() {
  cron.schedule('*/15 * * * *', rodarCiclo);
  console.log('Agendador iniciado (checagem a cada 15 min).');
}

module.exports = { iniciar, rodarCiclo, sortearIntervaloMs, estaNaHoraDeEnviar, totalDeTentativas };
