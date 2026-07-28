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

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { leads: {}, examples: [], topicos: TOPICOS_PADRAO };
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!db.topicos) db.topicos = TOPICOS_PADRAO;
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
  return upsertLead(phone, {
    nome,
    produto,
    teste: Boolean(teste),
    status: 'sequence_active',
    sequenceStartedAt: new Date().toISOString(),
    attemptsSent: 0,
    mensagensEnviadas: [],
    respostasAutomaticas: 0,
    conversa: [],
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

module.exports = {
  getLead,
  upsertLead,
  getActiveSequenceLeads,
  getAllLeads,
  iniciarSequencia,
  iniciarSequenciaEmLote,
  removerLead,
  getTopicos,
  salvarTopicos,
  appendConversa,
  appendExample,
  getRecentSuccessfulExamples,
};
