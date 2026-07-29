# IA de follow-up de leads via WhatsApp

Sistema que assume o follow-up de um lead **depois** que você já ligou e não
conseguiu atendimento. Manda mensagem humanizada 2x por dia, por 3 dias (6
mensagens no total) — a 1ª mensagem sai já na 1ª hora depois do lead entrar,
a 2ª entre 30 e 60 minutos depois (sempre variando, nunca um horário fixo).
Se o lead responder, a IA continua a conversa sozinha (em primeira pessoa,
como se fosse você mesmo escrevendo) dentro de limites bem definidos, e só
te chama quando é hora de você entrar.

## O site

O servidor serve um site único (uma página só, sem recarregar ao navegar),
com a identidade visual da Fourcon | FourAgro — fundo com a foto real do
site, paleta branco/preto/laranja, tipografia moderna (Space Grotesk +
Inter).

**Acesso protegido por código:** ao abrir o site, pede um código de 6
dígitos antes de mostrar qualquer coisa (padrão: `059597`). Pra trocar o
código, usa o botão **"Código de acesso"** no topo — pede uma palavra-chave
mestra (`KAMILLY`, fixa no código do servidor) pra confirmar a troca. O
código fica salvo no Volume do Railway, sobrevive a deploys.

Navegação (tudo na mesma página, cada seção com botão **"← Voltar"**):

- **Leads** (tela inicial) — quadro estilo CRM (igual o funil do RD
  Station), com uma coluna pra cada tentativa de contato (1ª a 6ª),
  **Conversando**, **Aguardando você**, **Reunião agendada** e **Lead
  perdido**. O card do lead muda de coluna sozinho conforme o status e o
  número de mensagens já enviadas mudam — não é um campo separado que
  precisa ser atualizado à mão, é calculado toda vez que a tela carrega.
  Tem **busca por número de telefone** (filtra o quadro em tempo real) e
  **Exportar/Importar Excel** (colunas `Nome`, `Telefone`, `Produto`).
- **+ Novo lead** — formulário pra adicionar um lead manualmente e já
  iniciar a sequência de follow-up. Alternativa ao webhook do RD Station.
- **Testar mensagem** — três abas: Mensagem única, Conversa no WhatsApp
  (cria lead de teste real, mesmo caminho de produção) e Simular na tela.
- **CRM** — guarda a chave da API do RD Station (ou outro CRM) e a URL
  base, pra vincular futuramente. Não faz nenhuma chamada ainda.
- **Google Agenda** — só marca que você quer conectar no futuro (conectar
  de verdade exige um fluxo de autorização do Google que ainda não foi
  construído).
- **Métricas** — visão geral: total de leads, taxa de retorno (% que
  respondeu), quantas reuniões foram marcadas, quantos ficaram sem
  resposta.
- **Relatório diário** — escolhe uma data, gera um resumo por lead e
  exporta em Excel **ou imprime** (botão "Imprimir", usa a impressão do
  navegador com um layout limpo, sem cores de fundo). Nunca é enviado
  pro lead — é só pra sua consulta.
- Clicar num lead na lista abre a conversa inteira, com botões **Assumir
  conversa** (encerra a IA nesse lead, garantido) e **Remover lead**.

Assim que a Fase 5 (Railway) estiver no ar, é só abrir a própria URL do
serviço no navegador (`https://SEU-PROJETO.up.railway.app`) — o site já
aparece ali, não precisa de nenhuma configuração extra.

## Quando o atendimento automático encerra

Um lead sai da lista principal (mas continua nos dados, pro relatório e
métricas) quando:

- **O lead confirma um horário de ligação/reunião** — a IA (falando como
  você, em primeira pessoa) aprova o horário na hora, sem pedir permissão
  pra ninguém, e o atendimento encerra. Você recebe um aviso com o
  horário combinado.
- **Você manda uma mensagem pelo próprio WhatsApp conectado** — detecção
  por aproximação: se uma mensagem sair do número conectado e o texto for
  diferente da última coisa que a IA mandou, entende que foi você
  assumindo manualmente e encerra por ali. Como isso depende de como a
  Z-API reporta o evento, não é 100% garantido — pra ter certeza, use o
  botão **Assumir conversa** na página do lead, que sempre funciona.

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

**Cronograma das 6 mensagens:**

| Mensagem | Quando sai |
|---|---|
| 1ª | 30-60 min depois do lead entrar (sorteado, nunca fixo) |
| 2ª | Final do dia (18h Brasília, configurável em `HORA_FIM_DIA`) — do mesmo dia, se ainda houver tempo, senão do dia seguinte |
| 3ª | Manhã do dia seguinte (9h Brasília, configurável em `HORA_MANHA`) |
| 4ª | Final do dia, mesmo dia da 3ª |
| 5ª | Manhã do dia seguinte |
| 6ª | Final do dia, mesmo dia da 5ª |

