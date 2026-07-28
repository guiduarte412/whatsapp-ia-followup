# IA de follow-up de leads via WhatsApp

Sistema que assume o follow-up de um lead **depois** que você já ligou e não
conseguiu atendimento. Manda mensagem humanizada 2x por dia, por 3 dias (6
mensagens no total). Se o lead responder, a IA continua a conversa sozinha
dentro de limites bem definidos, e só te chama quando é hora de você entrar.

## O site

O servidor serve um site único (uma página só, sem recarregar ao navegar),
com a identidade visual da Fourcon | FourAgro — fundo com a foto real do
site, paleta branco/preto/laranja.

**Acesso protegido por código:** ao abrir o site, pede um código de 6
dígitos antes de mostrar qualquer coisa (padrão: `059597`). Pra trocar o
código, usa o botão **"Código de acesso"** no topo — pede uma palavra-chave
mestra (`KAMILLY`, fixa no código do servidor) pra confirmar a troca. O
código fica salvo no Volume do Railway, sobrevive a deploys.

Navegação (tudo na mesma página, cada seção com botão **"← Voltar"**):

- **Leads** (tela inicial) — lista todos os leads, com status e progresso
  da sequência. Tem **Exportar Excel** e **Importar Excel** (colunas
  `Nome`, `Telefone`, `Produto`) pra criar vários leads de uma vez — mesmo
  formato de planilha que você já usa pra outras listas de chamada.
- **+ Novo lead** — formulário pra adicionar um lead manualmente e já
  iniciar a sequência de follow-up. Alternativa ao webhook do RD Station.
- **Testar mensagem** — três abas:
  - **Mensagem única**: gera uma mensagem com a IA de verdade e manda pro
    número que você informar (sem criar lead nem entrar na sequência real).
  - **Conversa no WhatsApp**: cria um lead marcado com selo **TESTE** e já
    manda a primeira mensagem pro número que você informar. Dali em diante
    você responde normalmente pelo seu WhatsApp — a conversa segue o
    caminho real (mesmo webhook que um lead de verdade usa).
  - **Simular na tela**: mesma ideia, mas sem tocar no WhatsApp - você
    digita o que o lead responderia e vê a IA reagir turno a turno.
- **Editar tópicos** — uma caixa de texto por segmento (agro, imóveis,
  caminhões, crédito empresarial) onde você escreve o que a IA pode
  mencionar sobre cada produto. Salva na hora, sem precisar mexer em código.
- **CRM** — guarda a chave da API do RD Station (ou outro CRM) e a URL base,
  pra vincular futuramente. Por enquanto só fica salva (o site nunca devolve
  a chave em claro depois de salva, só indica que existe uma) — nenhuma
  integração automática usa isso ainda, é só a base pronta pra quando for
  construída.
- **Relatório diário** — escolhe uma data, gera um resumo por lead (novo
  hoje, quantas mensagens foram enviadas, quantas respostas do lead, status
  atual) e exporta em Excel — pronto pra repassar no CRM manualmente.
- Clicar num lead na lista abre a conversa inteira, com botão **Remover
  lead**.

Assim que a Fase 5 (Railway) estiver no ar, é só abrir a própria URL do
serviço no navegador (`https://SEU-PROJETO.up.railway.app`) — o site já
aparece ali, não precisa de nenhuma configuração extra.

## Avisos pro consultor

Toda vez que a IA encaminha um lead pra você (ou quando o lead te manda uma
mensagem nova depois de já estar com você), você recebe um aviso no
WhatsApp `CONSULTOR_WHATSAPP` (hoje configurado pra `5547992412727`, ajuste
nas Variables do Railway se precisar trocar) sempre no mesmo formato:

```
Lead: <nome>
Número: <telefone>
Horário: <dia/mês hora:minuto>

<motivo/contexto>
```

## Como o fluxo funciona

1. Você recebe o lead no RD Station e liga.
2. Se não atender, você marca isso no RD Station (estágio/status combinado).
3. O RD Station dispara um webhook pra este sistema.
4. O sistema começa a sequência: gera uma mensagem com a Claude API, manda
   pelo seu WhatsApp (via Z-API) e agenda a próxima.
