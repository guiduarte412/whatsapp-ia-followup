const express = require('express');
const {
  getCrmConfig, salvarCrmConfig,
  getGoogleAgendaConfig, salvarGoogleAgendaConfig,
  getExemplosDeTom, salvarExemplosDeTom,
} = require('../db/store');

const router = express.Router();
router.use(express.json());

// So guarda e devolve o que foi salvo - a chave nunca aparece "em claro"
// de volta pro navegador depois de salva, so um indicador de que existe.
router.get('/crm', (req, res) => {
  const config = getCrmConfig();
  res.json({
    urlBase: config.urlBase || '',
    apiKeyDefinida: Boolean(config.apiKey),
  });
});

router.post('/crm', (req, res) => {
  const dados = {};
  if (typeof req.body?.urlBase === 'string') dados.urlBase = req.body.urlBase.trim();
  if (typeof req.body?.apiKey === 'string' && req.body.apiKey.trim()) {
    dados.apiKey = req.body.apiKey.trim();
  }
  salvarCrmConfig(dados);
  res.json({ ok: true });
});

// Google Agenda ainda nao conecta de verdade (precisa de autorizacao OAuth
// do Google, que e um fluxo a parte) - por enquanto so guarda a intencao.
router.get('/google-agenda', (req, res) => {
  res.json(getGoogleAgendaConfig());
});

router.post('/google-agenda', (req, res) => {
  const querConectar = Boolean(req.body?.querConectar);
  const config = salvarGoogleAgendaConfig({ querConectar });
  res.json(config);
});

// Exemplos de mensagens reais do consultor, usados como referencia de tom.
router.get('/exemplos-tom', (req, res) => {
  res.json({ exemplos: getExemplosDeTom() });
});

router.post('/exemplos-tom', (req, res) => {
  const exemplos = Array.isArray(req.body?.exemplos) ? req.body.exemplos : [];
  res.json({ exemplos: salvarExemplosDeTom(exemplos) });
});

module.exports = router;
