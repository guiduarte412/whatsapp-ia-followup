// ===== Labels compartilhados =====
const LABELS_STATUS = {
  sequence_active: 'Aguardando envio',
  aguardando_resposta: 'Mensagem enviada',
  conversa_ia: 'IA conversando',
  human_handoff: 'Aguardando você',
  cold_nurture: 'Nutrição futura',
  encerrado: 'Encerrado',
};
// ===== Chamadas autenticadas =====
// Todas as rotas de dados exigem o token de sessão que o servidor entrega
// quando o código de acesso é digitado certo. Se a sessão expirar (12h),
// volta pra tela de código automaticamente.
async function api(url, opcoes = {}) {
  const token = sessionStorage.getItem('sessaoToken');
  const resposta = await fetch(url, {
    ...opcoes,
    headers: { ...(opcoes.headers || {}), 'x-sessao': token || '' },
  });
  if (resposta.status === 401) {
    sessionStorage.removeItem('sessaoToken');
    location.reload();
    throw new Error('sessão expirada');
  }
  return resposta;
}

// ===== Gate de acesso =====
const gateEl = document.getElementById('gate');
const appEl = document.getElementById('app');

async function tentarEntrar() {
  const codigo = document.getElementById('codigo-acesso').value.trim();
  const erroEl = document.getElementById('erro-gate');
  const resp = await fetch('/api/acesso/verificar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });
  const corpo = await resp.json();

  if (corpo.valido) {
    sessionStorage.setItem('sessaoToken', corpo.sessao);
    erroEl.style.display = 'none';
    gateEl.style.display = 'none';
    appEl.style.display = 'block';
    rotear();
  } else {
    erroEl.textContent = corpo.erro || 'Código incorreto.';
    erroEl.style.display = 'block';
  }
}

document.getElementById('btn-entrar').addEventListener('click', tentarEntrar);
document.getElementById('codigo-acesso').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tentarEntrar();
});

if (sessionStorage.getItem('sessaoToken')) {
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
  } else if (['novo', 'testar', 'codigo', 'config', 'relatorio', 'metricas', 'backup'].includes(view)) {
    mostrarView(view);
    if (view === 'config') carregarConfig();
    if (view === 'relatorio') prepararRelatorio();
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
  { chave: 'aguardando_envio', titulo: 'Aguardando envio' },
  { chave: 'enviado', titulo: 'Mensagem enviada' },
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
  if (lead.status === 'sequence_active') return 'aguardando_envio';
  if (lead.status === 'aguardando_resposta') return 'enviado';
  if (lead.status === 'conversa_ia') return 'conversando';
  if (lead.status === 'human_handoff') return 'aguardando';
  if (lead.status === 'cold_nurture') return 'perdido';
  if (lead.status === 'encerrado') {
    return lead.motivoEncerramento === 'horario_confirmado' ? 'reuniao' : 'encerrado_manual';
  }
  return 'aguardando_envio';
}

let todosOsLeads = [];

async function carregarLeads() {
  const quadro = document.getElementById('quadro');
  try {
    const resp = await api('/api/leads');
    todosOsLeads = await resp.json();
    renderizarQuadro();
    atualizarEstadoPausa();
  } catch (erro) {
    quadro.innerHTML = '<div class="vazio">Não consegui carregar os leads agora.</div>';
  }
}

