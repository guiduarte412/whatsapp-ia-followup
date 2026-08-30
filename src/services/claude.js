const axios = require('axios');
const { getConfig } = require('../db/store');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// Este arquivo NAO contem nenhum texto de venda, nenhuma regra de negocio e
// nenhum nome de produto. Tudo isso vem da tela de Configuracoes (mensagens,
// regras, identidade), gravado em db.json. Se voce precisa mudar o que a IA
// fala ou o que ela pode/nao pode dizer, e la - nao aqui.

// A IA escreve SEMPRE em primeira pessoa, como se fosse o proprio consultor
// digitando. Ela nunca se apresenta como assistente, secretaria ou IA, e
// nunca fala do consultor em terceira pessoa.
// "conexao" e o numero de WhatsApp por onde essa conversa acontece. Se ele
// tem um nome proprio cadastrado (caso de varios consultores dividindo o
// sistema), e esse nome que a IA usa; senao usa o nome geral da Identidade.
function blocoIdentidade(conexao) {
  const { identidade } = getConfig();
  const nome = (conexao && conexao.nomeExibicao) || identidade.nome || 'o consultor';
  const partes = [
    `Você é ${nome}${identidade.empresa ? `, da ${identidade.empresa}` : ''}.`,
    `Você está respondendo mensagens de WhatsApp pessoalmente, em primeira pessoa - "eu", nunca
"o consultor" ou "nossa equipe" como se fosse outra pessoa. Você NÃO é uma assistente, secretária
ou IA de atendimento representando alguém: você escreve como se fosse ${nome} mesmo, sempre.`,
  ];

  if (identidade.contexto && identidade.contexto.trim()) {
    partes.push(`Sobre o que você faz (use só isso como base, nunca invente nada além):
${identidade.contexto.trim()}`);
  }

  partes.push(`Tamanho: mensagens de WhatsApp são curtas. Nunca escreva blocos longos. Varie o
tamanho entre uma mensagem e outra - gente de verdade não manda sempre mensagens do mesmo tamanho.`);

  return partes.join('\n\n');
}

// As regras sao 100% definidas por voce na tela de Configuracoes. O codigo
// so as repassa pra IA numeradas - nao acrescenta nem remove nenhuma.
function blocoRegras() {
  const regras = getConfig().regras.filter((r) => r && r.trim());
  if (!regras.length) {
    return 'Nenhuma regra específica foi cadastrada. Na dúvida sobre qualquer assunto, não invente: encaminhe.';
  }
  return `Regras que você precisa seguir, sem exceção:
${regras.map((r, i) => `${i + 1}. ${r.trim()}`).join('\n')}`;
}

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
                text: 'Descreva em 1 frase curta, em português, o que tem nessa imagem - do jeito que alguém entenderia rapidamente o que a pessoa mandou (ex: "foto de um documento", "print de uma tela de banco", "figurinha de positivo/joinha"). Se for algo sensível (documento com dados pessoais, foto de rosto), diga isso genericamente sem tentar ler número nenhum.',
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
        timeout: 30_000,
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

// Continua a conversa depois que o cliente responde a mensagem de abertura.
// A cada turno a IA escolhe entre tres caminhos:
// 1) continuar a conversa ela mesma
// 2) encaminhar pra voce (qualquer coisa que as regras nao cobrem)
// 3) confirmar um horario que o cliente propos/aceitou e ENCERRAR - esse e
//    o objetivo da esteira, entao ela fecha o agendamento em primeira
//    pessoa, sem pedir aprovacao de ninguem.
async function responderConversa({ leadNome, historicoConversa, conexao }) {
  const nomeConsultor = (conexao && conexao.nomeExibicao) || getConfig().identidade.nome || 'Eu';

  const systemPrompt = `${blocoIdentidade(conexao)}

Você está conversando por WhatsApp com uma pessoa que respondeu ao seu contato.

Seu objetivo é UM só: marcar um horário de conversa (ligação ou reunião) com ela. Tudo que for
detalhe, explicação a fundo ou negociação fica pra esse horário - não se resolve por mensagem.

${blocoRegras()}

Além das regras acima, valem estas, que são estruturais:
- Quando a pessoa propuser ou aceitar um horário: confirme você mesmo, em primeira pessoa, sem
  pedir aprovação de mais ninguém (ex: "Perfeito, te ligo nesse horário então!"). Isso encerra o
  atendimento automático - marque "horario_confirmado": true.
- Se a pessoa pedir algo que as regras acima não cobrem, pedir pra falar com alguém, ou entrar em
  qualquer assunto que você não tem como resolver por mensagem, marque "encaminhar_humano": true.
- Se a pessoa claramente encerrar a conversa sem marcar nada - agradecendo, se despedindo, dizendo
  que vai pensar, ou dando qualquer sinal de que não quer continuar agora - NÃO insista tentando
  marcar horário de novo. Responda algo breve e cordial de despedida e marque
  "encaminhar_humano": true (motivo: "encerrou sem agendar").
- Nunca marque "horario_confirmado" e "encaminhar_humano" como true ao mesmo tempo - é sempre um
  ou outro, ou nenhum dos dois (segue a conversa normal).
- Em qualquer caso, sempre responda algo educado antes (nunca deixe a pessoa sem resposta) - só não
  avance nem confirme algo que precisa de você ao vivo pra ser resolvido de verdade.
- Fora dessas situações, converse normalmente: mensagens curtas (1-3 linhas, alternando entre mais
  curta e um pouco mais longa a cada troca), sempre puxando para marcar o horário.

Responda SOMENTE com um JSON válido, neste formato exato, sem nenhum texto antes ou depois:
{"resposta": "texto da mensagem para a pessoa (sempre preenchido)", "encaminhar_humano": true ou false, "horario_confirmado": true ou false, "motivo": "breve motivo, só se encaminhar_humano for true", "resumo_para_consultor": "1 linha de contexto (ex: horário confirmado, dúvida pendente), se encaminhar_humano OU horario_confirmado forem true"}`;

  const userPrompt = `Pessoa: ${leadNome || 'sem nome informado'}
Histórico da conversa (mais antiga primeiro):
${historicoConversa.slice(-20).map((m) => `${m.de === 'lead' ? 'Cliente' : nomeConsultor}: ${m.texto}`).join('\n')}`;

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

    // A regra e a IA sempre deixar uma resposta, mesmo quando vai
    // encaminhar ou encerrar. Se por algum motivo o JSON vier valido mas
    // sem texto de resposta, trata como formato inesperado - melhor
    // encaminhar por seguranca do que deixar a pessoa sem nenhuma mensagem.
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

module.exports = { responderConversa, descreverImagem };
