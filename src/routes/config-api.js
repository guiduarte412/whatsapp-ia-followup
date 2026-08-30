const express = require('express');
const { getConfig, salvarConfig, normalizarTelefoneBR, getWhatsappPorId } = require('../db/store');
const { statusConexao, obterQrCode, desconectar } = require('../services/whatsapp');

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

// Tudo que a IA fala e obedece mora aqui: identidade, mensagens de
// abertura, regras da conversa e horarios. Nada disso fica no codigo -
// e essa rota que o site usa pra ler e gravar.

const MAX_ITENS = 30;      // teto de mensagens/regras cadastradas
const MAX_CARACTERES = 2000; // teto por item, pra nao estourar o prompt

function limparLista(valor) {
  if (!Array.isArray(valor)) return undefined;
  return valor
    .map((item) => (item || '').toString().trim())
    .filter((item) => item.length > 0)
    .map((item) => item.slice(0, MAX_CARACTERES))
    .slice(0, MAX_ITENS);
}

function horaValida(valor, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 23) return padrao;
  return Math.floor(n);
}

function minutosValidos(valor, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 24 * 60) return padrao;
  return Math.floor(n);
}

function segundosValidos(valor, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 3600) return padrao;
  return Math.floor(n);
}

// Os tokens da Z-API sao segredo: uma vez salvos, nunca voltam em claro pro
// navegador. A tela mostra so "ja salvo" e, se o campo voltar vazio no PUT,
// o valor guardado e mantido. Assim da pra editar o apelido de um numero sem
// precisar redigitar as credenciais dele.
function paraATela(config) {
  return {
    ...config,
    whatsapps: config.whatsapps.map((w) => ({
      id: w.id,
      apelido: w.apelido || '',
      instanceId: w.instanceId || '',
      token: '',
      tokenSalvo: Boolean(w.token),
      clientToken: '',
      clientTokenSalvo: Boolean(w.clientToken),
      nomeExibicao: w.nomeExibicao || '',
      avisarNumero: w.avisarNumero || '',
      ativo: w.ativo !== false,
    })),
  };
}

// Ids sao gerados pelo servidor e nunca mudam - a URL do webhook que voce
// cola na Z-API depende deles. Renomear o apelido nao quebra nada.
function proximoIdDisponivel(existentes) {
  let maior = 0;
  for (const w of existentes) {
    const n = Number(String(w.id || '').replace('wa-', ''));
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior + 1;
}

function montarWhatsapps(recebidos, atuais) {
  if (!Array.isArray(recebidos)) return { lista: undefined };
  if (recebidos.length > 10) return { erro: 'no máximo 10 números conectados' };

  let proximoId = proximoIdDisponivel(atuais);
  const lista = [];

  for (let i = 0; i < recebidos.length; i++) {
    const bruto = recebidos[i] || {};
    const anterior = atuais.find((w) => w.id === bruto.id) || {};
    const apelido = (bruto.apelido || '').toString().trim().slice(0, 60);
    const instanceId = (bruto.instanceId || '').toString().trim();
    // Campo vazio = "nao mexi nesse", entao mantem o que ja estava salvo.
    const token = (bruto.token || '').toString().trim() || anterior.token || '';
    const clientToken = (bruto.clientToken || '').toString().trim() || anterior.clientToken || '';

    if (!instanceId || !token) {
      return { erro: `o número ${i + 1}${apelido ? ' (' + apelido + ')' : ''} precisa de Instance ID e Token da Z-API` };
    }

    const avisarBruto = (bruto.avisarNumero || '').toString().trim();
    const avisarNumero = avisarBruto ? normalizarTelefoneBR(avisarBruto) : '';
    if (avisarBruto && !avisarNumero) {
      return { erro: `o número de aviso do WhatsApp ${i + 1}${apelido ? ' (' + apelido + ')' : ''} não é válido` };
    }

    lista.push({
      id: anterior.id || `wa-${proximoId++}`,
      apelido: apelido || `Número ${i + 1}`,
      instanceId,
      token,
      clientToken,
      nomeExibicao: (bruto.nomeExibicao || '').toString().trim().slice(0, 60),
      avisarNumero,
      ativo: bruto.ativo !== false,
    });
  }

  return { lista };
}

router.get('/config', (req, res) => {
  res.json(paraATela(getConfig()));
});

router.put('/config', (req, res) => {
  const atual = getConfig();
  const corpo = req.body || {};
  const parcial = {};

  if (corpo.identidade && typeof corpo.identidade === 'object') {
    parcial.identidade = {};
    for (const campo of ['nome', 'empresa', 'contexto']) {
      if (typeof corpo.identidade[campo] === 'string') {
        parcial.identidade[campo] = corpo.identidade[campo].trim().slice(0, MAX_CARACTERES);
      }
    }
  }

  if (corpo.whatsapps !== undefined) {
    const { lista, erro } = montarWhatsapps(corpo.whatsapps, atual.whatsapps);
    if (erro) return res.status(400).json({ erro });
    if (lista !== undefined) parcial.whatsapps = lista;
  }

  const mensagens = limparLista(corpo.mensagens);
  if (mensagens !== undefined) parcial.mensagens = mensagens;

  const regras = limparLista(corpo.regras);
  if (regras !== undefined) parcial.regras = regras;

  if (corpo.horarios && typeof corpo.horarios === 'object') {
    const inicio = horaValida(corpo.horarios.inicio, atual.horarios.inicio);
    const fim = horaValida(corpo.horarios.fim, atual.horarios.fim);
    // Janela invertida (fim antes do inicio) travaria todos os envios pra
    // sempre, sem nenhum erro visivel - rejeita na entrada.
    if (fim <= inicio) {
      return res.status(400).json({ erro: 'o horário final precisa ser maior que o inicial' });
    }
    const atrasoMin = minutosValidos(corpo.horarios.atrasoMinMinutos, atual.horarios.atrasoMinMinutos);
    const atrasoMax = minutosValidos(corpo.horarios.atrasoMaxMinutos, atual.horarios.atrasoMaxMinutos);
    if (atrasoMax < atrasoMin) {
      return res.status(400).json({ erro: 'o atraso máximo precisa ser maior ou igual ao mínimo' });
    }
    const intervaloMin = segundosValidos(corpo.horarios.intervaloMinSegundos, atual.horarios.intervaloMinSegundos);
    const intervaloMax = segundosValidos(corpo.horarios.intervaloMaxSegundos, atual.horarios.intervaloMaxSegundos);
    if (intervaloMax < intervaloMin) {
      return res.status(400).json({ erro: 'o intervalo máximo entre envios precisa ser maior ou igual ao mínimo' });
    }
    parcial.horarios = {
      inicio,
      fim,
      atrasoMinMinutos: atrasoMin,
      atrasoMaxMinutos: atrasoMax,
      intervaloMinSegundos: intervaloMin,
      intervaloMaxSegundos: intervaloMax,
    };
  }

  if (corpo.maxRespostasAutomaticas !== undefined) {
    const n = Number(corpo.maxRespostasAutomaticas);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return res.status(400).json({ erro: 'o limite de respostas automáticas precisa ser um número entre 1 e 50' });
    }
    parcial.maxRespostasAutomaticas = Math.floor(n);
  }

  res.json(paraATela(salvarConfig(parcial)));
});

