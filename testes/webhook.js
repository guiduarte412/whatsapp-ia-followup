// Testes do webhook: o caminho inteiro de uma mensagem que chega.
//
// Nao precisa de chave, nao precisa de internet, nao manda nada pro WhatsApp
// de verdade: a Z-API e a Claude sao substituidas por versoes falsas aqui
// dentro. Nao toca no banco de producao (db.json temporario).
//
//   node testes/webhook.js
//   node testes/webhook.js duplicado    (filtra por nome do caso)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-webhook-'));
fs.mkdirSync(path.join(pasta, 'data'), { recursive: true });

process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(pasta, 'data');
process.env.SEGUNDOS_PARA_JUNTAR_MENSAGENS = '1'; // 1s em vez de 12 pro teste nao arrastar
process.env.ZAPI_INSTANCE_ID = 'i';
process.env.ZAPI_TOKEN = 't';
process.env.ZAPI_CLIENT_TOKEN = 'c';
process.env.CONSULTOR_WHATSAPP = '5547900000000';
process.env.ANTHROPIC_API_KEY = 'nao-usada-neste-teste';
delete process.env.OPENAI_API_KEY;
delete process.env.ZAPI_WEBHOOK_SEGREDO;

const CONSULTOR = '5547900000000';

// --- Z-API falsa ---
// Anota tudo que o sistema tenta enviar. "telefonesQueFalham" simula a
// Z-API recusando o envio pra um numero.
const enviadas = [];           // { phone, message }
const telefonesQueFalham = new Set();

const zapi = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (p) => (corpo += p));
  req.on('end', () => {
    let j = {};
    try { j = JSON.parse(corpo || '{}'); } catch (e) { /* ignora */ }
    if (telefonesQueFalham.has(j.phone)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'instancia desconectada' }));
    }
    if (j.phone) enviadas.push({ phone: j.phone, message: j.message });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messageId: 'FAKE' }));
  });
});

// --- Claude falsa ---
// "proximaResposta" deixa cada caso decidir o que a IA devolve, sem
// depender do modelo de verdade (e sem gastar credito).
let chamadasDaIA = 0;
let historicosVistos = [];
let proximaResposta = null;

function respostaPadrao() {
  return {
    resposta: 'entendi, me conta mais',
    descadastrar: false, encaminharHumano: false, horarioConfirmado: false,
    motivo: null, resumoParaConsultor: null, qualificacao: null,
  };
}

const caminhoClaude = require.resolve('../src/services/claude');
require('../src/services/claude');
require.cache[caminhoClaude].exports = {
  responderConversa: async ({ historicoConversa }) => {
    chamadasDaIA += 1;
    historicosVistos.push(historicoConversa.filter((m) => m.de === 'lead').map((m) => m.texto));
    const r = proximaResposta || respostaPadrao();
    proximaResposta = null;
    return r;
  },
  descreverImagem: async () => 'uma foto de trator',
};

const axios = require('axios');
const postDireto = axios.post;

const store = require('../src/db/store');

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

function bancoCom(leads, config = {}) {
  fs.writeFileSync(path.join(pasta, 'data', 'db.json'), JSON.stringify({
    leads,
    bloqueados: {},
    codigoAcesso: '000000',
    config: {
      identidade: { nome: 'Guilherme', empresa: 'FourAgro', contexto: '' },
      whatsapps: [], mensagens: ['Bom dia, {nome}.'], mensagensFollowup: [], regras: [],
      horarios: {
        inicio: 0, fim: 24, atrasoMinMinutos: 5, atrasoMaxMinutos: 15,
        intervaloMinSegundos: 0, intervaloMaxSegundos: 0,
        followupHorasMin: 24, followupHorasMax: 36, limiteDiarioDestinatarios: 40,
      },
      versaoHorarios: 2, maxRespostasAutomaticas: 5,
      ...config,
    },
  }, null, 2));
}

function lead(phone, extra = {}) {
  return {
    phone, nome: 'Joao da Silva', whatsappId: null, teste: false,
    attemptsSent: 1, status: 'aguardando_resposta', respostasAutomaticas: 0,
    mensagensEnviadas: ['Bom dia, Joao.'],
    conversa: [{ de: 'ia', texto: 'Bom dia, Joao.', timestamp: new Date().toISOString() }],
    enviosEm: [new Date().toISOString()], proximoEnvioEm: null,
    ...extra,
  };
}

const casos = [];
function caso(nome, corpo) { casos.push({ nome, corpo }); }

const P = '5547992412727';

