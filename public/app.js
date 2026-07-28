// ===== Labels compartilhados =====
const LABELS_STATUS = {
  sequence_active: 'Sequência ativa',
  conversa_ia: 'IA conversando',
  human_handoff: 'Aguardando você',
  cold_nurture: 'Nutrição futura',
  encerrado: 'Encerrado',
};
const LABELS_PRODUTO = {
  agro: 'Agro/rural',
  imoveis: 'Imóveis',
  caminhoes: 'Caminhões',
  credito_empresarial: 'Crédito empresarial',
};

// ===== Gate de acesso =====
const gateEl = document.getElementById('gate');
const appEl = document.getElementById('app');

async function tentarEntrar() {
  const codigo = document.getElementById('codigo-acesso').value.trim();
  const resp = await fetch('/api/acesso/verificar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });
  const corpo = await resp.json();
  if (corpo.valido) {
    sessionStorage.setItem('acessoLiberado', 'sim');
    gateEl.style.display = 'none';
    appEl.style.display = 'block';
    rotear();
  } else {
    document.getElementById('erro-gate').style.display = 'block';
  }
}

document.getElementById('btn-entrar').addEventListener('click', tentarEntrar);
document.getElementById('codigo-acesso').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tentarEntrar();
});

if (sessionStorage.getItem('acessoLiberado') === 'sim') {
  gateEl.style.display = 'none';
  appEl.style.display = 'block';
}

// ===== Roteamento (sem recarregar a página) =====
function mostrarView(nome) {
  document.querySelectorAll('.view').forEach((v) => { v.style.display = 'none'; });
  const alvo = document.getElementById('view-' + nome);
  if (alvo) alvo.style.display = 'block';
  window.scrollTo(0, 0);
}

function rotear() {
  const hash = location.hash.replace('#', '');
  const [view, param] = hash.split('/');

  if (view === 'lead' && param) {
    mostrarView('lead');
    carregarDetalheLead(param);
  } else if (['novo', 'testar', 'codigo', 'crm', 'relatorio', 'agenda', 'metricas'].includes(view)) {
    mostrarView(view);
    if (view === 'crm') carregarCrm();
    if (view === 'relatorio') prepararRelatorio();
    if (view === 'agenda') carregarAgenda();
    if (view === 'metricas') carregarMetricas();
  } else {
    mostrarView('leads');
    carregarLeads();
  }
}

window.addEventListener('hashchange', rotear);
if (appEl.style.display !== 'none') rotear();

// ===== VIEW: quadro de leads (estilo CRM, colunas por contato) =====

const COLUNAS_QUADRO = [
  { chave: 'contato1', titulo: '1º contato' },
  { chave: 'contato2', titulo: '2º contato' },
  { chave: 'contato3', titulo: '3º contato' },
  { chave: 'contato4', titulo: '4º contato' },
  { chave: 'contato5', titulo: '5º contato' },
  { chave: 'contato6', titulo: '6º contato' },
  { chave: 'conversando', titulo: 'Conversando' },
  { chave: 'aguardando', titulo: 'Aguardando você' },
  { chave: 'reuniao', titulo: 'Reunião agendada' },
  { chave: 'perdido', titulo: 'Lead perdido' },
  { chave: 'encerrado_manual', titulo: 'Encerrado' },
];

// A coluna e sempre calculada a partir do status/tentativas atuais do lead -
// nao e um campo salvo. Isso e o que faz o card "andar" de coluna sozinho
// assim que uma mensagem e mandada ou o status muda, sem precisar de
// nenhuma logica extra pra mover nada.
function colunaDoLead(lead) {
  if (lead.status === 'sequence_active') {
    const n = Math.min(Math.max(lead.attemptsSent || 1, 1), 6);
    return `contato${n}`;
  }
  if (lead.status === 'conversa_ia') return 'conversando';
  if (lead.status === 'human_handoff') return 'aguardando';
  if (lead.status === 'cold_nurture') return 'perdido';
  if (lead.status === 'encerrado') {
    return lead.motivoEncerramento === 'horario_confirmado' ? 'reuniao' : 'encerrado_manual';
  }
  return 'contato1';
}

let todosOsLeads = [];

