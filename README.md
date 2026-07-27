# IA de follow-up de leads via WhatsApp

Sistema que assume o follow-up de um lead **depois** que você já ligou e não
conseguiu atendimento. Manda mensagem humanizada 2x por dia, por 3 dias (6
mensagens no total). Se o lead responder, a IA continua a conversa sozinha
dentro de limites bem definidos, e só te chama quando é hora de você entrar.

## O site pra adicionar leads manualmente

Além dos webhooks, o próprio servidor já serve um site simples:

- **`/` (ou `/index.html`)** — lista todos os leads, com status e progresso
  da sequência (quantas das 6 mensagens já foram enviadas).
- **`/novo.html`** — formulário pra adicionar um lead manualmente (nome,
  WhatsApp, produto) e já iniciar a sequência de follow-up. Serve como
  alternativa ao webhook do RD Station — você pode jogar o lead aqui assim
  que desliga a ligação sem retorno, e depois levar pro RD Station por fora,
  do seu jeito.
- **`/lead.html?telefone=...`** — clique num lead na lista pra ver a
  conversa inteira (mensagens da sequência + o que foi trocado depois que
  o lead respondeu).

Assim que a Fase 5 (Railway) estiver no ar, é só abrir a própria URL do
serviço no navegador (`https://SEU-PROJETO.up.railway.app`) — o site já
aparece ali, não precisa de nenhuma configuração extra.

## Como o fluxo funciona

1. Você recebe o lead no RD Station e liga.
2. Se não atender, você marca isso no RD Station (estágio/status combinado).
3. O RD Station dispara um webhook pra este sistema.
4. O sistema começa a sequência: gera uma mensagem com a Claude API, manda
   pelo seu WhatsApp (via Z-API) e agenda a próxima.
5. Quando o lead responde, a sequência de follow-up para e a IA passa a
   **conversar diretamente** com ele, usando só os tópicos que você cadastrou
   em `src/config/topicos.js` — nunca inventando valor, prazo ou condição.
6. A IA encaminha a conversa pra você (avisa no seu WhatsApp) assim que
   qualquer uma dessas situações acontece:
   - o lead pede um valor/condição que não está nos tópicos cadastrados;
   - o lead pede explicitamente para falar com uma pessoa;
   - o lead sinaliza que já quer fechar negócio;
   - o lead propõe ou aceita um horário para ser contatado — a IA nunca
     confirma horário de ligação em seu nome, quem confirma é você;
   - a conversa passa de **5 respostas automáticas seguidas** (limite de
     segurança, configurável em `MAX_RESPOSTAS_AUTOMATICAS` no `.env`) — isso
     garante que uma conversa real sobre consórcio nunca fica indefinidamente
     só com a IA, mesmo que ela ache que ainda dá pra continuar.

   Mesmo quando encaminha, a IA sempre manda uma resposta educada ao lead
   antes (nunca deixa ele sem retorno) — só não confirma nada que não seja
   dela para confirmar. O aviso que você recebe já vem com um resumo do que
   precisa fazer (ex: "lead propôs ligação amanhã às 15h").
7. A partir do encaminhamento, a IA para de responder e é você quem assume,
   manualmente, dali em diante.
8. Se ninguém responder depois das 6 mensagens da sequência inicial, o lead
   fica marcado como "nutrição futura".

Um ponto de atenção: como a IA agora conversa de verdade (não só manda
mensagens fixas), o conteúdo do `topicos.js` importa mais ainda — é o que
impede ela de improvisar sobre valores e condições do consórcio.

## Sobre a IA "aprender junto" — o que isso é de verdade

Vale alinhar expectativa aqui: a Claude (como qualquer LLM) não re-treina
sozinha a cada conversa. O que este sistema faz pra chegar perto do que você
pediu é um **loop de exemplos**: toda vez que uma mensagem gera resposta do
lead, ela é guardada (`src/db/store.js`) e as mais recentes entram como
referência de tom nas próximas gerações (`src/services/claude.js`). Na
prática o sistema fica mais afiado com o tempo porque aprende, com exemplos
reais seus, o que funciona — mas é um "playbook vivo", não um modelo sendo
retreinado.

## Como controlar o conteúdo das mensagens

Três coisas ficam totalmente editáveis, sem mexer na lógica do sistema:

- **`CONSULTOR_NOME` e `CONSULTOR_EMPRESA`** (no `.env`) — nome e empresa que
  a IA usa pra se apresentar na primeira mensagem, do jeito que você já faz
  de verdade ("Aqui é o Guilherme, da Fourcon | FourAgro").
