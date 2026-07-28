const cron = require('node-cron');
const { getActiveSequenceLeads, upsertLead, appendExample, appendConversa } = require('../db/store');
const { gerarMensagem } = require('./claude');
const { enviarMensagem, avisarConsultor, formatarAvisoLead } = require('./whatsapp');

// A sequencia tem 6 envios (2 por dia x 3 dias). Aqui vao os horarios-alvo
// em "horas desde o inicio da sequencia" - variados de propósito (nao e
// sempre a mesma hora exata) pra nao parecer disparo automatico identico.
const HORAS_DESDE_INICIO = [5, 9, 24, 29, 48, 53];

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

  const horasPassadas = (Date.now() - new Date(lead.sequenceStartedAt).getTime()) / 3_600_000;
  const horaAlvo = HORAS_DESDE_INICIO[tentativaAtual - 1];
  if (horasPassadas < horaAlvo) return; // ainda nao chegou a hora deste envio

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
    upsertLead(lead.phone, { attemptsSent: tentativaAtual, mensagensEnviadas });
  }
}

function iniciar() {
  // roda a cada 15 minutos e verifica quem precisa receber a proxima mensagem
  cron.schedule('*/15 * * * *', async () => {
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

module.exports = { iniciar };