async function carregarLeads() {
  const quadro = document.getElementById('quadro');
  try {
    const resp = await fetch('/api/leads');
    todosOsLeads = await resp.json();
    renderizarQuadro();
  } catch (erro) {
    quadro.innerHTML = '<div class="vazio">Não consegui carregar os leads agora.</div>';
  }
}

function renderizarQuadro() {
  const quadro = document.getElementById('quadro');
  const termoBusca = (document.getElementById('busca-telefone').value || '').replace(/\D/g, '');
  const leads = termoBusca ? todosOsLeads.filter((l) => l.phone.includes(termoBusca)) : todosOsLeads;

  if (!todosOsLeads.length) {
    quadro.innerHTML = '<div class="vazio">Nenhum lead ainda. Adicione o primeiro depois de uma ligação sem retorno.</div>';
    return;
  }
  if (termoBusca && !leads.length) {
    quadro.innerHTML = '<div class="vazio">Nenhum lead encontrado com esse número.</div>';
    return;
  }

  quadro.innerHTML = COLUNAS_QUADRO.map((coluna) => {
    const cartoes = leads.filter((l) => colunaDoLead(l) === coluna.chave);
    return `
      <div class="coluna">
        <div class="coluna-titulo"><span>${coluna.titulo}</span><span>${cartoes.length}</span></div>
        <div class="coluna-cartoes">
          ${cartoes.length ? cartoes.map((lead) => `
            <a class="cartao-lead" href="#lead/${encodeURIComponent(lead.phone)}">
              <span class="nome">${lead.nome || '—'}${lead.teste ? '<span class="selo-teste">TESTE</span>' : ''}</span>
              <span class="telefone">${lead.phone}</span>
              <span class="produto-card">${LABELS_PRODUTO[lead.produto] || lead.produto || '—'}</span>
            </a>
          `).join('') : '<p style="font-size:12px; color:var(--texto-fraco); padding:6px 4px;">Vazio</p>'}
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('busca-telefone').addEventListener('input', renderizarQuadro);

document.getElementById('btn-exportar').addEventListener('click', async () => {
  const resp = await fetch('/api/leads');
  const leads = await resp.json();
  const linhas = leads.map((l) => ({
    Nome: l.nome || '',
    Telefone: l.phone,
    Produto: LABELS_PRODUTO[l.produto] || l.produto || '',
    Status: LABELS_STATUS[l.status] || l.status,
    'Mensagens enviadas': l.attemptsSent || 0,
    'Início da sequência': l.sequenceStartedAt || '',
  }));
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Leads');
  XLSX.writeFile(livro, `leads-fouragro-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

const inputArquivo = document.getElementById('arquivo-importar');
document.getElementById('btn-importar').addEventListener('click', () => inputArquivo.click());
inputArquivo.addEventListener('change', async (evento) => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const dadosArquivo = await arquivo.arrayBuffer();
  const livro = XLSX.read(dadosArquivo);
  const primeiraAba = livro.Sheets[livro.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(primeiraAba);
  const leadsParaImportar = linhas.map((linha) => ({
    nome: linha.Nome || linha.nome || '',
    telefone: linha.Telefone || linha.telefone || linha.WhatsApp || '',
    produto: (linha.Produto || linha.produto || 'geral').toString().toLowerCase(),
  }));
  const resp = await fetch('/api/leads/lote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads: leadsParaImportar }),
  });
  const resultado = await resp.json();
  const msg = document.getElementById('msg-importacao');
  msg.style.display = 'block';
  msg.textContent = resultado.erros?.length
    ? `${resultado.criados} lead(s) importado(s). ${resultado.erros.length} linha(s) com erro (confira nome/telefone).`
    : `${resultado.criados} lead(s) importado(s) com sucesso.`;
  inputArquivo.value = '';
  carregarLeads();
});

// ===== VIEW: novo lead =====

document.getElementById('form-novo').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erroBox = document.getElementById('novo-erro');
  erroBox.style.display = 'none';

  const dados = {
    nome: document.getElementById('novo-nome').value.trim(),
    telefone: document.getElementById('novo-telefone').value.trim(),
    produto: document.getElementById('novo-produto').value,
  };

  try {
    const resp = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    if (!resp.ok) {
      const corpo = await resp.json();
      erroBox.textContent = corpo.erro || 'Não consegui adicionar esse lead.';
      erroBox.style.display = 'block';
      return;
    }
    document.getElementById('form-novo').reset();
    location.hash = '#leads';
  } catch (erro) {
    erroBox.textContent = 'Não consegui falar com o servidor agora.';
    erroBox.style.display = 'block';
  }
});

