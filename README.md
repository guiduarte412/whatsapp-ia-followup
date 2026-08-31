# Esteira de agendamento por WhatsApp

Você importa uma planilha de clientes, o sistema manda **uma** mensagem para
cada um, e quando alguém responde, a IA conversa no seu lugar até marcar um
horário com você.

O ponto central: **o texto das mensagens, as regras que a IA segue e os
horários de envio não estão no código.** Tudo isso é editado na tela de
Configurações do próprio site. Para mudar o que o sistema fala ou o que ele
pode e não pode dizer, ninguém precisa mexer em programação nem no Railway.

## Como o fluxo funciona

1. Você importa a planilha (colunas `Nome` e `Telefone`) ou cadastra um
   cliente pelo formulário do site.
2. Cada um entra na fila com um horário sorteado — nunca todo mundo no mesmo
   minuto.
3. Chegada a hora, sai **uma mensagem**, escolhida entre as que você
   cadastrou, com o `{nome}` já trocado pelo primeiro nome da pessoa.
4. **Se ninguém responder**, o sistema manda mais uma — e só mais uma —
   dias depois, com um texto diferente do primeiro. Isso é opcional: a
   segunda tentativa só existe se você cadastrar mensagens para ela em
   Configurações > Mensagens. Sem elas, o sistema manda uma mensagem e para.
   **Terceira não existe em nenhum caso.**
5. **Se a pessoa responder**, a esteira para e a IA assume a conversa. Ela
   escreve em primeira pessoa, como se fosse você digitando, seguindo as
   regras que você cadastrou.
6. Quando a pessoa propõe ou aceita um horário, a IA confirma na hora e
   encerra o atendimento automático. Você recebe um aviso no WhatsApp com o
   horário combinado, para colocar na agenda.

### Sobre o telefone da planilha

Planilha brasileira quase nunca traz o código do país, então ele entra
sozinho: `(47) 98888-7777`, `47988887777` e `+55 (47) 98888-7777` viram todos
`5547988887777`. Vale para celular e fixo.

Reimportar a mesma planilha **não** reinicia ninguém — quem já está na base é
contado como duplicado e ignorado, para não apagar conversa em andamento nem
mandar mensagem de novo para quem já foi atendido.

## A tela de Configurações

É o coração do sistema. Seis abas:

**Identidade** — seu nome, sua empresa e uma ou duas linhas sobre o que você
faz. A IA só pode falar do que estiver escrito aqui; o que não estiver, ela
não inventa — encaminha para você.

**WhatsApps** — os números conectados na Z-API. Com a lista vazia, o sistema
usa as credenciais das variáveis de ambiente, que é o modo de quem tem um
número só. Cadastrando dois ou três, os clientes são distribuídos em rodízio
entre eles e o volume se divide — e é volume **por número**, não volume total,
que faz o WhatsApp bloquear. Cada cliente fica grudado no número que abriu a
conversa dele, do começo ao fim, senão ele veria duas pessoas diferentes
falando com ele.

Dois campos de cada número são opcionais: **Nome nas mensagens** e **Avisos
vão para**. Em branco, tudo cai na sua identidade e os avisos chegam no seu
WhatsApp. Preenchidos, aquele número passa a ser de outra pessoa: a IA se
apresenta com o nome dela e os avisos vão para o WhatsApp dela.

**Mensagens** — o texto que abre a conversa. Escreva quantas variações
quiser: cada cliente recebe uma delas, sorteada. Mandar o texto idêntico para
centenas de números é justamente o padrão que o WhatsApp trata como spam. Use
`{nome}` onde quiser o primeiro nome da pessoa.

Enquanto não houver **nenhuma** mensagem cadastrada, nada é enviado — o
sistema prefere avisar você a inventar um texto para cobrir o buraco.

Na mesma aba, mais abaixo, fica a **segunda tentativa**: as mensagens para
quem não respondeu a primeira, e quantas horas esperar antes de mandá-las
(sorteado dentro da faixa, contado a partir da primeira mensagem). É daqui
que costuma vir boa parte do retorno, mas só funciona com um texto
*diferente* da abertura — reenviar "oi, tudo bem?" para o mesmo número é o
padrão que o WhatsApp lê como spam.

