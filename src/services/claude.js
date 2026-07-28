const axios = require('axios');
const { getRecentSuccessfulExamples, getTopicos } = require('../db/store');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const CONSULTOR_NOME = process.env.CONSULTOR_NOME || 'Guilherme';
const CONSULTOR_EMPRESA = process.env.CONSULTOR_EMPRESA || 'Fourcon | FourAgro';

// Le o texto livre que o consultor escreveu no site (pagina /topicos.html)
// pra aquele segmento de produto. E esse texto que vira referencia de
// conteudo pra IA - nada estruturado, e so o que ele escreveu mesmo.
function textoDosTopicos(produto) {
  const topicos = getTopicos();
  const chave = (produto || '').toLowerCase();
  let valor;
  if (chave.includes('agro') || chave.includes('rural')) valor = topicos.agro;
  else if (chave.includes('imov') || chave.includes('imóv')) valor = topicos.imoveis;
  else if (chave.includes('caminh') || chave.includes('frota') || chave.includes('veic')) valor = topicos.caminhoes;
  else if (chave.includes('credit') || chave.includes('crédit') || chave.includes('empresa')) valor = topicos.credito_empresarial;
  else valor = topicos.geral;

  return valor && valor.trim()
    ? `Como mencionar o produto (bem por cima, so pra situar o lead - os detalhes ficam pra ligacao):\n${valor.trim()}`
    : 'Nenhuma descricao basica cadastrada para este produto ainda (pagina /topicos.html no site) - so peça o horario pra ligar, sem citar detalhes do produto.';
}

// Exemplo real de mensagem que o consultor ja mandou - usado como referencia
// de tom pra IA escrever parecido, nao generico/robotico.
const EXEMPLO_REAL_DE_TOM = `"Boa tarde, tudo bem?
Aqui é o ${CONSULTOR_NOME}, da ${CONSULTOR_EMPRESA}.
Recebi sua solicitação de crédito rural e vou acompanhar seu atendimento.
Podemos fazer uma ligação de 10 minutos para entender sua necessidade e encontrar a melhor solução? Se preferir, me informe o melhor horário que eu ligo."`;

// O objetivo de TODA mensagem por WhatsApp e marcar uma ligacao ou reuniao/
// chamada de video - os detalhes do consorcio (valores, prazos, condicoes)
// so sao explicados ao vivo, nunca por texto. Isso vale tanto pra sequencia
// inicial (gerarMensagem) quanto pra conversa continuada (responderConversa).
const OBJETIVO_BASE = `O objetivo de toda mensagem e conseguir marcar uma ligacao ou reuniao/chamada
de video com o lead - NUNCA explicar o consorcio em detalhe por texto. Mencione o produto de forma
bem basica (ex: "sobre o consorcio de imoveis que voce se interessou") e direcione para uma
conversa por voz/video, onde o consultor explica tudo. Se o lead pedir detalhes de valor, prazo ou
condicao, a resposta certa e oferecer explicar isso numa ligacao rapida - nao tentar explicar por
mensagem.

Escreva no estilo do consultor. Exemplo real de uma mensagem dele (use como referencia de tom,
formalidade e estrutura - nao copie literalmente, cada mensagem e de um lead/situacao diferente):
${EXEMPLO_REAL_DE_TOM}

Regra critica sobre contemplacao: NUNCA prometa, insinue ou de a entender que a contemplacao
(sorteio ou lance) esta garantida, e um prazo certo, ou e "rapida"/"facil". Contemplacao em
consorcio e sempre incerta - depende de sorteio ou lance. Isso vale mesmo se o lead perguntar
diretamente ou insistir.`;

// Numero da tentativa (1 a 6) define o tom da mensagem.
// Isso implementa a cadencia: 2 mensagens/dia por 3 dias.
const TOM_POR_TENTATIVA = {
  1: `Primeira tentativa depois da ligacao nao atendida. Siga a estrutura do exemplo real: saudacao,
se apresente como ${CONSULTOR_NOME} da ${CONSULTOR_EMPRESA}, mencione que recebeu a solicitacao do
lead pra aquele produto especifico, peca uma ligacao curta (pode estimar 10 minutos) pra entender a
necessidade, e ofereca flexibilidade de horario.`,
  2: 'Segunda tentativa, ainda no mesmo dia da primeira. Nao precisa se reapresentar. Seja breve, so reforce a disponibilidade pra ligar, sem parecer insistente.',
  3: 'Terceiro contato, novo dia. Pergunte de outro jeito se um horario pra falar rapido por telefone funciona pra ele.',
  4: 'Quarto contato. Tom leve, uma pergunta direta e curta sobre o melhor horario, sem repetir o que ja foi dito antes.',
  5: 'Quinto contato, ultimo dia da sequencia. Reforce que e rapido e sem compromisso, so pra entender a necessidade dele.',
  6: 'Sexta e ultima mensagem da sequencia. Feche com gentileza: avise que essa e a ultima tentativa por aqui e que o lead pode chamar quando quiser.',
};

