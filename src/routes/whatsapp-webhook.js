const express = require('express');
const { getLead, upsertLead, appendExample } = require('../db/store');
const { avisarConsultor } = require('../services/whatsapp');

const router = express.Router();

// Configure essa URL como "webhook de mensagens recebidas" no painel da Z-API.
// O formato exato do payload pode variar por versao da Z-API - confira a
// documentacao atual e ajuste os campos abaixo se necessario.
router.post('/whatsapp', express.json(), async (req, res) => {
  const payload = req.body;

  const telefone = payload?.phone || payload?.from;
  const textoRecebido = payload?.text?.message || payload?.message;

  if (!telefone) return res.status(400).json({ erro: 'telefone nao encontrado no payload' });

  const lead = getLead(telefone);

  if (lead && lead.status === 'sequence_active') {
    // Lead respondeu -> para a sequencia automatica e devolve pro humano
    upsertLead(telefone, { status: 'human_handoff' });

    // Guarda como exemplo de sucesso: a ultima mensagem enviada gerou resposta.
    // E isso que alimenta o "aprendizado" do sistema (ver README).
    const ultimaMensagem = (lead.mensagensEnviadas || []).slice(-1)[0];
    if (ultimaMensagem) {
      appendExample({
        mensagem: ultimaMensagem,
        tentativa: lead.attemptsSent,
        responded: true,
        phone: telefone,
      });
    }

    await avisarConsultor(
      `Lead ${lead.nome || telefone} respondeu: "${textoRecebido}". Assuma o atendimento por aqui.`
    );
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
