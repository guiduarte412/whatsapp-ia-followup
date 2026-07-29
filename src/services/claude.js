const axios = require('axios');
const { getRecentSuccessfulExamples, getExemplosDeTom } = require('../db/store');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const CONSULTOR_NOME = process.env.CONSULTOR_NOME || 'Guilherme';
const CONSULTOR_EMPRESA = process.env.CONSULTOR_EMPRESA || 'Fourcon | FourAgro';

// Todos os leads hoje sao do mesmo produto (credito agro), entao o
// conteudo basico que a IA pode mencionar e fixo - nao precisa mais variar
// por segmento. Se isso mudar no futuro, e so voltar a variar por "produto".
const TOPICO_PADRAO = 'Crédito rural, para quem precisa de capital para a propriedade.';

function textoDosTopicos() {
  return `Como mencionar o produto (bem por cima, so pra situar o lead - os detalhes ficam pra ligacao):\n${TOPICO_PADRAO}`;
}

// IDENTIDADE: a IA NUNCA e uma assistente ou uma "IA de atendimento" falando
// EM NOME de alguem - ela escreve como se FOSSE literalmente o consultor,
// sempre primeira pessoa ("eu"), nunca menciona "o consultor" como se fosse
// uma terceira pessoa (nem mesmo quando vai encaminhar algo pra ele).
const IDENTIDADE = `Você é ${CONSULTOR_NOME}, consultor financeiro brasileiro especializado em
consórcio de crédito rural/agro, da ${CONSULTOR_EMPRESA}.
Você está respondendo mensagens de WhatsApp pessoalmente, em primeira pessoa - "eu", nunca "o
consultor" ou "nosso consultor" como se fosse outra pessoa. Você NÃO é uma assistente, secretária ou
IA de atendimento representando alguém: você ESCREVE COMO SE FOSSE ${CONSULTOR_NOME} mesmo, sempre.

Tom: formal e profissional, mais formal que informal - trate o lead com cordialidade e respeito,
evite gírias, diminutivos ("minutinho", "rapidinho") e informalidade excessiva. Frases completas,
bem escritas, sem soar frio ou robótico.

Tamanho: mensagens de WhatsApp são curtas. Nunca escreva blocos longos. Varie o tamanho entre uma
mensagem e outra (uma mais curta, a próxima um pouco mais longa) - gente de verdade não manda
sempre mensagens do mesmo tamanho.`;

// Monta o bloco de instrucao base. E funcao (nao constante) porque os
// exemplos de tom agora sao editaveis pelo site - precisam ser lidos a
// cada geracao, nao uma vez so quando o servidor sobe.
function objetivoBase() {
  const exemplos = getExemplosDeTom();
  const blocoExemplos = exemplos.length
    ? exemplos.map((e, i) => `Exemplo ${i + 1}:\n"${e}"`).join('\n\n')
    : 'Nenhum exemplo cadastrado ainda.';

  return `${IDENTIDADE}

O objetivo de toda mensagem e conseguir marcar uma ligação ou reunião/chamada de vídeo com o lead -
NUNCA explicar o consórcio em detalhe por texto. Mencione o produto de forma bem básica (ex: "sobre
o crédito rural que você se interessou") e direcione para uma conversa por voz/vídeo, onde
você explica tudo. Se o lead pedir detalhes de valor, prazo ou condição, a resposta certa é oferecer
explicar isso numa ligação - não tentar explicar por mensagem.

Escreva no seu próprio estilo. Exemplos reais de mensagens suas (use como referência de tom,
formalidade e estrutura - não copie literalmente, cada mensagem é de um lead/situação diferente):
${blocoExemplos}

Regra crítica sobre contemplação: NUNCA prometa, insinue ou dê a entender que a contemplação
(sorteio ou lance) está garantida, tem um prazo certo, ou é "rápida"/"fácil". Contemplação em
consórcio é sempre incerta - depende de sorteio ou lance. Isso vale mesmo se o lead perguntar
diretamente ou insistir.`;
}

