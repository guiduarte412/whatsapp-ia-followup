// Armazenamento simples em arquivo JSON.
// Serve bem para comecar. Se o volume de leads crescer muito,
// trocar por um banco de verdade (Postgres, SQLite) e so mudar este arquivo.
//
// IMPORTANTE: no Railway, o disco padrao e temporario - some a cada novo
// deploy. RAILWAY_VOLUME_MOUNT_PATH so existe quando um Volume esta
// configurado no servico; usando ele aqui, os dados sobrevivem aos deploys
// automaticamente assim que o Volume for criado (ver README).

const fs = require('fs');
const path = require('path');

const PASTA_DADOS = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(PASTA_DADOS, 'db.json');

const TOPICOS_PADRAO = {
  agro: 'Crédito rural, para quem precisa de capital para a propriedade.',
  imoveis: '',
  caminhoes: '',
  credito_empresarial: '',
  geral: '',
};

const CODIGO_ACESSO_PADRAO = '059597';
const PALAVRA_CHAVE_MESTRA = 'KAMILLY';

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { leads: {}, examples: [], topicos: TOPICOS_PADRAO, codigoAcesso: CODIGO_ACESSO_PADRAO, crmConfig: {} };
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!db.topicos) db.topicos = TOPICOS_PADRAO;
  if (!db.codigoAcesso) db.codigoAcesso = CODIGO_ACESSO_PADRAO;
  if (!db.crmConfig) db.crmConfig = {};
  return db;
}

