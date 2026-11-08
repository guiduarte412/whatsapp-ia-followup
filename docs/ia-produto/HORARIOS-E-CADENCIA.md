# Horários e cadência

Versão 0.1, rascunho de 08/11/2026. **Nenhum parâmetro aqui foi alterado no sistema.** Mesmos selos de `REGRAS-DA-IA.md`.

---

## 0. Bloqueio antes de qualquer mudança de horário

### O banco registra o necessário?

Conferido no código em 08/11/2026: `src/db/store.js`, `src/routes/leads-api.js` e a importação de planilha em `public/app.js:514-524`, que lê só `Nome` e `Telefone`/`WhatsApp`.

| Informação | Existe? | Onde |
|---|---|---|
| Autorização para contato (opt-in) | **Não.** Nenhum campo, nem na importação nem no cadastro manual | — |
| Origem do lead | **Não** | — |
| Fuso horário do lead | **Não.** Todo cálculo usa `America/Sao_Paulo` fixo (`scheduler.js:28-32`, `store.js:453-460`) | — |
| Horário de envio | Sim | `lead.enviosEm[]` (`scheduler.js`, `processarLead`) |
| Resposta do lead | Sim | `lead.conversa[]` com `de: 'lead'` e `timestamp` |
| Resultado | Parcial: status e `motivoEncerramento` (agendou, encaminhou, opt-out, teto). **Não há resultado depois do encaminhamento** (ligou? vendeu?) | `lead.status`, `lead.motivoEncerramento` |

### Consequência

**O envio inicial está bloqueado por falta de autorização comprovável.** `[PENDENTE]`

- A política do WhatsApp Business exige permissão (opt-in) do destinatário antes do contato. O opt-in precisa dizer claramente que a pessoa aceita receber mensagens daquela empresa e precisa trazer o nome da empresa (veja `FONTES.md`).
- A LGPD põe sobre o controlador o ônus de provar o consentimento, quando essa for a base legal (art. 8º, §2º).
- Hoje o sistema manda a abertura para todo lead importado. Ele não tem como separar quem autorizou de quem não autorizou.

Até o Guilherme decidir, a recomendação é: **não ativar novas regras de horário e não importar leads sem autorização registrada fora do sistema.**

### Mudança de código proposta (não implementada) `[PROPOSTA]`

1. **Campo no lead:**
   ```json
   "autorizacao": {
     "status": "confirmada | nao_informada | revogada",
     "origem": "formulario_site | evento | indicacao | cliente_existente | outro",
     "descricao": "texto curto: qual formulário, qual evento",
     "quando": "AAAA-MM-DD",
     "registradoEm": "ISO",
     "registradoPor": "importacao | painel"
   },
   "origem": "mesmo valor de autorizacao.origem ou outro",
   "uf": "MT",
   "fusoHorario": "America/Cuiaba"
   ```
2. **Importação:** aceitar as colunas `Autorizacao` (sim/não), `Origem`, `DataAutorizacao` e `UF`. Linha sem `Autorizacao = sim` entra com `status: 'nao_informada'`.
3. **Cadastro manual:** caixa "Tenho autorização desta pessoa para contato por WhatsApp", com origem obrigatória.
4. **Trava no envio:** em `scheduler.processarLead`, se `autorizacao.status !== 'confirmada'`, não envia. O lead fica num status novo, `aguardando_autorizacao`, visível no quadro. A resposta a uma mensagem que o próprio lead mandou continua liberada (foi ele quem iniciou).
5. **Leads já existentes:** migração que marca todo lead `sequence_active` sem autorização como `aguardando_autorizacao`. **Nenhum é enviado automaticamente.**
6. **Revogação:** opt-out (já existente) passa a gravar também `autorizacao.status = 'revogada'`.
7. **Testes:**
   - lead sem autorização não recebe abertura;
   - lead com autorização recebe;
   - importação sem a coluna não autoriza ninguém;
   - opt-out revoga.

## 1. Parâmetros atuais (Configurações > Horários)

| Parâmetro | Valor padrão hoje | Arquivo |
|---|---|---|
| `horarios.inicio` / `fim` | 7 / 21 (horário de Brasília) | `store.js:49-50` |
| Dias da semana | **Todos.** Não há checagem de dia útil nem feriado | `scheduler.js:24-33` |
| `atrasoMinMinutos` / `Max` | 5 / 15 (atraso sorteado entre importar e enviar) | `store.js:51-52` |
| `intervaloMinSegundos` / `Max` | 60 / 180 (pausa entre envios, por número) | `store.js:53-54` |
| `followupHorasMin` / `Max` | 24 / 36 (só se houver mensagens de follow-up) | `store.js:55-56` |
| `limiteDiarioDestinatarios` | 40 pessoas por número por dia | `store.js:66` |
| `maxRespostasAutomaticas` | 5 | `store.js:68` |
| `SEGUNDOS_PARA_JUNTAR_MENSAGENS` (variável de ambiente) | 12 | `whatsapp-webhook.js:23` |
| Ciclo do agendador | a cada 15 min | `scheduler.js`, `iniciar()` |

## 2. Ponto de partida proposto `[PROPOSTA]`

Tudo configurável. Nada disso vale até haver autorização comprovável (seção 0).

