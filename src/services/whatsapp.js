const axios = require('axios');

// Endpoint segue o padrao atual da Z-API (instancia + token na URL,
// Client-Token no header). CONFIRA na documentacao da Z-API antes de usar,
// provedores desse tipo mudam o formato do endpoint com alguma frequencia:
// https://developer.z-api.io

// Uma "conexao" e um dos numeros cadastrados em Configuracoes > WhatsApps.
// Quando nenhum foi cadastrado (conexao nula), cai nas variaveis de
// ambiente - e o modo de quem so tem um numero, que continua funcionando
// sem precisar cadastrar nada.
function credenciais(conexao) {
  if (conexao && conexao.instanceId && conexao.token) {
    return {
      instanceId: conexao.instanceId,
      token: conexao.token,
      clientToken: conexao.clientToken,
    };
  }
  return {
    instanceId: process.env.ZAPI_INSTANCE_ID,
    token: process.env.ZAPI_TOKEN,
    clientToken: process.env.ZAPI_CLIENT_TOKEN,
  };
}

async function enviarMensagem(telefone, mensagem, conexao) {
  const { instanceId, token, clientToken } = credenciais(conexao);
  try {
    return await axios.post(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      { phone: telefone, message: mensagem },
      { headers: { 'Client-Token': clientToken } }
    );
  } catch (erro) {
    // A mensagem padrao do axios ("Request failed with status code 400")
    // nao diz o motivo. O corpo da resposta da Z-API costuma ter o motivo
    // de verdade (numero invalido, instancia desconectada, etc).
    const detalhe = erro.response?.data ? JSON.stringify(erro.response.data) : erro.message;
    // Com varios numeros, saber qual deles falhou e a primeira coisa que
    // voce precisa - por isso o apelido entra na mensagem de erro.
    const qual = conexao && conexao.apelido ? ` (${conexao.apelido})` : '';
    throw new Error(`Z-API${qual}: ${detalhe}`);
  }
}

// Aviso interno. Vai pro numero de quem cuida daquela conexao, se ele foi
// informado no cadastro; senao pro CONSULTOR_WHATSAPP das variaveis de
// ambiente. Sai pela propria conexao envolvida, entao com varios numeros os
// avisos nao se concentram num so.
async function avisarConsultor(texto, conexao) {
  const numero = (conexao && conexao.avisarNumero) || process.env.CONSULTOR_WHATSAPP;
  if (!numero) return;
  return enviarMensagem(numero, texto, conexao);
}

// Formato padrao dos avisos que envolvem um lead - sempre com nome, numero
// e horario, pra voce nao precisar abrir o painel pra saber quem e/quando.
function formatarAvisoLead({ nome, telefone, contexto }) {
  // Sem "timeZone" explicito, isso pegaria o horario do servidor (UTC no
  // Railway), 3h adiantado do horario de Brasilia - mesmo problema
  // corrigido no agendador.
  const horario = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Lead: ${nome || 'sem nome'}\nNúmero: ${telefone}\nHorário: ${horario}\n\n${contexto}`;
}

module.exports = { enviarMensagem, avisarConsultor, formatarAvisoLead };
