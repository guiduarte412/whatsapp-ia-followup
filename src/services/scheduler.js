const cron = require('node-cron');
const { getActiveSequenceLeads, upsertLead, appendExample, appendConversa, getPausado } = require('../db/store');
const { gerarMensagem } = require('./claude');
const { enviarMensagem, avisarConsultor, formatarAvisoLead } = require('./whatsapp');

// A sequencia tem 6 envios (2 por dia x 3 dias):
// - a 1a mensagem (assim que o lead entra) sai entre 30 e 60 min depois,
//   sorteado - isso e calculado em store.js na hora que o lead e criado.
// - a partir dai, as mensagens alternam entre um horario de manha e um de
//   final de dia, sempre no proximo dia disponivel - nunca duas mensagens
//   "de manha" ou "de final de dia" seguidas.
const MANHA_HORA = Number(process.env.HORA_MANHA || 9);
const FIM_DIA_HORA = Number(process.env.HORA_FIM_DIA || 18);
const BRASILIA_OFFSET_MS = 3 * 3_600_000; // Brasilia = UTC-3, sem horario de verao desde 2019

// Acha o proximo momento em que sao "horaAlvo:00" no horario de Brasilia,
// estritamente depois de "apos" (timestamp em ms). Funciona em qualquer
// fuso que o servidor estiver rodando (Railway roda em UTC por padrao).
function proximoHorarioBrasilia(horaAlvo, apos) {
  const apósEmBrasilia = new Date(apos - BRASILIA_OFFSET_MS);
  const candidato = new Date(Date.UTC(
    apósEmBrasilia.getUTCFullYear(),
    apósEmBrasilia.getUTCMonth(),
    apósEmBrasilia.getUTCDate(),
    horaAlvo, 0, 0, 0
  ));
  if (candidato.getTime() <= apósEmBrasilia.getTime()) {
    candidato.setUTCDate(candidato.getUTCDate() + 1);
  }
  return new Date(candidato.getTime() + BRASILIA_OFFSET_MS);
}

// Depois de enviar a tentativa N, calcula quando a tentativa N+1 deve sair.
// Tentativas impares (1, 3, 5) sao seguidas por um envio de "final de dia";
// tentativas pares (2, 4, 6) sao seguidas por um envio de "manha" (do dia
// seguinte). Depois da 6a, nao tem proxima.
function calcularProximoEnvio(tentativaRecemEnviada, quandoEnviou) {
  if (tentativaRecemEnviada >= 6) return null;
  const proximaEhFimDeDia = tentativaRecemEnviada % 2 === 1;
  const horaAlvo = proximaEhFimDeDia ? FIM_DIA_HORA : MANHA_HORA;
  return proximoHorarioBrasilia(horaAlvo, quandoEnviou.getTime()).toISOString();
}

function dentroDoHorarioPermitido() {
  // O servidor (Railway) roda em UTC por padrao, nao no horario de Brasilia.
  // Usar getHours() direto pegaria a hora errada - aqui calcula a hora
  // especificamente no fuso do Brasil, nao importa onde o servidor roda.
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(new Date())
  );
  const inicio = Number(process.env.HORARIO_INICIO || 8);
  const fim = Number(process.env.HORARIO_FIM || 20);
  return hora >= inicio && hora < fim;
}

async function processarLead(lead) {
  const tentativaAtual = (lead.attemptsSent || 0) + 1;
  if (tentativaAtual > 6) return;
  if (!lead.proximoEnvioEm || Date.now() < new Date(lead.proximoEnvioEm).getTime()) return;

  const mensagem = await gerarMensagem({
    leadNome: lead.nome,
    produto: lead.produto,
    tentativa: tentativaAtual,
    historico: lead.mensagensEnviadas || [],
  });

  try {
    await enviarMensagem(lead.phone, mensagem);
  } catch (erro) {
    // Nao deixa a falha passar em silencio esperando o proximo tick (15 min)
    // pra sempre - avisa uma vez (nao repete a cada tentativa) que esse
    // lead esta com envio travado, pra voce poder investigar (Z-API caiu,
    // credito da Anthropic acabou, etc).
    if (!lead.avisoFalhaEnviado) {
      upsertLead(lead.phone, { avisoFalhaEnviado: true });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: lead.phone,
        contexto: `O envio automático está falhando pra esse lead: ${erro.message}\nVai continuar tentando sozinho, mas vale conferir.`,
      })).catch(() => {}); // se ate o aviso falhar, nao trava o resto do agendador
    }
    throw erro;
  }

  if (lead.avisoFalhaEnviado) {
    upsertLead(lead.phone, { avisoFalhaEnviado: false });
  }

  appendConversa(lead.phone, { de: 'ia', texto: mensagem });

  const mensagensEnviadas = [...(lead.mensagensEnviadas || []), mensagem];
  const proximoEnvioEm = calcularProximoEnvio(tentativaAtual, new Date());

  if (tentativaAtual === 6) {
    // ultima tentativa sem resposta ate aqui -> lead fica marcado para nutricao futura
    upsertLead(lead.phone, {
      attemptsSent: tentativaAtual,
      mensagensEnviadas,
      status: 'cold_nurture',
    });
    appendExample({ mensagem, tentativa: tentativaAtual, responded: false, phone: lead.phone });
    await avisarConsultor(formatarAvisoLead({
      nome: lead.nome,
      telefone: lead.phone,
      contexto: 'Completou as 6 tentativas sem responder. Fica marcado para nutrição futura.',
    }));
  } else {
    upsertLead(lead.phone, { attemptsSent: tentativaAtual, mensagensEnviadas, proximoEnvioEm });
  }
}

function iniciar() {
  // roda a cada 15 minutos e verifica quem precisa receber a proxima mensagem
  cron.schedule('*/15 * * * *', async () => {
    if (getPausado()) return; // botao de emergencia ligado - nao envia nada
    if (!dentroDoHorarioPermitido()) return;

    const leads = getActiveSequenceLeads();
    for (const lead of leads) {
      try {
        await processarLead(lead);
      } catch (erro) {
        console.error(`Erro processando lead ${lead.phone}:`, erro.message);
      }
    }
  });

  console.log('Agendador de follow-up iniciado (checagem a cada 15 min).');
}

module.exports = { iniciar, calcularProximoEnvio };