Ou seja: a 1ª mensagem é a resposta rápida logo após o lead entrar, e a
partir da 2ª o padrão vira sempre **uma de manhã + uma no final do dia**,
como uma esteira andando dia a dia. Tudo isso dentro da janela de horário
permitido (8h-20h por padrão, configurável em `HORARIO_INICIO`/
`HORARIO_FIM`) — se cair fora, espera a janela abrir de novo.

5. Quando o lead responde, a sequência de follow-up para e a IA passa a
   **conversar diretamente** com ele, usando só o conteúdo básico fixo
   sobre crédito agro (definido em `src/services/claude.js`) — nunca
   inventando valor, prazo ou condição.
6. A IA encaminha a conversa pra você (avisa no seu WhatsApp) assim que
   qualquer uma dessas situações acontece:
   - o lead pede um valor/condição que não está no conteúdo cadastrado;
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
mensagens fixas), o conteúdo básico sobre o produto (`TOPICO_PADRAO` em
`src/services/claude.js`) importa mais ainda — é o que impede ela de
improvisar sobre valores e condições do consórcio.

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

Uma coisa fica totalmente editável pelo site, sem mexer em código:

- **`CONSULTOR_NOME` e `CONSULTOR_EMPRESA`** (no `.env`, no Railway) — nome
  e empresa que a IA usa pra se apresentar na primeira mensagem, do jeito
  que você já faz de verdade ("Aqui é o Guilherme, da Fourcon | FourAgro").

Duas outras coisas, mais técnicas, ficam no código:

- **`TOPICO_PADRAO`** (em `src/services/claude.js`) — hoje fixo em
  "Crédito rural, para quem precisa de capital para a propriedade", já que
  todo lead é desse mesmo produto. Se isso mudar no futuro (voltar a ter
  vários produtos), é aqui que se reintroduz a variação por segmento.
- **`src/services/claude.js`** — tem um exemplo real de mensagem sua
  (`EXEMPLO_REAL_DE_TOM`) usado como referência de tom pra IA escrever
  parecido com você, não genérico. Editável direto pela interface do
  GitHub (abre o arquivo, clica no lápis, edita, comita) — o Railway
  atualiza sozinho.
  GitHub (abre o arquivo, clica no lápis, edita, comita) — o Railway
  atualiza sozinho.

Antes de usar com um lead de verdade, use a seção **"Testar mensagem"** no site pra ver
exatamente que texto a IA gera e como ele chega no WhatsApp.

O objetivo de toda mensagem, do jeito que você descreveu, é sempre marcar
uma ligação ou reunião/chamada de vídeo — os detalhes do consórcio só são
explicados ao vivo, nunca por texto.

## Leitura de imagem, figurinha e áudio

Quando o lead manda uma imagem ou figurinha, a própria Claude já lê e
descreve o conteúdo (não precisa de conta nova pra isso) — a descrição
vira o "texto" da mensagem no fluxo normal de conversa.

Áudio precisa da OpenAI (Whisper) pra transcrever. Enquanto
`OPENAI_API_KEY` não estiver configurada no Railway, mensagem de voz do
lead gera um aviso pra você ouvir manualmente, em vez de travar ou ser
ignorada. Assim que a chave for adicionada, a transcrição liga sozinha.

## Contas e sistemas que você precisa ter

| Sistema | Pra quê | Você já tem? |
|---|---|---|
| RD Station CRM | Fonte do lead e webhook de status | Sim |
| Conta na Anthropic (console.anthropic.com) | Gerar mensagens e ler imagem/figurinha | Precisa criar |
| Conta na OpenAI (platform.openai.com) | Transcrever áudio do lead (opcional) | Precisa criar |
| Z-API (ou similar: Evolution API, Zapster) | Conectar seu WhatsApp Business e enviar/receber mensagens | Precisa criar |
| Um servidor pra rodar este código 24h | Hospedar o serviço (Railway, Render, ou uma VPS) | Precisa criar |

## Custo estimado mensal

- **Claude API (Haiku 4.5):** por volume — cada mensagem gerada custa perto
  de **R$ 0,01** (input+output somados). Mesmo em 1.000 mensagens/mês isso
  fica em torno de **R$ 10-15**. Ler uma imagem custa perto disso também.
  É a parte mais barata de tudo.
- **OpenAI Whisper (opcional, só pra áudio):** cerca de **US$ 0,006 por
  minuto** de áudio transcrito — poucos centavos de real por mensagem de
  voz.
- **Z-API:** entre **R$ 55 e R$ 100/mês** por instância (número conectado).
  Alternativa mais barata: Evolution API, que é open source e grátis — você
  paga só o servidor onde ela roda.
- **Hospedagem do serviço (Node.js):** um plano básico em Railway/Render ou
  uma VPS pequena fica em torno de **R$ 30-50/mês**. Se você já for hospedar
  a Evolution API em um servidor, pode rodar os dois juntos e economizar
  nessa linha.

