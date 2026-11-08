// Testes dos riscos que a suite antiga nao cobria: o que acontece quando
// duas coisas mudam AO MESMO TEMPO (voce mexe no painel enquanto a IA esta
// esperando o lead terminar de digitar, o lead responde enquanto o ciclo de
// envio esta na fila, a Claude cai no meio da conversa).
//
// Cada caso descreve o comportamento ESPERADO. Quando este arquivo foi
// escrito, os casos 1 a 4 e o 5c falhavam (8/22 passavam, igual em tres
// execucoes seguidas) - apontavam defeito no codigo, nao no teste. Os
// consertos entraram em whatsapp-webhook.js e scheduler.js, e agora este
// arquivo faz parte do "npm test".
//
// O caso 4 (duplicata sem messageId, reinicio, expiracao) e decisao sua: se
// voce aceitar esse risco, apague o caso em vez de mudar o codigo.
//
// Nao precisa de chave nem de internet: Z-API e Claude sao falsas, tudo
// roda em 127.0.0.1, banco temporario, so numeros sinteticos (55479000xxxx).
//
//   node testes/riscos.js
//   node testes/riscos.js ciclo      (filtra por nome do caso)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-riscos-'));
fs.mkdirSync(path.join(pasta, 'data'), { recursive: true });

process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(pasta, 'data');
process.env.SEGUNDOS_PARA_JUNTAR_MENSAGENS = '1'; // 1s em vez de 12
process.env.ZAPI_INSTANCE_ID = 'i';
process.env.ZAPI_TOKEN = 't';
process.env.ZAPI_CLIENT_TOKEN = 'c';
process.env.CONSULTOR_WHATSAPP = '5547900000000';
process.env.ANTHROPIC_API_KEY = 'nao-usada-neste-teste';
delete process.env.OPENAI_API_KEY;
delete process.env.ZAPI_WEBHOOK_SEGREDO;

const CONSULTOR = '5547900000000';
const P = '5547900000101';
const A = '5547900000201';
const B = '5547900000202';

// --- Z-API falsa: anota tudo que o sistema tenta enviar ---
const enviadas = []; // { phone, message }
const zapi = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (p) => (corpo += p));
  req.on('end', () => {
    let j = {};
    try { j = JSON.parse(corpo || '{}'); } catch (e) { /* ignora */ }
    if (j.phone) enviadas.push({ phone: j.phone, message: j.message });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messageId: 'FAKE' }));
  });
});

// --- Claude falsa ---
let chamadasDaIA = 0;
let iaForaDoAr = false;
const caminhoClaude = require.resolve('../src/services/claude');
require('../src/services/claude');
require.cache[caminhoClaude].exports = {
  responderConversa: async () => {
    chamadasDaIA += 1;
    if (iaForaDoAr) throw new Error('Claude API: 529 overloaded (simulado)');
    return {
      resposta: 'resposta da IA',
      descadastrar: false, encaminharHumano: false, horarioConfirmado: false,
      motivo: null, resumoParaConsultor: null, qualificacao: null,
    };
  },
  descreverImagem: async () => 'uma foto de trator',
};

const axios = require('axios');
const postDireto = axios.post;

const store = require('../src/db/store');
const { rodarCiclo } = require('../src/services/scheduler');

// --- arnes ---
const filtro = (process.argv[2] || '').toLowerCase();
let total = 0;
let falhas = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function ok(rotulo, condicao, detalhe) {
  total += 1;
  if (!condicao) {
    falhas += 1;
    console.log(`FALHA  ${rotulo}` + (detalhe !== undefined ? `  -> recebi: ${JSON.stringify(detalhe)}` : ''));
  } else {
    console.log(`OK     ${rotulo}`);
  }
}
function igual(rotulo, recebido, esperado) {
  ok(rotulo, JSON.stringify(recebido) === JSON.stringify(esperado), recebido);
}