// =====================================================================
caso('evento que nao e mensagem', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  const r1 = await mandarCru({ type: 'DeliveryCallback', phone: P, messageId: 'M1' });
  const r2 = await mandarCru({ type: 'MessageStatusCallback', phone: P, status: 'READ' });
  await esperar(1500);
  igual('confirmacao de entrega responde 200', r1.status, 200);
  ok('e e marcada como ignorada', r1.data?.ignorado === 'DeliveryCallback', r1.data);
  igual('"visto por" tambem e ignorado', r2.data?.ignorado, 'MessageStatusCallback');
  igual('a IA nao foi chamada por um evento desses', chamadasDaIA, antes);
  igual('e nada foi enviado', enviadas.length, 0);
});

// =====================================================================
caso('telefone fora da base', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  const r = await mandarCru({ type: 'ReceivedCallback', phone: '5511988887777', fromMe: false, messageId: 'M2', text: { message: 'oi' } });
  await esperar(1500);
  igual('responde 200 (nao e erro)', r.status, 200);
  igual('a IA nao foi chamada', chamadasDaIA, antes);
  igual('nada enviado', enviadas.length, 0);
  ok('e nao criou lead novo', store.getLead('5511988887777') === null);
});

// =====================================================================
caso('payload sem telefone', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const r = await mandarCru({ type: 'ReceivedCallback', fromMe: false, messageId: 'M3', text: { message: 'oi' } });
  igual('recusa com 400', r.status, 400);
});

// =====================================================================
caso('mensagem normal e respondida', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  await mandar(P, 'bom dia, quero saber do consorcio');
  await esperar(2000);
  const l = store.getLead(P);
  igual('a IA foi chamada uma vez', chamadasDaIA, antes + 1);
  igual('saiu uma resposta', enviadas.length, 1);
  igual('a resposta foi pro lead', enviadas[0].phone, P);
  igual('gastou 1 das 5 respostas', l.respostasAutomaticas, 1);
  igual('status virou conversa_ia', l.status, 'conversa_ia');
  igual('a mensagem do lead ficou no historico', l.conversa.filter((m) => m.de === 'lead').length, 1);
  igual('a resposta da IA tambem', l.conversa.filter((m) => m.de === 'ia').length, 2);
});

// =====================================================================
// O caso critico: a Z-API reenvia o mesmo evento quando nao recebe 200 em
// tempo - e o handler segura a resposta por 12s de proposito (debounce).
caso('webhook duplicado ao mesmo tempo', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  const payload = { type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'MESMO-ID-1', text: { message: 'quero saber do consorcio' } };
  await Promise.all([mandarCru(payload), mandarCru(payload)]);
  await esperar(2500);
  const l = store.getLead(P);
  igual('o mesmo messageId nao gera duas respostas', enviadas.length, 1);
  igual('a IA foi chamada uma vez, nao duas', chamadasDaIA, antes + 1);
  igual('nao gastou duas das cinco respostas', l.respostasAutomaticas, 1);
  igual('a mensagem nao aparece duplicada no historico', l.conversa.filter((m) => m.de === 'lead').length, 1);
});

// =====================================================================
caso('webhook duplicado depois de responder (retentativa tardia)', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  const payload = { type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'MESMO-ID-2', text: { message: 'me explica como funciona' } };
  await mandarCru(payload);
  await esperar(2000);          // a primeira ja respondeu
  await mandarCru(payload);     // a Z-API reenvia o MESMO evento
  await esperar(2000);
  const l = store.getLead(P);
  igual('retentativa tardia nao gera segunda resposta', enviadas.length, 1);
  igual('a IA nao foi chamada de novo', chamadasDaIA, antes + 1);
  igual('nao gastou outra das cinco respostas', l.respostasAutomaticas, 1);
});

// =====================================================================
caso('eco da propria IA nao encerra a conversa', async (mandarCru) => {
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', conversa: [
    { de: 'ia', texto: 'Bom dia, Joao.' },
    { de: 'lead', texto: 'bom dia' },
    { de: 'ia', texto: 'entendi, me conta mais' },
  ] }) });
  // mesma mensagem que a IA acabou de registrar, voltando como fromMe
  await mandarCru({ type: 'ReceivedCallback', phone: P, fromMe: true, messageId: 'M5', text: { message: 'entendi, me conta mais' } });
  await esperar(500);
  const l = store.getLead(P);
  igual('o eco nao encerra o atendimento', l.status, 'conversa_ia');
  igual('e nao duplica no historico', l.conversa.length, 3);
});

