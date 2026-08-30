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

const CODIGO_ACESSO_PADRAO = '059597';

// A palavra-chave que autoriza trocar o codigo de acesso. O valor abaixo
// esta no codigo-fonte, num repositorio publico - ou seja, qualquer pessoa
// consegue ler. Por isso ele NAO vale sozinho: quando a variavel de
// ambiente PALAVRA_CHAVE_MESTRA nao esta configurada, a rota de troca passa
// a exigir tambem uma sessao ja aberta (ver acesso-api.js). Configure a
// variavel no Railway com um segredo de verdade e ela volta a servir de
// recuperacao de acesso, que e a funcao dela.
const PALAVRA_CHAVE_MESTRA = process.env.PALAVRA_CHAVE_MESTRA || 'KAMILLY';
const PALAVRA_CHAVE_E_PUBLICA = !process.env.PALAVRA_CHAVE_MESTRA;

// Configuracao editavel pelo site. Nada aqui e sobre um produto ou
// segmento especifico: o texto das mensagens, as regras que a IA segue e
// os horarios sao todos definidos na tela de Configuracoes, sem mexer no
// codigo. Os padroes abaixo sao deliberadamente VAZIOS - o sistema nao
// inventa conteudo nem manda mensagem enquanto nada for cadastrado.
const CONFIG_PADRAO = {
  identidade: {
    nome: '',       // como voce se apresenta ("Aqui e o Fulano")
    empresa: '',    // empresa que voce cita ao se apresentar
    contexto: '',   // 1-2 linhas sobre o que voce faz / o que oferece
  },
  whatsapps: [],    // numeros conectados na Z-API (vazio = usa as variaveis de ambiente)
  mensagens: [],    // mensagens de abertura da esteira (uma e sorteada por lead)
  regras: [],       // regras que a IA precisa seguir na conversa
  horarios: {
    inicio: 8,            // hora em que os envios podem comecar (Brasilia)
    fim: 20,              // hora em que os envios param (Brasilia)
    atrasoMinMinutos: 30, // atraso minimo entre o lead entrar e a mensagem sair
    atrasoMaxMinutos: 60, // atraso maximo (sorteado entre min e max)
    intervaloMinSegundos: 20, // pausa minima entre um envio e o proximo
    intervaloMaxSegundos: 60, // pausa maxima (sorteada entre min e max)
  },
  maxRespostasAutomaticas: 5, // trava: depois disso a IA passa a conversa pra voce
};

// Junta o que esta salvo com os padroes, campo a campo. Assim um banco
// antigo (ou um backup restaurado de uma versao anterior) nunca chega no
// resto do sistema com um pedaco de configuracao faltando.
function mesclarConfig(salva) {
  const c = salva || {};
  return {
    identidade: { ...CONFIG_PADRAO.identidade, ...(c.identidade || {}) },
    whatsapps: Array.isArray(c.whatsapps) ? c.whatsapps : [],
    mensagens: Array.isArray(c.mensagens) ? c.mensagens : [],
    regras: Array.isArray(c.regras) ? c.regras : [],
    horarios: { ...CONFIG_PADRAO.horarios, ...(c.horarios || {}) },
    maxRespostasAutomaticas: Number(c.maxRespostasAutomaticas) || CONFIG_PADRAO.maxRespostasAutomaticas,
  };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { leads: {}, codigoAcesso: CODIGO_ACESSO_PADRAO, config: mesclarConfig(null) };
  }
  let db;
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (erro) {
    // Falha ALTO de proposito, em vez de comecar com o banco vazio: subir
    // sem os leads faria o sistema parecer normal enquanto o arquivo com
    // tudo ainda esta la, e o primeiro save() gravaria por cima dele - ai
    // sim a perda seria definitiva.
    throw new Error(
      `O arquivo de dados (${DB_PATH}) esta ilegivel: ${erro.message}\n` +
      'Nao subi o servidor pra nao gravar por cima dele. Restaure o ultimo backup ' +
      '(tela Backup > Restaurar de um arquivo) ou conserte o arquivo antes de reiniciar.'
    );
  }
  if (!db.leads) db.leads = {};
  if (!db.codigoAcesso) db.codigoAcesso = CODIGO_ACESSO_PADRAO;
  db.config = mesclarConfig(db.config);
  return db;
}

