# CLAUDE.md

Fatos estáveis do projeto para o Claude Code. **Isto não muda o comportamento do bot.** O bot obedece a `src/services/claude.js` e às Configurações gravadas no `db.json`.

## Projeto

- Micro SaaS pessoal do Guilherme: esteira de follow-up de leads de consórcio rural por WhatsApp.
- Node.js + Express, CommonJS. Hospedado no Railway.
- Banco: arquivo JSON (`src/db/store.js`) em `RAILWAY_VOLUME_MOUNT_PATH/db.json`; localmente, em `data/db.json` (ignorado no git).
- WhatsApp: Z-API, integração **não oficial** (`src/services/whatsapp.js`).
- IA: API da Anthropic via axios (`src/services/claude.js`). Áudio: OpenAI, opcional (`src/services/openai.js`).

## Mapa

| O quê | Onde |
|---|---|
| Prompt e decisão da IA | `src/services/claude.js` (`responderConversa`) |
| Mensagem recebida (debounce, teto, opt-out, encaminhamento) | `src/routes/whatsapp-webhook.js` |
| Envio da esteira (cron a cada 15 min) | `src/services/scheduler.js` |
| Envio, eco e avisos para o Guilherme | `src/services/whatsapp.js` |
| Painel | `public/` (HTML/CSS/JS puro) |
| Regras do produto, memória, horários | `docs/ia-produto/` |
| Status para revisão | `docs/STATUS-CLAUDE-CODE.md` |

## Testes

- `npm test`: offline, com Z-API e Claude falsas, banco temporário. Pode rodar sempre.
- `npm run teste:conversa` (`testes/conversa.js`): **chama a Claude de verdade e tem custo.** Só com autorização explícita.
- Use apenas números sintéticos (`55479000xxxx`) em testes novos.

## Regras de trabalho

- Nunca ler nem mostrar valores do `.env`. Não acessar produção, não enviar mensagem real, não chamar API paga sem autorização.
- Não fazer commit nem push sem pedido explícito.
- Preservar alterações não commitadas de outros trabalhos; conferir `git status` antes e depois.
- Comentários no código em português, sem acento, explicando o **porquê**.
- Proibições de produto ficam no código (`blocoRegrasDuras`), não na tela editável.
- Conteúdo comercial (taxa, parcela, prazo, linha de produto) só com documento da administradora; sem documento, é **PENDENTE**. Nunca inventar.
- Mudança no que a IA fala segue `docs/ia-produto/REGRAS-DA-IA.md`, seção 7.
- Ao concluir uma tarefa: atualizar `docs/STATUS-CLAUDE-CODE.md` (feito, arquivos, testes, pendências, próximo passo) e terminar a resposta com `PRONTO PARA REVISÃO NO CODEX`.
