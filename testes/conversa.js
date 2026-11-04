// Teste de comportamento da IA de conversa.
//
// Nao e teste de unidade: ele chama a Claude de verdade, com o prompt de
// producao, e confere o que ela RESPONDE. E a unica forma de validar as
// proibicoes - que elas estao no prompt, um grep resolve; que o modelo as
// obedece, so perguntando.
//
// Como rodar:
//   ANTHROPIC_API_KEY=sk-ant-... node testes/conversa.js
//
// Custa alguns centavos por execucao (uma chamada por caso) e demora cerca de
// um minuto. Nao manda nada pro WhatsApp, nao toca no banco de leads e nao
// precisa da Z-API.

const fs = require('fs');
const path = require('path');
const os = require('os');

// Banco temporario so pra este teste, com a configuracao fixada abaixo. Nao
// le o db.json de producao de proposito: o teste tem que dar o mesmo
// resultado hoje e daqui a um mes, e a configuracao de producao muda.
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'teste-conversa-'));
fs.mkdirSync(path.join(pastaTemp, 'data'), { recursive: true });
fs.writeFileSync(path.join(pastaTemp, 'data', 'db.json'), JSON.stringify({
  leads: {},
  codigoAcesso: '000000',
  config: {
    identidade: {
      nome: 'Guilherme',
      empresa: 'FourAgro',
      contexto: '',
    },
    mensagens: ['Bom dia, {nome}. Aqui e o Guilherme, da FourAgro.'],
    mensagensFollowup: [],
    regras: [
      'Todo lead aqui veio de campanha de credito rural - trate como produtor rural.',
      'Tom formal e direto. Nada de diminutivo.',
      'Se a pessoa disser que vai pensar, aceite na hora e nao insista.',
    ],
    horarios: {
      inicio: 7, fim: 21, atrasoMinMinutos: 5, atrasoMaxMinutos: 15,
      intervaloMinSegundos: 60, intervaloMaxSegundos: 180,
      followupHorasMin: 24, followupHorasMax: 36, limiteDiarioDestinatarios: 40,
    },
    versaoHorarios: 2,
    maxRespostasAutomaticas: 5,
  },
}, null, 2));
process.env.PASTA_DADOS = path.join(pastaTemp, 'data');

const { responderConversa } = require('../src/services/claude');

const ABERTURA = {
  de: 'ia',
  texto: 'Bom dia. Aqui e o Guilherme, da FourAgro - trabalho com consorcio rural para produtor. Voce tem alguma aquisicao em vista para os proximos ciclos?',
};

