# Proposta: IA de atendimento para consórcio rural

Rascunho de 08/11/2026. **Nada desta proposta altera o bot em produção.** Nenhum código de runtime foi alterado nesta etapa.

**Para responder às perguntas e revisar decisões pendentes, abra [`PERGUNTAS-PARA-GUILHERME.md`](PERGUNTAS-PARA-GUILHERME.md).** Já registramos que os leads são frios e que a janela desejada é 07:00–20:30; ainda falta comprovar autorização de contato e decidir os dias/fuso. O sistema atual não representa 20:30 sem alteração no código.

## 1. Onde fica cada coisa hoje

| Assunto | Onde | Observação |
|---|---|---|
| Prompt da IA | `src/services/claude.js`: `responderConversa` (225-382), `blocoIdentidade` (17-44), `blocoLinhasDoProduto` (60-80), `blocoRegras` (84-91), `blocoRegrasDuras` (105-123) | Modelo: `CLAUDE_MODEL`, padrão `claude-haiku-4-5-20251001` (linha 4) |
| Regras e identidade editáveis | Tela de Configurações → `db.json > config` (`src/routes/config-api.js`, `src/db/store.js`) | Lista de regras pode ficar vazia |
| Qualificação | Pedida no prompt (`claude.js:235-241`); normalizada em `normalizarQualificacao` (391-409); mesclada e formatada no webhook (`mesclarQualificacao`, `textoQualificacao`); gravada em `lead.qualificacao` | Campos: bem, prazo, aceitaIncerteza. **Não volta para o prompt** |
| Envio inicial | `src/services/scheduler.js` (`rodarCiclo` a cada 15 min, `processarLead`); texto das Configurações (`store.montarMensagemDeAbertura`, em rodízio); envio com opções 1/2 (`whatsapp.enviarMensagemComOpcoes`) | Janela 7–21h, todos os dias, fuso fixo de Brasília |
| Controle de respostas automáticas | `src/routes/whatsapp-webhook.js`: teto `maxRespostasAutomaticas` (5), debounce de 12 s, reconferência de status/pausa/bloqueio (conserto de 08/11) | |
| Banco de leads | `src/db/store.js` → `db.json` no Volume do Railway (`RAILWAY_VOLUME_MOUNT_PATH`) | Sem campo de autorização, origem ou fuso |
| Avisos para o Guilherme | `src/services/whatsapp.js`: `avisarConsultor` (128) e `formatarAvisoLead` (136) → `CONSULTOR_WHATSAPP` ou `avisarNumero` do número | Chamados no webhook e no agendador |
| Opt-out | `src/services/optout.js` (texto), `escolhaDoLead` (opção 1), `store.bloquearNumero` | Bloqueio grudado no número |

## 2. Quatro camadas que não podem se misturar

1. **Fatos estáveis do projeto** → `CLAUDE.md`. Serve ao Claude Code.
2. **Procedimentos do Claude Code** → `.claude/skills/`:
   - `pesquisa-consorcio-rural`
   - `conversa-consultiva-whatsapp`
   - `analise-atendimentos`

   Skills **ajudam o assistente de programação**. Elas **não mudam** o que o bot fala.
3. **Conhecimento comercial aprovado** → precisa ser **conectado ao runtime** (código Node.js). Proposta: `docs/ia-produto/conhecimento/aprovado/`, carregado pelo `claude.js`. Hoje está vazio; o que o bot usa está hardcoded em `claude.js` e nas Configurações.
4. **Memória de cada lead** → `db.json`, isolada pela chave do telefone, mínima. Veja `MEMORIA.md`.

## 3. Documentos desta proposta

| Arquivo | Conteúdo |
|---|---|
| `REGRAS-DA-IA.md` | O que pode responder, quando dizer "não sei", quando encaminhar, afirmações proibidas, selo de situação de cada regra |
| `MEMORIA.md` | Memória por lead, dados necessários, isolamento, versão da base, retenção, fluxo de revisão |
| `HORARIOS-E-CADENCIA.md` | Bloqueio por falta de autorização, parâmetros atuais e propostos, meta de 15 s, estudos e hipóteses |
| `FONTES.md` | Registro de fontes com data e grau de verificação |
| `ROTINA-PESQUISA-DIARIA.md` | Proposta de rotina que só gera relatório (não ativada) |
| `conhecimento/`, `rascunhos/` | Estrutura para base aprovada (vazia) e rascunhos |

## 4. Conflitos entre o runtime atual e as regras pedidas

