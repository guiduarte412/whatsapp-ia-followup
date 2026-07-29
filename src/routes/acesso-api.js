const express = require('express');
const { verificarCodigoAcesso, alterarCodigoAcesso } = require('../db/store');
const { estaBloqueado, registrarFalha, limparFalhas, criarSessao, MAX_TENTATIVAS } = require('../services/sessao');

const router = express.Router();
router.use(express.json());

router.post('/acesso/verificar', (req, res) => {
  // Sem esse bloqueio, alguem com a URL do site poderia testar as
  // 1.000.000 combinacoes de 6 digitos automaticamente em pouco tempo.
  if (estaBloqueado(req)) {
    return res.status(429).json({
      valido: false,
      erro: `Muitas tentativas erradas. Espere 15 minutos e tente de novo.`,
    });
  }

  const valido = verificarCodigoAcesso((req.body?.codigo || '').trim());

  if (!valido) {
    registrarFalha(req);
    return res.json({ valido: false });
  }

  limparFalhas(req);
  res.json({ valido: true, sessao: criarSessao() });
});

router.post('/acesso/alterar', (req, res) => {
  if (estaBloqueado(req)) {
    return res.status(429).json({ erro: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' });
  }

  const palavraChave = (req.body?.palavraChave || '').trim();
  const novoCodigo = (req.body?.novoCodigo || '').trim();

  if (!/^\d{6}$/.test(novoCodigo)) {
    return res.status(400).json({ erro: 'o código precisa ter exatamente 6 dígitos' });
  }

  const ok = alterarCodigoAcesso(palavraChave, novoCodigo);
  if (!ok) {
    registrarFalha(req);
    return res.status(403).json({ erro: 'palavra-chave incorreta' });
  }

  limparFalhas(req);
  res.json({ ok: true });
});

module.exports = router;