- **`src/config/topicos.js`** — uma frase bem básica por segmento (agro,
  imóveis, caminhões, crédito empresarial) só pra situar o lead sobre qual
  produto ele pediu. Nada de valor, prazo ou condição — isso é sempre
  explicado na ligação, nunca por mensagem.
- **`src/services/claude.js`** — tem um exemplo real de mensagem sua
  (`EXEMPLO_REAL_DE_TOM`) usado como referência de tom pra IA escrever
  parecido com você, não genérico. Pode trocar por outro exemplo seu quando
  quiser recalibrar.

Os três são editáveis direto pela interface do GitHub (abre o arquivo,
clica no lápis, edita, comita) — o Railway atualiza sozinho.

O objetivo de toda mensagem, do jeito que você descreveu, é sempre marcar
uma ligação ou reunião/chamada de vídeo — os detalhes do consórcio só são
explicados ao vivo, nunca por texto.

## Contas e sistemas que você precisa ter

| Sistema | Pra quê | Você já tem? |
|---|---|---|
| RD Station CRM | Fonte do lead e webhook de status | Sim |
| Conta na Anthropic (console.anthropic.com) | Gerar as mensagens humanizadas | Precisa criar |
| Z-API (ou similar: Evolution API, Zapster) | Conectar seu WhatsApp Business e enviar/receber mensagens | Precisa criar |
| Um servidor pra rodar este código 24h | Hospedar o serviço (Railway, Render, ou uma VPS) | Precisa criar |

## Custo estimado mensal

- **Claude API (Haiku 4.5):** por volume — cada mensagem gerada custa perto
  de **R$ 0,01** (input+output somados). Mesmo em 1.000 mensagens/mês isso
  fica em torno de **R$ 10-15**. É a parte mais barata de tudo.
- **Z-API:** entre **R$ 55 e R$ 100/mês** por instância (número conectado).
  Alternativa mais barata: Evolution API, que é open source e grátis — você
  paga só o servidor onde ela roda.
- **Hospedagem do serviço (Node.js):** um plano básico em Railway/Render ou
  uma VPS pequena fica em torno de **R$ 30-50/mês**. Se você já for hospedar
  a Evolution API em um servidor, pode rodar os dois juntos e economizar
  nessa linha.

**Total estimado:** de **R$ 40/mês** (rota mais barata, com Evolution API) a
cerca de **R$ 150/mês** (Z-API + hospedagem separada), fora eventuais taxas
de cartão internacional pra pagar a Anthropic.

## Aviso importante — leia antes de colocar no ar

Z-API, Evolution API e similares conectam via WhatsApp Web (QR Code), **não**
são a API oficial da Meta. Enviar mensagem automática pra quem não respondeu
é justamente o padrão que o WhatsApp associa a spam. Formas de reduzir o
risco (já implementadas neste projeto):

- Horário de envio restrito (padrão 8h-20h, configurável no `.env`).
- Horários variados por tentativa, não sempre no mesmo minuto exato.
- Mensagem sempre gerada de novo, nunca template idêntico repetido.

Mesmo assim, o risco de bloqueio do número existe. Vale considerar um número
secundário dedicado a isso, separado do seu WhatsApp principal de
atendimento.

## Passo a passo pra colocar no ar

1. `npm install` na pasta do projeto.
2. Copie `.env.example` pra `.env` e preencha com suas credenciais.
3. Crie uma instância na Z-API, conecte via QR Code com o número que vai
   usar, e copie instance ID / token / client-token pro `.env`.
4. No painel da Z-API, configure o "webhook de mensagem recebida" apontando
   pra `https://SEU-SERVIDOR/webhooks/whatsapp`.
5. No RD Station CRM, configure um Webhook (Configurações > Webhooks)
   disparado na mudança de estágio/status que você usa pra "não atendeu",
   apontando pra `https://SEU-SERVIDOR/webhooks/rdstation`.
6. Ajuste os nomes de campo em `src/routes/rdstation-webhook.js` conforme o
   payload real que o RD Station manda na sua conta (o formato varia
   conforme como seu funil está montado).
7. `npm start`.

## Estrutura do projeto

```
src/
  server.js                    # sobe o servidor e o agendador
  routes/
    rdstation-webhook.js       # recebe aviso de "não atendeu" do RD Station
    whatsapp-webhook.js        # recebe resposta do lead, para a sequência
  services/
    claude.js                  # gera a mensagem humanizada
    whatsapp.js                # envia mensagem via Z-API
    scheduler.js               # controla a cadência 2x/dia por 3 dias
  config/
    topicos.js                 # pontos de conteúdo editáveis por segmento
  db/
    store.js                   # guarda leads e exemplos de sucesso
data/
  db.json                      # "banco de dados" simples em arquivo
```
