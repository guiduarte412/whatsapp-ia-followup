const crypto = require('crypto');

// Sessoes ativas: token -> quando expira. Ficam so na memoria (somem se o
// servidor reiniciar, o que so obriga a digitar o codigo de novo - nao
// perde nenhum dado).
const sessoes = new Map();
const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000; // 12 horas

// Controle de tentativas erradas por IP, pra impedir que alguem fique
// testando os 1.000.000 de combinacoes de 6 digitos automaticamente.
const tentativas = new Map();
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000; // 15 minutos

function limparExpirados() {
  const agora = Date.now();
  for (const [token, expiraEm] of sessoes) {
    if (expiraEm < agora) sessoes.delete(token);
  }
  for (const [ip, dados] of tentativas) {
    if (dados.bloqueadoAte && dados.bloqueadoAte < agora) tentativas.delete(ip);
  }
}
setInterval(limparExpirados, 60 * 60 * 1000).unref();

// Usa o req.ip do Express, que respeita o "trust proxy" configurado no
// server.js. Ler o X-Forwarded-For cru (como era antes) deixava o bloqueio
// inutil: quem esta testando codigos manda o cabecalho que quiser e vira um
// "IP" novo a cada tentativa, entao as 5 tentativas nunca se esgotavam.
function ipDaRequisicao(req) {
  return req.ip || 'desconhecido';
}

function estaBloqueado(req) {
  const dados = tentativas.get(ipDaRequisicao(req));
  return Boolean(dados?.bloqueadoAte && dados.bloqueadoAte > Date.now());
}

function registrarFalha(req) {
  const ip = ipDaRequisicao(req);
  const dados = tentativas.get(ip) || { contagem: 0 };
  dados.contagem += 1;
  if (dados.contagem >= MAX_TENTATIVAS) {
    dados.bloqueadoAte = Date.now() + BLOQUEIO_MS;
    dados.contagem = 0;
  }
  tentativas.set(ip, dados);
}

function limparFalhas(req) {
  tentativas.delete(ipDaRequisicao(req));
}

function criarSessao() {
  const token = crypto.randomBytes(32).toString('hex');
  sessoes.set(token, Date.now() + DURACAO_SESSAO_MS);
  return token;
}

function sessaoValida(token) {
  if (!token) return false;
  const expiraEm = sessoes.get(token);
  if (!expiraEm) return false;
  if (expiraEm < Date.now()) {
    sessoes.delete(token);
    return false;
  }
  return true;
}

// Middleware que protege as rotas de dados. O webhook da Z-API
// NAO passa por aqui - vem de fora e nao tem como mandar token.
function exigirSessao(req, res, next) {
  const token = req.headers['x-sessao'];
  if (!sessaoValida(token)) {
    return res.status(401).json({ erro: 'sessao invalida ou expirada' });
  }
  next();
}

module.exports = {
  estaBloqueado,
  registrarFalha,
  limparFalhas,
  criarSessao,
  exigirSessao,
  MAX_TENTATIVAS,
};
