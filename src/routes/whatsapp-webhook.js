const express = require('express');
const { getLeadFlexivel, upsertLead, appendConversa, appendExample } = require('../db/store');
const { avisarConsultor, enviarMensagem, formatarAvisoLead } = require('../services/whatsapp');
const { responderConversa } = require('../services/claude');
const { extrairTexto } = require('../services/media');

const router = express.Router();

// Numero maximo de respostas automaticas seguidas antes de forcar o
// encaminhamento pro humano, mesmo que a IA ache que ainda da pra continuar.
// E uma trava de seguranca: garante que uma conversa real sobre consorcio
// nao fica indefinidamente só com a IA.
const MAX_RESPOSTAS_AUTOMATICAS = Number(process.env.MAX_RESPOSTAS_AUTOMATICAS || 5);

function normalizarTelefone(valor) {
  return (valor || '').toString().replace(/\D/g, '');
}

function normalizarTexto(valor) {
  return (valor || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

// Configure essa URL como "webhook de mensagens recebidas" no painel da Z-API.
// O formato exato do payload pode variar por versao da Z-API - confira a
// documentacao atual e ajuste os campos abaixo se necessario.
router.post('/whatsapp', express.json(), async (req, res) => {
  const payload = req.body;

  // Log do payload cru - se algo nao bater, da pra ver o formato real nos
  // logs do Railway (Deployments -> View Logs) e ajustar os campos abaixo.
  console.log('Webhook WhatsApp recebido:', JSON.stringify(payload));

  const telefoneRecebido = normalizarTelefone(payload?.phone || payload?.from);
  if (!telefoneRecebido) return res.status(400).json({ erro: 'telefone nao encontrado no payload' });

  const lead = getLeadFlexivel(telefoneRecebido);
  if (!lead) {
    console.log(`Nenhum lead encontrado pro telefone ${telefoneRecebido} - mensagem ignorada.`);
    return res.status(200).json({ ok: true }); // mensagem de numero fora do fluxo, ignora
  }

  const telefoneLead = lead.phone;

  // "fromMe: true" quer dizer que a mensagem saiu do proprio numero
  // conectado - tanto faz se foi a IA respondendo automaticamente quanto
  // voce digitando manualmente no seu celular. Melhor esforco pra
  // distinguir: se o texto bate com a ultima mensagem que a propria IA
  // registrou pra esse lead, e so o eco do que ja mandamos - ignora. Se
  // for diferente, e voce escrevendo por fora - encerra o atendimento
  // automatico (voce assumiu). Isso e deteccao por aproximacao; se preferir
  // uma forma garantida, use o botao "Assumir conversa" na pagina do lead.
  // Usa so o texto simples aqui (sem processar midia) - nao vale a pena
  // gastar com leitura de imagem/audio so pra essa comparacao.
  if (payload?.fromMe === true) {
    const textoSimples = payload?.text?.message || payload?.message || '';
    const ultimaDaIA = [...(lead.conversa || [])].reverse().find((m) => m.de === 'ia');
    const ehEcoDaIA = ultimaDaIA && normalizarTexto(ultimaDaIA.texto) === normalizarTexto(textoSimples);

    // So fecha automaticamente quando da pra comparar com uma mensagem da
    // IA conhecida e ela for diferente. Sem essa mensagem de referencia
    // (ultimaDaIA ausente), e mais seguro nao fechar sozinho do que
    // arriscar fechar por engano.
    if (ultimaDaIA && !ehEcoDaIA && ['sequence_active', 'conversa_ia', 'cold_nurture'].includes(lead.status)) {
      appendConversa(telefoneLead, { de: 'ia', texto: textoSimples });
      upsertLead(telefoneLead, { status: 'encerrado', motivoEncerramento: 'assumido_manualmente' });
      console.log(`Lead ${telefoneLead} encerrado - mensagem manual detectada do numero conectado.`);
    }
    return res.status(200).json({ ok: true });
  }

  // Converte o que chegou (texto, imagem, figurinha ou audio) num texto
  // que o resto do sistema ja sabe processar. Protegido por try/catch
  // proprio - um erro aqui nao pode derrubar o processo inteiro.
  let textoRecebido;
  try {
    textoRecebido = await extrairTexto(payload);
  } catch (erro) {
    console.error(`Erro extraindo texto da mensagem do lead ${telefoneLead}:`, erro.message);
    textoRecebido = '[não foi possível processar essa mensagem]';
  }

  // Audio chegou mas ainda nao da pra transcrever (falta configurar a
  // OPENAI_API_KEY no Railway) - avisa direto em vez de deixar a IA
  // "adivinhar" uma resposta sem saber o que foi dito.
  if (textoRecebido === null) {
    try {
      appendConversa(telefoneLead, { de: 'lead', texto: '[áudio recebido - transcrição não configurada ainda]' });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `Lead mandou uma mensagem de voz (${payload?.audio?.seconds || '?'}s), mas a transcrição automática ainda não está configurada (falta OPENAI_API_KEY no Railway). Ouça manualmente pelo WhatsApp por enquanto.`,
      }));
    } catch (erro) {
      // Se ate o aviso falhar (Z-API fora do ar, etc), so loga - nao pode
      // derrubar o processo por causa de uma promise sem catch.
      console.error(`Erro avisando sobre audio nao transcrito do lead ${telefoneLead}:`, erro.message);
    }
    return res.status(200).json({ ok: true });
  }

  try {
    // Se ja esta com humano ou ja foi encerrado, a IA nao interfere mais -
    // so avisa que chegou mensagem nova (exceto se ja encerrado, ai so
    // registra sem incomodar - o atendimento por aqui acabou).
    if (lead.status === 'human_handoff' || lead.status === 'encerrado') {
      appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
      if (lead.status === 'human_handoff') {
        await avisarConsultor(formatarAvisoLead({
          nome: lead.nome,
          telefone: telefoneLead,
          contexto: `Nova mensagem: "${textoRecebido}"`,
        }));
      }
      return res.status(200).json({ ok: true });
    }

    const primeiraResposta = lead.status === 'sequence_active';

    if (primeiraResposta) {
      // Primeira vez que esse lead responde -> registra como exemplo de
      // sucesso (alimenta o "aprendizado" descrito no README) e para a
      // sequencia de follow-up (o agendador so processa status sequence_active).
      // Leads de teste nao entram no aprendizado, pra nao poluir os exemplos
      // reais com conversa fabricada.
      const ultimaMensagem = (lead.mensagensEnviadas || []).slice(-1)[0];
      if (ultimaMensagem && !lead.teste) {
        appendExample({
          mensagem: ultimaMensagem,
          tentativa: lead.attemptsSent,
          responded: true,
          phone: telefoneLead,
        });
      }
    }

    appendConversa(telefoneLead, { de: 'lead', texto: textoRecebido });
    const leadAtualizado = getLeadFlexivel(telefoneLead);
    const respostasAutomaticas = (leadAtualizado.respostasAutomaticas || 0) + 1;

    if (respostasAutomaticas > MAX_RESPOSTAS_AUTOMATICAS) {
      upsertLead(telefoneLead, { status: 'human_handoff' });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `Passou de ${MAX_RESPOSTAS_AUTOMATICAS} respostas automáticas seguidas. Assuma a conversa por aqui.`,
      }));
      return res.status(200).json({ ok: true });
    }

    const resultado = await responderConversa({
      leadNome: leadAtualizado.nome,
      produto: leadAtualizado.produto,
      historicoConversa: leadAtualizado.conversa,
    });

    // Manda a resposta pro lead em qualquer um dos casos - a IA sempre
    // deixa uma mensagem educada antes de encaminhar ou encerrar, nunca
    // some sem responder. Usa telefoneRecebido pra enviar (formato que a
    // Z-API acabou de confirmar).
    if (resultado.resposta) {
      try {
        await enviarMensagem(telefoneRecebido, resultado.resposta);
        appendConversa(telefoneLead, { de: 'ia', texto: resultado.resposta });
      } catch (erroEnvio) {
        // Se nao conseguir mandar a resposta, o lead fica sem retorno - isso
        // e grave o suficiente pra avisar direto, em vez de so registrar log.
        upsertLead(telefoneLead, { status: 'human_handoff', respostasAutomaticas });
        await avisarConsultor(formatarAvisoLead({
          nome: lead.nome,
          telefone: telefoneLead,
          contexto: `A IA tentou responder mas o envio falhou: ${erroEnvio.message}\nAssuma essa conversa manualmente.\nÚltima mensagem do lead: "${textoRecebido}"`,
        })).catch(() => {});
        return res.status(200).json({ ok: true });
      }
    }

    if (resultado.horarioConfirmado) {
      // O proprio consultor (a IA falando por ele) ja aprovou um horario -
      // encerra o atendimento automatico e sai da lista de leads ativos.
      upsertLead(telefoneLead, { status: 'encerrado', motivoEncerramento: 'horario_confirmado', respostasAutomaticas });
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `Horário confirmado com o lead: ${resultado.resumoParaConsultor || resultado.resposta}\nAtendimento automático encerrado - adicione na sua agenda.`,
      }));
    } else if (resultado.encaminharHumano) {
      upsertLead(telefoneLead, { status: 'human_handoff', respostasAutomaticas });
      const contexto = resultado.resumoParaConsultor || resultado.motivo || 'a IA identificou que é hora de assumir';
      await avisarConsultor(formatarAvisoLead({
        nome: lead.nome,
        telefone: telefoneLead,
        contexto: `${contexto}\nÚltima mensagem do lead: "${textoRecebido}"`,
      }));
    } else {
      upsertLead(telefoneLead, { status: 'conversa_ia', respostasAutomaticas });
    }

    res.status(200).json({ ok: true });
  } catch (erro) {
    // Se algo quebrar no meio do processo (Claude API fora do ar, Z-API
    // rejeitando o envio, etc), loga o erro em vez de deixar cair em
    // silencio - senao voce nunca saberia que a conversa travou.
    console.error(`Erro processando resposta do lead ${telefoneLead}:`, erro.message);
    res.status(200).json({ ok: true }); // responde 200 pra Z-API nao ficar reenviando
  }
});

module.exports = router;
