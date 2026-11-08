# Base de conhecimento comercial da IA de produção

**Status: VAZIA.** Nenhum conteúdo foi aprovado ainda, e nada desta pasta é carregado pelo runtime hoje.

- `aprovado/`: só itens aprovados pelo Guilherme, versionados (`base-AAAA-MM-vN.md`) e com `CHANGELOG.md`. Ainda não existe; será criada no primeiro item aprovado.
- Rascunhos ficam em `docs/ia-produto/rascunhos/`, nunca aqui.

O conhecimento que o bot usa de fato, hoje, está em:
- `src/services/claude.js` (`blocoLinhasDoProduto`, `blocoRegrasDuras` e o prompt de `responderConversa`);
- tela de Configurações: identidade, regras e mensagens (gravadas no `db.json`).

Como conectar esta pasta ao runtime: veja `docs/ia-produto/MEMORIA.md`, seção 2.