// ===== VIEW: testar (abas) =====

document.querySelectorAll('#abas-teste .aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelectorAll('#abas-teste .aba').forEach((a) => a.classList.remove('ativa'));
    aba.classList.add('ativa');
    document.getElementById('modo-unica').style.display = aba.dataset.modo === 'unica' ? 'block' : 'none';
    document.getElementById('modo-whatsapp').style.display = aba.dataset.modo === 'whatsapp' ? 'block' : 'none';
    document.getElementById('modo-simulacao').style.display = aba.dataset.modo === 'simulacao' ? 'block' : 'none';
  });
});

// -- mensagem única --
document.getElementById('form-teste').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erroBox = document.getElementById('erro');
  const sucessoBox = document.getElementById('sucesso');
  const botao = document.getElementById('btn-enviar');
  erroBox.style.display = 'none';
  sucessoBox.style.display = 'none';
  document.getElementById('resultado').style.display = 'none';
  botao.textContent = 'Gerando…';
  botao.disabled = true;

  const dados = {
    nome: document.getElementById('nome').value.trim(),
    telefone: document.getElementById('telefone').value.trim(),
    produto: document.getElementById('produto').value,
    tentativa: document.getElementById('tentativa').value,
  };

  try {
    const resp = await fetch('/api/testar-mensagem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    const corpo = await resp.json();
    if (!resp.ok) {
      erroBox.textContent = corpo.erro || 'Não consegui gerar a mensagem.';
      erroBox.style.display = 'block';
      return;
    }
    document.getElementById('texto-gerado').textContent = corpo.texto;
    document.getElementById('resultado').style.display = 'block';
    sucessoBox.textContent = 'Mensagem enviada para o número informado.';
    sucessoBox.style.display = 'block';
  } catch (erro) {
    erroBox.textContent = 'Não consegui falar com o servidor agora.';
    erroBox.style.display = 'block';
  } finally {
    botao.textContent = 'Gerar e enviar mensagem de teste';
    botao.disabled = false;
  }
});

// -- conversa no whatsapp --
document.getElementById('form-whatsapp').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const waErro = document.getElementById('wa-erro');
  const waSucesso = document.getElementById('wa-sucesso');
  const waBtn = document.getElementById('wa-btn');
  waErro.style.display = 'none';
  waSucesso.style.display = 'none';
  waBtn.textContent = 'Enviando…';
  waBtn.disabled = true;

  const telefone = document.getElementById('wa-telefone').value.trim();
  const dados = {
    nome: document.getElementById('wa-nome').value.trim(),
    telefone,
    produto: document.getElementById('wa-produto').value,
  };

  try {
    const resp = await fetch('/api/testar-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    const corpo = await resp.json();
    if (!resp.ok) {
      waErro.textContent = corpo.erro || 'Não consegui iniciar o teste.';
      waErro.style.display = 'block';
      return;
    }
    waSucesso.innerHTML = `Mensagem enviada! Responde pelo seu WhatsApp normalmente. Acompanhe em <a href="#lead/${encodeURIComponent(telefone)}">Ver conversa</a> (selo TESTE no painel).`;
    waSucesso.style.display = 'block';
    document.getElementById('form-whatsapp').reset();
  } catch (erro) {
    waErro.textContent = 'Não consegui falar com o servidor agora.';
    waErro.style.display = 'block';
  } finally {
    waBtn.textContent = 'Iniciar teste no WhatsApp';
    waBtn.disabled = false;
  }
});

// -- simular na tela --
let simHistorico = [];
let simNome = '';
let simProduto = '';
let simEncerrada = false;