// Grava num arquivo temporario e so entao renomeia por cima do db.json.
// Escrever direto no db.json parece igual, mas nao e: se o processo morrer
// no meio da escrita (deploy do Railway, falta de memoria, queda da
// maquina), o arquivo fica pela metade e leva junto TODOS os leads e
// conversas. O rename e atomico no mesmo disco - ou o db.json e o antigo
// inteiro, ou e o novo inteiro, nunca um pedaco dos dois.
function save(db) {
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  const temporario = `${DB_PATH}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(db, null, 2));
  fs.renameSync(temporario, DB_PATH);
}

// --- Configuracao (tudo editavel pelo site) ---

function getConfig() {
  return load().config;
}

function salvarConfig(parcial) {
  const db = load();
  const atual = db.config;
  db.config = mesclarConfig({
    identidade: { ...atual.identidade, ...(parcial.identidade || {}) },
    whatsapps: parcial.whatsapps !== undefined ? parcial.whatsapps : atual.whatsapps,
    mensagens: parcial.mensagens !== undefined ? parcial.mensagens : atual.mensagens,
    regras: parcial.regras !== undefined ? parcial.regras : atual.regras,
    horarios: { ...atual.horarios, ...(parcial.horarios || {}) },
    maxRespostasAutomaticas: parcial.maxRespostasAutomaticas !== undefined
      ? parcial.maxRespostasAutomaticas
      : atual.maxRespostasAutomaticas,
  });
  save(db);
  return db.config;
}

// Sorteia uma das mensagens cadastradas e troca {nome} pelo primeiro nome
// do lead. Devolve null se nao houver nenhuma mensagem cadastrada - quem
// chama decide o que fazer (o agendador avisa voce em vez de inventar
// texto por conta propria).
function montarMensagemDeAbertura(nomeDoLead) {
  const validas = getConfig().mensagens.filter((m) => m && m.trim());
  if (!validas.length) return null;
  const escolhida = validas[Math.floor(Math.random() * validas.length)];
  const primeiroNome = (nomeDoLead || '').trim().split(' ')[0] || '';
  return escolhida
    .replace(/\{nome\}/gi, primeiroNome)
    // Sem nome cadastrado, {nome} vira vazio e sobraria "Oi , tudo bem?" -
    // limpa o espaco orfao antes da pontuacao e os espacos duplicados.
    .replace(/ +([,.!?;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// --- WhatsApps conectados ---
// Cada numero e uma instancia separada na Z-API. Ter mais de um divide o
// volume: e volume por numero, nao volume total, que faz o WhatsApp
// bloquear. Com a lista vazia o sistema cai nas variaveis de ambiente,
// entao quem so tem um numero nao precisa cadastrar nada.

function getWhatsapps() {
  return getConfig().whatsapps;
}

function getWhatsappsAtivos() {
  return getWhatsapps().filter((w) => w.ativo !== false && w.instanceId && w.token);
}

function getWhatsappPorId(id) {
  if (!id) return null;
  return getWhatsapps().find((w) => w.id === id) || null;
}

// Reveza entre os numeros ativos, na ordem, pra distribuir os leads por
// igual. O ponteiro fica no banco (nao na memoria) pra continuar de onde
// parou depois de um deploy - senao todo reinicio recomecaria no primeiro
// numero e ele levaria mais carga que os outros.
function escolherWhatsappParaNovoLead() {
  const ativos = getWhatsappsAtivos();
  if (!ativos.length) return null; // nenhum cadastrado: modo variavel de ambiente
  const db = load();
  const proximo = (Number(db.ultimoWhatsappIndice) || 0) % ativos.length;
  db.ultimoWhatsappIndice = proximo + 1;
  save(db);
  return ativos[proximo];
}

// --- Leads ---

function getLead(phone) {
  const db = load();
  return db.leads[phone] || null;
}

// Completa o codigo do pais em numero brasileiro digitado ou importado sem
// ele: "(47) 98888-7777" e "47988887777" viram os dois 5547988887777.
//
// A decisao e por QUANTIDADE de digitos, nao por prefixo. Checar se "comeca
// com 55" quebraria os numeros do DDD 55 (Rio Grande do Sul): 55988887777 e
// um numero LOCAL de 11 digitos e precisa do 55 na frente do mesmo jeito,
// virando 5555988887777.
//
// Devolve null quando nao da pra reconhecer como telefone brasileiro.
function normalizarTelefoneBR(valor) {
  const digitos = (valor || '').toString().replace(/[^0-9]/g, '');
  if (digitos.length === 10 || digitos.length === 11) return '55' + digitos; // DDD + numero
  if (digitos.length === 12 || digitos.length === 13) return digitos;        // ja veio com o 55
  return null;
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

// Ponto unico que coloca um lead na esteira. Usado tanto pela importacao
// de planilha quanto pelo formulario manual do site - os dois caem na
// mesma logica, pra nunca ficar desalinhado.
// "teste: true" marca o lead como um teste (aparece com selo TESTE no
// painel, pra nao confundir com lead real).
//
// IMPORTANTE: se o lead JA existe, nao reinicia nada. Sem isso, reimportar
// a mesma planilha apagaria a conversa inteira e comecaria a mandar
// mensagem de novo pra quem ja estava sendo atendido.
function iniciarSequencia(phone, { nome, teste }) {
  const existente = getLeadFlexivel(phone);
  if (existente) return { ...existente, jaExistia: true };

  // O numero que abre a conversa e o mesmo que responde ate o fim. Se a
  // abertura saisse de um numero e a resposta de outro, o cliente veria
  // duas pessoas diferentes falando com ele.
  const whatsapp = escolherWhatsappParaNovoLead();

  const { atrasoMinMinutos, atrasoMaxMinutos } = getConfig().horarios;
  const minimo = Math.max(0, Number(atrasoMinMinutos) || 0);
  const maximo = Math.max(minimo, Number(atrasoMaxMinutos) || minimo);
  const agora = new Date();
  // A mensagem sai num momento sorteado dentro da faixa configurada, pra
  // nunca sair um disparo no mesmo minuto exato pra todo mundo.
  const atrasoMs = (minimo + Math.random() * (maximo - minimo)) * 60_000;

  return upsertLead(phone, {
    nome,
    teste: Boolean(teste),
    whatsappId: whatsapp ? whatsapp.id : null,
    status: 'sequence_active',
    sequenceStartedAt: agora.toISOString(),
    attemptsSent: 0,
    mensagensEnviadas: [],
    respostasAutomaticas: 0,
    conversa: [],
    proximoEnvioEm: new Date(agora.getTime() + atrasoMs).toISOString(),
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
  const resultado = { criados: 0, duplicados: 0, erros: [] };
  linhas.forEach((linha, indice) => {
    const telefone = normalizarTelefoneBR(linha.telefone);
    if (!telefone) {
      resultado.erros.push({ linha: indice + 1, motivo: 'telefone inválido' });
      return;
    }
    if (!linha.nome) {
      resultado.erros.push({ linha: indice + 1, motivo: 'nome vazio' });
      return;
    }
    const lead = iniciarSequencia(telefone, { nome: linha.nome });
    if (lead.jaExistia) resultado.duplicados += 1;
    else resultado.criados += 1;
  });
  return resultado;
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

// --- Pausa geral do sistema ---
// Botao de emergencia: para TODOS os envios automaticos na hora, sem
// precisar mexer no Railway nem derrubar o servidor. Os leads e conversas
// ficam intactos - so nao sai nem entra mensagem automatica enquanto
// estiver pausado.

function getPausado() {
  return Boolean(load().pausado);
}

function setPausado(pausado) {
  const db = load();
  db.pausado = Boolean(pausado);
  save(db);
  return db.pausado;
}

// --- Backup completo ---
// Exporta/importa o banco inteiro. O Volume do Railway ja protege contra
// perda em deploy, mas nao contra o Volume em si se perder - por isso vale
// baixar um backup de vez em quando.

function exportarTudo() {
  return load();
}

function importarTudo(dados) {
  save(dados);
  return dados;
}

module.exports = {
  PALAVRA_CHAVE_E_PUBLICA,
  normalizarTelefoneBR,
  getWhatsapps,
  getWhatsappsAtivos,
  getWhatsappPorId,
  escolherWhatsappParaNovoLead,
  getConfig,
  salvarConfig,
  montarMensagemDeAbertura,
  getLead,
  getLeadFlexivel,
  upsertLead,
  getActiveSequenceLeads,
  getAllLeads,
  iniciarSequencia,
  iniciarSequenciaEmLote,
  removerLead,
  appendConversa,
  getPausado,
  setPausado,
  verificarCodigoAcesso,
  alterarCodigoAcesso,
  exportarTudo,
  importarTudo,
};