// =====================================================================
caso('mensagem digitada por mim encerra o automatico', async (mandarCru) => {
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', conversa: [
    { de: 'ia', texto: 'Bom dia, Joao.' },
    { de: 'lead', texto: 'bom dia' },
    { de: 'ia', texto: 'entendi, me conta mais' },
  ] }) });
  await mandarCru({ type: 'ReceivedCallback', phone: P, fromMe: true, messageId: 'M6', text: { message: 'Joao, aqui e o Guilherme, vou te ligar agora' } });
  await esperar(500);
  const l = store.getLead(P);
  igual('encerra o atendimento automatico', l.status, 'encerrado');
  igual('e registra o motivo', l.motivoEncerramento, 'assumido_manualmente');
  ok('a minha mensagem entra no historico', l.conversa.some((m) => m.texto.includes('vou te ligar')));
});

// =====================================================================
caso('sistema pausado nao responde', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P) });
  store.setPausado(true);
  const antes = chamadasDaIA;
  await mandar(P, 'oi, tenho interesse');
  await esperar(1500);
  const l = store.getLead(P);
  igual('a IA nao foi chamada', chamadasDaIA, antes);
  igual('nada foi enviado', enviadas.length, 0);
  igual('mas a mensagem do lead foi registrada', l.conversa.filter((m) => m.de === 'lead').length, 1);
  igual('o status nao mudou', l.status, 'aguardando_resposta');
  store.setPausado(false);
});

// =====================================================================
caso('pedido de descadastro escrito', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  await mandar(P, 'nao quero mais receber mensagem');
  await esperar(1000);
  const l = store.getLead(P);
  igual('a IA nao foi chamada (resolvido antes)', chamadasDaIA, antes);
  igual('o numero foi bloqueado', store.numeroEstaBloqueado(P), true);
  igual('o atendimento foi encerrado', l.status, 'encerrado');
  igual('com motivo optout', l.motivoEncerramento, 'optout');
  ok('saiu UMA despedida pro lead', enviadas.filter((e) => e.phone === P).length === 1, enviadas);
  ok('e um aviso pra mim', enviadas.some((e) => e.phone === CONSULTOR), enviadas);
  store.desbloquearNumero(P);
});

// =====================================================================
caso('digitou 1 (sair da lista)', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  await mandar(P, '1');
  await esperar(1000);
  const l = store.getLead(P);
  igual('a IA nao foi chamada', chamadasDaIA, antes);
  igual('numero bloqueado', store.numeroEstaBloqueado(P), true);
  igual('encerrado por optout', l.motivoEncerramento, 'optout');
  store.desbloquearNumero(P);
});

// =====================================================================
caso('digitou 2 (falar comigo)', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  await mandar(P, '2');
  await esperar(1000);
  const l = store.getLead(P);
  igual('a IA nao responde - a conversa e minha', chamadasDaIA, antes);
  igual('passou pra humano', l.status, 'human_handoff');
  ok('recebi o aviso', enviadas.some((e) => e.phone === CONSULTOR), enviadas);
  ok('nao mandou nada automatico pro lead', enviadas.every((e) => e.phone !== P), enviadas);
});

// =====================================================================
caso('numero bloqueado volta a escrever', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P) });
  store.bloquearNumero(P, { motivo: 'pediu antes', origem: 'pedido_do_lead' });
  const antes = chamadasDaIA;
  await mandar(P, 'mudei de ideia, quero saber');
  await esperar(1000);
  const l = store.getLead(P);
  igual('a IA nao responde a quem pediu pra sair', chamadasDaIA, antes);
  ok('nada automatico pro lead', enviadas.every((e) => e.phone !== P), enviadas);
  ok('mas eu sou avisado', enviadas.some((e) => e.phone === CONSULTOR));
  igual('e a mensagem fica registrada', l.conversa.filter((m) => m.de === 'lead').length, 1);
  store.desbloquearNumero(P);
});

