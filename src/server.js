require('dotenv').config();
const path = require('path');
const express = require('express');
const whatsappWebhook = require('./routes/whatsapp-webhook');
const leadsApi = require('./routes/leads-api');
const testeApi = require('./routes/teste-api');
const acessoApi = require('./routes/acesso-api');
const configApi = require('./routes/config-api');
const backupApi = require('./routes/backup-api');
const { exigirSessao } = require('./services/sessao');
const scheduler = require('./services/scheduler');

// No Node atual, uma promise rejeitada sem catch derruba o processo inteiro.
// Num sistema que fica de pe recebendo webhooks, isso significa parar de
// atender todos os leads por causa de uma falha pontual (Z-API fora do ar,
// timeout da IA). Registra e segue - o Railway reinicia se for algo fatal
// de verdade.
process.on('unhandledRejection', (motivo) => {
  console.error('Promise rejeitada sem tratamento:', motivo instanceof Error ? motivo.message : motivo);
});
process.on('uncaughtException', (erro) => {
  console.error('Erro nao tratado:', erro.message);
});

const app = express();
// Railway roda atras de UM proxy - sem isso o IP real nao chega. O numero
// importa: com "true" o Express confia na cadeia inteira e passa a aceitar
// o primeiro IP do X-Forwarded-For, que quem chama escreve como quiser -
// era assim que dava pra furar o bloqueio de tentativas do codigo de acesso.
app.set('trust proxy', 1);

// O webhook da Z-API vem de fora e nao tem como mandar token - fica fora
// da protecao de sessao, de proposito.
app.use('/webhooks', whatsappWebhook);

// Rota de acesso e publica (e ela quem valida o codigo e cria a sessao).
app.use('/api', acessoApi);

// Todo o resto exige uma sessao valida - sem isso, qualquer um com a URL
// do site conseguiria baixar a lista de leads sem digitar codigo nenhum.
app.use('/api', exigirSessao, leadsApi);
app.use('/api', exigirSessao, testeApi);
app.use('/api', exigirSessao, configApi);
app.use('/api', exigirSessao, backupApi);

// Site simples pra adicionar leads manualmente e ver o andamento -
// arquivos em /public, sem build step, só HTML/CSS/JS puro.
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  scheduler.iniciar();
});
