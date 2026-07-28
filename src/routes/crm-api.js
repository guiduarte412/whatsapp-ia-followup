const express = require('express');
const { getCrmConfig, salvarCrmConfig } = require('../db/store');

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

module.exports = router;
