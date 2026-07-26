# Passo a passo completo — do zero até o sistema no ar

Esse guia parte do princípio de que você não tem nada configurado ainda.
Segue a ordem certa pra não travar em nenhuma etapa. Onde os nomes de menu
podem variar (as plataformas mudam a interface de vez em quando), aviso.

---

## Fase 1 — Criar a conta na Anthropic e pegar a chave da IA

1. Acesse **console.anthropic.com** e crie sua conta (e-mail ou Google).
2. Vá em **Settings → Billing** e cadastre um cartão — a API não tem
   camada gratuita permanente, você paga só pelo uso (e como vimos, o uso
   aqui é barato: uns R$ 10-15/mês).
3. Vá em **API Keys → Create Key**, dê um nome (ex: "follow-up-whatsapp") e
   clique em criar.
4. **Copie a chave na hora** — ela começa com `sk-ant-` e só aparece uma
   vez. Cole num bloco de notas temporário, você vai precisar dela na Fase 5.

## Fase 2 — Criar a conta na Z-API e conectar seu WhatsApp Business

1. Acesse **app.z-api.io** e crie sua conta (tem teste grátis por alguns
   dias antes de escolher um plano).
2. No painel, crie uma **nova instância** (é o "número" que a Z-API vai
   controlar).
3. Abra a instância criada — vai aparecer um **QR Code**.
4. No seu celular, abra o **WhatsApp Business** → Configurações →
   Aparelhos conectados → Conectar um aparelho, e leia o QR Code (é o
   mesmo processo do WhatsApp Web).
5. Depois de conectado, anote (ainda no painel da instância):
   - **Instance ID**
   - **Token**
6. Vá em **app.z-api.io/app/security** e copie o **Client-Token** da conta.
   Guarde os 3 valores junto com a chave da Anthropic.

## Fase 3 — Colocar o código num repositório do GitHub

Isso é necessário porque a hospedagem (Fase 4) puxa o código direto do
GitHub.

1. Se não tiver, crie uma conta em **github.com**.
2. Clique em **New repository**, dê um nome (ex: `whatsapp-ia-followup`) e
   deixe como privado. Não marque nenhuma opção de inicialização.
3. Extraia o .zip que te passei no computador.
4. Na página do repositório recém-criado, clique em **uploading an
   existing file**, arraste todos os arquivos e pastas extraídos, e clique
   em **Commit changes**.
   - Não é preciso usar linha de comando — dá pra fazer tudo pelo site.

## Fase 4 — Subir o servidor (hospedagem)

Vou usar o **Railway** como exemplo por ser o caminho mais simples pra
quem não mexe com servidor no dia a dia. Custo: R$ 25-100/mês dependendo
do uso (não tem plano gratuito permanente, só um crédito inicial de teste).

1. Acesse **railway.com**, crie a conta fazendo login com o GitHub.
2. Clique em **New Project → Deploy from GitHub repo** e selecione o
   repositório que você criou na Fase 3.
3. O Railway detecta que é um projeto Node.js automaticamente e começa o
   deploy (a primeira tentativa pode falhar — é esperado, porque faltam as
   variáveis de ambiente, próximo passo resolve isso).

## Fase 5 — Configurar as credenciais no Railway

1. Dentro do projeto no Railway, abra a aba **Variables**.
2. Adicione cada uma das variáveis do arquivo `.env.example` com os
   valores reais que você guardou nas Fases 1 e 2:
   - `ANTHROPIC_API_KEY`
   - `CLAUDE_MODEL` → `claude-haiku-4-5-20251001`
   - `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
   - `CONSULTOR_WHATSAPP` → seu número, só dígitos, com código do país
     (ex: `5555999999999`)
   - `HORARIO_INICIO` e `HORARIO_FIM` → pode deixar `8` e `20`
3. Salve. O Railway vai reiniciar o deploy automaticamente com as
   variáveis novas.
4. Vá em **Settings → Networking → Generate Domain**. Isso cria uma URL
   pública tipo `https://seu-projeto.up.railway.app` — é o endereço do seu
   servidor. Copie essa URL, você vai usá-la nas duas próximas fases.
5. Confirme que está no ar: abra `https://seu-projeto.up.railway.app` no
   navegador. Deve aparecer a mensagem "Serviço de follow-up de leads via
   WhatsApp rodando."

## Fase 6 — Apontar o Z-API pro seu servidor

1. No painel da instância na Z-API, procure o campo de **webhook de
   mensagem recebida** (às vezes chamado de "Ao receber").
2. Cole: `https://seu-projeto.up.railway.app/webhooks/whatsapp`
3. Salve.

Isso garante que, quando um lead responder, seu servidor saiba na hora e
pare a sequência automática.

## Fase 7 — Apontar o RD Station CRM pro seu servidor

Webhooks no RD Station CRM exigem plano **Basic, Pro ou Advanced** do CRM.

1. No RD Station CRM, procure **Configurações → Webhooks** (o caminho
   exato pode variar um pouco conforme sua versão do painel).
2. Clique em **Criar Webhook**.
3. Preencha:
   - **Nome:** algo como "Follow-up WhatsApp"
   - **URL:** `https://seu-projeto.up.railway.app/webhooks/rdstation`
   - **Gatilho:** escolha o evento de mudança de estágio/status da
     negociação (ex: "negociação atualizada")
4. Salve e use o botão de **Verificar/Testar**, se disponível, pra
   confirmar que o RD Station consegue alcançar seu servidor.

**Atenção:** o formato exato do payload que o RD Station manda depende de
como seu funil está montado (nomes de estágio, campos customizados etc).
O arquivo `src/routes/rdstation-webhook.js` tem um exemplo genérico — bem
provavelmente vai precisar ajustar os nomes dos campos (`payload.deal.status`
etc) pra bater com o que sua conta realmente envia. Dá pra ver o payload
real testando o webhook uma vez e olhando os logs no Railway (aba
**Deployments → View Logs**).

## Fase 8 — Teste de ponta a ponta

Antes de confiar o fluxo todo pra automação, valide cada etapa:

1. Marque manualmente um lead de teste como "não atendeu" no RD Station e
   confira nos logs do Railway se o webhook chegou.
2. Espere a primeira mensagem ser enviada (o agendador roda a cada 15
   min, dentro do horário configurado) e confira se ela chegou no
   WhatsApp de teste.
3. Responda essa mensagem a partir do número de teste e confira se: (a) a
   sequência parou, e (b) você recebeu o aviso no seu próprio WhatsApp.

## Fase 9 — Depois de validado

- Acompanhe os logs no Railway nos primeiros dias pra pegar qualquer erro
  de payload ou de formato de número.
- Se notar sinais de bloqueio ou restrição no número conectado à Z-API,
  pare os disparos automáticos até entender o que houve — vale ter um
  número secundário reservado só pra essa automação, como comentei antes.
