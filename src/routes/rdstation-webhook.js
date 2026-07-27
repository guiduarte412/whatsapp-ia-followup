const express = require('express');
const { iniciarSequencia } = require('../db/store');

const router = express.Router();

// Configure no RD Station CRM um Webhook disparado quando a negociacao/tarefa
// muda para o estagio ou status que voce usa para marcar "nao atendeu"
// (Configuracoes > Webhooks). O RD Station manda o payload em JSON.
// Ajuste os nomes de campo abaixo conforme o payload real da sua conta -
// o formato exato depende de como seu funil esta configurado.
router.post('/rdstation', express.json(), async (req, res) => {
  const payload = req.body;

  const telefone = payload?.contact?.phone || payload?.phone;
  const nome = payload?.contact?.name || payload?.name;
  const produto = payload?.deal?.campaign || payload?.deal?.origin || 'nao informado';
  const statusNaoAtendeu = payload?.deal?.status === 'nao_atendeu'; // AJUSTAR ao seu funil

  if (!telefone) {
    return res.status(400).json({ erro: 'telefone nao encontrado no payload' });
  }

  if (statusNaoAtendeu) {
    iniciarSequencia(telefone, { nome, produto });
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
