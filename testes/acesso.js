// Testes de acesso: quem nao digitou o codigo nao ve nada, o codigo nao se
// quebra por tentativa e os tokens da Z-API nao voltam pro navegador.
//
// Sobe o mesmo encanamento do server.js (as rotas protegidas por
// exigirSessao), mas num banco temporario. Nao precisa de chave nem de
// internet.
//
//   node testes/acesso.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-acesso-'));
fs.mkdirSync(path.join(pasta, 'data'), { recursive: true });
process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(pasta, 'data');
delete process.env.PALAVRA_CHAVE_MESTRA; // modo "palavra-chave publica"

const CODIGO = '000000';

fs.writeFileSync(path.join(pasta, 'data', 'db.json'), JSON.stringify({
  leads: {
    '5547992412727': {
      phone: '5547992412727', nome: 'Joao da Silva', status: 'conversa_ia',
      conversa: [{ de: 'lead', texto: 'assunto privado do lead' }],
      attemptsSent: 1, respostasAutomaticas: 1, enviosEm: [], mensagensEnviadas: [],
    },
  },
  codigoAcesso: CODIGO,
  config: {
    identidade: { nome: 'Guilherme', empresa: 'FourAgro', contexto: '' },
    // Numero cadastrado COM credenciais: o teste confere que elas nao
    // voltam em claro pra tela.
    whatsapps: [{
      id: 'wa-1', apelido: 'Principal', instanceId: 'INSTANCIA-SECRETA',
      token: 'TOKEN-SUPER-SECRETO', clientToken: 'CLIENT-TOKEN-SECRETO',
      nomeExibicao: '', avisarNumero: '', ativo: true, mensagens: [], mensagensFollowup: [],
    }],
    mensagens: ['Bom dia, {nome}.'], mensagensFollowup: [], regras: [],
    horarios: {
      inicio: 7, fim: 21, atrasoMinMinutos: 5, atrasoMaxMinutos: 15,
      intervaloMinSegundos: 60, intervaloMaxSegundos: 180,
      followupHorasMin: 24, followupHorasMax: 36, limiteDiarioDestinatarios: 40,
    },
    versaoHorarios: 2, maxRespostasAutomaticas: 5,
  },
}, null, 2));

const express = require('express');
const axios = require('axios');
const { exigirSessao } = require('../src/services/sessao');
const store = require('../src/db/store');

// Mesmo encanamento do server.js: acesso publico, o resto atras da sessao.
const app = express();
app.use('/api', require('../src/routes/acesso-api'));
app.use('/api', exigirSessao, require('../src/routes/leads-api'));
app.use('/api', exigirSessao, require('../src/routes/config-api'));
app.use('/api', exigirSessao, require('../src/routes/backup-api'));

let total = 0;
let falhas = 0;
function ok(rotulo, condicao, detalhe) {
  total += 1;
  if (!condicao) {
    falhas += 1;
    console.log(`FALHA  ${rotulo}` + (detalhe !== undefined ? `  -> recebi: ${JSON.stringify(detalhe).slice(0, 300)}` : ''));
  } else {
    console.log(`OK     ${rotulo}`);
  }
}
function igual(rotulo, recebido, esperado) {
  ok(rotulo, JSON.stringify(recebido) === JSON.stringify(esperado), recebido);
}

