const axios = require('axios');
const { getRecentSuccessfulExamples } = require('../db/store');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// Numero da tentativa (1 a 6) define o tom da mensagem.
// Isso implementa a cadencia: 2 mensagens/dia por 3 dias.
const TOM_POR_TENTATIVA = {
  1: 'Primeira tentativa. Reforce o motivo do contato (o produto que o lead demonstrou interesse) e pergunte um horario melhor para conversar.',
  2: 'Segunda tentativa, ainda no mesmo dia da primeira. Seja breve, mostre disponibilidade sem parecer insistente.',
  3: 'Terceiro contato, novo dia. Ofereca algo de valor concreto (ex: uma simulacao personalizada) para dar um motivo novo de resposta.',
  4: 'Quarto contato. Tom leve, uma pergunta direta e curta, sem repetir o que ja foi dito antes.',
  5: 'Quinto contato, ultimo dia da sequencia. Traga um senso de oportunidade real (ex: condicao ou vaga do periodo) sem soar como pressao agressiva.',
  6: 'Sexta e ultima mensagem da sequencia. Feche com gentileza: avise que essa e a ultima tentativa por aqui e que o lead pode responder quando quiser.',
};

async function gerarMensagem({ leadNome, produto, tentativa, historico }) {
  const exemplosBons = getRecentSuccessfulExamples(4);

  const exemplosTexto = exemplosBons.length
    ? exemplosBons
        .map((e, i) => `Exemplo ${i + 1} (gerou resposta do lead): "${e.mensagem}"`)
        .join('\n')
    : 'Ainda sem exemplos anteriores registrados.';

  const systemPrompt = `Voce escreve mensagens de WhatsApp para um consultor financeiro brasileiro
especializado em consorcio (segmentos: agro/rural, imoveis, caminhoes/veiculos pesados e credito empresarial).

Contexto: o consultor ja ligou para o lead e nao conseguiu atendimento. Seu papel e escrever
UMA mensagem curta, humana e natural (nunca robotica, nunca com cara de disparo em massa) para
tentar reengajar esse lead pelo WhatsApp.

Regras:
- Maximo 3-4 linhas.
- Nunca usar linguagem de spam ("promocao imperdivel", excesso de emoji, tudo em maiusculas).
- Termine com uma pergunta simples ou um proximo passo claro.
- Varie a abordagem de acordo com o numero da tentativa (instrucao abaixo).
- Escreva como se fosse o proprio consultor digitando, em primeira pessoa.
- Nao invente informacoes sobre condicoes, valores ou prazos que nao foram fornecidos.

Instrucao para esta tentativa (${tentativa} de 6): ${TOM_POR_TENTATIVA[tentativa]}

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

module.exports = { gerarMensagem };
