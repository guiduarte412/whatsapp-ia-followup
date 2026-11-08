// Testes de unidade das regras que nao dependem de rede nenhuma:
// telefone, opt-out, teto diario, fuso de Brasilia, rodizio de mensagens,
// escolha do lead (1/2) e as tentativas da esteira.
//
// Nao precisa de chave, nao precisa de internet, nao toca no banco de
// producao (cria um db.json temporario). Roda em menos de 2 segundos.
//
//   node testes/unidade.js
//   node testes/unidade.js telefone     (filtra por nome do grupo)

const fs = require('fs');
const path = require('path');
const os = require('os');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-unidade-'));
fs.mkdirSync(path.join(pasta, 'data'), { recursive: true });
process.env.RAILWAY_VOLUME_MOUNT_PATH = path.join(pasta, 'data');

function bancoLimpo(config = {}) {
  fs.writeFileSync(path.join(pasta, 'data', 'db.json'), JSON.stringify({
    leads: {},
    codigoAcesso: '000000',
    config: {
      identidade: { nome: 'Guilherme', empresa: 'FourAgro', contexto: '' },
      whatsapps: [],
      mensagens: ['Bom dia, {nome}.'],
      mensagensFollowup: [],
      regras: [],
      horarios: {
        inicio: 7, fim: 21, atrasoMinMinutos: 5, atrasoMaxMinutos: 15,
        intervaloMinSegundos: 60, intervaloMaxSegundos: 180,
        followupHorasMin: 24, followupHorasMax: 36, limiteDiarioDestinatarios: 40,
      },
      versaoHorarios: 2,
      maxRespostasAutomaticas: 5,
      ...config,
    },
  }, null, 2));
}

bancoLimpo();

const store = require('../src/db/store');
const optout = require('../src/services/optout');
const whats = require('../src/services/whatsapp');
const agendador = require('../src/services/scheduler');

// --- arnes minimo ---
const filtro = (process.argv[2] || '').toLowerCase();
let total = 0;
let falhas = 0;
let grupoAtual = '';

function grupo(nome, corpo) {
  if (filtro && !nome.toLowerCase().includes(filtro)) return;
  grupoAtual = nome;
  console.log(`\n== ${nome} ==`);
  bancoLimpo();
  corpo();
}

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

// =====================================================================
grupo('telefone', () => {
  igual('(47) 98888-7777 recebe o 55', store.normalizarTelefoneBR('(47) 98888-7777'), '5547988887777');
  igual('47988887777 recebe o 55', store.normalizarTelefoneBR('47988887777'), '5547988887777');
  igual('+55 (47) 98888-7777 nao duplica o 55', store.normalizarTelefoneBR('+55 (47) 98888-7777'), '5547988887777');
  igual('fixo de 10 digitos tambem', store.normalizarTelefoneBR('4733334444'), '554733334444');
  // DDD 55 (Rio Grande do Sul) e o caso que uma checagem por prefixo quebraria
  igual('DDD 55 nao e confundido com codigo do pais', store.normalizarTelefoneBR('55988887777'), '5555988887777');
  igual('numero curto e recusado', store.normalizarTelefoneBR('123'), null);
  igual('vazio e recusado', store.normalizarTelefoneBR(''), null);
  igual('texto sem digito e recusado', store.normalizarTelefoneBR('nao tenho'), null);

  // 9o digito: a Z-API as vezes reporta sem ele
  store.upsertLead('5547988887777', { nome: 'Com nove', status: 'aguardando_resposta' });
  ok('acha o lead quando chega SEM o 9', Boolean(store.getLeadFlexivel('554788887777')));
  ok('acha o lead quando chega COM o 9', Boolean(store.getLeadFlexivel('5547988887777')));
  ok('nao inventa lead que nao existe', store.getLeadFlexivel('5511999990000') === null);
});