// Reescrever o banco a cada caso zera tambem a pausa e os bloqueios.
function bancoCom(leads, horarios = {}) {
  fs.writeFileSync(path.join(pasta, 'data', 'db.json'), JSON.stringify({
    leads,
    bloqueados: {},
    codigoAcesso: '000000',
    config: {
      identidade: { nome: 'Guilherme', empresa: 'Teste', contexto: '' },
      whatsapps: [], mensagens: ['Abertura pra {nome}.'], mensagensFollowup: [], regras: [],
      horarios: {
        inicio: 0, fim: 24, atrasoMinMinutos: 5, atrasoMaxMinutos: 15,
        intervaloMinSegundos: 0, intervaloMaxSegundos: 0,
        followupHorasMin: 24, followupHorasMax: 36, limiteDiarioDestinatarios: 40,
        ...horarios,
      },
      versaoHorarios: 2, maxRespostasAutomaticas: 5,
    },
  }, null, 2));
}

// Lead que ja recebeu a abertura e pode responder.
function leadEmConversa(phone, extra = {}) {
  return {
    phone, nome: 'Lead Sintetico', whatsappId: null, teste: true,
    attemptsSent: 1, status: 'aguardando_resposta', respostasAutomaticas: 0,
    mensagensEnviadas: ['Abertura pra Lead.'],
    conversa: [{ de: 'ia', texto: 'Abertura pra Lead.', timestamp: new Date().toISOString() }],
    enviosEm: [], proximoEnvioEm: null,
    ...extra,
  };
}

// Lead na fila do ciclo, com a hora de envio ja vencida.
function leadNaFila(phone) {
  return {
    phone, nome: 'Fila', whatsappId: null, teste: true,
    attemptsSent: 0, status: 'sequence_active', respostasAutomaticas: 0,
    mensagensEnviadas: [], conversa: [], enviosEm: [],
    proximoEnvioEm: new Date(Date.now() - 60_000).toISOString(),
  };
}

const paraO = (phone) => enviadas.filter((e) => e.phone === phone);
const mensagensDoLead = (phone) => (store.getLead(phone).conversa || []).filter((m) => m.de === 'lead').length;
const ehAbertura = (e) => (e.message || '').includes('Abertura pra');

async function ate(condicao, limiteMs = 10_000) {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) return false;
    await esperar(25);
  }
  return true;
}

const casos = [];
function caso(nome, corpo) { casos.push({ nome, corpo }); }

// =====================================================================
// RISCO 1 - voce mexe no lead enquanto a IA espera o debounce.
// Hoje: depois da espera o webhook rele o lead, mas so confere a ultima
// mensagem - nao confere status, pausa nem bloqueio - e responde mesmo assim.
// =====================================================================
caso('1a encerrei a conversa durante a espera da IA', async ({ mandar }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  const pendente = mandar(P, 'quero saber do consorcio');
  await esperar(300);
  store.upsertLead(P, { status: 'encerrado', motivoEncerramento: 'assumido_manualmente' });
  await pendente;
  await esperar(300);
  igual('nenhuma resposta automatica sai depois que eu encerrei', paraO(P).length, 0);
  igual('o status continua encerrado (nao volta pra conversa_ia)', store.getLead(P).status, 'encerrado');
});

caso('1b pausei o sistema durante a espera da IA', async ({ mandar }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  const pendente = mandar(P, 'quero saber do consorcio');
  await esperar(300);
  store.setPausado(true);
  await pendente;
  await esperar(300);
  igual('com o sistema pausado, a IA nao responde', paraO(P).length, 0);
});

caso('1c bloqueei o numero durante a espera da IA', async ({ mandar }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  const pendente = mandar(P, 'quero saber do consorcio');
  await esperar(300);
  store.bloquearNumero(P, { motivo: 'bloqueado no painel', origem: 'manual' });
  await pendente;
  await esperar(300);
  igual('numero bloqueado nao recebe resposta automatica', paraO(P).length, 0);
});

