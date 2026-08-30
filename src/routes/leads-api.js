const express = require('express');
const { getAllLeads, getLead, iniciarSequencia, iniciarSequenciaEmLote, removerLead, upsertLead, normalizarTelefoneBR } = require('../db/store');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

router.get('/leads', (req, res) => {
  res.json(getAllLeads());
});

router.get('/leads/:telefone', (req, res) => {
  const lead = getLead(req.params.telefone);
  if (!lead) return res.status(404).json({ erro: 'lead nao encontrado' });
  res.json(lead);
});

router.post('/leads', (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const telefone = normalizarTelefoneBR(req.body?.telefone);
  if (!telefone) {
    return res.status(400).json({ erro: 'telefone invalido - informe DDD + numero (o 55 do Brasil entra sozinho)' });
  }
  if (!nome) {
    return res.status(400).json({ erro: 'nome e obrigatorio' });
  }
  const lead = iniciarSequencia(telefone, { nome });
  if (lead.bloqueado) {
    return res.status(400).json({
      erro: 'esse número pediu pra não receber mais mensagens, então não entrou na esteira. '
        + 'Se foi engano, libere em Configurações > Bloqueios.',
    });
  }
  // Lead repetido nao e erro (a esteira dele continua intacta, de proposito),
  // mas tambem nao e criacao - responder 201 fazia a tela dizer "adicionado"
  // pra quem, na pratica, nao adicionou nada.
  res.status(lead.jaExistia ? 200 : 201).json(lead);
});

// Importacao em lote (usado pelo importador de Excel no site - o arquivo e
// lido no navegador, aqui so recebe a lista ja em JSON).
router.post('/leads/lote', (req, res) => {
  const linhas = req.body?.leads;
  if (!Array.isArray(linhas) || !linhas.length) {
    return res.status(400).json({ erro: 'nenhuma linha recebida' });
  }
  const resultado = iniciarSequenciaEmLote(linhas);
  res.status(201).json(resultado);
});

router.delete('/leads/:telefone', (req, res) => {
  removerLead(req.params.telefone);
  res.status(204).end();
});

// Forma garantida de encerrar o atendimento automatico - nao depende de
// detectar nada vindo da Z-API, sempre funciona.
router.post('/leads/:telefone/encerrar', (req, res) => {
  const lead = getLead(req.params.telefone);
  if (!lead) return res.status(404).json({ erro: 'lead nao encontrado' });
  const atualizado = upsertLead(req.params.telefone, { status: 'encerrado', motivoEncerramento: 'assumido_manualmente' });
  res.json(atualizado);
});

module.exports = router;
