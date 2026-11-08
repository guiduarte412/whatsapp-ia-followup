---
name: pesquisa-consorcio-rural
description: Pesquisa sobre consórcio (e consórcio rural) com fontes oficiais, citação, datas e registro de conflito. Use quando for preciso levantar, conferir ou atualizar qualquer informação sobre consórcio para o projeto — regra legal, norma do Banco Central, dado do setor, condição de uma administradora — ou quando a rotina diária de pesquisa rodar. Produz sempre um RASCUNHO para revisão; nunca altera o prompt de produção nem a base aprovada.
---

# Pesquisa sobre consórcio rural

Esta skill orienta o **Claude Code** a pesquisar. Ela não muda nada do que a IA de produção fala com os leads. O que sai daqui é um rascunho, que só vira conhecimento da aplicação depois da revisão do Guilherme (veja `docs/ia-produto/MEMORIA.md`, seção "Fluxo de revisão").

## Regras invioláveis

1. **Nunca edite** `src/services/claude.js`, `docs/ia-produto/conhecimento/aprovado/`, nem as regras e mensagens no `db.json`. A saída vai só para `docs/ia-produto/rascunhos/`.
2. **Nunca invente número.** Taxa, parcela, prazo, grupo, crédito, lance médio, condição comercial: só com documento atual da administradora que realmente está no projeto. Sem documento, escreva `PENDENTE — sem documento da administradora no projeto`.
3. **Regra geral e condição de administradora são coisas diferentes.** Toda afirmação recebe o tipo. A lei diz o que *pode*; o contrato do grupo diz o que *vale* para aquele cliente.
4. **Dado estatístico não é promessa.** Média de taxa de administração ou percentual de contemplação por lance (Panorama do BCB) descreve o setor no passado. Ele nunca pode ser usado para estimar o caso de um lead.
5. **Toda fonte tem data.** Registre a data de publicação (ou "sem data na página"), a data de consulta e, para norma, a vigência e as alterações.
6. **Conflito não se resolve por palpite.** Se duas fontes divergem, registre as duas no quadro de conflitos e marque `CONFLITANTE`. Não escolha uma.

## Hierarquia de fontes

Use a de nível mais alto disponível. Fonte de nível 4 ou 5 só serve como pista para achar uma de nível 1 a 3.

| Nível | Fonte | Serve para |
|---|---|---|
| 1 | Lei nº 11.795/2008 (planalto.gov.br); normativos do BCB (normativos.bcb.gov.br): Resolução BCB nº 285/2023 e alterações | Regra geral do consórcio |
| 2 | Publicações do BCB: Panorama do Sistema de Consórcios, glossário de cidadania financeira, consulta de instituições autorizadas | Conceito, estatística do setor, autorização da administradora |
| 3 | Documentos **atuais** da administradora que está no projeto: regulamento do grupo, contrato de adesão, proposta, tabela vigente | Condição comercial (só para aquela oferta) |
| 4 | Associação do setor (ABAC), escritório de advocacia, órgão de defesa do consumidor | Contexto, interpretação, notícia de mudança |
| 5 | Imprensa, blog, site de vendas, IA | Só pista. Nunca é base de afirmação |

Para regras de contato e mensagens, as fontes primárias são: a política do WhatsApp Business (whatsappbusiness.com/policy), os Termos e a FAQ do WhatsApp, e a LGPD (Lei nº 13.709/2018). O ponto de partida está em `docs/ia-produto/FONTES.md`.

## Como pesquisar

1. Comece pelo registro de fontes `docs/ia-produto/FONTES.md`. Confira se a fonte já está lá e qual foi a data da última consulta.
2. Busque a fonte primária. Prefira o texto da norma ao comentário sobre ela.
3. Leia a vigência. Exemplos já encontrados:
   - a Resolução BCB 285/2023 revogou a Circular 3.432/2009, e a entrada em vigor foi adiada para 1º/7/2024 (pela Resolução BCB 362/2023, segundo fontes secundárias; falta confirmar no texto oficial);
   - normas antigas, como a Circular 2.196/1992, servem só como histórico.
4. Para cada afirmação, preencha a ficha abaixo.
5. Compare com o que o runtime fala hoje (`src/services/claude.js`, funções `blocoLinhasDoProduto` e `blocoRegrasDuras`). Toda afirmação do runtime sem fonte vai para a lista "Afirmações do runtime sem lastro".

## Formato de saída

Arquivo: `docs/ia-produto/rascunhos/pesquisa-AAAA-MM-DD.md`.

```markdown
# Pesquisa — AAAA-MM-DD
Status: RASCUNHO — não aprovado. Nada aqui está no runtime.

## Fichas
### F-001
- Afirmação: <uma frase>
- Tipo: regra geral | condição de administradora | estatística do setor | política de plataforma | proteção de dados
- Fonte: <órgão — documento, artigo/página> — <URL>
- Publicação: <data ou "sem data na página">  · Consulta: AAAA-MM-DD
- Vigência: <se norma: desde quando; alterações>
- Status: vigente | revogada | não verificada no original | CONFLITANTE | PENDENTE
- Trecho curto: "<até 15 palavras>"
- Pode ir para a base da IA? sim (texto sugerido) | não (motivo)

## Conflitos
| Assunto | Fonte A diz | Fonte B diz | O que falta para resolver |

## Desatualizado
| Onde está (arquivo/linha ou fonte) | O que mudou | Desde quando |

## Afirmações do runtime sem lastro
| Trecho do prompt | Arquivo:linha | O que precisa (documento/decisão) |

## Alterações sugeridas (rascunho para o Guilherme)
- <mudança> — motivo — fichas que sustentam
```

## O que já se sabe (consulta em 08/11/2026)

- Consórcio é a reunião de pessoas em grupo para aquisição de bens ou serviços por autofinanciamento (Lei 11.795/2008, art. 2º). O objeto pode ser "bem móvel, imóvel ou serviço de qualquer natureza" (art. 12).
- A contemplação ocorre por sorteio ou lance (art. 22, §1º).
- A administradora tem direito à taxa de administração (art. 5º, §3º). O valor é do contrato, não da lei.
- O contemplado pode usar o crédito para quitar financiamento próprio, **desde que a administradora aprove antes e o contrato preveja** (art. 22, §3º). É condição dependente; não afirme que "pode" sem esse complemento.
- O excluído não contemplado tem direito à restituição do que pagou ao fundo comum, nas condições da lei e do contrato (art. 30).
- No Panorama BCB de dez/2024, a taxa média de administração dos grupos novos foi 18,35%, e 78,3% das contemplações foram por lance. **É estatística do setor: não use como estimativa para lead nenhum.**
- Pendente: confirmar no texto oficial do BCB a Resolução 285/2023 consolidada, a data de vigência e as alterações (362/2023 e 381/2024 aparecem em fontes secundárias).
