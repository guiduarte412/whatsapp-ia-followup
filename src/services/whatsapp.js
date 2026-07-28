const axios = require('axios');

// Endpoint segue o padrao atual da Z-API (instancia + token na URL,
// Client-Token no header). CONFIRA na documentacao da Z-API antes de usar,
// provedores desse tipo mudam o formato do endpoint com alguma frequencia:
// https://developer.z-api.io

function baseUrl() {
  const { ZAPI_INSTANCE_ID, ZAPI_TOKEN } = process.env;
  return `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;
}

async function enviarMensagem(telefone, mensagem) {
  try {
    return await axios.post(
      `${baseUrl()}/send-text`,
      { phone: telefone, message: mensagem },
      { headers: { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } }
    );
  } catch (erro) {
    // A mensagem padrao do axios ("Request failed with status code 400")
    // nao diz o motivo. O corpo da resposta da Z-API costuma ter o motivo
    // de verdade (numero invalido, instancia desconectada, etc).
    const detalhe = erro.response?.data ? JSON.stringify(erro.response.data) : erro.message;
    throw new Error(`Z-API: ${detalhe}`);
  }
}

// Aviso interno pro consultor (usa o mesmo canal, mandando pro proprio numero dele)
async function avisarConsultor(texto) {
  const numero = process.env.CONSULTOR_WHATSAPP;
  if (!numero) return;
  return enviarMensagem(numero, texto);
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
