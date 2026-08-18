const express = require('express');
const { exportarTudo, importarTudo, getPausado, setPausado } = require('../db/store');

const router = express.Router();
router.use(express.json({ limit: '10mb' }));

// Botao de emergencia: liga/desliga TODOS os envios automaticos na hora.
router.get('/pausa', (req, res) => {
  res.json({ pausado: getPausado() });
});

router.post('/pausa', (req, res) => {
  res.json({ pausado: setPausado(req.body?.pausado) });
});

// Baixa TUDO (leads, conversas, exemplos, configuracoes) num arquivo JSON.
// Se o Volume do Railway se perder, esse arquivo devolve o sistema ao
// estado exato de quando foi baixado.
router.get('/backup', (req, res) => {
  const dados = exportarTudo();
  const data = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="backup-${data}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(dados, null, 2));
});

// Restaura a partir de um arquivo baixado antes. Substitui TUDO que
// estiver salvo - por isso o site pede confirmacao antes de chamar.
router.post('/backup/restaurar', (req, res) => {
  const dados = req.body?.dados;
  if (!dados || typeof dados !== 'object' || !dados.leads) {
    return res.status(400).json({ erro: 'arquivo de backup inválido' });
  }
  importarTudo(dados);
  res.json({ ok: true, leads: Object.keys(dados.leads).length });
});

module.exports = router;