// =====================================================================
// RISCO 2 - o lead responde enquanto o rodarCiclo() espera a vez do numero.
// Hoje: o ciclo trabalha com a foto da fila tirada no inicio, manda a
// abertura pra quem ja esta conversando e grava status por cima.
// =====================================================================
caso('2 ciclo: lead responde antes da abertura dele sair', async ({ mandar }) => {
  bancoCom({ [A]: leadNaFila(A), [B]: leadNaFila(B) }, { intervaloMinSegundos: 2, intervaloMaxSegundos: 2 });
  const ciclo = rodarCiclo();
  // B escreve primeiro (viu o anuncio, por exemplo) enquanto o ciclo
  // segura a pausa de 2s entre um envio e outro.
  await esperar(300);
  await mandar(B, 'vi o anuncio, me explica');
  await ciclo;
  await esperar(200);
  const b = store.getLead(B);
  ok('a abertura NAO sai pra quem ja respondeu', !paraO(B).some(ehAbertura), paraO(B));
  igual('o status do B continua conversa_ia', b.status, 'conversa_ia');
  igual('e a resposta que a IA contou continua contada', b.respostasAutomaticas, 1);
  ok('o A recebeu a abertura normalmente', paraO(A).some(ehAbertura), paraO(A));
});

// =====================================================================
// RISCO 3 - a Claude cai no meio da conversa.
// Hoje: o catch so grava log. O lead fica sem resposta, voce nao sabe, e a
// retentativa do mesmo evento e descartada pela trava de duplicado.
// =====================================================================
caso('3 Claude fora do ar', async ({ mandarCru }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  iaForaDoAr = true;
  await mandarCru({ type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'R3-IA-FALHA', text: { message: 'quero saber' } });
  await esperar(300);
  const l = store.getLead(P);
  ok('eu sou avisado que a IA nao conseguiu responder', paraO(CONSULTOR).length >= 1, enviadas);
  igual('o lead passa pra mim em vez de ficar parado', l.status, 'human_handoff');
  igual('e nao sai nada inventado pro lead', paraO(P).length, 0);
});

// =====================================================================
// RISCO 4 - duplicatas que a trava em memoria nao pega.
// Decisao de design: se aceitar o risco, apague este bloco.
// =====================================================================
caso('4a evento sem messageId chega duas vezes', async ({ mandarCru }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  const payload = { type: 'ReceivedCallback', phone: P, fromMe: false, text: { message: 'quero saber' } };
  await Promise.all([mandarCru(payload), mandarCru(payload)]);
  await esperar(300);
  // Nao confere o contador aqui: com dois webhooks juntos ele as vezes bate
  // e as vezes fica uma abaixo, conforme quem grava primeiro - assercao que
  // depende de sorte nao serve de teste.
  igual('sai UMA resposta, nao duas', paraO(P).length, 1);
  igual('a mensagem do lead nao duplica no historico', mensagensDoLead(P), 1);
});

caso('4b servidor reinicia entre o evento e a retentativa', async ({ mandarCru, reiniciarWebhook }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  const payload = { type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'R4-REINICIO', text: { message: 'me explica' } };
  await mandarCru(payload);
  await reiniciarWebhook(); // deploy do Railway: a memoria da trava some
  await mandarCru(payload);
  await esperar(300);
  igual('a retentativa depois do reinicio nao gera segunda resposta', paraO(P).length, 1);
  igual('e nao duplica a mensagem do lead', mensagensDoLead(P), 1);
});

caso('4c retentativa chega depois da janela de 10 minutos', async ({ mandarCru }) => {
  bancoCom({ [P]: leadEmConversa(P) });
  const payload = { type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'R4-EXPIRA', text: { message: 'oi' } };
  await mandarCru(payload);
  const agoraDeVerdade = Date.now;
  try {
    Date.now = () => agoraDeVerdade() + 11 * 60 * 1000;
    await mandarCru(payload);
  } finally {
    Date.now = agoraDeVerdade;
  }
  await esperar(300);
  igual('o mesmo evento 11 min depois nao gera segunda resposta', paraO(P).length, 1);
});

// =====================================================================
// RISCO 5 - o ciclo de envio respeita bloqueio, pausa e teto.
// Nenhum teste chamava o rodarCiclo() antes deste arquivo.
// =====================================================================
caso('5a ciclo: numero bloqueado depois de entrar na fila', async () => {
  bancoCom({ [A]: leadNaFila(A) });
  store.bloquearNumero(A, { motivo: 'pediu pra sair', origem: 'pedido_do_lead' });
  await rodarCiclo();
  igual('nada sai pra quem foi bloqueado', paraO(A).length, 0);
  igual('e o lead sai da fila como optout', store.getLead(A).motivoEncerramento, 'optout');
});