// --- Conexao dos numeros (status / QR Code / desconectar) ---
// O :id e o id de um numero cadastrado, ou a palavra "padrao" pra quem usa
// as credenciais das variaveis de ambiente (modo de um numero so).

function conexaoDoParametro(id) {
  if (id === 'padrao') {
    // "padrao" so existe de fato se as variaveis de ambiente estiverem la -
    // sem elas, a chamada iria pra Z-API com "undefined" na URL.
    if (!process.env.ZAPI_INSTANCE_ID || !process.env.ZAPI_TOKEN) return { naoExiste: true };
    return { conexao: null };
  }
  const conexao = getWhatsappPorId(id);
  if (!conexao) return { naoExiste: true };
  return { conexao };
}

router.get('/whatsapps/:id/status', async (req, res) => {
  const { conexao, naoExiste } = conexaoDoParametro(req.params.id);
  if (naoExiste) return res.status(404).json({ erro: 'número não encontrado' });
  try {
    const status = await statusConexao(conexao);
    res.json({ conectado: Boolean(status && status.connected), motivo: (status && status.error) || null });
  } catch (erro) {
    res.status(502).json({ erro: erro.message });
  }
});

router.get('/whatsapps/:id/qrcode', async (req, res) => {
  const { conexao, naoExiste } = conexaoDoParametro(req.params.id);
  if (naoExiste) return res.status(404).json({ erro: 'número não encontrado' });
  try {
    // Conectada, a Z-API nao devolve QR Code nenhum - checar antes evita a
    // tela ficar esperando uma imagem que nunca vem.
    const status = await statusConexao(conexao);
    if (status && status.connected) return res.json({ conectado: true, imagem: null });
    const qr = await obterQrCode(conexao);
    res.json({ conectado: false, imagem: (qr && qr.value) || null });
  } catch (erro) {
    res.status(502).json({ erro: erro.message });
  }
});

router.post('/whatsapps/:id/desconectar', async (req, res) => {
  const { conexao, naoExiste } = conexaoDoParametro(req.params.id);
  if (naoExiste) return res.status(404).json({ erro: 'número não encontrado' });
  try {
    await desconectar(conexao);
    res.json({ ok: true });
  } catch (erro) {
    res.status(502).json({ erro: erro.message });
  }
});

module.exports = router;
