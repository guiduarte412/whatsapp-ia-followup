# Status — Claude Code

Atualizado em 08/11/2026. Nada foi commitado nem enviado (sem commit, sem push).

---

# Etapa 2: proposta de IA para consórcio rural (documentos e skills)

## O que foi feito

- Mapeei onde ficam o prompt, a qualificação, o envio inicial, o controle de respostas, o banco e os avisos (`docs/ia-produto/README.md`, seção 1).
- **Confirmei que o lead não tem campo de autorização (opt-in), nem de origem, nem de fuso.** A importação lê só nome e telefone. Isso ficou registrado como **bloqueio para o envio inicial**, com a mudança de código proposta (não implementada) em `docs/ia-produto/HORARIOS-E-CADENCIA.md`, seção 0.
- Pesquisei fontes primárias e registrei data e grau de verificação de cada uma: Lei 11.795/2008, normas do BCB, política do WhatsApp Business, FAQ do WhatsApp, LGPD e estudos de velocidade de resposta.
- Criei 3 skills do Claude Code, 6 documentos de produto e o `CLAUDE.md`, separando as quatro camadas:
  - fatos do projeto;
  - procedimentos do Claude Code;
  - conhecimento comercial do runtime;
  - memória por lead.
- Identifiquei 8 conflitos entre o runtime atual e as regras pedidas. Os principais:
  - a IA se passa pelo Guilherme;
  - "parcelas acompanham o ciclo da safra" e "capital de giro" aparecem sem documento;
  - horário de 7 a 21h todos os dias, com fuso fixo de Brasília;
  - debounce de 12 s, incompatível com a meta de 15 s;
  - payload bruto do lead gravado no log.

## Arquivos criados

| Arquivo | Para quem |
|---|---|
| `CLAUDE.md` | Claude Code |
| `.claude/skills/pesquisa-consorcio-rural/SKILL.md` | Claude Code |
| `.claude/skills/conversa-consultiva-whatsapp/SKILL.md` | Claude Code |
| `.claude/skills/analise-atendimentos/SKILL.md` | Claude Code |
| `docs/ia-produto/README.md` | Proposta geral: mapa, camadas, conflitos, o que conectar, perguntas |
| `docs/ia-produto/REGRAS-DA-IA.md` | Especificação do comportamento da IA, com selo por regra |
| `docs/ia-produto/MEMORIA.md` | Memória por lead, base versionada, retenção, revisão |
| `docs/ia-produto/HORARIOS-E-CADENCIA.md` | Bloqueio de opt-in, parâmetros, estudos, hipóteses |
| `docs/ia-produto/FONTES.md` | Registro de fontes |
| `docs/ia-produto/ROTINA-PESQUISA-DIARIA.md` | Rotina proposta, **não ativada** |
| `docs/ia-produto/conhecimento/README.md` | Base aprovada (vazia) |
| `docs/ia-produto/rascunhos/README.md` | Pasta de rascunhos |

**Nenhum arquivo de runtime foi alterado nesta etapa.** `src/`, `public/`, `package.json` e testes estão como ficaram na etapa 1.

## Validação executada

| Verificação | Resultado |
|---|---|
| Frontmatter das 3 skills (`name` igual à pasta, `description` presente) | OK; as 3 aparecem na lista de skills do Claude Code |
| Caminhos de arquivo citados nos documentos | Todos existem, exceto os 3 rascunhos datados, que só serão criados quando a pesquisa ou a análise rodar |
| Referências arquivo:linha (23 conferidas) | 21 OK. 2 estavam uma linha antes da posição real em `HORARIOS-E-CADENCIA.md` (webhook 22 → 23, 18-21 → 19-22) e foram **corrigidas**. Uma divergência no `claude.js` era falso alarme do script de conferência; a faixa citada (248-254) está certa |
| Segredos e telefones nos documentos | Nenhum segredo; nenhum telefone fora do padrão sintético `55479000xxxx` |
| Ausência de campo de autorização/opt-in no código | Confirmada (busca em `src/` e `public/app.js`) |
| Runtime inalterado nesta etapa | `git diff --stat` igual ao fim da etapa 1 (3 arquivos, +177/−12) |
| `node --check` em `src/` | OK |
| `npm test` (offline) | unidade 105/105, acesso 46/46, prompt 65/65, webhook 87/87, debounce OK, riscos 22/22; exit 0 |
| `testes/conversa.js` (Claude real) | Não executado (custo) |