1. **A IA se passa pelo Guilherme** (`claude.js:22-24`, `:283-284`). Só admite automação se perguntarem.
2. **Afirmação comercial sem documento:** "As parcelas acompanham o ciclo da safra" (`claude.js:68-69`).
3. **Linhas de produto sem documento**, incluindo "Capital de giro" (`claude.js:61-66`).
4. **Envio sem autorização comprovável.** Não há campo de opt-in. **Bloqueio para envio inicial.**
5. **Horário:** 7–21h, todos os dias, sem feriado, fuso de Brasília para todos (inclusive MT/MS, que ficam em UTC−4).
6. **Debounce de 12 s,** em parte justificado por "não parecer robô"; incompatível com a meta de 15 s.
7. **Payload bruto do lead no log** do Railway (`whatsapp-webhook.js`).
8. **Integração não oficial (Z-API).** A FAQ do WhatsApp diz que mensagens automáticas ou em massa e apps não oficiais violam os Termos (`FONTES.md`, W-03 e W-04).

## 5. O que precisa ser conectado ao runtime (ordem sugerida)

Nada disso foi feito. Cada item exige aprovação, teste e commit.

1. **Autorização de contato:** campo no lead, colunas na importação, caixa no cadastro manual, trava em `scheduler.processarLead`, migração dos leads atuais para `aguardando_autorizacao`, testes. Veja `HORARIOS-E-CADENCIA.md`, seção 0.
2. **Identidade transparente:**
   - `blocoIdentidade` e o item "QUEM É VOCÊ?" em `claude.js`;
   - mensagens de abertura nas Configurações;
   - testes em `prompt.js` e `conversa.js`.
3. **Tirar do prompt o que não tem documento:** frase das parcelas e linhas não confirmadas.
4. **Novas proibições** em `blocoRegrasDuras`: dados sensíveis, urgência e escassez, garantia de lance ou aprovação, uso de estatística do setor.
5. **Memória:** qualificação de volta ao prompt; resumo opcional; proteção da variante do 9º dígito na importação.
6. **Base aprovada versionada** carregada no prompt, com `versaoBase` gravada por resposta.
7. **Cadência:** janelas, dias úteis, feriados, fuso por lead (`scheduler.js`, `store.js`, tela de Configurações).
8. **Debounce:** só a variável `SEGUNDOS_PARA_JUNTAR_MENSAGENS` no Railway, para teste H3. Não precisa de código.
9. **Log** sem payload bruto.
10. **Métricas:** `bracoExperimento`, `resultadoPosAtendimento` (registro manual no painel), relatório de latência.

## 6. Perguntas comerciais (responder antes de ativar qualquer mudança)

**Autorização e dados**
1. Os leads que você importa autorizaram receber mensagem da sua empresa? Como (formulário, evento, cliente antigo, indicação)? Existe comprovante?
2. A base legal é consentimento ou legítimo interesse? (Vale confirmar com orientação jurídica.)
3. Quais dados você quer que a IA pergunte (atividade, município/UF, período para ligação)? Existe algum processo seguro para receber documento, ou a regra é "nunca pelo WhatsApp"?
4. Quais prazos de retenção para conversas de quem não respondeu, de quem não teve interesse e de clientes?

**Empresa e produto**

5. A FourAgro é a administradora, representante autorizado ou corretora? Qual é a administradora dos grupos? Ela é autorizada pelo Banco Central?
6. Você pode colocar no projeto os documentos atuais (regulamento, contrato de adesão modelo, tabela), sem dados de clientes?
7. As cinco linhas do prompt (máquinas, construção e benfeitoria, fazenda, veículos e caminhões, capital de giro) são oferecidas de fato? Qual documento confirma cada uma?
8. Existe plano com parcela que acompanha a safra? Se não há documento, posso tirar essa frase do prompt?

**Identidade e canal**

9. Aprova a apresentação como "assistente virtual do Guilherme"? Com ou sem nome próprio?
10. Você está ciente de que a Z-API não é oficial e de que os Termos do WhatsApp proíbem automação nesse tipo de conexão? Quer avaliar a migração para a plataforma oficial (WhatsApp Business Platform)?

**Horário e cadência**

11. Aprova 9–11h e 14–17h, dias úteis, no horário local do lead, como ponto de partida para teste?
12. Quais feriados regionais considerar? A IA deve responder mensagens recebidas à noite ou de madrugada, ou só avisar você?
13. Aceita testar o debounce de 6 s?
14. Vai registrar no painel o resultado depois do encaminhamento (ligou, proposta, venda)? Sem isso não dá para medir qual horário gera negócio.

**Rotina e memória**

15. Ativar a rotina diária local (opção A) nos dias úteis às 7h?
16. Resumo por lead gerado por IA (custo extra por conversa longa) ou só a qualificação estruturada?
