require('dotenv').config();
const express = require('express');
const rdstationWebhook = require('./routes/rdstation-webhook');
const whatsappWebhook = require('./routes/whatsapp-webhook');
const scheduler = require('./services/scheduler');

const app = express();

app.use('/webhooks', rdstationWebhook);
app.use('/webhooks', whatsappWebhook);

app.get('/', (req, res) => {
  res.send('Servico de follow-up de leads via WhatsApp rodando.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  scheduler.iniciar();
});