// =====================================================================
caso('horario confirmado encerra e avisa', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', respostasAutomaticas: 2 }) });
  proximaResposta = {
    resposta: 'Fechado, te ligo amanha as 9h.',
    descadastrar: false, encaminharHumano: false, horarioConfirmado: true,
    motivo: null, resumoParaConsultor: 'Amanha 9h, quer trocar o trator',
    qualificacao: { bem: 'trator', prazo: 'este ano', aceitaIncerteza: true },
  };
  await mandar(P, 'amanha 9h pode ser');
  await esperar(2000);
  const l = store.getLead(P);
  igual('encerra o atendimento automatico', l.status, 'encerrado');
  igual('com motivo horario_confirmado', l.motivoEncerramento, 'horario_confirmado');
  ok('o lead recebeu a confirmacao', enviadas.some((e) => e.phone === P && e.message.includes('Fechado')), enviadas);
  const aviso = enviadas.find((e) => e.phone === CONSULTOR);
  ok('recebi o aviso com o horario', Boolean(aviso) && aviso.message.includes('9h'), aviso);
  ok('o aviso traz a qualificacao', Boolean(aviso) && aviso.message.includes('trator'), aviso);
  igual('a qualificacao ficou salva', l.qualificacao.bem, 'trator');
});

// =====================================================================
caso('qualificacao nao se apaga entre mensagens', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', respostasAutomaticas: 1, qualificacao: { bem: 'trator', prazo: null, aceitaIncerteza: null } }) });
  proximaResposta = {
    ...respostaPadrao(),
    qualificacao: { bem: null, prazo: 'ate a safra', aceitaIncerteza: null },
  };
  await mandar(P, 'preciso ate a safra');
  await esperar(2000);
  const l = store.getLead(P);
  igual('o prazo novo entrou', l.qualificacao.prazo, 'ate a safra');
  igual('e o bem de antes NAO foi apagado', l.qualificacao.bem, 'trator');
});

// =====================================================================
caso('encaminhar pra humano quando a IA pede', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', respostasAutomaticas: 1 }) });
  proximaResposta = {
    resposta: 'Vou te passar pro Guilherme.',
    descadastrar: false, encaminharHumano: true, horarioConfirmado: false,
    motivo: 'pediu taxa duas vezes', resumoParaConsultor: 'quer numero fechado',
    qualificacao: null,
  };
  await mandar(P, 'qual a taxa exatamente?');
  await esperar(2000);
  const l = store.getLead(P);
  igual('passa pra humano', l.status, 'human_handoff');
  igual('com motivo registrado', l.motivoEncerramento, 'encaminhado_pela_ia');
  ok('o lead nao fica sem resposta', enviadas.some((e) => e.phone === P), enviadas);
  ok('e eu recebo o contexto', enviadas.some((e) => e.phone === CONSULTOR && e.message.includes('fechado')), enviadas);
});

// =====================================================================
caso('teto de respostas automaticas', async (_cru, mandar) => {
  // 5 de 5 ja gastas: a proxima mensagem nao pode ser respondida pela IA
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', respostasAutomaticas: 5 }) });
  const antes = chamadasDaIA;
  await mandar(P, 'e ai, como fica?');
  await esperar(2000);
  const l = store.getLead(P);
  igual('a IA nao e chamada depois do teto', chamadasDaIA, antes);
  igual('passa pra humano', l.status, 'human_handoff');
  ok('e eu sou avisado', enviadas.some((e) => e.phone === CONSULTOR), enviadas);
});

// =====================================================================
caso('lead que ja esta comigo (human_handoff)', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P, { status: 'human_handoff' }) });
  const antes = chamadasDaIA;
  await mandar(P, 'consegue me ligar hoje?');
  await esperar(1500);
  const l = store.getLead(P);
  igual('a IA nao interfere', chamadasDaIA, antes);
  ok('nada automatico pro lead', enviadas.every((e) => e.phone !== P), enviadas);
  ok('mas eu sou avisado da mensagem nova', enviadas.some((e) => e.phone === CONSULTOR && e.message.includes('ligar hoje')), enviadas);
  igual('a mensagem fica registrada', l.conversa.filter((m) => m.de === 'lead').length, 1);
});

// =====================================================================
caso('lead encerrado nao incomoda ninguem', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P, { status: 'encerrado', motivoEncerramento: 'horario_confirmado' }) });
  const antes = chamadasDaIA;
  await mandar(P, 'obrigado!');
  await esperar(1500);
  const l = store.getLead(P);
  igual('a IA nao e chamada', chamadasDaIA, antes);
  igual('nada e enviado (nem aviso)', enviadas.length, 0);
  igual('mas a mensagem fica registrada', l.conversa.filter((m) => m.de === 'lead').length, 1);
});

// =====================================================================
caso('responder antes da abertura cancela a 2a tentativa', async (_cru, mandar) => {
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  bancoCom({ [P]: lead(P, { status: 'sequence_active', attemptsSent: 0, proximoEnvioEm: amanha, conversa: [] }) });
  await mandar(P, 'vi seu anuncio, me explica');
  await esperar(2000);
  const l = store.getLead(P);
  igual('o envio agendado foi cancelado', l.proximoEnvioEm, null);
  ok('e a IA respondeu normalmente', enviadas.some((e) => e.phone === P), enviadas);
});