## Pendências, dúvidas e riscos

- 16 perguntas comerciais em `docs/ia-produto/README.md`, seção 6. As que bloqueiam são: autorização dos leads; papel da FourAgro e qual é a administradora; documentos comerciais; aprovação da apresentação transparente; risco da Z-API não oficial.
- Fontes ainda não conferidas no original:
  - texto consolidado da Resolução BCB 285/2023 e a vigência (há conflito 362 × 216 em fonte secundária);
  - números do Panorama BCB 2024;
  - CDC, arts. 37 e 39;
  - guia da ANPD sobre legítimo interesse;
  - números do estudo da HBR (2011).
- Os estudos de velocidade de resposta não são de WhatsApp nem de consórcio agrícola. A meta de 15 s é técnica, e os horários são hipóteses.

## Próximo passo recomendado

Responder as perguntas 1, 5, 6, 9 e 10 do README. Com elas, implementar primeiro, em etapa separada e com testes:
1. a trava de autorização;
2. a identidade transparente;
3. a retirada das afirmações sem documento.

---

# Etapa 1: revisão e conserto da suíte de testes

## O que foi feito

1. **Revisão crítica da suíte de testes.** Li os testes e o código de produção que eles alcançam. Rodei a suíte numa cópia isolada, sem `.env` e só com serviços falsos locais. Fiz testes de mutação e sondas para ver o que cada asserção prova de verdade.
2. **Novo arquivo de testes `testes/riscos.js`** (22 asserções). Ele cobre os cinco riscos de maior impacto que a suíte não cobria. Na primeira execução, contra o código antigo, passaram 8 de 22, com o mesmo resultado em três execuções seguidas.
3. **Consertos no código** para os defeitos que esses testes expuseram:
   - **Webhook reconfere o lead antes de responder.** Depois do debounce, e de novo depois da resposta da Claude, ele confere se a conversa foi encerrada, se o sistema foi pausado ou se o número foi bloqueado. Antes, a IA respondia mesmo assim e gravava `conversa_ia` por cima de `encerrado`.
   - **Claude fora do ar deixa de ser silêncio.** O lead passa para `human_handoff` (motivo `falha_da_ia`) e o consultor recebe um aviso. Antes, o erro só ia para o log e a retentativa da Z-API era descartada pela trava de evento repetido.
   - **Trava de evento repetido em duas camadas:**
     - em memória, como já era, agora também para evento sem `messageId`, usando uma impressão digital do payload com janela de 2 min;
     - gravada no lead (`eventosRecebidos`, os últimos 100 IDs), que sobrevive a deploy ou reinício e não expira em 10 min.
   - **Ciclo de envio relê o lead na hora de mandar.** Antes, ele trabalhava com a foto da fila tirada no início do ciclo e mandava a abertura para quem já tinha respondido, gravando `aguardando_resposta` por cima do status novo.
   - **Pausa e horário reconferidos depois da espera entre envios.** Apertar "Pausar" durante os 60 a 180s de intervalo deixava sair mais uma mensagem.
4. **`testes/riscos.js` incluído no `npm test`.**

## Arquivos criados ou alterados

