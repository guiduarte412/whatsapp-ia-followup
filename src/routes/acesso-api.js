const express = require('express');
const { verificarCodigoAcesso, alterarCodigoAcesso } = require('../db/store');

const router = express.Router();
router.use(express.json());

router.post('/acesso/verificar', (req, res) => {
  const valido = verificarCodigoAcesso((req.body?.codigo || '').trim());
  res.json({ valido });
});

router.post('/acesso/alterar', (req, res) => {
  const palavraChave = (req.body?.palavraChave || '').trim();
  const novoCodigo = (req.body?.novoCodigo || '').trim();

  if (!novoCodigo) {
    return res.status(400).json({ erro: 'informe o novo código' });
  }

  const ok = alterarCodigoAcesso(palavraChave, novoCodigo);
  if (!ok) {
    return res.status(403).json({ erro: 'palavra-chave incorreta' });
  }
  res.json({ ok: true });
});

module.exports = router;
