// Reconhece quando a pessoa esta pedindo pra nao receber mais mensagem.
//
// Isso roda ANTES de chamar a IA, por dois motivos: quem pediu pra parar nao
// deve esperar a IA decidir se para, e nao faz sentido gastar credito pra
// interpretar um "me tira dessa lista".
//
// O criterio aqui e deliberadamente conservador. Errar dizendo "nao houve
// pedido" so adia o bloqueio pro turno seguinte, porque a IA tambem sinaliza
// o pedido em linguagem natural (campo "descadastrar"). Errar pro outro lado
// e pior: bloquear quem escreveu "me tira uma duvida" tira um lead bom da
// esteira e ninguem percebe. Por isso os padroes exigem a frase inteira, e
// nunca uma palavra solta como "para", "cancelar" ou "sair".

// Tira acento e uniformiza espacos, pra "não" e "nao" caírem no mesmo lugar.
function normalizar(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PADROES = [
  // "não quero mais receber", "não quero receber mais mensagens".
  // Exige o "mais" ou um objeto de mensagem: sem essa exigencia, um
  // "nao quero receber uma proposta fora do orcamento" - que e conversa de
  // venda, e das boas - seria lido como pedido pra sair da lista.
  /nao quer[oa] mais receber/,
  /nao quer[oa] receber mais/,
  /nao quer[oa] receber (nada|mensage|msg|isso|nenhuma|esse tipo|nem)/,
  // "pare de me mandar mensagem", "para de mandar mensagem"
  /par[ea] de (me )?(mandar|enviar|encher|perturbar)/,
  /parar? de (me )?(mandar|enviar|receber)/,
  // "não me manda mais", "não me mande mais mensagem"
  /nao (me )?mand[ea] mais/,
  /nao (me )?envie? mais/,
  // Sair da lista - exige o complemento, senao "me tira uma duvida" entraria
  /(me )?(tir[ae]|remov[ae]|retir[ae])[^.!?]{0,20}\b(da|desta|dessa|de sua|da sua) lista/,
  /(sai[ar]?|me tir[ae])[^.!?]{0,15}\bda (sua |tua )?lista/,
  /remov[ae][^.!?]{0,20}\b(meu|esse|este) (numero|contato)/,
  /tir[ae][^.!?]{0,20}\b(meu|esse|este) (numero|contato)\b[^.!?]{0,20}(lista|cadastro|base)?/,
  // Descadastro explicito. "cancelar inscricao/cadastro" ficou de fora de
  // proposito: numa conversa de venda, isso costuma ser sobre um servico
  // ("cancela minha inscricao no curso"), nao sobre parar de receber
  // mensagem. Quando for pedido de saida mesmo, a IA sinaliza.
  /descadastr/,
  /desinscrev/,
  /cancel[ae][^.!?]{0,15}(envio|recebimento|as mensagens|essas mensagens)/,
  // "chega de mensagem", "não quero mais contato"
  /chega de (mensagem|mensagens|msg)/,
  /nao quer[oa] (mais )?(nenhum )?contato/,
  // Bloqueio - exige o pronome antes ou o alvo depois, pra "vou bloquear a
  // agenda das 15h" continuar sendo o que e: alguem marcando reuniao.
  /\bvou (te|lhe) bloquear/,
  /\bbloque(ar|io|ia)[^.!?]{0,15}\b(voce|vc|esse numero|este numero|seu numero|teu numero)/,
  /\bme bloqueia\b/,
  // "STOP" isolado, do jeito que se usa em SMS marketing
  /^(stop|sair|parar)$/,
];

// Pedidos PARCIAIS, que se parecem com os de cima mas nao sao pedido de
// saida - a pessoa esta escolhendo canal, formato ou corrigindo cadastro, e
// segue querendo falar com voce:
//
//   "nao me manda mais audio, prefiro texto"
//   "para de enviar pelo email, manda aqui"
//   "me tira da lista de espera e ja marca logo"
//   "remove meu numero antigo do cadastro e poe esse novo"
//
// Bloquear qualquer uma dessas tiraria um lead BOM da esteira pra sempre, e
// ninguem perceberia. Quando uma delas aparece, a decisao fica com a IA, que
// le a frase inteira em vez de procurar pedaco.
const QUALIFICADORES = [
  // canal ou formato especifico, nao "mensagem" em geral
  /\b(audio|audios|ligacao|ligacoes|email|e-mail|telefonema|video|videos|foto|fotos|print|prints|sms|carta)\b/,
  // "mais de uma por vez" nao e "nao me manda mais"
  /\bmais de (uma|um|dois|duas|tres|\d+)\b/,
  // lista de espera nao e a lista de disparo
  /\blista de espera\b/,
  // correcao de cadastro: trocar um numero pelo outro
  /\b(antigo|antiga)\b/,
  /\b(poe|poem|coloca|cadastra|usa|use)\b[^.!?]{0,15}\b(esse|este|o novo|meu novo)\b/,
  // ja resolveu em outro lugar
  /\b(outro|outra) (sistema|empresa|lista|cadastro|numero)\b/,
  // ressalva que devolve o contato: "mas mensagem pode", "mas a sua eu quero"
  /\b(mas|porem|so que)\b[^.!?]{0,40}\b(pode|quero|prefiro|manda|envia|continua|sim)\b/,
  /\bprefiro\b/,
];

// Devolve true so quando o texto contem um pedido claro e sem ressalva. Na
// duvida, false - a IA ainda sinaliza no turno seguinte, e um bloqueio
// adiado por um turno custa muito menos que um lead bloqueado por engano.
function pediuParaParar(texto) {
  const limpo = normalizar(texto);
  if (!limpo) return false;
  if (!PADROES.some((padrao) => padrao.test(limpo))) return false;
  return !QUALIFICADORES.some((excecao) => excecao.test(limpo));
}

// Resposta unica de confirmacao. Ficar em silencio faria a pessoa achar que
// nao foi lida e repetir o pedido, agora irritada; mandar uma linha curta
// reconhecendo e encerrando e o que se espera de gente educada. Depois
// dessa, nao sai mais nada pra esse numero.
function respostaDeDespedida(nomeDoLead) {
  const primeiroNome = (nomeDoLead || '').trim().split(' ')[0];
  const saudacao = primeiroNome ? `${primeiroNome}, ` : '';
  return `${saudacao}sem problema — não te mando mais nada por aqui. Desculpa o incômodo!`;
}

module.exports = { pediuParaParar, respostaDeDespedida, normalizar };