| Arquivo | Situação |
|---|---|
| `src/routes/whatsapp-webhook.js` | Alterado: reconferência antes de responder, tratamento de falha da IA, trava em duas camadas. Por cima do conserto anterior, que também não estava commitado |
| `src/services/scheduler.js` | Alterado: relê o lead antes do envio, não sobrescreve status de quem respondeu, reconfere a pausa depois da espera |
| `testes/riscos.js` | Criado |
| `package.json` | Alterado: `riscos.js` adicionado ao script `teste`. Os scripts que já estavam pendentes foram mantidos |
| `docs/STATUS-CLAUDE-CODE.md` | Criado (este arquivo) |

Os outros quatro testes novos (`acesso.js`, `prompt.js`, `unidade.js`, `webhook.js`) não foram modificados e continuam sem commit.

## Testes executados e resultados

Todos rodaram localmente: Z-API e Claude falsas, só 127.0.0.1, banco temporário, variáveis de ambiente sensíveis removidas antes de rodar.

| Arquivo | Resultado |
|---|---|
| `testes/unidade.js` | 105/105 |
| `testes/acesso.js` | 46/46 |
| `testes/prompt.js` | 65/65 |
| `testes/webhook.js` | 87/87 |
| `testes/debounce.js` | tudo passou (9 asserções) |
| `testes/riscos.js` | 22/22 em 3 execuções seguidas (antes dos consertos: 8/22) |
| `npm test` (os seis juntos) | exit 0 |

**Não executado:** `testes/conversa.js` (`npm run teste:conversa`), porque chama a Claude de verdade e tem custo.

## Pendências, dúvidas e riscos

- **Entrega real não é testada.** A Z-API falsa sempre responde 200, e os `DeliveryCallback` são ignorados. Uma mensagem aceita pela Z-API e não entregue continua invisível.
- **O fallback `payload.id` da trava não foi conferido** contra um payload real. Se esse campo não for único por mensagem, mensagens legítimas seriam descartadas. Confirmar nos logs do Railway.
- **Evento sem `messageId`:** dois payloads idênticos byte a byte em menos de 2 min contam como reenvio. É improvável em mensagens reais, mas é uma decisão de design que vale confirmar.
- **Várias instâncias:** a trava em memória vale só dentro do processo. A trava gravada no lead depende de um único `db.json`.
- **Ainda há uma janela mínima** entre a última reconferência e o envio (a duração de uma chamada HTTP), em que uma mudança no painel não é vista.
- **`motivoEncerramento: 'falha_da_ia'` é um valor novo.** O painel o mostra como encerramento genérico. Conferir se é assim que você quer ver.
- **Asserções fracas que continuam na suíte antiga** (apontadas na revisão, não alteradas):
  - `testes/unidade.js:110`: o rótulo não bate com o que é verificado;
  - `testes/prompt.js:124-126` e `:214-217`: provam menos do que dizem;
  - `testes/acesso.js`: monta as rotas na mão em vez de usar o `server.js`, então o teste do X-Forwarded-For não reflete o `trust proxy` de produção;
  - `testes/webhook.js:200`: passava mesmo sem a trava.
- **Os testes antigos ainda usam números com formato real.** Trocar por sintéticos (`55479000xxxx`).
- **Sem segredo no webhook** (`ZAPI_WEBHOOK_SEGREDO`), qualquer pessoa com a URL injeta eventos e faz o servidor baixar a URL de imagem que quiser.
- **Autorização para contato:** o sistema garante o bloqueio de quem pediu para sair, mas não registra consentimento de quem é importado.

## Próximo passo recomendado

Revisar o diff de `src/routes/whatsapp-webhook.js` e `src/services/scheduler.js` e, se aprovado, commitar junto com os testes novos. Depois, num commit separado:

1. corrigir as asserções fracas listadas acima;
2. trocar os números de formato real por sintéticos;
3. conferir um payload real da Z-API (campos `messageId`/`id`, `imageUrl`, `stickerUrl`) nos logs do Railway.

PRONTO PARA REVISÃO NO CODEX