Deixe essa lista vazia se não quiser segunda tentativa: sem nenhuma mensagem
ali, cada cliente recebe uma só, como antes. Ela também vale apenas para
clientes novos — quem já recebeu a abertura antes de você cadastrar isso não
leva uma segunda mensagem de surpresa. E quem responde, em qualquer momento,
sai da fila: a segunda tentativa nunca chega para quem já está conversando.

**Regras** — o que a IA pode e não pode fazer quando o cliente responde. Uma
regra por caixa, escrita do jeito que você falaria ("nunca informe preço por
mensagem", "se perguntarem sobre prazo, me passe a conversa"). Ela segue
todas, sem exceção.

**Horários** — a janela em que os envios podem acontecer (horário de
Brasília), a faixa de espera entre o cliente entrar e a mensagem sair, a pausa
entre um envio e o próximo, e o teto de respostas automáticas seguidas.

**Bloqueios** — os números que pediram para não receber mais mensagens. Um
número nessa lista não recebe nada por nenhum caminho: não entra na esteira,
não recebe resposta da IA e não volta nem se aparecer de novo numa planilha
importada. O sistema adiciona sozinho quando a pessoa pede pelo WhatsApp —
tanto pelo texto ("me tira dessa lista") quanto pelo que a IA identifica —
e você pode bloquear na mão quando o pedido chegar por outro canal. Nessa
aba as ações valem na hora, sem passar pelo botão Salvar.

Quem pede para sair recebe **uma** confirmação curta e nada mais. No quadro
de leads ele aparece na coluna "Pediu pra parar", para você não perder de
vista o que aconteceu.

## Por que existem tantas esperas

Quatro controles diferentes, cada um resolvendo um problema:

| Controle | Para quê |
|---|---|
| Janela de horário (8h–20h) | Nada sai de madrugada |
| Espera antes do envio (30–60 min) | Quem entra junto não recebe junto |
| Pausa entre envios (20–60 s) | Uma planilha grande não vira rajada |
| Espera da 2ª tentativa (48–72 h) | O follow-up não soa como cobrança |

A pausa entre envios é a mais importante quando você importa muita gente de
uma vez. Sem ela, 200 linhas viram 200 mensagens emendadas — o comportamento
que mais derruba número. Com vários números cadastrados, essa pausa é contada
**por número**, então três números mandam três vezes mais rápido no total sem
que nenhum deles acelere.

Se um ciclo não der conta de todo mundo, quem sobrou fica para o ciclo
seguinte. Ciclos nunca rodam um por cima do outro.

## Quando a IA para e chama você

- **A pessoa marcou um horário** — a IA confirma em primeira pessoa e encerra.
  Você recebe o aviso para colocar na agenda.
- **A pessoa pediu algo que as regras não cobrem**, quis falar com alguém, ou
  entrou num assunto que não se resolve por mensagem.
- **A pessoa se despediu sem marcar nada** — a IA responde com cordialidade e
  para de insistir, em vez de ficar tentando reengajar.
- **Passou do teto de respostas automáticas seguidas** (padrão 5), mesmo que a
  IA ache que ainda dava para continuar.
- **Você respondeu manualmente pelo WhatsApp** — detecção por aproximação: se
  sair uma mensagem do número conectado com texto diferente do que a IA mandou
  por último, entende que você assumiu. Como isso depende de como a Z-API
  relata o evento, não é garantido; para ter certeza, use o botão **Assumir
  conversa** na página do cliente.

Em todos os casos a IA sempre deixa uma resposta educada antes de sair — o
cliente nunca fica sem retorno.

Os avisos chegam sempre no mesmo formato:

```
Lead: <nome>
Número: <telefone>
Horário: <dia/mês hora:minuto>

<o que aconteceu / o que você precisa fazer>
```

## O site

Uma página só, sem recarregar ao navegar. Protegida por um código de 6
dígitos (padrão `059597`).

- **Leads** — quadro estilo funil, com uma coluna para cada etapa: Aguardando
  envio, Mensagem enviada, Conversando, Aguardando você, Reunião agendada,
  Lead perdido e Encerrado. O card anda de coluna sozinho conforme o status
  muda; não é um campo que alguém precisa atualizar à mão. Tem busca por nome
  ou número e importação/exportação de Excel.
- **+ Novo lead** — cadastro manual de um cliente.
- **Testar mensagem** — três abas: mandar a mensagem para um número seu,
  criar um cliente de teste e conversar de verdade pelo WhatsApp, ou simular
  a conversa inteira na tela sem tocar em nada.
- **Configurações** — as seis abas descritas acima.
- **Métricas** — total, taxa de retorno, reuniões marcadas e quantos ainda não
  responderam.
- **Relatório diário** — resumo de um dia, exportável em Excel ou impresso.
  Nunca é enviado para o cliente.
- **Backup** — baixa tudo num arquivo e restaura a partir dele.
- **Pausar envios** — botão de emergência no quadro de leads. Para todos os
  envios automáticos na hora, inclusive no meio de um ciclo já em andamento.
  As mensagens que chegarem continuam sendo registradas, só não recebem
  resposta automática.

## Imagem, figurinha e áudio

Imagem e figurinha a própria Claude lê e descreve — não precisa de conta
extra. Áudio precisa da OpenAI (Whisper); enquanto `OPENAI_API_KEY` não
estiver configurada, mensagem de voz gera um aviso para você ouvir
manualmente, em vez de a IA responder sem saber o que foi dito.

## Contas necessárias

| Sistema | Para quê |
|---|---|
| Anthropic (console.anthropic.com) | A IA que conversa e lê imagens |
| Z-API (ou Evolution API) | Conectar o WhatsApp e enviar/receber |
| Railway, Render ou uma VPS | Hospedar o serviço 24h |
| OpenAI (platform.openai.com) | Opcional, só para transcrever áudio |

## Passo a passo para colocar no ar

1. `npm install`.
2. Copie `.env.example` para `.env` e preencha as credenciais.
3. Crie a instância na Z-API e conecte o número via QR Code.
4. No painel da Z-API, aponte o webhook de "ao receber mensagem" para
   `https://SEU-SERVIDOR/webhooks/whatsapp`.
   Se você cadastrar vários números na aba WhatsApps, cada instância aponta
   para a URL própria dela (`/webhooks/whatsapp/wa-1`, `/wa-2`, ...) — a tela
   mostra a URL pronta embaixo de cada número.
5. **Crie o Volume no Railway** (passo abaixo) antes de importar clientes de
   verdade.
6. `npm start`.
7. Abra o site, entre com o código e preencha **Configurações** — pelo menos
   Identidade e uma mensagem. Sem isso nada é enviado.
8. Use **Testar mensagem** para ver como o texto chega antes de importar a
   primeira planilha real.

### O Volume do Railway (não pule)

O disco padrão do Railway é temporário: some a cada deploy. Sem um Volume,
**toda atualização de código apaga os clientes e as configurações**. O projeto
já sabe usar um Volume automaticamente, mas ele precisa ser criado uma vez:

1. No projeto do Railway, use ⌘K / Ctrl+K e escolha **Create Volume**.
2. Anexe ao serviço `whatsapp-ia-followup`.
3. Em **Mount Path**, digite `/app/data`.

## Segurança

- Código de acesso de 6 dígitos, com bloqueio de IP por 15 minutos após 5
  erros. Sem isso, alguém com a URL testaria o 1.000.000 de combinações
  automaticamente.
- Sessão de 12 horas: sem o token, nenhuma rota de dados responde.
- Os tokens da Z-API, uma vez salvos, nunca voltam para o navegador. A tela
  mostra só "já salvo"; salvar com o campo em branco mantém o que estava
  guardado.
- Os webhooks ficam fora dessa proteção porque vêm de fora e não têm como
  mandar token. Para fechar essa porta, defina `ZAPI_WEBHOOK_SEGREDO` e
  acrescente `?segredo=<o valor>` no fim da URL que você cola na Z-API. Sem
  a variável, o webhook aceita qualquer chamada.
- A palavra-chave que autoriza trocar o código de acesso vem de
  `PALAVRA_CHAVE_MESTRA`. **Enquanto ela não estiver configurada**, trocar o
  código exige uma sessão já aberta — porque o valor padrão está no
  código-fonte, que é público, e sozinho ele não pode valer nada.

**Faça estas três coisas antes de usar para valer:** troque o código de
acesso padrão (ele está no código-fonte), defina `PALAVRA_CHAVE_MESTRA` e
defina `ZAPI_WEBHOOK_SEGREDO`.

Isso não substitui os cuidados de LGPD: são dados de pessoas reais. Limite
quem tem o código e troque-o quando alguém sair da equipe. Vale também
registrar de onde veio cada contato — numa reclamação, é a primeira coisa
perguntada, e a planilha importada não responde isso sozinha.

## Aviso importante sobre bloqueio

Z-API e similares conectam via WhatsApp Web (QR Code), **não** são a API
oficial da Meta. Mandar mensagem para quem não pediu contato é exatamente o
padrão que o WhatsApp associa a spam. O que o projeto faz para reduzir o
risco: janela de horário, horário sorteado por pessoa, pausa entre envios,
variação de texto e rodízio entre números.

Mesmo assim o risco existe. Vale usar um número dedicado, separado do seu
WhatsApp principal.

Se você ligar a segunda tentativa, lembre que ela **dobra** o volume por
número: a mesma lista passa a gerar duas mensagens por pessoa em vez de uma.
O que segura o risco é o espaçamento — dias entre a primeira e a segunda, com
texto diferente. Encurtar essa espera para poucas horas desfaz a proteção e
transforma o follow-up em cobrança, que é o que faz a pessoa denunciar.

## Sobre a IA "aprender"

A Claude não re-treina sozinha. O que deixa o sistema mais afiado é você
editar as mensagens e as regras na tela conforme vê o que funciona — não
existe aprendizado automático por trás.

## Custo estimado

- **Claude (Haiku 4.5):** centavos por conversa. A mensagem de abertura não
  gasta nada, porque é o texto que você escreveu — a API só entra quando o
  cliente responde.
- **Z-API:** R$ 55 a R$ 100/mês por número conectado.
- **Hospedagem:** R$ 30 a 50/mês.
- **Whisper (opcional):** cerca de US$ 0,006 por minuto de áudio.

## Estrutura do projeto

```
src/
  server.js                  # sobe o servidor, o site e o agendador
  routes/
    whatsapp-webhook.js      # recebe a resposta do cliente e aciona a IA
    leads-api.js             # lista/cria clientes, importação em lote
    config-api.js            # identidade, números, mensagens, regras, horários
    teste-api.js             # testes e simulação da conversa
    acesso-api.js            # código de acesso e sessão
    backup-api.js            # exporta/restaura tudo, botão de pausa
  services/
    claude.js                # a IA da conversa (sem nenhum texto fixo dentro)
    whatsapp.js              # envio pela Z-API, um ou vários números
    media.js                 # imagem/figurinha/áudio viram texto
    openai.js                # transcrição de áudio
    optout.js                # reconhece "não me manda mais mensagem"
    sessao.js                # tokens de sessão e bloqueio de força bruta
    scheduler.js             # a esteira: quando e em que ritmo enviar
  db/
    store.js                 # leads, configuração, bloqueios e telefone brasileiro
public/
  index.html                 # o site inteiro
  app.js                     # toda a lógica da tela
  estilo.css                 # identidade visual
data/
  db.json                    # o "banco de dados", um arquivo só (fora do Git)
```

Não existe integração com CRM nem com o Google Agenda. O agendamento termina
num aviso no seu WhatsApp; colocar na agenda é manual.
