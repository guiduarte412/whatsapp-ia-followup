# Rotina de pesquisa diária (proposta, NÃO ativada)

## O que ela faz

Uma vez por dia, o Claude Code usa a skill `pesquisa-consorcio-rural` para procurar:
- novidades nas fontes do `FONTES.md` (normas do BCB, política do WhatsApp, LGPD);
- mudanças nos documentos da administradora, quando eles existirem no projeto.

O resultado é **um único arquivo de rascunho datado**:

```
docs/ia-produto/rascunhos/pesquisa-diaria/AAAA-MM-DD.md
```

## O que ela NÃO pode fazer

- Editar `src/`, `claude.js`, `db.json`, `docs/ia-produto/conhecimento/aprovado/`, `REGRAS-DA-IA.md` ou qualquer arquivo fora da pasta de rascunhos.
- Fazer commit, push ou PR.
- Acessar produção, Railway, Z-API, o painel ou o `.env`.
- Enviar mensagem a qualquer pessoa.

Toda alteração sugerida fica no rascunho, esperando a revisão do Guilherme (veja `MEMORIA.md`, seção 4).

## Formato do relatório

```markdown
# Pesquisa diária — AAAA-MM-DD
Status: RASCUNHO para revisão. Nada foi aplicado.

## Novidades (com fonte, data de publicação e data de consulta)
## Mudanças em fontes já registradas (o que mudou, desde quando)
## Conflitos ou informação desatualizada encontrados
## Afirmações do runtime que ficaram sem lastro
## Alterações sugeridas (para o Guilherme aprovar ou rejeitar)
## Nada de novo? Dizer explicitamente "sem novidades nas fontes X, Y, Z"
```

## Como programar (quando o Guilherme aprovar)

Há dois caminhos no Claude Code. **Nenhum foi criado.**

### Opção A, recomendada: tarefa agendada local (app desktop)

Roda no PC, na pasta do projeto, e escreve o arquivo localmente. Não precisa de commit. Só roda com o PC ligado e o app aberto.

Configuração a ser criada (rascunho):

- **Nome:** `pesquisa-diaria-consorcio`
- **Quando:** dias úteis, 7h (horário de Brasília)
- **Pasta:** `C:\Users\guilh\OneDrive\Área de Trabalho\whatsapp-ia-followup`
- **Instrução:**
  > Use a skill pesquisa-consorcio-rural. Pesquise novidades desde a última pesquisa em docs/ia-produto/rascunhos/pesquisa-diaria/ nas fontes de docs/ia-produto/FONTES.md. Escreva SOMENTE o arquivo docs/ia-produto/rascunhos/pesquisa-diaria/<data de hoje>.md no formato de docs/ia-produto/ROTINA-PESQUISA-DIARIA.md. Não edite nenhum outro arquivo, não rode testes que chamem serviços pagos, não faça commit nem push, não leia .env.
- **Permissões:** busca e leitura web; escrita só nessa pasta.

### Opção B: rotina na nuvem (`/schedule`)

Roda na nuvem, a partir do repositório no GitHub. Para o relatório chegar até você, a rotina precisaria fazer commit numa branch ou abrir PR, o que contraria a regra de "sem commit" desta proposta. Só faz sentido se o Guilherme quiser receber o relatório como PR de rascunho.

## Custo

A rotina usa o plano do Claude Code do Guilherme, não a `ANTHROPIC_API_KEY` da aplicação. Pesquisa web todo dia consome uso do plano. Começar com dias úteis e, se houver poucas novidades, passar para semanal.
