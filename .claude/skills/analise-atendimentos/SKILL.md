---
name: analise-atendimentos
description: Analisa conversas e resultados de atendimento da esteira de WhatsApp a partir de dados ANONIMIZADOS, para encontrar problemas e recomendar melhorias com evidência, prioridade e forma de medir. Use quando o Guilherme pedir para entender por que leads somem, avaliar o efeito de uma mudança de horário ou de prompt, ou revisar a qualidade das respostas da IA.
---

# Análise de atendimentos

Esta skill é para o **Claude Code** analisar. Ela não muda o runtime. As recomendações saem como rascunho, e cada mudança segue o fluxo de `docs/ia-produto/MEMORIA.md` (revisão do Guilherme, depois implementação com teste).

## Antes de começar: dados

1. **Nunca use o `db.json` de produção direto**, nem o backup bruto, nem log do Railway. Esses arquivos têm nome, telefone e conversa real.
2. Trabalhe só com uma exportação anonimizada, guardada **fora do repositório** (por exemplo `C:\Users\<voce>\analises\`). Nada de dado de lead em commit.
3. Anonimização mínima, antes de qualquer leitura:
   - telefone → hash curto e estável (`L-3f9a`); nunca o número;
   - nome → removido (`Lead`);
   - números dentro de mensagens com cara de CPF, conta, cartão, CEP ou telefone → `[NUMERO]`;
   - e-mail e endereço → `[REMOVIDO]`;
   - datas absolutas podem ficar (são necessárias para analisar horário); se não forem necessárias, converta para relativas.
4. Ainda não existe script de anonimização no projeto. A proposta é `scripts/anonimizar-export.js`, que lê um backup local e escreve o arquivo anonimizado. Criar só com pedido do Guilherme.
5. Se encontrar dado sensível que escapou da anonimização, pare. Avise e não reproduza o trecho.

## O que o banco permite medir hoje

Campos por lead (`src/db/store.js`): `status`, `motivoEncerramento`, `attemptsSent`, `enviosEm` (quando cada mensagem da esteira saiu), `conversa[]` (com `de`, `texto` e `timestamp` por mensagem), `respostasAutomaticas`, `qualificacao` (bem, prazo, aceitaIncerteza), `whatsappId`.

| Métrica | Como calcular |
|---|---|
| Taxa de resposta à abertura | leads com ≥1 mensagem `de: 'lead'` ÷ leads com `attemptsSent ≥ 1` |
| Tempo até a 1ª resposta do lead | 1º `timestamp` de lead − 1º item de `enviosEm` |
| Latência da IA | `timestamp` da resposta `de: 'ia'` − `timestamp` da última mensagem do lead antes dela |
| Resposta por hora/dia do envio | agrupar a taxa de resposta pela hora e dia da semana de `enviosEm[0]`, **no fuso do lead** (hoje não registrado; veja HORARIOS-E-CADENCIA.md) |
| Agendamentos | `motivoEncerramento === 'horario_confirmado'` |
| Encaminhamentos e motivo | `status === 'human_handoff'` + `motivoEncerramento` |
| Opt-out | `motivoEncerramento === 'optout'` (e lista de bloqueados) |
| Teto atingido | `motivoEncerramento === 'limite_de_respostas'` |
| Qualidade da qualificação | % de handoffs com `qualificacao.bem` e `prazo` preenchidos |

**Não dá para medir hoje:** autorização de contato, origem do lead, fuso do lead, resultado depois do handoff (ligou? vendeu?), braço de experimento. Registre isso como limitação em toda análise.

## Formato de cada achado

```markdown
### A-001 — <título curto>
- Problema: <o que acontece>
- Evidência: n = <quantos leads/conversas>, <percentual>, período <de–até>; exemplos anonimizados: L-3f9a, L-77c1
- Impacto: risco regulatório/plataforma | perda de lead | experiência | custo
- Prioridade: P1 | P2 | P3  (critério abaixo)
- Recomendação: <mudança concreta, com o arquivo afetado>
- Como medir: <métrica, valor atual, meta, prazo de observação>
- Confiança: alta | média | baixa — <por quê: tamanho da amostra, viés, confusão>
```

**Critério de prioridade:**
- **P1:** contato sem autorização, insistência depois de opt-out, afirmação proibida (prazo, valor, garantia), dado de um lead aparecendo para outro, pedido de dado sensível;
- **P2:** lead perdido por falha do sistema (sem resposta, resposta duplicada, encaminhamento que não chegou);
- **P3:** tom, tamanho, naturalidade, horário.

## Cuidados de método

- **Amostra pequena não prova nada.** Com cerca de 40 contatos por dia, diferenças de poucos pontos entre horários não são distinguíveis em uma semana. Diga o n e evite conclusão forte.
- **Correlação não é causa.** Se os leads da tarde vieram de outra origem, a diferença pode ser da origem.
- **Compare períodos equivalentes:** mesmo dia da semana, mesma época de safra.
- **Não cite trecho de conversa real**, mesmo anonimizado, além do mínimo para ilustrar. Prefira paráfrase.
- **Separe o que é falha da IA do que é falha do sistema.** Use os testes de `testes/riscos.js` como referência dos defeitos de sistema já conhecidos.

## Saída

`docs/ia-produto/rascunhos/analise-AAAA-MM-DD.md`, com:
- período e n;
- limitações;
- achados ordenados por prioridade;
- lista "O que precisa ser registrado no banco para medir melhor".
