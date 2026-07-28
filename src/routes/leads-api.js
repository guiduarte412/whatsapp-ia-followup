const express = require('express');
const { getAllLeads, getLead, iniciarSequencia, iniciarSequenciaEmLote, removerLead } = require('../db/store');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

const PRODUTOS_VALIDOS = ['agro', 'imoveis', 'caminhoes', 'credito_empresarial'];

function normalizarTelefone(valor) {
  return (valor || '').replace(/\D/g, '');
}

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
  const telefone = normalizarTelefone(req.body?.telefone);
  const produto = req.body?.produto;

  if (!telefone || telefone.length < 12) {
    return res.status(400).json({ erro: 'telefone invalido - use codigo do pais + DDD + numero, so digitos' });
  }
  if (!nome) {
    return res.status(400).json({ erro: 'nome e obrigatorio' });
  }
  if (!PRODUTOS_VALIDOS.includes(produto)) {
    return res.status(400).json({ erro: 'produto invalido' });
  }

  const lead = iniciarSequencia(telefone, { nome, produto });
  res.status(201).json(lead);
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

module.exports = router;