function save(db) {
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// --- Leads ---

function getLead(phone) {
  const db = load();
  return db.leads[phone] || null;
}

// Numeros brasileiros de celular tem 9 digitos depois do DDD (55 + DDD +
// 9XXXXXXXX), mas a Z-API (e o WhatsApp por baixo) as vezes reporta o
// numero SEM esse 9 extra (55 + DDD + XXXXXXXX). Pra nao perder o lead
// por causa disso, tenta as duas variantes antes de desistir.
function variantesTelefoneBR(telefone) {
  if (!telefone || !telefone.startsWith('55') || telefone.length < 12) return [telefone];
  const ddd = telefone.slice(2, 4);
  const resto = telefone.slice(4);
  if (resto.length === 9 && resto[0] === '9') {
    return [telefone, `55${ddd}${resto.slice(1)}`];
  }
  if (resto.length === 8) {
    return [telefone, `55${ddd}9${resto}`];
  }
  return [telefone];
}

// Como getLead, mas tenta tambem a variante com/sem o 9º digito antes de
// considerar que o lead nao existe. Usar essa versao em qualquer lugar que
// recebe telefone vindo de fora (webhook), nao do que o proprio sistema
// gerou.
function getLeadFlexivel(telefone) {
  for (const variante of variantesTelefoneBR(telefone)) {
    const lead = getLead(variante);
    if (lead) return lead;
  }
  return null;
}

function upsertLead(phone, data) {
  const db = load();
  db.leads[phone] = { ...(db.leads[phone] || {}), ...data, phone };
  save(db);
  return db.leads[phone];
}

function getActiveSequenceLeads() {
  const db = load();
  return Object.values(db.leads).filter((l) => l.status === 'sequence_active');
}

function getAllLeads() {
  const db = load();
  return Object.values(db.leads).sort((a, b) =>
    (b.sequenceStartedAt || '').localeCompare(a.sequenceStartedAt || '')
  );
}

// Ponto unico que inicia a sequencia de follow-up pra um lead. Usado tanto
// pelo webhook do RD Station quanto pelo formulario manual do site - os
// dois caem na mesma logica, pra nunca ficar desalinhado.
// "teste: true" marca o lead como um teste (aparece com selo TESTE no
// painel, pra nao confundir com lead real).
function iniciarSequencia(phone, { nome, produto, teste }) {
  const agora = new Date();
  // 1a mensagem: 30 a 60 min depois do lead entrar (sorteado, nunca fixo).
  const primeiroEnvioEm = new Date(agora.getTime() + (30 + Math.random() * 30) * 60_000).toISOString();

  return upsertLead(phone, {
    nome,
    produto,
    teste: Boolean(teste),
    status: 'sequence_active',
    sequenceStartedAt: agora.toISOString(),
    attemptsSent: 0,
    mensagensEnviadas: [],
    respostasAutomaticas: 0,
    conversa: [],
    proximoEnvioEm: primeiroEnvioEm,
  });
}

function removerLead(phone) {
  const db = load();
  delete db.leads[phone];
  save(db);
}

// Cria varios leads de uma vez (usado na importacao de Excel). Retorna
// quantos entraram certo e quais linhas deram erro, pra mostrar no site.
function iniciarSequenciaEmLote(linhas) {
  const resultado = { criados: 0, erros: [] };
  linhas.forEach((linha, indice) => {
    const telefone = (linha.telefone || '').toString().replace(/\D/g, '');
    if (!telefone || telefone.length < 12) {
      resultado.erros.push({ linha: indice + 1, motivo: 'telefone inválido' });
      return;
    }
    if (!linha.nome) {
      resultado.erros.push({ linha: indice + 1, motivo: 'nome vazio' });
      return;
    }
    iniciarSequencia(telefone, { nome: linha.nome, produto: linha.produto || 'geral' });
    resultado.criados += 1;
  });
  return resultado;
}

// --- Tópicos que a IA usa como referência de conteúdo (editável pelo site) ---

function getTopicos() {
  return load().topicos;
}

function salvarTopicos(novosTopicos) {
  const db = load();
  db.topicos = { ...db.topicos, ...novosTopicos };
  save(db);
  return db.topicos;
}

// Adiciona uma mensagem (de: 'ia' ou 'lead') ao historico de conversa do
// lead. E esse historico que a IA le pra continuar a conversa depois que
// o lead responde.
function appendConversa(phone, { de, texto }) {
  const db = load();
  const lead = db.leads[phone];
  if (!lead) return null;
  lead.conversa = [...(lead.conversa || []), { de, texto, timestamp: new Date().toISOString() }];
  save(db);
  return lead;
}

// --- Exemplos que "alimentam" o aprendizado da IA ---
// Isso NAO re-treina o modelo (a Claude nao aprende sozinha em tempo real).
// O que fazemos aqui e guardar os melhores exemplos reais (mensagens que
// geraram resposta do lead) e reusa-los como referencia nas proximas geracoes.
// Na pratica funciona como um "playbook vivo" que vai ficando mais afiado.

function appendExample(example) {
  const db = load();
  db.examples.push({ ...example, createdAt: new Date().toISOString() });
  // mantem só os 200 exemplos mais recentes pra nao crescer sem limite
  if (db.examples.length > 200) {
    db.examples = db.examples.slice(-200);
  }
  save(db);
}

function getRecentSuccessfulExamples(limit = 5) {
  const db = load();
  return db.examples
    .filter((e) => e.responded === true)
    .slice(-limit);
}

// --- Configuração de integração com o CRM (guardado pra vincular no futuro) ---
// Por enquanto so guarda e devolve o que foi salvo - nao faz nenhuma chamada
// pro CRM ainda. Serve de base pra quando a integração de verdade for feita.

function getCrmConfig() {
  return load().crmConfig;
}

function salvarCrmConfig(dados) {
  const db = load();
  db.crmConfig = { ...db.crmConfig, ...dados };
  save(db);
  return db.crmConfig;
}

// --- Preferência de conexão futura com o Google Agenda ---
// Ainda não conecta de verdade (isso exige um fluxo de autorização do
// Google) - por enquanto so guarda que voce quer ativar isso no futuro.

function getGoogleAgendaConfig() {
  return load().googleAgenda || { querConectar: false };
}

function salvarGoogleAgendaConfig(dados) {
  const db = load();
  db.googleAgenda = { ...(db.googleAgenda || {}), ...dados };
  save(db);
  return db.googleAgenda;
}

// --- Código de acesso pra ver os leads ---
// A palavra-chave mestra (pra poder trocar o código) fica fixa no código
// do servidor, nunca exposta ao navegador - só o resultado (certo/errado)
// volta pro site.

function verificarCodigoAcesso(codigo) {
  return codigo === load().codigoAcesso;
}

function alterarCodigoAcesso(palavraChave, novoCodigo) {
  if (palavraChave !== PALAVRA_CHAVE_MESTRA) return false;
  const db = load();
  db.codigoAcesso = novoCodigo;
  save(db);
  return true;
}

module.exports = {
  getLead,
  getLeadFlexivel,
  upsertLead,
  getActiveSequenceLeads,
  getAllLeads,
  iniciarSequencia,
  iniciarSequenciaEmLote,
  removerLead,
  getTopicos,
  salvarTopicos,
  getCrmConfig,
  salvarCrmConfig,
  getGoogleAgendaConfig,
  salvarGoogleAgendaConfig,
  verificarCodigoAcesso,
  alterarCodigoAcesso,
  appendConversa,
  appendExample,
  getRecentSuccessfulExamples,
};
