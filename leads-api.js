require('dotenv').config();
const path = require('path');
const express = require('express');
const rdstationWebhook = require('./routes/rdstation-webhook');
const whatsappWebhook = require('./routes/whatsapp-webhook');
const leadsApi = require('./routes/leads-api');
const scheduler = require('./services/scheduler');

const app = express();

app.use('/webhooks', rdstationWebhook);
app.use('/webhooks', whatsappWebhook);
app.use('/api', leadsApi);

// Site simples pra adicionar leads manualmente e ver o andamento -
// arquivos em /public, sem build step, só HTML/CSS/JS puro.
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  scheduler.iniciar();
});