caso('5b ciclo: teto diario por numero', async () => {
  bancoCom({ [A]: leadNaFila(A), [B]: leadNaFila(B) }, { limiteDiarioDestinatarios: 1 });
  await rodarCiclo();
  const sairam = enviadas.filter(ehAbertura).length;
  igual('com teto 1, so uma abertura sai', sairam, 1);
  const quemFicou = [A, B].map((t) => store.getLead(t)).find((l) => l.attemptsSent === 0);
  ok('quem ficou de fora continua na fila pra amanha',
    Boolean(quemFicou) && quemFicou.status === 'sequence_active' && Boolean(quemFicou.proximoEnvioEm), quemFicou);
});

caso('5c ciclo: apertei pausa no meio do ciclo', async () => {
  bancoCom({ [A]: leadNaFila(A), [B]: leadNaFila(B) }, { intervaloMinSegundos: 2, intervaloMaxSegundos: 2 });
  const ciclo = rodarCiclo();
  // Pausa 500ms depois que a primeira abertura sai: nesse ponto o ciclo ja
  // esta dentro da espera de 2s antes da proxima - e o caso real de apertar
  // "Pausar" no meio dos 60-180s entre um envio e outro. Hoje a pausa so e
  // conferida ANTES dessa espera, entao a proxima abertura sai mesmo assim.
  const saiuAPrimeira = await ate(() => enviadas.some(ehAbertura));
  await esperar(500);
  store.setPausado(true);
  const antes = enviadas.filter(ehAbertura).length;
  await ciclo;
  ok('a primeira abertura saiu (pre-condicao do teste)', saiuAPrimeira);
  igual('depois que eu pausei, nenhuma abertura sai', enviadas.filter(ehAbertura).length - antes, 0);
});

// =====================================================================
zapi.listen(0, () => {
  const portaZapi = zapi.address().port;
  axios.post = (url, ...resto) =>
    postDireto(url.replace('https://api.z-api.io', `http://127.0.0.1:${portaZapi}`), ...resto);

  const express = require('express');
  const caminhoWebhook = require.resolve('../src/routes/whatsapp-webhook');
  let servidor = null;

  function subirWebhook() {
    const app = express();
    app.use('/webhooks', require('../src/routes/whatsapp-webhook'));
    return new Promise((r) => { const s = app.listen(0, () => r(s)); });
  }

  // Simula um deploy: derruba o servidor e carrega o modulo do webhook do
  // zero, como um processo novo faria (a Claude falsa continua no cache).
  async function reiniciarWebhook() {
    await new Promise((r) => servidor.close(r));
    delete require.cache[caminhoWebhook];
    servidor = await subirWebhook();
  }

  const url = () => `http://127.0.0.1:${servidor.address().port}/webhooks/whatsapp`;
  const mandarCru = (payload) => postDireto(url(), payload, { validateStatus: () => true });
  const mandar = (phone, texto) =>
    mandarCru({ type: 'ReceivedCallback', phone, fromMe: false, messageId: 'R' + Math.random(), text: { message: texto } });

  (async () => {
    servidor = await subirWebhook();
    for (const { nome, corpo } of casos) {
      if (filtro && !nome.toLowerCase().includes(filtro)) continue;
      console.log(`\n== ${nome} ==`);
      enviadas.length = 0;
      iaForaDoAr = false;
      try {
        await corpo({ mandar, mandarCru, reiniciarWebhook });
      } catch (erro) {
        falhas += 1; total += 1;
        console.log(`FALHA  o caso quebrou: ${erro.message}`);
      }
    }

    console.log(`\n${total - falhas}/${total} passaram`);
    servidor.close();
    zapi.close();
    fs.rmSync(pasta, { recursive: true, force: true });
    process.exit(falhas ? 1 : 0);
  })();
});
