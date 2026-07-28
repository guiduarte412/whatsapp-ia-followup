const express = require('express');
const { getLead, upsertLead, appendConversa, appendExample } = require('../db/store');
const { avisarConsultor, enviarMensagem, formatarAvisoLead } = require('../services/whatsapp');
const { responderConversa } = require('../services/claude');

const router = express.Router();

// Numero maximo de respostas automaticas seguidas antes de forcar o
// encaminhamento pro humano, mesmo que a IA ache que ainda da pra continuar.
// E uma trava de seguranca: garante que uma conversa real sobre consorcio
// nao fica indefinidamente só com a IA.
const MAX_RESPOSTAS_AUTOMATICAS = Number(process.env.MAX_RESPOSTAS_AUTOMATICAS || 5);

// Configure essa URL como "webhook de mensagens recebidas" no painel da Z-API.
// O formato exato do payload pode variar por versao da Z-API - confira a
// documentacao atual e ajuste os campos abaixo se necessario.
router.post('/whatsapp', express.json(), async (req, res) => {
  const payload = req.body;

  const telefone = payload?.phone || payload?.from;
  const textoRecebido = payload?.text?.message || payload?.message;

  if (!telefone) return res.status(400).json({ erro: 'telefone nao encontrado no payload' });

  const lead = getLead(telefone);
  if (!lead) return res.status(200).json({ ok: true }); // mensagem de numero fora do fluxo, ignora

  // Se ja esta com humano, a IA nao interfere mais - so avisa que chegou
  // mensagem nova, pra nao atropelar uma conversa que o consultor ja assumiu.
  if (lead.status === 'human_handoff') {
    appendConversa(telefone, { de: 'lead', texto: textoRecebido });
    await avisarConsultor(formatarAvisoLead({
      nome: lead.nome,
      telefone,
      contexto: `Nova mensagem: "${textoRecebido}"`,
    }));
    return res.status(200).json({ ok: true });
  }

  const primeiraResposta = lead.status === 'sequence_active';

  if (primeiraResposta) {
    // Primeira vez que esse lead responde -> registra como exemplo de
    // sucesso (alimenta o "aprendizado" descrito no README) e para a
    // sequencia de follow-up (o agendador so processa status sequence_active).
    // Leads de teste nao entram no aprendizado, pra nao poluir os exemplos
    // reais com conversa fabricada.
    const ultimaMensagem = (lead.mensagensEnviadas || []).slice(-1)[0];
    if (ultimaMensagem && !lead.teste) {
      appendExample({
        mensagem: ultimaMensagem,
        tentativa: lead.attemptsSent,
        responded: true,
        phone: telefone,
      });
    }
  }

  appendConversa(telefone, { de: 'lead', texto: textoRecebido });
  const leadAtualizado = getLead(telefone);
  const respostasAutomaticas = (leadAtualizado.respostasAutomaticas || 0) + 1;

  if (respostasAutomaticas > MAX_RESPOSTAS_AUTOMATICAS) {
    upsertLead(telefone, { status: 'human_handoff' });
    await avisarConsultor(formatarAvisoLead({
      nome: lead.nome,
      telefone,
      contexto: `Passou de ${MAX_RESPOSTAS_AUTOMATICAS} respostas automáticas seguidas. Assuma a conversa por aqui.`,
    }));
    return res.status(200).json({ ok: true });
  }

  const resultado = await responderConversa({
    leadNome: leadAtualizado.nome,
    produto: leadAtualizado.produto,
    historicoConversa: leadAtualizado.conversa,
  });

  // Manda a resposta pro lead em qualquer um dos dois casos - a IA sempre
  // deixa uma mensagem educada antes de encaminhar, nunca some sem responder.
  if (resultado.resposta) {
    await enviarMensagem(telefone, resultado.resposta);
    appendConversa(telefone, { de: 'ia', texto: resultado.resposta });
  }

  if (resultado.encaminharHumano) {
    upsertLead(telefone, { status: 'human_handoff', respostasAutomaticas });
    const contexto = resultado.resumoParaConsultor || resultado.motivo || 'a IA identificou que é hora de assumir';
    await avisarConsultor(formatarAvisoLead({
      nome: lead.nome,
      telefone,
      contexto: `${contexto}\nÚltima mensagem do lead: "${textoRecebido}"`,
    }));
  } else {
    upsertLead(telefone, { status: 'conversa_ia', respostasAutomaticas });
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
