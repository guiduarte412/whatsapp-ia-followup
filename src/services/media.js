const axios = require('axios');
const { descreverImagem } = require('./claude');
const { transcreverAudio } = require('./openai');

async function baixarBase64(url) {
  const resposta = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(resposta.data).toString('base64');
}

// Converte qualquer tipo de mensagem recebida (texto, imagem, figurinha,
// audio) num texto que o resto do sistema ja sabe processar - a IA nunca
// precisa saber a diferenca, so recebe um texto descrevendo o que chegou.
//
// Caso especial: se for audio e a OPENAI_API_KEY ainda nao estiver
// configurada, devolve null (em vez de um texto) - e o sinal pro
// whatsapp-webhook.js tratar esse caso separadamente (avisar o consultor
// em vez de deixar a IA "inventar" uma resposta sem saber o que foi dito).
async function extrairTexto(payload) {
  if (payload?.text?.message) return payload.text.message;
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;

  if (payload?.image) {
    try {
      const base64 = await baixarBase64(payload.image.imageUrl);
      const descricao = await descreverImagem({ base64, mimeType: payload.image.mimeType || 'image/jpeg' });
      const legenda = payload.image.caption ? ` Legenda escrita pelo lead: "${payload.image.caption}"` : '';
      return `[Lead enviou uma imagem: ${descricao}]${legenda}`;
    } catch (erro) {
      console.error('Erro ao processar imagem recebida:', erro.message);
      return '[Lead enviou uma imagem - não foi possível analisar automaticamente]';
    }
  }

  if (payload?.sticker) {
    try {
      const base64 = await baixarBase64(payload.sticker.stickerUrl);
      const descricao = await descreverImagem({ base64, mimeType: payload.sticker.mimeType || 'image/webp' });
      return `[Lead enviou uma figurinha: ${descricao}]`;
    } catch (erro) {
      console.error('Erro ao processar figurinha recebida:', erro.message);
      return '[Lead enviou uma figurinha]';
    }
  }

  if (payload?.audio) {
    if (!process.env.OPENAI_API_KEY) return null;
    try {
      const base64 = await baixarBase64(payload.audio.audioUrl);
      return await transcreverAudio(base64, payload.audio.mimeType || 'audio/ogg');
    } catch (erro) {
      console.error('Erro ao transcrever audio recebido:', erro.message);
      return '[Lead enviou um áudio - não foi possível transcrever automaticamente]';
    }
  }

  return '[mensagem sem texto reconhecido - provavelmente vídeo, documento ou contato]';
}

module.exports = { extrairTexto };