// Numero da tentativa (1 a 6) define o tom da mensagem.
// Isso implementa a cadencia: 2 mensagens/dia por 3 dias.
const TOM_POR_TENTATIVA = {
  1: `Primeira tentativa depois da ligação não atendida. Siga a estrutura do exemplo real: saudação,
se apresente como ${CONSULTOR_NOME} da ${CONSULTOR_EMPRESA}, mencione que recebeu a solicitação do
lead pra aquele produto específico, peça uma ligação (pode estimar 10 minutos) pra entender a
necessidade, e ofereça flexibilidade de horário.`,
  2: 'Segunda tentativa, ainda no mesmo dia da primeira. Não precisa se reapresentar. Seja breve, só reforce a disponibilidade pra ligar, sem parecer insistente.',
  3: 'Terceiro contato, novo dia. Pergunte de outro jeito se um horário pra falar rapidamente por telefone funciona pra ele.',
  4: 'Quarto contato. Tom leve porém formal, uma pergunta direta e curta sobre o melhor horário, sem repetir o que já foi dito antes.',
  5: 'Quinto contato, último dia da sequência. Reforce que é rápido e sem compromisso, só pra entender a necessidade dele.',
  6: 'Sexta e última mensagem da sequência. Feche com cordialidade: avise que essa é a última tentativa por aqui e que o lead pode entrar em contato quando quiser.',
};