// =====================================================================
grupo('entrada na esteira', () => {
  const criado = store.iniciarSequencia('5547988887777', { nome: 'Joao da Silva' });
  igual('entra como sequence_active', criado.status, 'sequence_active');
  igual('nasce sem tentativa enviada', criado.attemptsSent, 0);
  ok('ja nasce com horario de envio marcado', Boolean(criado.proximoEnvioEm));

  const atrasoMin = (new Date(criado.proximoEnvioEm).getTime() - Date.now()) / 60000;
  ok('o atraso cai dentro da faixa configurada (5-15 min)', atrasoMin > 4 && atrasoMin < 15.5, atrasoMin);

  // Reimportar a mesma planilha nao pode reiniciar quem ja esta em conversa
  store.appendConversa('5547988887777', { de: 'lead', texto: 'tenho interesse' });
  const denovo = store.iniciarSequencia('5547988887777', { nome: 'Joao da Silva' });
  igual('reimportar marca como duplicado', denovo.jaExistia, true);
  igual('reimportar NAO apaga a conversa', denovo.conversa.length, 1);
  igual('reimportar NAO zera as tentativas', denovo.status, 'sequence_active');

  // Opt-out e barreira de entrada, nao so de saida
  store.bloquearNumero('5511988887777', { motivo: 'pediu pra parar', origem: 'pedido_do_lead' });
  const barrado = store.iniciarSequencia('5511988887777', { nome: 'Quem pediu pra sair' });
  igual('numero bloqueado nao entra na esteira', barrado.bloqueado, true);
  ok('e nao fica gravado como lead', store.getLead('5511988887777') === null);
  // bloqueio tem que valer nas duas formas do numero, senao nao vale nada
  ok('bloqueio pega a variante sem o 9', store.numeroEstaBloqueado('551188887777'));
  igual('desbloquear libera as duas variantes', store.desbloquearNumero('551188887777'), true);
  ok('depois de liberado, entra', store.numeroEstaBloqueado('5511988887777') === false);
});

// =====================================================================
grupo('importacao em lote', () => {
  store.bloquearNumero('5547911112222', { origem: 'pedido_do_lead' });
  const r = store.iniciarSequenciaEmLote([
    { nome: 'Um', telefone: '47 98888-0001' },
    { nome: 'Dois', telefone: '47988880002' },
    { nome: 'Um de novo', telefone: '5547988880001' },   // repetido dentro da propria planilha
    { nome: 'Bloqueado', telefone: '47911112222' },      // pediu pra sair antes
    { nome: 'Sem telefone', telefone: 'xxx' },
    { nome: '', telefone: '47988880003' },               // sem nome
  ]);
  igual('conta os criados', r.criados, 2);
  igual('conta o repetido da propria planilha', r.duplicados, 1);
  igual('conta o bloqueado separado do erro', r.bloqueados, 1);
  igual('aponta as duas linhas com erro', r.erros.length, 2);
  igual('erro aponta o numero da linha', r.erros[0].linha, 5);
  ok('linha sem nome nao entra', store.getLead('5547988880003') === null);
  ok('quem entrou ficou com o 55 normalizado', Boolean(store.getLead('5547988880001')));
});

// =====================================================================
grupo('teto diario e fuso', () => {
  // O servidor roda em UTC. 01:00Z de um dia 10 ainda e dia 9 em Brasilia -
  // contar pelo relogio do servidor zeraria o teto no meio da noite.
  igual('01:00Z conta como o dia anterior em Brasilia',
    store.diaEmBrasilia(new Date('2026-03-10T01:00:00Z')), '2026-03-09');
  igual('12:00Z conta como o mesmo dia',
    store.diaEmBrasilia(new Date('2026-03-10T12:00:00Z')), '2026-03-10');

  const hoje = new Date().toISOString();
  const ontem = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  store.upsertLead('5547900000001', { nome: 'A', whatsappId: null, enviosEm: [hoje] });
  store.upsertLead('5547900000002', { nome: 'B', whatsappId: null, enviosEm: [hoje, hoje] });
  store.upsertLead('5547900000003', { nome: 'C', whatsappId: null, enviosEm: [ontem] });
  store.upsertLead('5547900000004', { nome: 'D', whatsappId: 'wa-2', enviosEm: [hoje] });

  igual('conta PESSOAS de hoje, nao mensagens', store.contarDestinatariosHoje(null), 2);
  igual('nao conta quem recebeu ontem', store.contarDestinatariosHoje(null) < 3, true);
  igual('o teto e por numero', store.contarDestinatariosHoje('wa-2'), 1);

  const placar = store.placarDoDia();
  igual('placar: 2 pessoas no numero padrao + 1 no outro', placar.destinatarios, 3);
  igual('placar: 4 mensagens no dia', placar.mensagens, 4);
  igual('placar traz o teto configurado', placar.limite, 40);
});