function renderizarQuadro() {
  const quadro = document.getElementById('quadro');
  const termoCru = (document.getElementById('busca-telefone').value || '').trim().toLowerCase();
  const termoDigitos = termoCru.replace(/\D/g, '');
  const leads = termoCru
    ? todosOsLeads.filter((l) =>
        (termoDigitos && l.phone.includes(termoDigitos)) ||
        (l.nome || '').toLowerCase().includes(termoCru))
    : todosOsLeads;

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
            </a>
          `).join('') : '<p style="font-size:12px; color:var(--texto-fraco); padding:6px 4px;">Vazio</p>'}
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('busca-telefone').addEventListener('input', renderizarQuadro);

// O quadro se atualiza sozinho a cada 30s enquanto estiver aberto, pra
// refletir mensagens que sairam ou leads que responderam nesse meio tempo.
setInterval(() => {
  if (document.getElementById('view-leads').style.display !== 'none') carregarLeads();
}, 30000);

// ===== Botao de emergencia (pausar todos os envios) =====

async function atualizarEstadoPausa() {
  try {
    const resp = await api('/api/pausa');
    const { pausado } = await resp.json();
    document.getElementById('aviso-pausado').style.display = pausado ? 'block' : 'none';
    document.getElementById('btn-pausa').textContent = pausado ? 'Retomar envios' : 'Pausar envios';
  } catch (erro) { /* silencioso - nao vale travar o painel por isso */ }
}

document.getElementById('btn-pausa').addEventListener('click', async () => {
  const resp = await api('/api/pausa');
  const { pausado } = await resp.json();
  const novo = !pausado;
  if (novo && !confirm('Pausar TODOS os envios automáticos? Nenhum lead vai receber mensagem até você retomar.')) return;
  await api('/api/pausa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pausado: novo }),
  });
  atualizarEstadoPausa();
});

document.getElementById('btn-exportar').addEventListener('click', async () => {
  const resp = await api('/api/leads');
  const leads = await resp.json();
  const linhas = leads.map((l) => ({
    Nome: l.nome || '',
    Telefone: l.phone,
    Status: LABELS_STATUS[l.status] || l.status,
    'Mensagens enviadas': l.attemptsSent || 0,
    'Entrou em': l.sequenceStartedAt || '',
  }));
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Leads');
  XLSX.writeFile(livro, `leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  }));
  const resp = await api('/api/leads/lote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads: leadsParaImportar }),
  });
  const resultado = await resp.json();
  const msg = document.getElementById('msg-importacao');
  msg.style.display = 'block';
  const partes = [`${resultado.criados} lead(s) importado(s)`];
  if (resultado.duplicados) partes.push(`${resultado.duplicados} já existia(m) e foi(ram) mantido(s) sem alteração`);
  if (resultado.erros?.length) partes.push(`${resultado.erros.length} linha(s) com erro (confira nome/telefone)`);
  msg.textContent = partes.join(' · ') + '.';
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
  };

  try {
    const resp = await api('/api/leads', {
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
  };

  try {
    const resp = await api('/api/testar-mensagem', {
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
  };

  try {
    const resp = await api('/api/testar-whatsapp', {
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

  btnIniciar.textContent = 'Gerando…';
  btnIniciar.disabled = true;

  try {
    const resp = await api('/api/simular/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: simNome }),
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
    const resp = await api('/api/simular/responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: simNome, historico: simHistorico }),
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
  const resp = await api(`/api/leads/${encodeURIComponent(telefone)}`);
  if (!resp.ok) {
    document.getElementById('lead-resumo').textContent = 'Lead não encontrado.';
    return;
  }
  const lead = await resp.json();

  document.getElementById('lead-nome').textContent = lead.nome || telefone;
  document.getElementById('lead-resumo').innerHTML = `
    <span class="status ${lead.status}"><span class="ponto"></span>${LABELS_STATUS[lead.status] || lead.status}</span>
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
    await api(`/api/leads/${encodeURIComponent(telefone)}/encerrar`, { method: 'POST' });
    carregarDetalheLead(telefone);
  };

  document.getElementById('btn-remover-lead').onclick = async () => {
    if (!confirm('Remover este lead? Isso apaga a conversa e não pode ser desfeito.')) return;
    await api(`/api/leads/${encodeURIComponent(telefone)}`, { method: 'DELETE' });
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

  const resp = await api('/api/leads');
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
    Status: item.status,
    'O que aconteceu': item.resumo,
  }));
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Relatório');
  const data = document.getElementById('relatorio-data').value;
  XLSX.writeFile(livro, `relatorio-${data}.xlsx`);
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
  const resp = await api('/api/leads');
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
  const semResposta = leads.filter((l) => l.status === 'aguardando_resposta').length;
  const taxaRetorno = total ? Math.round((respondeu / total) * 100) : 0;

  container.innerHTML = [
    cartaoMetrica(total, 'Leads no total'),
    cartaoMetrica(`${taxaRetorno}%`, 'Taxa de retorno'),
    cartaoMetrica(encerrados, 'Reuniões marcadas'),
    cartaoMetrica(semResposta, 'Sem resposta ainda'),
  ].join('');
}

// ===== VIEW: configurações =====
// Identidade, mensagens de abertura, regras da conversa e horários. É daqui
// que sai TUDO que a IA fala e obedece - nada disso está no código, então
// mudar o comportamento do sistema é mudar esta tela.

const LISTAS_CONFIG = {
  'cfg-mensagem': {
    container: 'cfg-mensagens',
    rotulo: 'Mensagem',
    vazio: 'Nenhuma mensagem cadastrada. Enquanto não houver pelo menos uma, nada é enviado pra ninguém.',
  },
  'cfg-regra': {
    container: 'cfg-regras',
    rotulo: 'Regra',
    vazio: 'Nenhuma regra cadastrada. Sem regras, a IA encaminha pra você em vez de arriscar responder por conta própria.',
  },
};

// Texto vai pra dentro de um <textarea>, então & e < precisam ser escapados -
// sem isso, uma mensagem que contenha "<" quebraria o HTML da tela.
function escaparParaTextarea(texto) {
  return (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function valoresDe(classe) {
  return [...document.querySelectorAll('.' + classe)].map((campo) => campo.value);
}

function renderizarLista(classe, itens) {
  const { container, rotulo, vazio } = LISTAS_CONFIG[classe];
  const alvo = document.getElementById(container);
  if (!itens.length) {
    alvo.innerHTML = '<p class="dica">' + vazio + '</p>';
    return;
  }
  alvo.innerHTML = itens.map((texto, i) => `
    <div class="campo">
      <label>${rotulo} ${i + 1}</label>
      <textarea class="${classe}" rows="4">${escaparParaTextarea(texto)}</textarea>
      <button type="button" class="botao secundario btn-remover-item" data-classe="${classe}" data-indice="${i}" style="margin-top:8px;">Remover</button>
    </div>
  `).join('');
}


// --- WhatsApps conectados ---
// Cada numero e uma instancia da Z-API. A lista vazia significa "usa as
// credenciais das variaveis de ambiente", que e o modo de um numero so.

function escaparAtributo(texto) {
  return (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function valoresDosWhatsapps() {
  return [...document.querySelectorAll('.cartao-whatsapp')].map((cartao) => ({
    id: cartao.dataset.id || undefined,
    apelido: cartao.querySelector('.wa-apelido').value.trim(),
    instanceId: cartao.querySelector('.wa-instance').value.trim(),
    token: cartao.querySelector('.wa-token').value.trim(),
    clientToken: cartao.querySelector('.wa-client-token').value.trim(),
    nomeExibicao: cartao.querySelector('.wa-nome').value.trim(),
    avisarNumero: cartao.querySelector('.wa-avisar').value.trim(),
    ativo: cartao.querySelector('.wa-ativo').checked,
    tokenSalvo: cartao.dataset.tokenSalvo === 'sim',
    clientTokenSalvo: cartao.dataset.clientTokenSalvo === 'sim',
  }));
}

function renderizarWhatsapps(lista) {
  const alvo = document.getElementById('cfg-whatsapps');
  if (!lista.length) {
    alvo.innerHTML = '<p class="dica">Nenhum número cadastrado — o sistema está usando as credenciais das variáveis de ambiente, ou seja, um número só.</p>';
    return;
  }
  alvo.innerHTML = lista.map((w, i) => `
    <div class="cartao-whatsapp" data-id="${escaparAtributo(w.id || '')}" data-token-salvo="${w.tokenSalvo ? 'sim' : 'nao'}" data-client-token-salvo="${w.clientTokenSalvo ? 'sim' : 'nao'}" style="border:1px solid rgba(255,255,255,0.14); border-radius:8px; padding:18px; margin-bottom:18px;">
      <div class="campo">
        <label>Apelido</label>
        <input type="text" class="wa-apelido" value="${escaparAtributo(w.apelido)}" placeholder="Ex: Número 1">
      </div>
      <div class="campo">
        <label>Instance ID (Z-API)</label>
        <input type="text" class="wa-instance" value="${escaparAtributo(w.instanceId)}">
      </div>
      <div class="campo">
        <label>Token (Z-API)</label>
        <input type="password" class="wa-token" placeholder="${w.tokenSalvo ? 'já salvo — deixe em branco pra manter' : 'cole o token'}">
      </div>
      <div class="campo">
        <label>Client-Token (Z-API)</label>
        <input type="password" class="wa-client-token" placeholder="${w.clientTokenSalvo ? 'já salvo — deixe em branco pra manter' : 'cole o client-token'}">
      </div>
      <div class="campo">
        <label>Nome nas mensagens (opcional)</label>
        <input type="text" class="wa-nome" value="${escaparAtributo(w.nomeExibicao)}" placeholder="Em branco = usa o nome da aba Identidade">
      </div>
      <div class="campo">
        <label>Avisos vão para (opcional)</label>
        <input type="text" class="wa-avisar" value="${escaparAtributo(w.avisarNumero)}" placeholder="Em branco = vão pro número padrão do sistema">
      </div>
      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:12px;">
        <input type="checkbox" class="wa-ativo" ${w.ativo ? 'checked' : ''} style="width:auto;">
        Ativo (entra no rodízio e recebe leads novos)
      </label>
      ${w.id
        ? `<p class="dica">Webhook desse número — cole na Z-API em "ao receber mensagem":<br><code style="word-break:break-all;">${location.origin}/webhooks/whatsapp/${w.id}</code></p>`
        : '<p class="dica">Salve pra gerar a URL de webhook desse número.</p>'}
      <button type="button" class="botao secundario btn-remover-whatsapp" data-indice="${i}">Remover número</button>
    </div>
  `).join('');
}

document.getElementById('btn-add-whatsapp').addEventListener('click', () => {
  renderizarWhatsapps([...valoresDosWhatsapps(), {
    id: '', apelido: '', instanceId: '', nomeExibicao: '', avisarNumero: '',
    ativo: true, tokenSalvo: false, clientTokenSalvo: false,
  }]);
});

async function carregarConfig() {
  const resp = await api('/api/config');
  const cfg = await resp.json();

  document.getElementById('cfg-nome').value = cfg.identidade.nome || '';
  document.getElementById('cfg-empresa').value = cfg.identidade.empresa || '';
  document.getElementById('cfg-contexto').value = cfg.identidade.contexto || '';

  renderizarWhatsapps(cfg.whatsapps || []);
  renderizarLista('cfg-mensagem', cfg.mensagens);
  renderizarLista('cfg-regra', cfg.regras);

  document.getElementById('cfg-hora-inicio').value = cfg.horarios.inicio;
  document.getElementById('cfg-hora-fim').value = cfg.horarios.fim;
  document.getElementById('cfg-atraso-min').value = cfg.horarios.atrasoMinMinutos;
  document.getElementById('cfg-atraso-max').value = cfg.horarios.atrasoMaxMinutos;
  document.getElementById('cfg-intervalo-min').value = cfg.horarios.intervaloMinSegundos;
  document.getElementById('cfg-intervalo-max').value = cfg.horarios.intervaloMaxSegundos;
  document.getElementById('cfg-max-respostas').value = cfg.maxRespostasAutomaticas;
}

// Abas da tela de configuração (Identidade / Mensagens / Regras / Horários)
document.querySelectorAll('#abas-config .aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelectorAll('#abas-config .aba').forEach((a) => a.classList.remove('ativa'));
    aba.classList.add('ativa');
    document.querySelectorAll('.painel-config').forEach((p) => { p.style.display = 'none'; });
    document.getElementById('config-' + aba.dataset.painel).style.display = 'block';
  });
});

document.getElementById('btn-add-mensagem').addEventListener('click', () => {
  renderizarLista('cfg-mensagem', [...valoresDe('cfg-mensagem'), '']);
});

document.getElementById('btn-add-regra').addEventListener('click', () => {
  renderizarLista('cfg-regra', [...valoresDe('cfg-regra'), '']);
});

// Os botões "Remover" nascem junto com os itens, então o clique é escutado
// no container - assim continua funcionando depois de cada re-render.
document.getElementById('view-config').addEventListener('click', (evento) => {
  const remocaoDeNumero = evento.target.closest('.btn-remover-whatsapp');
  if (remocaoDeNumero) {
    const indice = Number(remocaoDeNumero.dataset.indice);
    renderizarWhatsapps(valoresDosWhatsapps().filter((_, i) => i !== indice));
    return;
  }

  const botao = evento.target.closest('.btn-remover-item');
  if (!botao) return;
  const classe = botao.dataset.classe;
  const indice = Number(botao.dataset.indice);
  renderizarLista(classe, valoresDe(classe).filter((_, i) => i !== indice));
});

document.getElementById('btn-salvar-config').addEventListener('click', async () => {
  const sucesso = document.getElementById('cfg-sucesso');
  const erro = document.getElementById('cfg-erro');
  sucesso.style.display = 'none';
  erro.style.display = 'none';

  const corpo = {
    whatsapps: valoresDosWhatsapps(),
    identidade: {
      nome: document.getElementById('cfg-nome').value.trim(),
      empresa: document.getElementById('cfg-empresa').value.trim(),
      contexto: document.getElementById('cfg-contexto').value.trim(),
    },
    mensagens: valoresDe('cfg-mensagem').filter((t) => t.trim()),
    regras: valoresDe('cfg-regra').filter((t) => t.trim()),
    horarios: {
      inicio: Number(document.getElementById('cfg-hora-inicio').value),
      fim: Number(document.getElementById('cfg-hora-fim').value),
      atrasoMinMinutos: Number(document.getElementById('cfg-atraso-min').value),
      atrasoMaxMinutos: Number(document.getElementById('cfg-atraso-max').value),
      intervaloMinSegundos: Number(document.getElementById('cfg-intervalo-min').value),
      intervaloMaxSegundos: Number(document.getElementById('cfg-intervalo-max').value),
    },
    maxRespostasAutomaticas: Number(document.getElementById('cfg-max-respostas').value),
  };

  try {
    const resp = await api('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await resp.json();
    if (!resp.ok) {
      erro.textContent = dados.erro || 'Não consegui salvar.';
      erro.style.display = 'block';
      return;
    }
    renderizarWhatsapps(dados.whatsapps || []);
    renderizarLista('cfg-mensagem', dados.mensagens);
    renderizarLista('cfg-regra', dados.regras);
    sucesso.textContent = `Salvo — ${(dados.whatsapps || []).filter((w) => w.ativo).length} número(s) ativo(s), ${dados.mensagens.length} mensagem(ns) e ${dados.regras.length} regra(s).`;
    sucesso.style.display = 'block';
    setTimeout(() => { sucesso.style.display = 'none'; }, 3000);
  } catch (falha) {
    erro.textContent = 'Não consegui falar com o servidor agora.';
    erro.style.display = 'block';
  }
});

// ===== VIEW: backup =====

document.getElementById('btn-baixar-backup').addEventListener('click', async () => {
  const resp = await api('/api/backup');
  const texto = await resp.text();
  const blob = new Blob([texto], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

const arquivoBackup = document.getElementById('arquivo-backup');
document.getElementById('btn-restaurar-backup').addEventListener('click', () => {
  if (!confirm('Restaurar de um backup SUBSTITUI todos os dados atuais (leads, conversas, configurações). Isso não pode ser desfeito. Continuar?')) return;
  arquivoBackup.click();
});

arquivoBackup.addEventListener('change', async (evento) => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const sucessoEl = document.getElementById('backup-sucesso');
  const erroEl = document.getElementById('backup-erro');
  sucessoEl.style.display = 'none';
  erroEl.style.display = 'none';

  try {
    const dados = JSON.parse(await arquivo.text());
    const resp = await api('/api/backup/restaurar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados }),
    });
    const corpo = await resp.json();
    if (!resp.ok) throw new Error(corpo.erro || 'falha ao restaurar');
    sucessoEl.textContent = `Restaurado — ${corpo.leads} lead(s) no sistema.`;
    sucessoEl.style.display = 'block';
  } catch (erro) {
    erroEl.textContent = `Não consegui restaurar: ${erro.message}`;
    erroEl.style.display = 'block';
  } finally {
    arquivoBackup.value = '';
  }
});