function simAdicionarBolha(de, texto) {
  const bolha = document.createElement('div');
  bolha.className = `bolha ${de === 'lead' ? 'lead' : 'ia'}`;
  bolha.textContent = texto;
  document.getElementById('sim-conversa').appendChild(bolha);
  bolha.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function simMostrarEncaminhado(resultado) {
  simEncerrada = true;
  document.getElementById('sim-input-area').style.display = 'none';
  const box = document.getElementById('sim-encaminhado');
  box.style.display = 'block';
  box.innerHTML = `<strong>A IA encaminharia pra você agora.</strong><br>${resultado.resumoParaConsultor || resultado.motivo || ''}`;
}

document.getElementById('btn-iniciar-simulacao').addEventListener('click', async () => {
  const btnIniciar = document.getElementById('btn-iniciar-simulacao');
  simHistorico = [];
  simEncerrada = false;
  document.getElementById('sim-conversa').innerHTML = '';
  document.getElementById('sim-encaminhado').style.display = 'none';
  simNome = document.getElementById('sim-nome').value.trim();
  simProduto = document.getElementById('sim-produto').value;

  btnIniciar.textContent = 'Gerando…';
  btnIniciar.disabled = true;

  try {
    const resp = await fetch('/api/simular/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: simNome, produto: simProduto }),
    });
    const resultado = await resp.json();
    if (!resp.ok) throw new Error(resultado.erro);
    simHistorico.push({ de: 'ia', texto: resultado.resposta });
    simAdicionarBolha('ia', resultado.resposta);
    document.getElementById('sim-input-area').style.display = 'flex';
  } catch (erro) {
    simAdicionarBolha('ia', `Erro ao iniciar: ${erro.message}`);
  } finally {
    btnIniciar.textContent = 'Iniciar simulação';
    btnIniciar.disabled = false;
  }
});

async function simEnviarComoLead() {
  if (simEncerrada) return;
  const inputEl = document.getElementById('sim-resposta-lead');
  const btnEnviarComoLead = document.getElementById('btn-enviar-como-lead');
  const texto = inputEl.value.trim();
  if (!texto) return;

  simHistorico.push({ de: 'lead', texto });
  simAdicionarBolha('lead', texto);
  inputEl.value = '';
  btnEnviarComoLead.disabled = true;

  try {
    const resp = await fetch('/api/simular/responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: simNome, produto: simProduto, historico: simHistorico }),
    });
    const resultado = await resp.json();
    if (!resp.ok) throw new Error(resultado.erro);
    if (resultado.resposta) {
      simHistorico.push({ de: 'ia', texto: resultado.resposta });
      simAdicionarBolha('ia', resultado.resposta);
    }
    if (resultado.encaminharHumano) simMostrarEncaminhado(resultado);
  } catch (erro) {
    simAdicionarBolha('ia', `Erro: ${erro.message}`);
  } finally {
    btnEnviarComoLead.disabled = false;
  }
}
document.getElementById('btn-enviar-como-lead').addEventListener('click', simEnviarComoLead);
document.getElementById('sim-resposta-lead').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') simEnviarComoLead();
});

// ===== VIEW: detalhe do lead =====

function formatarHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function carregarDetalheLead(telefone) {
  const resp = await fetch(`/api/leads/${encodeURIComponent(telefone)}`);
  if (!resp.ok) {
    document.getElementById('lead-resumo').textContent = 'Lead não encontrado.';
    return;
  }
  const lead = await resp.json();

  document.getElementById('lead-nome').textContent = lead.nome || telefone;
  document.getElementById('lead-resumo').innerHTML = `
    <span class="status ${lead.status}"><span class="ponto"></span>${LABELS_STATUS[lead.status] || lead.status}</span>
    &nbsp;·&nbsp; ${LABELS_PRODUTO[lead.produto] || lead.produto || '—'}
    &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 13px;">${lead.phone}</span>
  `;

  const conversaDiv = document.getElementById('lead-conversa');
  const mensagensSequencia = (lead.mensagensEnviadas || []).map((texto) => ({ de: 'ia', texto, timestamp: null }));
  const conversa = lead.conversa && lead.conversa.length ? lead.conversa : mensagensSequencia;

  conversaDiv.innerHTML = !conversa.length
    ? '<p style="color: var(--texto-fraco);">Nenhuma mensagem trocada ainda.</p>'
    : conversa.map((m) => `
        <div class="bolha ${m.de === 'lead' ? 'lead' : 'ia'}">
          ${m.texto}
          ${m.timestamp ? `<span class="hora">${formatarHora(m.timestamp)}</span>` : ''}
        </div>
      `).join('');

  const botaoAssumir = document.getElementById('btn-assumir-lead');
  botaoAssumir.style.display = lead.status === 'encerrado' ? 'none' : 'inline-flex';
  botaoAssumir.onclick = async () => {
    if (!confirm('Encerrar o atendimento automático desse lead? A IA para de responder por aqui.')) return;
    await fetch(`/api/leads/${encodeURIComponent(telefone)}/encerrar`, { method: 'POST' });
    carregarDetalheLead(telefone);
  };

  document.getElementById('btn-remover-lead').onclick = async () => {
    if (!confirm('Remover este lead? Isso apaga a conversa e não pode ser desfeito.')) return;
    await fetch(`/api/leads/${encodeURIComponent(telefone)}`, { method: 'DELETE' });
    location.hash = '#leads';
  };
}