// =====================================================================
grupo('mensagens e rodizio', () => {
  store.salvarConfig({ mensagens: ['Bom dia, {nome}. Aqui e o Guilherme.', 'Oi {nome}, tudo bem?'] });
  const primeira = store.montarMensagemDeAbertura('Joao da Silva');
  const segunda = store.montarMensagemDeAbertura('Maria Souza');
  ok('troca {nome} pelo primeiro nome', primeira.includes('Joao') && !primeira.includes('Silva'), primeira);
  ok('as duas mensagens cadastradas giram em rodizio', primeira.split(',')[0] !== segunda.split(',')[0], [primeira, segunda]);

  const terceira = store.montarMensagemDeAbertura('Joao', { avancarRodizio: false });
  const quarta = store.montarMensagemDeAbertura('Joao', { avancarRodizio: false });
  igual('tela de teste nao gasta posicao do rodizio', terceira, quarta);

  // Sem nome cadastrado, nao pode sobrar "Oi , tudo bem?"
  store.salvarConfig({ mensagens: ['Oi {nome}, tudo bem?'] });
  const semNome = store.montarMensagemDeAbertura('');
  ok('sem nome, nao sobra espaco orfao antes da virgula', !semNome.includes(' ,'), semNome);

  // O sistema nao inventa texto quando nada esta cadastrado
  store.salvarConfig({ mensagens: [] });
  igual('nenhuma mensagem cadastrada: devolve null, nao inventa', store.montarMensagemDeAbertura('Joao'), null);
  igual('sem follow-up cadastrado, a 2a tentativa nao existe', store.followupEstaAtivo(), false);
  igual('e a esteira tem no maximo 1 mensagem', agendador.totalDeTentativas(), 1);

  store.salvarConfig({ mensagensFollowup: ['Passando de novo, {nome}.'] });
  igual('com follow-up cadastrado, a esteira tem 2', agendador.totalDeTentativas(), 2);
  igual('e nunca 3', agendador.totalDeTentativas() <= 2, true);
});

// =====================================================================
grupo('vez de enviar', () => {
  const passou = new Date(Date.now() - 60000).toISOString();
  const futuro = new Date(Date.now() + 600000).toISOString();

  ok('hora vencida e tentativa disponivel: envia',
    agendador.estaNaHoraDeEnviar({ attemptsSent: 0, proximoEnvioEm: passou, whatsappId: null }));
  ok('hora no futuro: nao envia',
    agendador.estaNaHoraDeEnviar({ attemptsSent: 0, proximoEnvioEm: futuro, whatsappId: null }) === false);
  ok('sem horario marcado: nao envia',
    agendador.estaNaHoraDeEnviar({ attemptsSent: 0, proximoEnvioEm: null, whatsappId: null }) === false);
  ok('ja mandou a unica tentativa: nao envia de novo',
    agendador.estaNaHoraDeEnviar({ attemptsSent: 1, proximoEnvioEm: passou, whatsappId: null }) === false);

  store.salvarConfig({ mensagensFollowup: ['segunda tentativa'] });
  ok('com 2a tentativa ligada, quem mandou 1 ainda pode mandar',
    agendador.estaNaHoraDeEnviar({ attemptsSent: 1, proximoEnvioEm: passou, whatsappId: null }));
  ok('mas quem ja mandou as 2 nunca mais envia',
    agendador.estaNaHoraDeEnviar({ attemptsSent: 2, proximoEnvioEm: passou, whatsappId: null }) === false);

  const intervalo = agendador.sortearIntervaloMs();
  ok('a pausa entre envios respeita a faixa (60-180s)', intervalo >= 60000 && intervalo <= 180000, intervalo);
});

// =====================================================================
grupo('opt-out', () => {
  const pedidos = [
    'nao quero mais receber',
    'não quero receber mais mensagens',
    'para de me mandar mensagem',
    'pare de mandar mensagem',
    'nao me manda mais',
    'me tira dessa lista',
    'remove meu numero',
    'descadastrar',
    'chega de mensagem',
    'nao quero mais contato',
    'me bloqueia',
    'STOP',
  ];
  for (const texto of pedidos) {
    ok(`reconhece pedido: "${texto}"`, optout.pediuParaParar(texto) === true);
  }

  // Os falsos positivos sao o risco real: bloquear um lead BOM por engano e
  // invisivel - ele simplesmente nunca mais recebe nada.
  const naoSaoPedidos = [
    'me tira uma duvida',
    'nao me manda mais audio, prefiro texto',
    'para de enviar pelo email, manda aqui mesmo',
    'me tira da lista de espera e ja marca logo',
    'remove meu numero antigo do cadastro e poe esse novo',
    'vou bloquear a agenda das 15h pra gente falar',
    'nao quero receber uma proposta fora do meu orcamento',
    'bom dia, quero saber do consorcio',
    'manda mais de uma opcao',
    '',
  ];
  for (const texto of naoSaoPedidos) {
    ok(`NAO confunde com pedido: "${texto}"`, optout.pediuParaParar(texto) === false);
  }

  const despedida = optout.respostaDeDespedida('Joao da Silva');
  ok('despedida usa o primeiro nome', despedida.startsWith('Joao,'), despedida);
  ok('despedida sem nome nao fica estranha', optout.respostaDeDespedida('').length > 10);
});