const servidor = app.listen(0, async () => {
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = (metodo, caminho, { corpo, sessao } = {}) => axios({
    method: metodo, url: base + caminho, data: corpo,
    headers: sessao ? { 'x-sessao': sessao } : {},
    validateStatus: () => true,
  });

  console.log('\n== sem sessao, nada ==');
  const rotasProtegidas = [
    ['get', '/api/leads'],
    ['get', '/api/leads/5547992412727'],
    ['get', '/api/placar-do-dia'],
    ['get', '/api/config'],
    ['get', '/api/backup/exportar'],
  ];
  for (const [metodo, caminho] of rotasProtegidas) {
    const r = await pedir(metodo, caminho);
    igual(`${metodo.toUpperCase()} ${caminho} sem sessao = 401`, r.status, 401);
    ok(`${caminho} nao devolve dado nenhum`, JSON.stringify(r.data).includes('assunto privado') === false, r.data);
  }

  const comTokenInventado = await pedir('get', '/api/leads', { sessao: 'f'.repeat(64) });
  igual('token inventado nao vale', comTokenInventado.status, 401);
  const comTokenVazio = await pedir('get', '/api/leads', { sessao: '' });
  igual('token vazio nao vale', comTokenVazio.status, 401);

  console.log('\n== codigo de acesso ==');
  const errado = await pedir('post', '/api/acesso/verificar', { corpo: { codigo: '111111' } });
  igual('codigo errado nao abre sessao', errado.data, { valido: false });
  ok('e nao devolve token nenhum', !errado.data.sessao, errado.data);

  const certo = await pedir('post', '/api/acesso/verificar', { corpo: { codigo: CODIGO } });
  igual('codigo certo abre sessao', certo.data.valido, true);
  ok('devolve um token de tamanho razoavel', (certo.data.sessao || '').length === 64, (certo.data.sessao || '').length);
  const sessao = certo.data.sessao;

  const duasSessoes = await pedir('post', '/api/acesso/verificar', { corpo: { codigo: CODIGO } });
  ok('cada entrada gera um token diferente', duasSessoes.data.sessao !== sessao);

  console.log('\n== com sessao, tudo ==');
  const leads = await pedir('get', '/api/leads', { sessao });
  igual('GET /api/leads com sessao = 200', leads.status, 200);
  igual('e devolve o lead', leads.data.length, 1);

  const resumo = await pedir('get', '/api/leads?resumo=1', { sessao });
  ok('?resumo=1 nao manda a conversa inteira', JSON.stringify(resumo.data).includes('assunto privado') === false, resumo.data);
  ok('mas ainda manda o lead', resumo.data[0]?.phone === '5547992412727', resumo.data);

  console.log('\n== tokens da Z-API nao voltam pro navegador ==');
  const config = await pedir('get', '/api/config', { sessao });
  igual('GET /api/config com sessao = 200', config.status, 200);
  const comoTexto = JSON.stringify(config.data);
  ok('o token da Z-API NAO aparece', comoTexto.includes('TOKEN-SUPER-SECRETO') === false, comoTexto.slice(0, 200));
  ok('o client-token NAO aparece', comoTexto.includes('CLIENT-TOKEN-SECRETO') === false);
  ok('mas a tela sabe que ja esta salvo', config.data.whatsapps?.[0]?.tokenSalvo === true, config.data.whatsapps?.[0]);
  ok('e o apelido continua visivel', config.data.whatsapps?.[0]?.apelido === 'Principal');

  console.log('\n== validacao de entrada (POST /api/leads) ==');
  const semTelefone = await pedir('post', '/api/leads', { sessao, corpo: { nome: 'Sem telefone', telefone: 'abc' } });
  igual('telefone invalido = 400', semTelefone.status, 400);
  const semNome = await pedir('post', '/api/leads', { sessao, corpo: { nome: '', telefone: '47988880001' } });
  igual('nome vazio = 400', semNome.status, 400);
  const criado = await pedir('post', '/api/leads', { sessao, corpo: { nome: 'Novo Lead', telefone: '47988880001' } });
  igual('lead valido = 201', criado.status, 201);
  const repetido = await pedir('post', '/api/leads', { sessao, corpo: { nome: 'Novo Lead', telefone: '47988880001' } });
  igual('lead repetido = 200 (nao e criacao)', repetido.status, 200);
  igual('e vem marcado como ja existente', repetido.data.jaExistia, true);

  store.bloquearNumero('5547988889999', { origem: 'pedido_do_lead' });
  const bloqueado = await pedir('post', '/api/leads', { sessao, corpo: { nome: 'Pediu pra sair', telefone: '47988889999' } });
  igual('numero que pediu pra sair = 400', bloqueado.status, 400);
  ok('e a mensagem explica o motivo', (bloqueado.data.erro || '').includes('não receber'), bloqueado.data);

  const loteVazio = await pedir('post', '/api/leads/lote', { sessao, corpo: { leads: [] } });
  igual('lote vazio = 400', loteVazio.status, 400);

  const inexistente = await pedir('post', '/api/leads/5511000000000/encerrar', { sessao });
  igual('encerrar lead que nao existe = 404', inexistente.status, 404);

  const whatsappInvalido = await pedir('post', '/api/leads/5547992412727/whatsapp', { sessao, corpo: { whatsappId: 'wa-99' } });
  igual('numero nao cadastrado = 400', whatsappInvalido.status, 400);

  console.log('\n== troca de codigo sem estar logado ==');
  // Com PALAVRA_CHAVE_MESTRA ausente, a palavra-chave padrao esta no
  // codigo-fonte - entao a rota exige sessao, senao qualquer um assumiria
  // o painel inteiro.
  const trocaSemSessao = await pedir('post', '/api/acesso/alterar', { corpo: { palavraChave: 'KAMILLY', novoCodigo: '999999' } });
  igual('sem sessao e com palavra-chave publica = 403', trocaSemSessao.status, 403);
  ok('o codigo NAO foi trocado', store.verificarCodigoAcesso(CODIGO), store.verificarCodigoAcesso('999999'));

  const trocaCurta = await pedir('post', '/api/acesso/alterar', { sessao, corpo: { palavraChave: 'KAMILLY', novoCodigo: '12' } });
  igual('codigo novo de 2 digitos = 400', trocaCurta.status, 400);
  const trocaComLetra = await pedir('post', '/api/acesso/alterar', { sessao, corpo: { palavraChave: 'KAMILLY', novoCodigo: 'abcdef' } });
  igual('codigo novo com letra = 400', trocaComLetra.status, 400);

  console.log('\n== forca bruta no codigo (roda por ultimo: bloqueia o IP) ==');
  const { MAX_TENTATIVAS } = require('../src/services/sessao');
  let ultimaResposta;
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    ultimaResposta = await pedir('post', '/api/acesso/verificar', { corpo: { codigo: '123456' } });
  }
  igual(`as ${MAX_TENTATIVAS} primeiras erradas sao so "invalido"`, ultimaResposta.status, 200);
  const bloqueadoAgora = await pedir('post', '/api/acesso/verificar', { corpo: { codigo: '123456' } });
  igual('depois do limite = 429', bloqueadoAgora.status, 429);
  ok('e a resposta explica a espera', (bloqueadoAgora.data.erro || '').includes('15 minutos'), bloqueadoAgora.data);

  // O ponto que importa: o bloqueio tem que valer tambem pra quem acerta
  // depois - senao ele nao atrasa ataque nenhum.
  const certoDuranteBloqueio = await pedir('post', '/api/acesso/verificar', { corpo: { codigo: CODIGO } });
  igual('nem o codigo certo passa durante o bloqueio', certoDuranteBloqueio.status, 429);

  // Sessao aberta ANTES do bloqueio continua valendo (o bloqueio e de
  // tentativa, nao de uso) - senao um ataque derrubaria o seu acesso.
  const aindaLogado = await pedir('get', '/api/leads', { sessao });
  igual('quem ja estava logado nao e expulso', aindaLogado.status, 200);

  // Cabecalho forjado nao pode virar "IP novo" e zerar as tentativas
  const forjado = await axios({
    method: 'post', url: base + '/api/acesso/verificar',
    data: { codigo: CODIGO },
    headers: { 'X-Forwarded-For': '1.2.3.4' },
    validateStatus: () => true,
  });
  igual('X-Forwarded-For forjado nao fura o bloqueio', forjado.status, 429);

  console.log(`\n${total - falhas}/${total} passaram`);
  servidor.close();
  fs.rmSync(pasta, { recursive: true, force: true });
  process.exit(falhas ? 1 : 0);
});
