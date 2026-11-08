# Memória da IA: por lead e base geral

Versão 0.1, rascunho de 08/11/2026. Mesmos selos de `REGRAS-DA-IA.md`: `[NO-RUNTIME]`, `[PROPOSTA]`, `[PENDENTE]`, `[CONFLITO]`.

São **quatro camadas diferentes**, e cada uma tem dono e lugar próprios:

| Camada | O que é | Onde fica | Quem altera |
|---|---|---|---|
| Fatos estáveis do projeto | Como o código funciona, como testar, convenções | `CLAUDE.md` | Claude Code, com revisão |
| Procedimentos do Claude Code | Como pesquisar, escrever falas, analisar | `.claude/skills/*/SKILL.md` | Claude Code, com revisão |
| Conhecimento comercial aprovado | O que a IA de produção pode afirmar sobre o produto | Hoje: `claude.js` + Configurações. Proposta: `docs/ia-produto/conhecimento/aprovado/` conectado ao runtime | **Só o Guilherme aprova** |
| Memória de cada lead | O que aquele lead disse e o estado do atendimento | `db.json`, chave = telefone | O sistema, automaticamente, de forma mínima |

Skills e `CLAUDE.md` **não chegam ao bot**. O bot só enxerga o que `responderConversa` monta no prompt.

---

## 1. Memória por lead

### Como é hoje `[NO-RUNTIME]`

- Registro em `db.json > leads[telefone]` (`src/db/store.js`).
- O prompt recebe:
  - o nome do lead;
  - as **últimas 20 mensagens** daquele telefone (`claude.js:331-333`);
  - as regras e a identidade da configuração.
- Qualificação estruturada: `bem`, `prazo`, `aceitaIncerteza` (`claude.js:391-409`). Ela é mesclada campo a campo sem apagar o que já existia (`whatsapp-webhook.js`, `mesclarQualificacao`).
- **Não existe resumo por lead.** Em conversa longa, o que saiu das últimas 20 mensagens some para a IA. A qualificação é o único resíduo.
- **A qualificação não volta para o prompt.** Ela é gravada e vai no aviso ao Guilherme, mas `responderConversa` não a recebe.

### Proposta `[PROPOSTA]`

Acrescentar ao lead um bloco `memoria`, montado pelo **código**, não pelo modelo:

```json
"memoria": {
  "resumo": "Quer trocar a plantadeira para a próxima safra. Prefere ligação à tarde.",
  "resumoAtualizadoEm": "2026-11-08T14:02:00Z",
  "resumoBaseadoAteMensagem": 14,
  "qualificacao": { "bem": "plantadeira", "prazo": "próxima safra", "aceitaIncerteza": null },
  "preferencias": { "canal": "ligacao", "periodo": "tarde" },
  "pendencias": ["perguntou sobre lance; encaminhar"],
  "versaoBase": "base-2026-11-v1"
}
```

Regras do resumo:
- No máximo cerca de 400 caracteres, **só fatos ditos pelo lead** ou decisões do atendimento. Nunca dedução ("parece ter dinheiro").
- Gerado só quando a conversa passar de 20 mensagens. Se for gerado por IA, isso é uma chamada a mais, com custo; é decisão `[PENDENTE]`. Alternativa sem custo: usar só a qualificação estruturada, devolvida ao prompt.
- Proibido no resumo: CPF, renda, dívida, saúde, religião, política, números de documento ou conta.
- O resumo entra no prompt marcado como "o que este lead já te disse".

Dados estruturados necessários (mínimos):

| Campo | Para quê | Situação |
|---|---|---|
| `phone`, `nome` | Identificar | Existe |
| `status`, `motivoEncerramento` | Estado | Existe |
| `conversa[]` com `timestamp` | Histórico e métricas | Existe |
| `enviosEm[]` | Horário de envio | Existe |
| `qualificacao` | Qualificar | Existe (não volta ao prompt) |
| `autorizacao` | Provar que pode contatar | **Não existe**. Veja `HORARIOS-E-CADENCIA.md` |
| `origem` | Responder "de onde veio meu número" e analisar | **Não existe** |
| `fusoHorario` / `uf` | Respeitar horário local | **Não existe** (fuso fixo `America/Sao_Paulo`) |
| `resultadoPosAtendimento` | Saber se o handoff virou ligação ou venda | **Não existe** |
| `bracoExperimento` | Teste de horário | **Não existe** |

### Proteção contra mistura de conversas

`[NO-RUNTIME]`:
- O prompt é montado só com `leads[telefone].conversa`. Não há busca semântica nem memória global entre leads.
- A tela `?resumo=1` não envia as conversas.

Riscos e salvaguardas:

1. **Variante do 9º dígito** (`store.variantesTelefoneBR`): um número de 8 dígitos depois do DDD é tratado como o mesmo celular com o 9. Se dois leads diferentes existirem nas duas formas, o webhook escolhe o primeiro encontrado. `[PROPOSTA]`: na importação, recusar ou avisar quando as duas variantes já existirem como leads distintos.
2. **Teste de isolamento fraco:** `testes/prompt.js:109-127` não tem outro lead no banco, então passa por construção. `[PROPOSTA]`: criar um teste com dois leads reais no banco temporário. A mensagem de A chega pelo webhook; o teste confere que o prompt enviado à Claude falsa não contém nenhum texto de B.
3. **Resumo e qualificação:** sempre gravados e lidos pela chave do lead que gerou a mensagem, nunca por nome.
4. **Avisos ao Guilherme:** levam dados de um lead só. Nunca agregar vários leads numa mensagem de WhatsApp.
5. **Logs:** `whatsapp-webhook.js` grava o **payload bruto** no log do Railway (`console.log('Webhook WhatsApp recebido:' ...)`). Isso coloca telefone e texto do lead nos logs. `[PROPOSTA]`: registrar só o tipo do evento, um hash do telefone e o tamanho do texto.

## 2. Base geral de conhecimento

### Hoje `[NO-RUNTIME]`

O conhecimento do produto está espalhado em três lugares:
- `blocoLinhasDoProduto` e `blocoRegrasDuras` em `claude.js` (fixos no código);
- `identidade.contexto` e `regras[]` nas Configurações (editáveis);
- mensagens de abertura nas Configurações.

Não há versão nem registro de qual conteúdo estava valendo quando cada resposta foi dada.

### Proposta `[PROPOSTA]`

```
docs/ia-produto/conhecimento/
  aprovado/
    base-AAAA-MM-vN.md     ← única fonte que o runtime pode carregar
    CHANGELOG.md           ← o que mudou, quando, quem aprovou
  (rascunhos ficam em docs/ia-produto/rascunhos/)
```

Cada item da base aprovada tem:
- texto exato que a IA pode usar;
- tipo (regra geral ou condição da administradora X);
- fonte e data;
- validade ("revisar até AAAA-MM-DD");
- versão.

Conexão ao runtime, para implementar depois:
- carregar a base aprovada no início do processo;
- incluir no prompt como "o que você pode afirmar";
- gravar `versaoBase` em cada mensagem `de: 'ia'`;
- teste garantindo que nada fora da base aprovada com tipo "condição comercial" aparece no prompt.

Condições comerciais (taxa, prazo, parcela, grupo) **nunca entram na base** sem documento atual da administradora. Mesmo com documento, a regra "não informar valor por mensagem" continua valendo. A base serve para a IA saber o que **não** dizer e o que confirmar na ligação.

## 3. Retenção

Todos os prazos são `[PENDENTE]`: decisão do Guilherme, idealmente com orientação jurídica. A LGPD exige que o tratamento termine quando a finalidade for alcançada e que os dados sejam eliminados depois, com exceções (Lei 13.709/2018, arts. 15 e 16). Proposta inicial:

| Dado | Proposta de retenção |
|---|---|
| Conversa e qualificação de lead que não respondeu | Apagar X meses depois da última tentativa |
| Conversa de lead encerrado sem interesse | Apagar X meses depois do encerramento |
| Conversa de lead que virou cliente | Enquanto houver relação. Depois, conforme a obrigação legal aplicável |
| Lista de bloqueados (opt-out) | Manter enquanto o sistema existir, **só com telefone, data e origem do pedido**: é o que garante não recontatar |
| Backups exportados | Mesmo prazo do dado original. Não guardar em pasta sincronizada pública |
| Logs do Railway | Configurar a retenção mínima e parar de logar payload bruto |

`[PROPOSTA]` de código: rotina de expurgo que apaga `conversa` e `memoria` dos leads vencidos e mantém só os contadores agregados para métrica.

## 4. Fluxo de revisão de novos conhecimentos

1. **Coleta:** a rotina diária ou uma pesquisa manual (skill `pesquisa-consorcio-rural`) gera `docs/ia-produto/rascunhos/pesquisa-AAAA-MM-DD.md`.
2. **Triagem (Claude Code):** separa o que é novidade, conflito ou desatualização. Nada é aplicado.
3. **Revisão (Guilherme):** marca cada sugestão como aprovada, rejeitada ou "precisa de documento".
4. **Promoção:** o Claude Code, a pedido, cria `base-AAAA-MM-vN+1.md` com os itens aprovados e atualiza o `CHANGELOG.md`.
5. **Conexão:** mudança no runtime segue `REGRAS-DA-IA.md`, seção 7 (teste, revisão, commit).
6. **Proibido:** qualquer automação escrever direto em `aprovado/`, em `claude.js` ou no `db.json`.
