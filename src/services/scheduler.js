const cron = require('node-cron');
const { getLeadsParaEnvio, upsertLead, appendConversa, getPausado, getConfig, montarMensagemDeAbertura, montarMensagemDeFollowup, followupEstaAtivo, getWhatsappPorId, numeroEstaBloqueado } = require('../db/store');
const { enviarMensagem, avisarConsultor, formatarAvisoLead } = require('./whatsapp');

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
function totalDeTentativas() {
  return followupEstaAtivo() ? 2 : 1;
}

// Ja passou a hora sorteada desse lead e ele ainda tem tentativa disponivel?
function estaNaHoraDeEnviar(lead) {
  if ((lead.attemptsSent || 0) >= totalDeTentativas()) return false;
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
async function processarLead(lead) {
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
    ? montarMensagemDeFollowup(lead.nome)
    : montarMensagemDeAbertura(lead.nome);

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

  try {
    await enviarMensagem(lead.phone, mensagem, conexao);
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

  appendConversa(lead.phone, { de: 'ia', texto: mensagem });

  const tentativasFeitas = (lead.attemptsSent || 0) + 1;

  // Agenda a 2a tentativa aqui, no instante em que a 1a saiu, em vez de
  // decidir depois "faz tempo que mandei, mando de novo". A diferenca
  // aparece no dia em que voce cadastra as mensagens de follow-up: com data
  // marcada, so os leads novos entram no ciclo de duas mensagens; sem ela,
  // todo lead antigo que nunca respondeu viraria elegivel de uma vez e o
  // sistema dispararia a fila inteira de surpresa.
  const agendarFollowup = tentativasFeitas < totalDeTentativas();

  // Mensagem entregue: sai da fila de envio e passa a esperar a resposta.
  // Nao avisa voce aqui - isso e o caminho normal, o aviso so faz sentido
  // quando tem algo pra voce fazer.
  upsertLead(lead.phone, {
    attemptsSent: tentativasFeitas,
    mensagensEnviadas: [...(lead.mensagensEnviadas || []), mensagem],
    proximoEnvioEm: agendarFollowup ? sortearMomentoDoFollowup() : null,
    avisoFalhaEnviado: false,
    status: 'aguardando_resposta',
  });

  return true;
}

// Um ciclo pode durar bem mais que os 15 min entre um tick e outro, porque
// a pausa entre envios segura de proposito. Sem essa trava, o tick seguinte
// comecaria por cima do anterior e os dois mandariam ao mesmo tempo - de
// volta a rajada que a pausa existe pra evitar. Quem sobrar fica pro
// proximo ciclo: o lead continua 'sequence_active' com a hora ja vencida.
let cicloEmAndamento = false;

async function rodarCiclo() {
  if (cicloEmAndamento) return;
  cicloEmAndamento = true;

  try {
    const leads = getLeadsParaEnvio();
    let enviados = 0;

    for (const lead of leads) {
      // Reavaliado a cada lead, nao so no inicio: um ciclo longo pode
      // atravessar o fim da janela de horario, e voce pode apertar "Pausar
      // envios" no meio dele.
      if (getPausado()) break;
      if (!dentroDoHorarioPermitido()) break;
      if (!estaNaHoraDeEnviar(lead)) continue;

      // Espera so o que faltar pro NUMERO desse lead poder mandar de novo.
      // Se o lead anterior saiu por outro numero, nao ha espera nenhuma.
      await aguardarAVezDoNumero(lead.whatsappId || 'padrao');

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
