const express = require('express');
const { responderConversa } = require('../services/claude');
const { enviarMensagem } = require('../services/whatsapp');
const { iniciarSequencia, upsertLead, appendConversa, montarMensagemDeAbertura, normalizarTelefoneBR, getWhatsappPorId, getWhatsappsAtivos, numeroEstaBloqueado } = require('../db/store');

const router = express.Router();
router.use(express.json());

const SEM_MENSAGEM = 'Nenhuma mensagem cadastrada. Vá em Configurações > Mensagens e cadastre pelo menos uma.';

// Teste tem que sair pelo mesmo caminho do envio real. Sem isso, quem
// cadastrou numeros na tela via o teste sair pelas credenciais das
// variaveis de ambiente - que podem nem existir - e o teste falhava (ou
// pior: saia por um numero diferente do que o painel diz).
function conexaoParaTeste() {
  return getWhatsappsAtivos()[0] || null;
}

// Vale pro teste tambem: um numero que pediu pra sair nao recebe mensagem
// nossa por nenhum caminho, nem "so pra testar".
const BLOQUEADO = 'esse número pediu pra não receber mais mensagens. Se foi engano, libere em Configurações > Bloqueios.';

// Rota de teste: monta a mensagem de abertura com a MESMA logica usada de
// verdade (sorteia entre as que voce cadastrou e troca {nome}) e manda pro
// numero informado, mas NAO mexe no banco de leads - nao entra na esteira,
// nao aparece no painel. Serve so pra ver como o texto chega no WhatsApp.
router.post('/testar-mensagem', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const telefone = normalizarTelefoneBR(req.body?.telefone);

  if (!telefone) {
    return res.status(400).json({ erro: 'telefone invalido - informe DDD + numero (o 55 do Brasil entra sozinho)' });
  }

  if (numeroEstaBloqueado(telefone)) return res.status(400).json({ erro: BLOQUEADO });

  const texto = montarMensagemDeAbertura(nome);
  if (!texto) return res.status(400).json({ erro: SEM_MENSAGEM });

  try {
    await enviarMensagem(telefone, texto, conexaoParaTeste());
    res.json({ texto });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao enviar mensagem de teste' });
  }
});

// --- Simulacao da conversa completa ---
// Diferente da rota acima, essas duas NUNCA mandam nada pro WhatsApp e
// NUNCA tocam no banco de leads - o historico da conversa fica so na tela
// (o navegador manda de volta a cada turno). Serve pra testar o roteiro
// inteiro: da mensagem de abertura ate a IA marcar o horario ou encaminhar
// pra voce, exatamente com a mesma logica de producao.

router.post('/simular/iniciar', (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const texto = montarMensagemDeAbertura(nome);
  if (!texto) return res.status(400).json({ erro: SEM_MENSAGEM });
  res.json({ resposta: texto, encaminharHumano: false });
});

router.post('/simular/responder', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const historico = Array.isArray(req.body?.historico) ? req.body.historico : [];

  try {
    const resultado = await responderConversa({ leadNome: nome, historicoConversa: historico });
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao continuar simulacao' });
  }
});

// --- Teste direto no WhatsApp de verdade ---
// Cria um lead marcado como teste (aparece no painel com selo TESTE) e ja
// manda a mensagem na hora, sem esperar o agendador. Dali em diante, quando
// voce responder pelo WhatsApp, cai no MESMO webhook (/webhooks/whatsapp)
// que um lead real usaria - testa o roteiro inteiro E a integracao com a
// Z-API ao mesmo tempo.
router.post('/testar-whatsapp', async (req, res) => {
  const nome = (req.body?.nome || '').trim();
  const telefone = normalizarTelefoneBR(req.body?.telefone);

  if (!telefone) {
    return res.status(400).json({ erro: 'telefone invalido - informe DDD + numero (o 55 do Brasil entra sozinho)' });
  }

  if (numeroEstaBloqueado(telefone)) return res.status(400).json({ erro: BLOQUEADO });

  const texto = montarMensagemDeAbertura(nome);
  if (!texto) return res.status(400).json({ erro: SEM_MENSAGEM });

  try {
    const lead = iniciarSequencia(telefone, { nome, teste: true });
    // Pelo numero que o rodizio fixou nesse lead - e ele que vai receber a
    // resposta no webhook, entao a abertura precisa sair por ele tambem.
    await enviarMensagem(telefone, texto, getWhatsappPorId(lead.whatsappId));
    appendConversa(telefone, { de: 'ia', texto });
    // A unica mensagem da esteira ja saiu aqui - o lead vai direto pra
    // espera de resposta, sem nada agendado depois.
    upsertLead(telefone, {
      attemptsSent: 1,
      mensagensEnviadas: [texto],
      proximoEnvioEm: null,
      status: 'aguardando_resposta',
    });
    res.json({ texto, lead });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'falha ao iniciar teste no WhatsApp' });
  }
});

module.exports = router;