// =====================================================================
grupo('escolha do lead', () => {
  igual('botao 1 = parar', whats.escolhaDoLead({ buttonsResponseMessage: { buttonId: '1' } }, ''), 'parar');
  igual('botao 2 = falar', whats.escolhaDoLead({ buttonsResponseMessage: { buttonId: '2' } }, ''), 'falar');
  igual('item de lista tambem conta', whats.escolhaDoLead({ listResponseMessage: { selectedRowId: '2' } }, ''), 'falar');
  igual('digitou 1', whats.escolhaDoLead({}, '1'), 'parar');
  igual('digitou 2', whats.escolhaDoLead({}, '2'), 'falar');
  igual('digitou "2." com ponto', whats.escolhaDoLead({}, '2.'), 'falar');
  igual('digitou "opcao 2"', whats.escolhaDoLead({}, 'opção 2'), 'falar');
  igual('digitou o rotulo inteiro', whats.escolhaDoLead({}, 'Quero falar com você'), 'falar');

  // O caso que torna isso perigoso: numero no meio de uma frase nao e escolha
  igual('"consigo as 2 horas" NAO e escolha', whats.escolhaDoLead({}, 'consigo as 2 horas'), null);
  igual('"tenho 2 tratores" NAO e escolha', whats.escolhaDoLead({}, 'tenho 2 tratores'), null);
  igual('"1 momento" NAO e escolha', whats.escolhaDoLead({}, '1 momento'), null);
  igual('texto comum nao e escolha', whats.escolhaDoLead({}, 'bom dia, tudo bem?'), null);

  ok('texto que nunca enviamos nao e eco nosso', whats.foiEnviadaPorNos('mensagem que o lead escreveu') === false);
});

// =====================================================================
grupo('isolamento entre leads', () => {
  store.iniciarSequencia('5547900001111', { nome: 'Lead A' });
  store.iniciarSequencia('5547900002222', { nome: 'Lead B' });
  store.appendConversa('5547900001111', { de: 'lead', texto: 'segredo do lead A' });

  const a = store.getLead('5547900001111');
  const b = store.getLead('5547900002222');
  igual('a conversa do A ficou no A', a.conversa.length, 1);
  igual('e nao vazou pro B', b.conversa.length, 0);
  ok('o historico do B nao contem o texto do A',
    JSON.stringify(b).includes('segredo do lead A') === false);

  store.removerLead('5547900001111');
  ok('remover o A nao remove o B', Boolean(store.getLead('5547900002222')));
  ok('e o A sai mesmo', store.getLead('5547900001111') === null);

  // appendConversa num telefone que nao existe nao pode criar lead fantasma
  igual('conversa pra telefone inexistente e ignorada', store.appendConversa('5511000000000', { de: 'lead', texto: 'x' }), null);
});

// =====================================================================
grupo('pausa geral', () => {
  igual('nasce despausado', store.getPausado(), false);
  store.setPausado(true);
  igual('pausa liga', store.getPausado(), true);
  store.setPausado(false);
  igual('pausa desliga', store.getPausado(), false);
});

// =====================================================================
grupo('codigo de acesso', () => {
  ok('codigo certo passa', store.verificarCodigoAcesso('000000'));
  ok('codigo errado nao passa', store.verificarCodigoAcesso('111111') === false);
  ok('vazio nao passa', store.verificarCodigoAcesso('') === false);
  ok('palavra-chave errada nao troca o codigo', store.alterarCodigoAcesso('ERRADA', '123456') === false);
  ok('codigo nao mudou depois da tentativa errada', store.verificarCodigoAcesso('000000'));
});

console.log(`\n${total - falhas}/${total} passaram`);
fs.rmSync(pasta, { recursive: true, force: true });
process.exit(falhas ? 1 : 0);
