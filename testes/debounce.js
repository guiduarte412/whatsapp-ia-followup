// Teste do debounce: as mensagens que o lead manda em sequencia viram UMA
// resposta, nao uma por mensagem.
//
// Nao precisa de chave nem de internet: a Claude e a Z-API sao substituidas
// por versoes falsas aqui dentro. Roda em uns 20 segundos.
//
//   node testes/debounce.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-debounce-'));
fs.mkdirSync(path.join(pasta, 'data'), { recursive: true });

const LEAD_A = '5547992412727';
const LEAD_B = '5554992214094';

function leadDeTeste(phone, nome) {
  return {
    phone, nome, whatsappId: null, attemptsSent: 1,
    status: 'aguardando_resposta', respostasAutomaticas: 0,
    conversa: [{ de: 'ia', texto: 'Bom dia. Aqui e o Guilherme, da FourAgro.' }],
    enviosEm: [],
  };
}

fs.writeFileSync(path.join(pasta, 'data', 'db.json'), JSON.stringify({
  leads: { [LEAD_A]: leadDeTeste(LEAD_A, 'Um'), [LEAD_B]: leadDeTeste(LEAD_B, 'Dois') },
  codigoAcesso: '000000',
  config: {
    identidade: { nome: 'Guilherme', empresa: 'FourAgro', contexto: '' },
    mensagens: ['oi {nome}'], mensagensFollowup: [], regras: [],
    horarios: {
      inicio: 0, fim: 24, atrasoMinMinutos: 5, atrasoMaxMinutos: 15,
      intervaloMinSegundos: 0, intervaloMaxSegundos: 0,
      followupHorasMin: 24, followupHorasMax: 36, limiteDiarioDestinatarios: 40,
    },
    versaoHorarios: 2, maxRespostasAutomaticas: 5,
  },
}, null, 2));

process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(pasta, 'data');
process.env.SEGUNDOS_PARA_JUNTAR_MENSAGENS = '3'; // 3s em vez de 12 pro teste nao arrastar
process.env.ZAPI_INSTANCE_ID = 'i';
process.env.ZAPI_TOKEN = 't';
process.env.ZAPI_CLIENT_TOKEN = 'c';
process.env.ANTHROPIC_API_KEY = 'nao-usada-neste-teste';

// Z-API falsa: anota o que o sistema tenta mandar, por telefone.
const enviadas = { [LEAD_A]: [], [LEAD_B]: [] };
const zapi = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (p) => (corpo += p));
  req.on('end', () => {
    try {
      const j = JSON.parse(corpo);
      if (enviadas[j.phone]) enviadas[j.phone].push(j.message);
    } catch (e) { /* payload que nao e envio de texto */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messageId: 'FAKE' }));
  });
});

// Claude falsa: devolve quantas mensagens do lead ela enxergou. E isso que
// prova que o debounce juntou - se juntou, ela ve 3 de uma vez.
let chamadasDaIA = 0;
const caminhoClaude = require.resolve('../src/services/claude');
require('../src/services/claude');
require.cache[caminhoClaude].exports = {
  responderConversa: async ({ historicoConversa }) => {
    chamadasDaIA += 1;
    const doLead = historicoConversa.filter((m) => m.de === 'lead');
    return {
      resposta: `vi ${doLead.length} mensagem(ns)`,
      descadastrar: false, encaminharHumano: false, horarioConfirmado: false,
      motivo: null, resumoParaConsultor: null, qualificacao: null,
    };
  },
  descreverImagem: async () => 'imagem',
};

const axios = require('axios');
const postDireto = axios.post;

let falhas = 0;
function ok(rotulo, condicao) {
  if (!condicao) falhas += 1;
  console.log((condicao ? 'OK  ' : 'FALHA ') + rotulo);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

zapi.listen(0, () => {
  const portaZapi = zapi.address().port;
  axios.post = (url, ...resto) =>
    postDireto(url.replace('https://api.z-api.io', `http://127.0.0.1:${portaZapi}`), ...resto);

  const express = require('express');
  const app = express();
  app.use('/webhooks', require('../src/routes/whatsapp-webhook'));

  const servidor = app.listen(0, async () => {
    const url = `http://127.0.0.1:${servidor.address().port}/webhooks/whatsapp`;
    const mandar = (phone, texto) => postDireto(url, {
      type: 'ReceivedCallback', phone, fromMe: false,
      messageId: 'M' + Math.random(), text: { message: texto },
    }).catch((e) => ({ erro: e.message }));

    // --- 1: tres mensagens em sequencia viram uma resposta ---
    console.log('\n1. tres mensagens seguidas do mesmo lead');
    const seguidas = [mandar(LEAD_A, 'bom dia')];
    await esperar(700);
    seguidas.push(mandar(LEAD_A, 'to querendo trocar o trator'));
    await esperar(700);
    seguidas.push(mandar(LEAD_A, 'mas queria ver condicao antes'));
    await Promise.all(seguidas);
    await esperar(5000);

    const store = require('../src/db/store');
    const a = store.getLead(LEAD_A);

    ok('a IA foi chamada uma vez, nao tres', chamadasDaIA === 1);
    ok('saiu uma resposta, nao tres', enviadas[LEAD_A].length === 1);
    ok('gastou 1 das 5 respostas, nao 3', a.respostasAutomaticas === 1);
    ok('a IA enxergou as tres juntas', (enviadas[LEAD_A][0] || '').includes('vi 3 mensagem'));
    ok('as tres ficaram no historico', a.conversa.filter((m) => m.de === 'lead').length === 3);

    // --- 2: mensagem unica continua sendo respondida ---
    console.log('\n2. mensagem unica (o caso mais comum)');
    const antes = chamadasDaIA;
    await mandar(LEAD_B, 'bah to precisando de area');
    await esperar(5000);
    const b = store.getLead(LEAD_B);

    ok('mensagem sozinha tambem e respondida', enviadas[LEAD_B].length === 1);
    ok('a IA foi chamada mais uma vez', chamadasDaIA === antes + 1);
    ok('enxergou a mensagem unica', (enviadas[LEAD_B][0] || '').includes('vi 1 mensagem'));
    ok('o outro lead nao foi afetado', b.respostasAutomaticas === 1);

    console.log(falhas ? `\n>>> ${falhas} FALHA(S)` : '\n>>> tudo passou');
    servidor.close();
    zapi.close();
    fs.rmSync(pasta, { recursive: true, force: true });
    process.exit(falhas ? 1 : 0);
  });
});
