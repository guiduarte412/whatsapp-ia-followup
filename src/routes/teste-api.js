const express = require('express');
const { gerarMensagem, responderConversa } = require('../services/claude');
const { enviarMensagem } = require('../services/whatsapp');
const { iniciarSequencia, upsertLead } = require('../db/store');

const router = express.Router();
router.use(express.json());

// Rota de teste: gera uma mensagem com a mesma logica/prompt usado de
// verdade e manda pro numero informado, mas NAO mexe no banco de leads -
// nao entra na sequencia, nao conta como tentativa, nao aparece no painel.
// Serve so pra validar tom/formato antes de usar com leads reais.
router.post('/testar-mensagem', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const telefone = (req.body?.telefone || '').replace(/\D/g, '');
  const produto = req.body?.produto || 'geral';
  const tentativa = Number(req.body?.tentativa) || 1;

  if (!telefone || telefone.length < 12) {
    return res.status(400).json({ erro: 'telefone invalido - use codigo do pais + DDD + numero, so digitos' });
  }

  try {
    const texto = await gerarMensagem({ leadNome: nome, produto, tentativa, historico: [] });
    await enviarMensagem(telefone, texto);
    res.json({ texto });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao gerar/enviar mensagem de teste' });
  }
});

// --- Simulacao da conversa completa ---
// Diferente da rota acima, essas duas NUNCA mandam nada pro WhatsApp e
// NUNCA tocam no banco de leads - o historico da conversa fica so na tela
// (o navegador manda de volta a cada turno). Serve pra testar o roteiro
// inteiro: da primeira mensagem ate a IA tentar marcar a reuniao ou
// encaminhar pra voce, exatamente com a mesma logica de producao.

router.post('/simular/iniciar', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const produto = req.body?.produto || 'geral';

  try {
    const texto = await gerarMensagem({ leadNome: nome, produto, tentativa: 1, historico: [] });
    res.json({ resposta: texto, encaminharHumano: false });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao iniciar simulacao' });
  }
});

router.post('/simular/responder', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const produto = req.body?.produto || 'geral';
  const historico = Array.isArray(req.body?.historico) ? req.body.historico : [];

  try {
    const resultado = await responderConversa({ leadNome: nome, produto, historicoConversa: historico });
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao continuar simulacao' });
  }
});

// --- Teste direto no WhatsApp de verdade ---
// Cria um lead marcado como teste (aparece no painel com selo TESTE) e ja
// manda a primeira mensagem na hora, sem esperar o agendador. Dali em
// diante, quando voce responder pelo WhatsApp, cai no MESMO webhook
// (/webhooks/whatsapp) que um lead real usaria - testa o roteiro inteiro
// E a integracao com a Z-API ao mesmo tempo.
router.post('/testar-whatsapp', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const telefone = (req.body?.telefone || '').replace(/\D/g, '');
  const produto = req.body?.produto || 'geral';

  if (!telefone || telefone.length < 12) {
    return res.status(400).json({ erro: 'telefone invalido - use codigo do pais + DDD + numero, so digitos' });
  }

  try {
    const lead = iniciarSequencia(telefone, { nome, produto, teste: true });
    const texto = await gerarMensagem({ leadNome: nome, produto, tentativa: 1, historico: [] });
    await enviarMensagem(telefone, texto);
    upsertLead(telefone, { attemptsSent: 1, mensagensEnviadas: [texto] });
    res.json({ texto, lead });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao iniciar teste no WhatsApp' });
  }
});

module.exports = router;
