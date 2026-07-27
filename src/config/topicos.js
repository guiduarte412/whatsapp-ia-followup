// Liste aqui, por segmento, uma frase bem básica pra IA situar o lead sobre
// qual produto ele pediu - nada de detalhe de valor, prazo ou condição, isso
// é sempre explicado na ligação/reunião, nunca por mensagem. Pode editar
// direto pelo GitHub, o Railway atualiza sozinho.
//
// Exemplo de como preencher (apague o // pra ativar):
// agro: [
//   'Consórcio de crédito rural, pra quem precisa de capital pra propriedade',
// ],

const TOPICOS = {
  agro: ['Crédito rural, para quem precisa de capital para a propriedade'],
  imoveis: [],
  caminhoes: [],
  credito_empresarial: [],
  // usado quando o produto não é reconhecido nas categorias acima
  geral: [],
};

function buscarTopicos(produto) {
  const chave = (produto || '').toLowerCase();
  if (chave.includes('agro') || chave.includes('rural')) return TOPICOS.agro;
  if (chave.includes('imov') || chave.includes('imóv')) return TOPICOS.imoveis;
  if (chave.includes('caminh') || chave.includes('frota') || chave.includes('veic')) {
    return TOPICOS.caminhoes;
  }
  if (chave.includes('credit') || chave.includes('crédit') || chave.includes('empresa')) {
    return TOPICOS.credito_empresarial;
  }
  return TOPICOS.geral;
}

module.exports = { TOPICOS, buscarTopicos };
