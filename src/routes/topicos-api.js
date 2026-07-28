const express = require('express');
const { getTopicos, salvarTopicos } = require('../db/store');

const router = express.Router();
router.use(express.json());

router.get('/topicos', (req, res) => {
  res.json(getTopicos());
});

router.post('/topicos', (req, res) => {
  const permitidos = ['agro', 'imoveis', 'caminhoes', 'credito_empresarial', 'geral'];
  const dados = {};
  permitidos.forEach((chave) => {
    if (typeof req.body?.[chave] === 'string') dados[chave] = req.body[chave];
  });
  const topicos = salvarTopicos(dados);
  res.json(topicos);
});

module.exports = router;
