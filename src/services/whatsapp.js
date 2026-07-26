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
  return axios.post(
    `${baseUrl()}/send-text`,
    { phone: telefone, message: mensagem },
    { headers: { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } }
  );
}

// Aviso interno pro consultor (usa o mesmo canal, mandando pro proprio numero dele)
async function avisarConsultor(texto) {
  const numero = process.env.CONSULTOR_WHATSAPP;
  if (!numero) return;
  return enviarMensagem(numero, texto);
}

module.exports = { enviarMensagem, avisarConsultor };