// ===== VIEW: trocar código de acesso =====

document.getElementById('form-codigo').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const erroBox = document.getElementById('codigo-erro');
  const sucessoBox = document.getElementById('codigo-sucesso');
  erroBox.style.display = 'none';
  sucessoBox.style.display = 'none';

  const dados = {
    palavraChave: document.getElementById('codigo-palavra-chave').value.trim(),
    novoCodigo: document.getElementById('codigo-novo').value.trim(),
  };

  const resp = await fetch('/api/acesso/alterar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  const corpo = await resp.json();

  if (!resp.ok) {
    erroBox.textContent = corpo.erro || 'Não consegui trocar o código.';
    erroBox.style.display = 'block';
    return;
  }
  sucessoBox.textContent = 'Código alterado com sucesso.';
  sucessoBox.style.display = 'block';
  document.getElementById('form-codigo').reset();
});

// ===== VIEW: integração com o CRM =====

async function carregarCrm() {
  const resp = await fetch('/api/crm');
  const dados = await resp.json();
  document.getElementById('crm-url').value = dados.urlBase || '';
  document.getElementById('crm-status').textContent = dados.apiKeyDefinida
    ? 'Já existe uma chave salva. Salvar de novo substitui.'
    : 'Nenhuma chave salva ainda.';
}

document.getElementById('form-crm').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const sucessoBox = document.getElementById('crm-sucesso');
  const dados = {
    urlBase: document.getElementById('crm-url').value.trim(),
    apiKey: document.getElementById('crm-chave').value.trim(),
  };
  await fetch('/api/crm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  sucessoBox.textContent = 'Salvo.';
  sucessoBox.style.display = 'block';
  document.getElementById('crm-chave').value = '';
  carregarCrm();
  setTimeout(() => { sucessoBox.style.display = 'none'; }, 2500);
});

// ===== VIEW: relatório diário =====

let relatorioAtual = [];

function mesmoDia(isoString, dataAlvo) {
  return Boolean(isoString) && isoString.slice(0, 10) === dataAlvo;
}

function prepararRelatorio() {
  const inputData = document.getElementById('relatorio-data');
  if (!inputData.value) inputData.value = new Date().toISOString().slice(0, 10);
}

async function gerarRelatorio() {
  const dataAlvo = document.getElementById('relatorio-data').value;
  const listaEl = document.getElementById('relatorio-lista');
  if (!dataAlvo) return;

  const resp = await fetch('/api/leads');
  const leads = await resp.json();
  relatorioAtual = [];

  leads.forEach((lead) => {
    const conversa = lead.conversa || [];
    const mensagensHoje = conversa.filter((m) => m.de === 'ia' && mesmoDia(m.timestamp, dataAlvo));
    const respostasHoje = conversa.filter((m) => m.de === 'lead' && mesmoDia(m.timestamp, dataAlvo));
    const criadoHoje = mesmoDia(lead.sequenceStartedAt, dataAlvo);

    if (!criadoHoje && !mensagensHoje.length && !respostasHoje.length) return;

    const partes = [];
    if (criadoHoje) partes.push('lead novo');
    if (mensagensHoje.length) partes.push(`${mensagensHoje.length} mensagem(ns) enviada(s)`);
    if (respostasHoje.length) partes.push(`${respostasHoje.length} resposta(s) do lead`);
    partes.push(`status atual: ${LABELS_STATUS[lead.status] || lead.status}`);

    relatorioAtual.push({
      nome: lead.nome || '—',
      telefone: lead.phone,
      produto: LABELS_PRODUTO[lead.produto] || lead.produto || '—',
      status: LABELS_STATUS[lead.status] || lead.status,
      resumo: partes.join(' · '),
    });
  });

  listaEl.innerHTML = !relatorioAtual.length
    ? '<div class="vazio">Nenhuma atividade nessa data.</div>'
    : relatorioAtual.map((item) => `
        <a class="linha-lead" style="grid-template-columns: 1.2fr 1fr 1fr 2fr;" href="#lead/${encodeURIComponent(item.telefone)}">
          <span class="nome">${item.nome}</span>
          <span class="telefone">${item.telefone}</span>
          <span class="status">${item.status}</span>
          <span style="font-size: 13px; color: var(--texto-fraco);">${item.resumo}</span>
        </a>
      `).join('');
}