async function gerarMensagem({ leadNome, produto, tentativa, historico }) {
  const exemplosBons = getRecentSuccessfulExamples(4);

  const exemplosTexto = exemplosBons.length
    ? exemplosBons
        .map((e, i) => `Exemplo ${i + 1} (gerou resposta do lead): "${e.mensagem}"`)
        .join('\n')
    : 'Ainda sem exemplos anteriores registrados.';

  const topicosTexto = textoDosTopicos(produto);

  const systemPrompt = `Voce escreve mensagens de WhatsApp para um consultor financeiro brasileiro
especializado em consorcio (segmentos: agro/rural, imoveis, caminhoes/veiculos pesados e credito empresarial).

Contexto: o consultor ja ligou para o lead e nao conseguiu atendimento. Seu papel e escrever
UMA mensagem curta, humana e natural (nunca robotica, nunca com cara de disparo em massa).

${OBJETIVO_BASE}

Regras:
- Maximo 3-4 linhas.
- Nunca usar linguagem de spam ("promocao imperdivel", excesso de emoji, tudo em maiusculas).
- Termine perguntando um horario pra ligar ou conversar - esse e sempre o proximo passo.
- Varie a abordagem de acordo com o numero da tentativa (instrucao abaixo).
- Escreva como se fosse o proprio consultor digitando, em primeira pessoa.
- Nao invente informacoes sobre condicoes, valores ou prazos que nao foram fornecidos.

Instrucao para esta tentativa (${tentativa} de 6): ${TOM_POR_TENTATIVA[tentativa]}

${topicosTexto}

Exemplos de mensagens que funcionaram bem no passado (use como referencia de tom, nao copie literalmente):
${exemplosTexto}

Responda APENAS com o texto da mensagem, sem aspas, sem explicacoes.`;

  const userPrompt = `Lead: ${leadNome || 'sem nome informado'}
Produto de interesse: ${produto || 'nao informado'}
Historico de mensagens ja enviadas nesta sequencia: ${historico?.length ? historico.join(' | ') : 'nenhuma ainda'}`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  return response.data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// Continua a conversa depois que o lead responde. Diferente do
// gerarMensagem (que so manda mensagem "as cegas"), aqui a IA le o que o
// lead escreveu e decide, a cada turno, se responde ela mesma ou se
// encaminha pro humano - nunca as duas coisas ao mesmo tempo.
async function responderConversa({ leadNome, produto, historicoConversa }) {
  const topicosTexto = textoDosTopicos(produto);

  const systemPrompt = `Você é a IA de atendimento inicial de um consultor financeiro brasileiro
especializado em consórcio (segmentos: agro/rural, imóveis, caminhões/veículos pesados e crédito
empresarial). Você está conversando por WhatsApp com um lead que respondeu ao contato.

${OBJETIVO_BASE}

${topicosTexto}

Regras rígidas, sem exceção:
- NUNCA informe valor de parcela, taxa, prazo de contrato, percentual de entrada ou qualquer
  condição comercial - isso é sempre explicado na ligação, nunca por mensagem, mesmo que esteja
  na lista de tópicos.
- NUNCA prometa, insinue ou dê a entender que a contemplação (sorteio ou lance) está garantida,
  tem prazo certo, ou é "rápida"/"fácil" - contemplação é sempre incerta. Se o lead perguntar
  sobre contemplação, não responda por texto - encaminhe para o consultor.
- NUNCA confirme fechamento de negócio, nem diga que "está aprovado" ou "garantido".
- NUNCA prometa ou confirme um horário de ligação em nome do consultor - você não sabe a
  agenda dele. Se o lead propuser ou aceitar um horário para ser contatado, agradeça e diga que
  vai confirmar com o consultor, mas encaminhe para o humano (é ele quem confirma o horário).
- Se o lead pedir qualquer detalhe de valor/condição, OU perguntar sobre contemplação, OU
  pedir para falar com uma pessoa, OU demonstrar que já quer fechar negócio, OU propuser/aceitar
  um horário de contato, você deve encaminhar para o consultor humano em vez de tentar resolver
  por texto.
- Mesmo quando for encaminhar, sempre responda algo educado ao lead antes (nunca deixe ele sem
  resposta) - só não avance a negociação nem confirme compromissos que não são seus para confirmar.
- Fora dessas situações, converse normalmente: tire dúvidas bem gerais, mantenha o interesse, tom
  humano e direto, em primeira pessoa (como se fosse o próprio consultor digitando), mensagens
  curtas (2-3 linhas), sempre puxando para marcar a ligação/reunião.

Responda SOMENTE com um JSON válido, neste formato exato, sem nenhum texto antes ou depois:
{"resposta": "texto da mensagem para o lead (sempre preenchido)", "encaminhar_humano": true ou false, "motivo": "breve motivo, só se encaminhar_humano for true", "resumo_para_consultor": "1 linha de contexto pro consultor saber o que fazer ao assumir (ex: horário proposto, dúvida pendente), só se encaminhar_humano for true"}`;

  const userPrompt = `Lead: ${leadNome || 'sem nome informado'}
Produto de interesse: ${produto || 'não informado'}
Histórico da conversa (mais antiga primeiro):
${historicoConversa.map((m) => `${m.de === 'lead' ? 'Lead' : 'Consultor (IA)'}: ${m.texto}`).join('\n')}`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  const textoCru = response.data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  try {
    const parsed = JSON.parse(textoCru);
    return {
      resposta: parsed.resposta,
      encaminharHumano: Boolean(parsed.encaminhar_humano),
      motivo: parsed.motivo || null,
      resumoParaConsultor: parsed.resumo_para_consultor || null,
    };
  } catch (erro) {
    // Se a IA nao devolver um JSON valido (raro, mas pode acontecer),
    // joga pro humano por seguranca em vez de arriscar mandar algo errado.
    return {
      resposta: null,
      encaminharHumano: true,
      motivo: 'Resposta da IA em formato inesperado - encaminhado por segurança.',
      resumoParaConsultor: null,
    };
  }
}

module.exports = { gerarMensagem, responderConversa };