5. Quando o lead responde, a sequência de follow-up para e a IA passa a
   **conversar diretamente** com ele, usando só os tópicos que você
   cadastrou na seção Editar tópicos — nunca inventando valor, prazo ou condição.
6. A IA encaminha a conversa pra você (avisa no seu WhatsApp) assim que
   qualquer uma dessas situações acontece:
   - o lead pede um valor/condição que não está nos tópicos cadastrados;
   - o lead pergunta sobre contemplação (sorteio/lance) — a IA nunca fala
     de contemplação por texto, isso é sempre encaminhado;
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
mensagens fixas), o conteúdo cadastrado nos tópicos importa mais
ainda — é o que impede ela de improvisar sobre valores e condições do
consórcio.

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

Duas coisas ficam totalmente editáveis pelo site, sem mexer em código:

- **seção "Editar tópicos" no site** — uma caixa de texto por segmento (agro, imóveis,
  caminhões, crédito empresarial) só pra situar o lead sobre qual produto
  ele pediu. Nada de valor, prazo ou condição — isso é sempre explicado na
  ligação, nunca por mensagem.
- **`CONSULTOR_NOME` e `CONSULTOR_EMPRESA`** (no `.env`, no Railway) — nome
  e empresa que a IA usa pra se apresentar na primeira mensagem, do jeito
  que você já faz de verdade ("Aqui é o Guilherme, da Fourcon | FourAgro").

Uma terceira coisa, mais técnica, fica no código:

- **`src/services/claude.js`** — tem um exemplo real de mensagem sua
  (`EXEMPLO_REAL_DE_TOM`) usado como referência de tom pra IA escrever
  parecido com você, não genérico. Editável direto pela interface do
  GitHub (abre o arquivo, clica no lápis, edita, comita) — o Railway
  atualiza sozinho.

Antes de usar com um lead de verdade, use a seção **"Testar mensagem"** no site pra ver
exatamente que texto a IA gera e como ele chega no WhatsApp.

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

## Configurar o Volume no Railway (não pular esse passo)

O disco padrão do Railway é temporário — some a cada novo deploy. Sem um
Volume configurado, **toda vez que você atualizar o código, os leads que
estiverem salvos são apagados**, mesmo os reais. O projeto já está pronto
pra usar um Volume automaticamente (basta criar um), mas o Volume em si
precisa ser configurado uma vez, direto no Railway:

1. Dentro do seu projeto no Railway, clique com o botão direito no canvas
   (ou use o atalho ⌘K / Ctrl+K) e escolha **Create Volume**.
2. Selecione o serviço `whatsapp-ia-followup` pra anexar o Volume a ele.
3. No campo de **Mount Path**, digite `/app/data`.
4. Salve — o Railway reinicia o serviço sozinho (pode dar uma breve pausa,
   normal).

A partir daí, os leads sobrevivem a qualquer atualização de código. Faça
isso **antes** de importar sua primeira leva de leads reais.

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
  server.js                    # sobe o servidor, o site e o agendador
  routes/
    rdstation-webhook.js       # recebe aviso de "não atendeu" do RD Station
    whatsapp-webhook.js        # recebe resposta do lead, para a sequência
    leads-api.js               # lista/cria leads, importação em lote
    topicos-api.js             # lê/salva os tópicos usados pela IA
    teste-api.js                # gera mensagem de teste + simulação de conversa completa
    acesso-api.js               # verifica/troca o código de acesso ao site
    crm-api.js                  # guarda a chave de integração com o CRM
  services/
    claude.js                  # gera a mensagem humanizada
    whatsapp.js                # envia mensagem via Z-API
    scheduler.js               # controla a cadência 2x/dia por 3 dias
  db/
    store.js                   # guarda leads, tópicos, código de acesso e exemplos de sucesso
public/
  index.html                  # site inteiro (todas as seções, navegação por hash)
  app.js                      # toda a lógica do site (roteamento, formulários, etc)
  estilo.css                  # identidade visual Fourcon | FourAgro
data/
  db.json                      # "banco de dados" simples em arquivo
```
