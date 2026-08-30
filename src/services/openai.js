const axios = require('axios');
const FormData = require('form-data');

// Transcreve audio (base64) usando o Whisper da OpenAI. So funciona depois
// que OPENAI_API_KEY estiver configurada no Railway - enquanto isso, quem
// chama essa funcao deve checar process.env.OPENAI_API_KEY antes.
async function transcreverAudio(base64, mimeType) {
  const buffer = Buffer.from(base64, 'base64');
  const extensao = (mimeType || '').includes('ogg') ? 'ogg' : 'mp3';

  const form = new FormData();
  form.append('file', buffer, { filename: `audio.${extensao}` });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  try {
    const resposta = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders(),
      },
      timeout: 60_000, // audio longo demora; sem teto, o webhook fica preso
    });
    return resposta.data.text;
  } catch (erro) {
    const detalhe = erro.response?.data?.error?.message || erro.message;
    throw new Error(`OpenAI Whisper: ${detalhe}`);
  }
}

module.exports = { transcreverAudio };
