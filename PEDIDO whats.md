# Pedido de implementação

Quatro mudanças no projeto. As duas primeiras são correções de bugs
existentes; as duas últimas são funcionalidades novas.

Ao terminar, faça commit e push para o repositório.

---

## 1. Corrigir erro que quebra o quadro de leads

**Arquivo:** `public/app.js`, dentro de `renderizarQuadro()`

Existe uma referência à variável `termoBusca`, que não está declarada em
lugar nenhum — a variável correta se chama `termoCru`. Isso lança
`ReferenceError` e **quebra o quadro inteiro** sempre que uma busca não
encontra nenhum lead.

Trocar `termoBusca` por `termoCru` na condição do estado vazio.

## 2. Restaurar o escape de HTML nos cartões do quadro

**Arquivo:** `public/app.js`, dentro de `renderizarQuadro()`

O nome do lead e o telefone são inseridos no HTML sem escape
(`${lead.nome}`, `${lead.phone}`). Esses dados vêm de fora — o lead escolhe
o próprio nome no WhatsApp — então isso é uma brecha de XSS: uma mensagem
com HTML dentro executaria no navegador de quem abrir o painel.

Já existe `escaparAtributo()` no arquivo, mas ela não escapa `>` nem `'`,
porque foi feita para valores dentro de aspas de atributo. Criar uma função
separada para conteúdo entre tags (escapando `&`, `<`, `>`, `"`, `'`) e
aplicá-la em todo dado de lead inserido no HTML do quadro.

## 3. Conectar o WhatsApp pela própria página (QR Code)

Hoje é preciso abrir o painel da Z-API para escanear o QR Code. Levar isso
para dentro da aba **Configurações → WhatsApps**, por número.

**Backend** — `src/services/whatsapp.js` já tem `credenciais(conexao)`, que
resolve as credenciais de um número cadastrado (ou cai nas variáveis de
ambiente). Reaproveitar essa função e adicionar:

- `statusConexao(conexao)` → `GET /instances/{id}/token/{token}/status`
- `obterQrCode(conexao)` → `GET /instances/{id}/token/{token}/qr-code/image`
  (retorna a imagem em base64, no campo `value`)
- `desconectar(conexao)` → `GET /instances/{id}/token/{token}/disconnect`

Todas com o header `Client-Token` e `timeout` definido. Erros devem
propagar o corpo da resposta da Z-API, não só o código de status — a
mensagem padrão do axios não diz o motivo real.

**Rotas** — em `src/routes/config-api.js` (que já é montado atrás de
`exigirSessao`):

- `GET  /api/whatsapps/:id/status`
- `GET  /api/whatsapps/:id/qrcode`
- `POST /api/whatsapps/:id/desconectar`

O `:id` aceita o id de um número cadastrado ou a palavra `padrao` (as
credenciais das variáveis de ambiente, para quem ainda usa um número só).
Id inexistente → 404.

Na rota do QR Code, checar o status antes: se já estiver conectado, a Z-API
não devolve QR Code — retornar `{ conectado: true, imagem: null }` em vez de
deixar a tela esperando uma imagem que nunca vem.

**Frontend** — em cada cartão de número (`renderizarWhatsapps` em
`public/app.js`), adicionar:

- Indicador de status (conectado / desconectado, com o motivo se houver)
- Botão **Conectar**, que exibe o QR Code no próprio cartão
- Botão **Desconectar**, com confirmação
- Botão **Cancelar**, que fecha o QR Code

**Detalhe importante:** o WhatsApp invalida o QR Code a cada ~20 segundos.
A tela precisa buscar um novo nesse intervalo enquanto não conectar, e
verificar o status em paralelo (a cada ~5s) para fechar sozinha quando
conectar. Limitar a um número máximo de tentativas (~12, uns 4 minutos) e
parar os timers ao sair da tela de configurações — senão continuam chamando
a Z-API em segundo plano indefinidamente.

## 4. Mostrar de qual número é cada lead no quadro

Cada lead já tem `whatsappId` (definido em `src/db/store.js`), mas isso não
aparece na interface.

- No cartão de cada lead no quadro, exibir uma etiqueta com o **apelido** do
  número responsável (não o id). Estilo discreto: fonte pequena, monoespaçada,
  em pílula com a cor laranja do tema.
- Adicionar um `<select>` na barra de ferramentas do quadro para filtrar por
  número, com a opção "Todos os números".
- O filtro deve ficar **escondido** quando houver um número ou nenhum — não
  serve para nada nesse caso.
- Os apelidos vêm de `GET /api/config`. Buscar uma vez e guardar em cache;
  atualizar quando a configuração for salva, para que renomear um número
  reflita no quadro sem recarregar a página.
- Preservar a seleção do filtro quando o quadro se auto-atualiza (ele
  recarrega sozinho a cada 30s).
- Se o `whatsappId` não bater com nenhum número cadastrado (número removido
  depois), mostrar algo como "Número removido" em vez de quebrar.

---

## Ao finalizar

- Conferir que `node --check` passa em todos os arquivos de `src/`
- Conferir que todo `getElementById` do `app.js` tem um `id` correspondente
  no `index.html`
- Commit e push