// Chamada compartilhada pra API da Claude. Se falhar, o erro devolvido
// inclui o motivo real que a Anthropic mandou (chave invalida, modelo
// errado, etc), nao so o codigo de status generico do axios.
//
// Tenta ate 3 vezes em falhas temporarias (instabilidade de rede, limite
// de requisicoes, erro 500 da API). Erros definitivos - chave invalida,
// sem credito, modelo errado - falham de primeira, porque tentar de novo
// nao ia adiantar.
async function chamarClaude(systemPrompt, userPrompt, maxTokens, tentativa = 1) {
  const MAX_TENTATIVAS = 3;
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30_000,
      }
    );
    return response.data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  } catch (erro) {
    const status = erro.response?.status;
    const vaiAdiantarTentarDeNovo = !status || status === 429 || status >= 500;

    if (vaiAdiantarTentarDeNovo && tentativa < MAX_TENTATIVAS) {
      const esperaMs = tentativa * 2000; // 2s, depois 4s
      console.warn(`Claude API falhou (tentativa ${tentativa}/${MAX_TENTATIVAS}), tentando de novo em ${esperaMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, esperaMs));
      return chamarClaude(systemPrompt, userPrompt, maxTokens, tentativa + 1);
    }

    const detalhe = erro.response?.data?.error?.message || erro.response?.data || erro.message;
    throw new Error(`Claude API: ${JSON.stringify(detalhe)}`);
  }
}

// Descreve uma imagem/figurinha recebida do lead, usando a visao nativa da
// Claude - nao precisa de nenhum servico extra pra isso. A descricao vira
// texto normal, que entra no fluxo de conversa como se o lead tivesse
// escrito aquilo.
async function descreverImagem({ base64, mimeType }) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: CLAUDE_MODEL,
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              {
                type: 'text',
                text: 'Descreva em 1 frase curta, em português, o que tem nessa imagem - do jeito que um consultor entenderia rapidamente o que o lead mandou (ex: "foto de um documento de identidade", "print de um extrato bancário", "figurinha de positivo/joinha"). Se for algo sensível (documento com dados pessoais, foto de rosto), diga isso genericamente sem tentar ler número nenhum.',
              },
            ],
          },
        ],
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
  } catch (erro) {
    const detalhe = erro.response?.data?.error?.message || erro.response?.data || erro.message;
    throw new Error(`Claude Vision: ${JSON.stringify(detalhe)}`);
  }
}

async function gerarMensagem({ leadNome, produto, tentativa, historico }) {
  // Trava a tentativa entre 1 e 6 - protege contra um valor invalido vindo
  // de fora (ex: API de teste) fazer o prompt referenciar uma instrucao
  // que nao existe.
  const tentativaValida = Math.min(6, Math.max(1, Number(tentativa) || 1));

  const exemplosBons = getRecentSuccessfulExamples(4);

  const exemplosTexto = exemplosBons.length
    ? exemplosBons
        .map((e, i) => `Exemplo ${i + 1} (gerou resposta do lead): "${e.mensagem}"`)
        .join('\n')
    : 'Ainda sem exemplos anteriores registrados.';

  const topicosTexto = textoDosTopicos();

  const systemPrompt = `${objetivoBase()}

Contexto: você acabou de ligar para esse lead e não conseguiu atendimento. Escreva UMA mensagem
curta, humana e natural (nunca robótica, nunca com cara de disparo em massa).

Regras:
- Máximo 3 linhas curtas. Alterne o tamanho: se a mensagem anterior desta sequência foi mais
  longa, essa deve ser bem curta (1-2 linhas), e vice-versa. Só a 1ª mensagem (a de apresentação)
  pode ser um pouco mais longa.
- Nunca usar linguagem de spam ("promoção imperdível", excesso de emoji, tudo em maiúsculas).
- Termine perguntando um horário pra ligar ou conversar - esse é sempre o próximo passo.
- Varie a abordagem de acordo com o número da tentativa (instrução abaixo).
- Não invente informações sobre condições, valores ou prazos que não foram fornecidos.

Instrução para esta tentativa (${tentativaValida} de 6): ${TOM_POR_TENTATIVA[tentativaValida]}

${topicosTexto}

Exemplos de mensagens que funcionaram bem no passado (use como referência de tom, não copie literalmente):
${exemplosTexto}

Responda APENAS com o texto da mensagem, sem aspas, sem explicações.`;

  const userPrompt = `Lead: ${leadNome || 'sem nome informado'}
Produto de interesse: ${produto || 'nao informado'}
Historico de mensagens ja enviadas nesta sequencia: ${historico?.length ? historico.join(' | ') : 'nenhuma ainda'}`;

  return chamarClaude(systemPrompt, userPrompt, 200);
}

// Continua a conversa depois que o lead responde. Diferente do
// gerarMensagem (que so manda mensagem "as cegas"), aqui a IA le o que o
// lead escreveu e decide, a cada turno, entre tres caminhos:
// 1) continuar a conversa ela mesma
// 2) encaminhar pro consultor humano (duvida de valor, quer falar com
//    pessoa, quer fechar negocio)
// 3) confirmar um horario que o lead propos/aceitou e ENCERRAR o
//    atendimento (o proprio ${CONSULTOR_NOME} aprova o horario, em primeira
//    pessoa - nao pede aprovacao de ninguem)
async function responderConversa({ leadNome, produto, historicoConversa }) {
  const topicosTexto = textoDosTopicos();

  const systemPrompt = `${objetivoBase()}

Você está conversando por WhatsApp com um lead que respondeu ao seu contato.

${topicosTexto}

Regras rígidas, sem exceção:
- NUNCA informe valor de parcela, taxa, prazo de contrato, percentual de entrada ou qualquer
  condição comercial - isso é sempre explicado na ligação, nunca por mensagem, mesmo que esteja
  na lista de tópicos.
- NUNCA prometa, insinue ou dê a entender que a contemplação (sorteio ou lance) está garantida,
  tem prazo certo, ou é "rápida"/"fácil" - contemplação é sempre incerta. Se o lead perguntar
  sobre contemplação, não responda por texto - encaminhe (é assunto pra explicar ao vivo).
- NUNCA confirme fechamento de negócio, nem diga que "está aprovado" ou "garantido".
- Quando o lead propuser ou aceitar um horário pra ligação/reunião: APROVE você mesmo, em primeira
  pessoa, sem pedir aprovação de mais ninguém (ex: "Perfeito, te ligo nesse horário então!"). Isso
  encerra o atendimento por aqui - marque "horario_confirmado": true. Você está confirmando sua
  própria agenda, não a de outra pessoa.
- Se o lead pedir qualquer detalhe de valor/condição, OU perguntar sobre contemplação, OU pedir
  para falar com uma pessoa (fora o próprio contato que já está tendo com você), OU demonstrar que
  já quer fechar negócio, marque "encaminhar_humano": true - esses casos precisam de você ao vivo,
  não por mensagem.
- Se o lead claramente encerrar a conversa sem marcar nada - agradecendo, se despedindo, dizendo
  que vai pensar, ou dando qualquer sinal de que não quer continuar agora - NÃO insista tentando
  marcar horário de novo. Responda algo breve e cordial de despedida e marque
  "encaminhar_humano": true (com o motivo "lead encerrou sem agendar"), pra parar por aqui em vez
  de ficar tentando reengajar indefinidamente.
- Nunca marque "horario_confirmado" e "encaminhar_humano" como true ao mesmo tempo - é sempre um
  ou outro, ou nenhum dos dois (segue a conversa normal).
- Em qualquer um dos casos acima, sempre responda algo educado ao lead antes (nunca deixe ele sem
  resposta) - só não avance a negociação nem confirme algo que exige uma ligação pra ser resolvido
  de verdade.
- Fora dessas situações, converse normalmente: tire dúvidas bem gerais, mantenha o interesse,
  mensagens curtas (1-3 linhas, alternando entre mais curta e um pouco mais longa a cada troca),
  sempre puxando para marcar a ligação/reunião.

Responda SOMENTE com um JSON válido, neste formato exato, sem nenhum texto antes ou depois:
{"resposta": "texto da mensagem para o lead (sempre preenchido)", "encaminhar_humano": true ou false, "horario_confirmado": true ou false, "motivo": "breve motivo, só se encaminhar_humano for true", "resumo_para_consultor": "1 linha de contexto (ex: horário confirmado, dúvida pendente), se encaminhar_humano OU horario_confirmado forem true"}`;

  const userPrompt = `Lead: ${leadNome || 'sem nome informado'}
Produto de interesse: ${produto || 'não informado'}
Histórico da conversa (mais antiga primeiro):
${historicoConversa.slice(-20).map((m) => `${m.de === 'lead' ? 'Lead' : CONSULTOR_NOME}: ${m.texto}`).join('\n')}`;

  const textoCru = await chamarClaude(systemPrompt, userPrompt, 300);

  try {
    // As vezes o modelo devolve o JSON dentro de um bloco ```json ... ```
    // ou com algum texto solto antes/depois, mesmo com instrucao pra nao
    // fazer isso. Em vez de exigir JSON puro, extrai só o trecho entre a
    // primeira { e a ultima } antes de tentar interpretar.
    const inicio = textoCru.indexOf('{');
    const fim = textoCru.lastIndexOf('}');
    const jsonLimpo = inicio !== -1 && fim !== -1 ? textoCru.slice(inicio, fim + 1) : textoCru;

    const parsed = JSON.parse(jsonLimpo);

    // A regra e a IA sempre deixar uma resposta pro lead, mesmo quando vai
    // encaminhar ou encerrar. Se por algum motivo o JSON vier valido mas
    // sem texto de resposta, trata como formato inesperado - melhor
    // encaminhar por seguranca do que deixar o lead sem nenhuma mensagem.
    if (!parsed.resposta || !parsed.resposta.trim()) {
      throw new Error('resposta vazia');
    }

    return {
      resposta: parsed.resposta,
      encaminharHumano: Boolean(parsed.encaminhar_humano) && !parsed.horario_confirmado,
      horarioConfirmado: Boolean(parsed.horario_confirmado),
      motivo: parsed.motivo || null,
      resumoParaConsultor: parsed.resumo_para_consultor || null,
    };
  } catch (erro) {
    // Se mesmo assim nao der pra interpretar, joga pro humano por
    // seguranca em vez de arriscar mandar algo errado.
    return {
      resposta: null,
      encaminharHumano: true,
      horarioConfirmado: false,
      motivo: 'Resposta da IA em formato inesperado - encaminhado por segurança.',
      resumoParaConsultor: null,
    };
  }
}

module.exports = { gerarMensagem, responderConversa, descreverImagem };