| Parâmetro novo/alterado | Proposta | Observação |
|---|---|---|
| `envio.exigirAutorizacao` | `true` | Sem exceção para envio inicial e follow-up |
| `envio.diasPermitidos` | seg a sex | |
| `envio.feriados` | lista `AAAA-MM-DD` | Nacionais; os regionais são `[PENDENTE]` |
| `envio.janelas` | `[{9,11}, {14,17}]` **no horário local do lead** | Substitui `inicio/fim` para envio inicial e follow-up |
| `envio.fusoPadrao` | `America/Sao_Paulo` | Usado só quando o lead não tem `fusoHorario` |
| `fusoHorario` por lead | da coluna UF, ou sugerido pelo DDD e confirmado | MT (DDD 65/66), MS (67), RO (69), RR (95) e quase todo o AM (92/97) ficam em UTC−4; AC (68) em UTC−5. **9h em Brasília = 8h em Cuiabá.** Num público agro isso pesa |
| Atraso, intervalo, teto diário | manter | Servem para proteger o número de rajada, não para "parecer humano" |
| `maxRespostasAutomaticas` | manter 5 | Encaminhamento já avisa o Guilherme |

A resposta a mensagem recebida **não** fica restrita à janela: quem escreve espera resposta. `[PENDENTE]`: o Guilherme decide se quer resposta automática de madrugada ou só um aviso.

## 3. Tempo de resposta a mensagens recebidas

- **Meta técnica inicial** `[PROPOSTA]`: pelo menos 80% das respostas automáticas saem **em até 15 s** depois da última mensagem do lead que elas respondem. Medição com os `timestamp` que já existem em `conversa[]`; é a métrica "latência da IA" da skill `analise-atendimentos`.
- **Hoje essa meta não é atingível.** Só a espera do debounce é de 12 s, e depois vêm a chamada da Claude (alguns segundos, mais 2 s e 4 s se houver retentativa) e o envio pela Z-API.
- **O debounce não é atraso de fachada.** Ele existe para juntar "bom dia" + "quero trocar o trator" + "mas queria ver condição" numa resposta só, e protege o teto de 5 respostas. Mas o comentário em `whatsapp-webhook.js:19-22` também justifica a espera por "responder em 1 segundo é que denuncia robô". **Esse motivo deixa de valer** com a apresentação transparente (REGRAS-DA-IA.md, seção 1).
- `[PROPOSTA]` Hipótese H3 abaixo: reduzir para 5 a 6 s e medir.
- **Sem atraso artificial** para simular digitação. Os atrasos da esteira de **envio** (5 a 15 min, 60 a 180 s) são outra coisa: limitam o volume que sai do número.

## 4. O que os estudos dizem, e o que não dizem

| Estudo | Canal | População | Data | O que encontrou | Limites |
|---|---|---|---|---|---|
| Oldroyd, McElheran e Elkington, "The Short Life of Online Sales Leads", *Harvard Business Review* 89(3) | Lead de formulário web; resposta da empresa por telefone ou e-mail | Auditoria de 2.241 empresas dos EUA (número de fonte secundária) | mar/2011 | Empresas que respondem rápido qualificam muito mais leads; a maioria responde devagar | EUA, web, B2B/B2C genérico. Números não conferidos no texto original (acesso pago). **Não é WhatsApp nem consórcio** |
| "Lead Response Management Study" (Oldroyd, com InsideSales.com) | Ligação telefônica a lead web | Leads de clientes da InsideSales | ~2007–2008 | Citado como "21× mais chance em 5 min do que em 30 min" | Patrocinado por fornecedor, metodologia não verificada, **telefone**, EUA |
| Entagl, "Response Velocity Study" | Instagram DM, WhatsApp Business, chat web, Messenger, Telegram | 32.581 conversas em 1.247 workspaces de clientes do fornecedor | jan–abr/2026 | Resposta em menos de 1 min com conversão maior (35,1%) | Observacional, não randomizado; fornecedor; metodologia completa não publicada; canais misturados; **não é agro nem Brasil** |

**Conclusão:** os estudos sustentam a ideia geral de que demorar muito custa leads. **Nenhum define um número ideal para WhatsApp de consórcio agrícola**, nem um melhor horário de envio. A meta de 15 s é técnica, não científica; os horários são hipóteses a testar com dados próprios.

## 5. Hipóteses a testar `[PROPOSTA]`

Regras comuns a todos os testes:
- só leads com autorização;
- sorteio do braço **por lead**, não por dia (para não confundir com o dia da semana);
- braço gravado no lead (`bracoExperimento`);
- mínimo de 4 semanas;
- registrar a época da safra;
- não declarar vencedor com menos de cerca de 200 leads por braço. Com 40 envios por dia, isso leva semanas, e diferenças pequenas não vão aparecer.

| ID | Hipótese | Braços | Métrica principal | Métrica de segurança |
|---|---|---|---|---|
| H1 | A janela da manhã rende diferente da tarde | 9–11 × 14–17 (hora local) | % que responde em 24 h; % que agenda | % de opt-out e bloqueio |
| H2 | Usar o fuso do lead melhora a resposta nos estados UTC−4 | horário de Brasília × horário local | % de resposta em 24 h (só MT/MS/RO/RR/AM) | opt-out |
| H3 | Debounce menor mantém uma resposta por "rajada" e cumpre a meta de 15 s | 12 s × 6 s | % de respostas ≤15 s | respostas por rajada (deve ficar ~1); teto de 5 atingido |
| H4 | Follow-up mais espaçado incomoda menos | 24–36 h × 48–72 h | % de resposta ao follow-up | opt-out depois do follow-up |
| H5 | O texto da apresentação transparente afeta a resposta | variante A × variante B (as duas transparentes) | % de resposta | opt-out; perguntas "é robô?" |

H5 testa **qual texto**, não **se** a IA é transparente: a transparência é regra, não variável.

## 6. Perguntas que precisam de resposta antes de ativar

Veja a lista consolidada em `docs/ia-produto/README.md`, seção "Perguntas comerciais".
