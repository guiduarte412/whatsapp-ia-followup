// Armazenamento simples em arquivo JSON.
// Serve bem para comecar. Se o volume de leads crescer muito,
// trocar por um banco de verdade (Postgres, SQLite) e so mudar este arquivo.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { leads: {}, examples: [] };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function save(db) {
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
  appendExample,
  getRecentSuccessfulExamples,
};