document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorio);

document.getElementById('btn-imprimir-relatorio').addEventListener('click', async () => {
  if (!relatorioAtual.length) await gerarRelatorio();
  window.print();
});

document.getElementById('btn-exportar-relatorio').addEventListener('click', async () => {
  if (!relatorioAtual.length) await gerarRelatorio();
  if (!relatorioAtual.length) return;

  const linhas = relatorioAtual.map((item) => ({
    Nome: item.nome,
    Telefone: item.telefone,
    Produto: item.produto,
    Status: item.status,
    'O que aconteceu': item.resumo,
  }));
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Relatório');
  const data = document.getElementById('relatorio-data').value;
  XLSX.writeFile(livro, `relatorio-${data}.xlsx`);
});

// ===== VIEW: Google Agenda =====

async function carregarAgenda() {
  const resp = await fetch('/api/google-agenda');
  const config = await resp.json();
  document.getElementById('agenda-querconectar').checked = Boolean(config.querConectar);
}

document.getElementById('btn-salvar-agenda').addEventListener('click', async () => {
  const querConectar = document.getElementById('agenda-querconectar').checked;
  await fetch('/api/google-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ querConectar }),
  });
  const sucesso = document.getElementById('agenda-sucesso');
  sucesso.textContent = 'Salvo.';
  sucesso.style.display = 'block';
  setTimeout(() => { sucesso.style.display = 'none'; }, 2500);
});

// ===== VIEW: métricas (taxa de retorno dos leads) =====

function cartaoMetrica(valor, rotulo) {
  return `
    <div class="painel" style="padding: 20px; text-align:center;">
      <div style="font-family: var(--font-display); font-size: 32px; font-weight: 600; color: var(--laranja);">${valor}</div>
      <div style="font-size: 12px; color: var(--texto-fraco); margin-top:6px; text-transform:uppercase; letter-spacing:0.04em;">${rotulo}</div>
    </div>
  `;
}

async function carregarMetricas() {
  const resp = await fetch('/api/leads');
  const leads = await resp.json();
  const container = document.getElementById('metricas-cartoes');

  if (!leads.length) {
    container.innerHTML = '<div class="vazio">Nenhum lead ainda.</div>';
    return;
  }

  const total = leads.length;
  // "Respondeu" = teve pelo menos uma mensagem do lead na conversa. Nao usa
  // o status como atalho porque um lead pode ser encerrado manualmente
  // (botao "Assumir conversa") mesmo sem nunca ter respondido.
  const respondeu = leads.filter((l) => (l.conversa || []).some((m) => m.de === 'lead')).length;
  // So conta como "reunião marcada" quem encerrou especificamente porque
  // confirmou um horário - não qualquer encerramento (que também pode ser
  // você assumindo manualmente por outro motivo).
  const encerrados = leads.filter((l) => l.motivoEncerramento === 'horario_confirmado').length;
  const semResposta = leads.filter((l) => l.status === 'cold_nurture').length;
  const taxaRetorno = total ? Math.round((respondeu / total) * 100) : 0;

  container.innerHTML = [
    cartaoMetrica(total, 'Leads no total'),
    cartaoMetrica(`${taxaRetorno}%`, 'Taxa de retorno'),
    cartaoMetrica(encerrados, 'Reuniões marcadas'),
    cartaoMetrica(semResposta, 'Sem resposta (6 tentativas)'),
  ].join('');
}
