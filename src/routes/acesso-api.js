const express = require('express');
const { verificarCodigoAcesso, alterarCodigoAcesso, PALAVRA_CHAVE_E_PUBLICA } = require('../db/store');
const { estaBloqueado, registrarFalha, limparFalhas, criarSessao, sessaoValida, MAX_TENTATIVAS } = require('../services/sessao');

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

  // Esta rota e publica de proposito: ela e a recuperacao de acesso pra
  // quando o codigo e esquecido. Só que a palavra-chave padrao esta no
  // codigo-fonte, num repositorio publico - entao, enquanto ela nao for
  // trocada por uma de verdade na variavel de ambiente, qualquer um poderia
  // trocar o codigo daqui e assumir o painel inteiro (leads, conversas e o
  // backup com os tokens da Z-API). Nesse caso, exige tambem uma sessao ja
  // aberta: quem nao sabe o codigo atual nao passa.
  if (PALAVRA_CHAVE_E_PUBLICA && !sessaoValida(req.headers['x-sessao'])) {
    return res.status(403).json({
      erro: 'Pra trocar o código por aqui, entre no painel primeiro. '
        + 'Pra poder trocar sem estar logado (recuperação de acesso), configure a variável '
        + 'PALAVRA_CHAVE_MESTRA no Railway com uma palavra secreta sua.',
    });
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