// =====================================================================
caso('falha de envio vira aviso, nao silencio', async (_cru, mandar) => {
  bancoCom({ [P]: lead(P, { status: 'conversa_ia', respostasAutomaticas: 1 }) });
  telefonesQueFalham.add(P);
  await mandar(P, 'manda o detalhe');
  await esperar(2000);
  telefonesQueFalham.delete(P);
  const l = store.getLead(P);
  igual('passa pra humano quando o envio falha', l.status, 'human_handoff');
  const aviso = enviadas.find((e) => e.phone === CONSULTOR);
  ok('eu sou avisado da falha', Boolean(aviso), enviadas);
  ok('o aviso diz o motivo da Z-API', Boolean(aviso) && aviso.message.includes('desconectada'), aviso);
});

// =====================================================================
caso('audio sem transcricao configurada', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  await mandarCru({ type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'M9', audio: { audioUrl: 'http://127.0.0.1:1/x.ogg', seconds: 12 } });
  await esperar(1500);
  const l = store.getLead(P);
  igual('a IA nao inventa resposta sem saber o que foi dito', chamadasDaIA, antes);
  ok('eu sou avisado pra ouvir no WhatsApp', enviadas.some((e) => e.phone === CONSULTOR && e.message.includes('voz')), enviadas);
  ok('e fica registrado que chegou audio', l.conversa.some((m) => m.texto.includes('áudio')), l.conversa);
});

// =====================================================================
caso('clique em botao e lido como escolha', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  const antes = chamadasDaIA;
  await mandarCru({
    type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'M10',
    buttonsResponseMessage: { buttonId: '2', message: 'Quero falar com você' },
  });
  await esperar(1000);
  const l = store.getLead(P);
  igual('botao 2 passa pra humano sem chamar a IA', chamadasDaIA, antes);
  igual('status human_handoff', l.status, 'human_handoff');
});

// =====================================================================
caso('segredo do webhook fecha a porta', async (mandarCru) => {
  bancoCom({ [P]: lead(P) });
  process.env.ZAPI_WEBHOOK_SEGREDO = 'segredo-de-teste';
  const antes = chamadasDaIA;
  const semSegredo = await mandarCru({ type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'M11', text: { message: 'injetado' } });
  igual('sem o segredo: 401', semSegredo.status, 401);
  igual('a IA nao foi chamada', chamadasDaIA, antes);
  igual('e nada foi gravado', (store.getLead(P).conversa || []).filter((m) => m.de === 'lead').length, 0);

  const comSegredo = await mandarCru(
    { type: 'ReceivedCallback', phone: P, fromMe: false, messageId: 'M12', text: { message: 'mensagem legitima' } },
    '?segredo=segredo-de-teste'
  );
  await esperar(2000);
  igual('com o segredo: 200', comSegredo.status, 200);
  igual('e a mensagem e processada', chamadasDaIA, antes + 1);
  delete process.env.ZAPI_WEBHOOK_SEGREDO;
});

// =====================================================================
zapi.listen(0, () => {
  const portaZapi = zapi.address().port;
  axios.post = (url, ...resto) =>
    postDireto(url.replace('https://api.z-api.io', `http://127.0.0.1:${portaZapi}`), ...resto);
  axios.get = ((original) => (url, ...resto) =>
    original(url.replace('https://api.z-api.io', `http://127.0.0.1:${portaZapi}`), ...resto))(axios.get);

  const express = require('express');
  const app = express();
  app.use('/webhooks', require('../src/routes/whatsapp-webhook'));

  const servidor = app.listen(0, async () => {
    const base = `http://127.0.0.1:${servidor.address().port}/webhooks/whatsapp`;

    const mandarCru = (payload, query = '') =>
      postDireto(base + query, payload, { validateStatus: () => true });
    const mandar = (phone, texto) =>
      mandarCru({ type: 'ReceivedCallback', phone, fromMe: false, messageId: 'M' + Math.random(), text: { message: texto } });

    for (const { nome, corpo } of casos) {
      if (filtro && !nome.toLowerCase().includes(filtro)) continue;
      console.log(`\n== ${nome} ==`);
      enviadas.length = 0;
      historicosVistos = [];
      proximaResposta = null;
      try {
        await corpo(mandarCru, mandar);
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
  });
});