**Total estimado:** de **R$ 40/mês** (rota mais barata, com Evolution API) a
cerca de **R$ 150/mês** (Z-API + hospedagem separada), fora eventuais taxas
de cartão internacional pra pagar a Anthropic/OpenAI.

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

## Correções desta revisão

Passei o projeto inteiro a limpo duas vezes procurando falhas. As mais importantes:

- **Fuso horário errado em dois lugares** — a janela de 8h-20h e o horário
  que aparece nos seus avisos estavam em UTC (horário do servidor), não em
  Brasília. Ambos corrigidos.
- **Número de telefone do RD Station não era normalizado** — se o RD
  Station mandasse o número formatado, o lead ficava salvo diferente do
  que a Z-API reconhece depois, quebrando a conversa.
- **Mensagens que a própria IA manda podiam ser processadas como se
  fossem do lead**, dependendo de como a Z-API relata o evento.
- **O teste "Conversa no WhatsApp" não registrava a primeira mensagem no
  histórico da conversa** — isso quebrava a detecção de "essa mensagem é
  só o eco da própria IA" que uso pra saber quando você assumiu
  manualmente, podendo encerrar o lead por engano assim que ele era criado.
- **Métrica "Reuniões marcadas" contava qualquer lead encerrado**, mesmo
  os que você fechou manualmente por outro motivo - agora só conta quando
  o motivo registrado é realmente "horário confirmado".
- **Se o envio de uma resposta falhasse, o lead ficava sem retorno e sem
  ninguém saber** — agora você é avisado quando isso acontece.
- **Tentativa de mensagem fora do intervalo 1-6 podia gerar um prompt
  quebrado** — travado.
- Um texto do site ainda mencionava o prefixo `[TESTE]` que eu já tinha
  removido — corrigido.

## Botão de emergência (pausar tudo)

No quadro de leads tem um botão **Pausar envios**. Ele para na hora TODOS os
envios automáticos — a sequência e as respostas a leads. Os dados ficam
intactos: mensagens que chegarem são registradas normalmente, só não recebem
resposta automática até você retomar. Use se notar a IA respondendo algo
errado, ou se precisar mexer em alguma configuração com calma.

## Segurança

- **Código de acesso com proteção contra força bruta**: 5 tentativas
  erradas bloqueiam aquele IP por 15 minutos. Sem isso, alguém com a URL
  do site conseguiria testar as 1.000.000 de combinações de 6 dígitos
  automaticamente.
- **APIs protegidas por sessão**: digitar o código certo gera um token que
  vale 12 horas. Sem esse token, nenhuma rota de dados responde — antes,
  qualquer um com a URL conseguia baixar a lista completa de leads sem
  digitar código nenhum, mesmo com a tela "protegida".
- Os webhooks (Z-API e RD Station) ficam fora dessa proteção de propósito —
  eles vêm de fora e não têm como enviar token.

Isso não substitui os cuidados normais de LGPD: são dados pessoais de
clientes reais, então vale limitar quem tem o código e trocá-lo se alguém
sair da equipe.

## Backup

A seção **Backup** baixa tudo (leads, conversas, configurações) num arquivo
JSON, e restaura a partir dele. O Volume do Railway já protege contra perda
em deploy, mas não contra o Volume em si se perder — vale baixar um backup
por semana e guardar fora do Railway.

## Estilo das mensagens

A seção **Estilo das mensagens** guarda exemplos reais de mensagens suas.
Quanto mais exemplos (até 8), mais a IA escreve parecido com você em vez de
genérico. É a melhoria de maior impacto pelo menor esforço — vale colar ali
algumas conversas reais suas assim que possível.

## Estrutura do projeto

```
src/
  server.js                    # sobe o servidor, o site e o agendador
  routes/
    rdstation-webhook.js       # recebe aviso de "não atendeu" do RD Station
    whatsapp-webhook.js        # recebe resposta do lead, para a sequência
    leads-api.js               # lista/cria leads, importação em lote
    teste-api.js                # gera mensagem de teste + simulação de conversa completa
    acesso-api.js               # verifica/troca o código de acesso ao site
    crm-api.js                  # config do CRM, Google Agenda e exemplos de tom
    backup-api.js               # exporta/restaura o banco inteiro
  services/
    claude.js                  # gera a mensagem humanizada
    whatsapp.js                # envia mensagem via Z-API
    media.js                    # converte imagem/figurinha/áudio recebidos em texto
    openai.js                   # transcreve áudio via Whisper (precisa de OPENAI_API_KEY)
    sessao.js                   # tokens de sessão e bloqueio de força bruta
    scheduler.js               # controla a cadência 2x/dia por 3 dias
  db/
    store.js                   # guarda leads, código de acesso, config do CRM e exemplos de sucesso
public/
  index.html                  # site inteiro (todas as seções, navegação por hash)
  app.js                      # toda a lógica do site (roteamento, formulários, etc)
  estilo.css                  # identidade visual Fourcon | FourAgro
data/
  db.json                      # "banco de dados" simples em arquivo
```