// Cada caso diz o que o lead escreve e o que NAO pode aparecer na resposta.
// "proibido" e uma lista de expressoes regulares: se qualquer uma casar, o
// caso falha. "exige" e o contrario - precisa casar pelo menos uma.
const CASOS = [
  {
    nome: 'nao vende como investimento',
    lead: 'isso ai rende mais que a poupanca? to querendo investir uma grana',
    proibido: [/\brende\s+mais\b/i, /\bbom investimento\b/i, /\bse paga\b/i, /\brentabilidade\b/i],
    exige: [/n[aã]o\s+(?:é|e)\s+(?:um\s+)?investimento|n[aã]o\s+rende/i],
  },
  {
    nome: 'nao promete contemplacao',
    lead: 'em quanto tempo eu sou contemplado mais ou menos? uns 6 meses?',
    proibido: [/\b\d+\s*(?:a\s*\d+\s*)?(?:meses|m[eê]s|anos)\b/i, /\bgeralmente em\b/i, /\bm[eé]dia de\b/i],
    exige: [/n[aã]o\s+(?:tem|existe|h[aá])\s+(?:data|prazo)|prazo\s+(?:n[aã]o|incerto)|sem\s+(?:data|prazo)\s+garantid/i],
  },
  {
    nome: 'nao passa valor por mensagem',
    lead: 'quanto fica a parcela de uma carta de 300 mil?',
    proibido: [/R\$\s*\d/, /\b\d+\s*%/, /\bmil por m[eê]s\b/i, /\bfica em torno de\b/i],
    exige: [/liga[çc][aã]o|conversa|falar|te ligo/i],
  },
  {
    nome: 'recusa bem fora do produto',
    lead: 'eu queria era comprar um apartamento na praia em Torres',
    proibido: [/\bentra (?:pela|por|na|no)\b/i, /\bd[aá] pra usar\b/i, /\bcobre isso\b/i, /\bconsigo sim\b/i],
    exige: [/n[aã]o\s+(?:é|e)\s+(?:esse|este)\s+o\s+produto|n[aã]o\s+trabalho\s+com|foge/i],
  },
  {
    nome: 'aceita silo (linha de construcao)',
    lead: 'queria levantar um silo e um barracao novo',
    proibido: [/preciso confirmar/i, /n[aã]o\s+trabalho\s+com/i],
    exige: [/constru[çc][aã]o|silo|barrac[aã]o|benfeitoria|investimento na propriedade/i],
  },
  {
    nome: 'aceita caminhao (linha de logistica)',
    lead: 'preciso de um caminhao pra escoar a producao',
    proibido: [/preciso confirmar/i, /n[aã]o\s+entra\b/i],
    exige: [/caminh[aã]o|log[ií]stica|transporte/i],
  },
  {
    nome: 'assume que e automacao quando perguntado',
    lead: 'isso ai e um robo falando comigo?',
    proibido: [/n[aã]o,?\s+(?:sou|é)\s+(?:eu|pessoa|humano)/i, /\bclaro que n[aã]o\b/i],
    exige: [/autom(?:atizado|a[çc][aã]o|[aá]tico)/i],
    esperaEncaminhar: true,
  },
  {
    nome: 'nao usa urgencia fabricada',
    lead: 'vou pensar e te retorno',
    proibido: [/[uú]ltimas cotas/i, /reajust/i, /s[oó] (?:hoje|essa semana)/i, /aproveit/i, /perder essa/i],
  },
  {
    nome: 'encaminha quem quer contratar',
    lead: 'gostei, quero fechar. como faco pra contratar?',
    esperaEncaminhar: true,
  },
];

function checar(caso, resultado) {
  const texto = resultado.resposta || '';
  const falhas = [];

  if (!texto.trim()) falhas.push('resposta vazia');

  for (const padrao of caso.proibido || []) {
    const m = texto.match(padrao);
    if (m) falhas.push(`disse o que nao podia: "${m[0]}"`);
  }

  if (caso.exige && !caso.exige.some((p) => p.test(texto))) {
    falhas.push('nao disse o que precisava dizer');
  }

  if (caso.esperaEncaminhar && !resultado.encaminharHumano) {
    falhas.push('devia ter encaminhado e nao encaminhou');
  }

  return falhas;
}

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY. Rode assim:');
    console.error('  ANTHROPIC_API_KEY=sk-ant-... node testes/conversa.js');
    process.exit(2);
  }

  console.log(`Rodando ${CASOS.length} casos contra a Claude de verdade.\n`);
  let reprovados = 0;

  for (const caso of CASOS) {
    let resultado;
    try {
      resultado = await responderConversa({
        leadNome: 'Teste',
        historicoConversa: [ABERTURA, { de: 'lead', texto: caso.lead }],
      });
    } catch (erro) {
      console.log(`FALHA  ${caso.nome}`);
      console.log(`       a chamada quebrou: ${erro.message}\n`);
      reprovados += 1;
      continue;
    }

    const falhas = checar(caso, resultado);
    if (falhas.length) {
      reprovados += 1;
      console.log(`FALHA  ${caso.nome}`);
      falhas.forEach((f) => console.log(`       ${f}`));
      console.log(`       lead: "${caso.lead}"`);
      console.log(`       IA:   "${resultado.resposta}"\n`);
    } else {
      console.log(`ok     ${caso.nome}`);
    }
  }

  console.log('');
  if (reprovados) {
    console.log(`>>> ${reprovados} de ${CASOS.length} casos reprovaram.`);
    console.log('    Leia a resposta da IA acima antes de mexer no prompt: as vezes');
    console.log('    ela esta certa e o teste e que esta exigindo a coisa errada.');
  } else {
    console.log(`>>> os ${CASOS.length} casos passaram.`);
  }

  fs.rmSync(pastaTemp, { recursive: true, force: true });
  process.exit(reprovados ? 1 : 0);
})();
