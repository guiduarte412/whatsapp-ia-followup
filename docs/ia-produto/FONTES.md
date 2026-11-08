# Registro de fontes

Consulta feita em **08/11/2026** pelo Claude Code. "Verificado" quer dizer que o texto citado foi lido na fonte primária nesta data. "Secundária" quer dizer que a informação veio de comentário, notícia ou resumo e **ainda precisa ser conferida no original**.

## Consórcio: regra geral

| ID | Fonte | URL | Publicação / vigência | Situação | Uso |
|---|---|---|---|---|---|
| S-01 | Lei nº 11.795, de 8/10/2008 (Sistema de Consórcio) | https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2008/lei/l11795.htm | 2008, vigente | **Verificado**: arts. 2º, 5º §3º, 12, 18, 19, 22 §§1º e 3º, 27, 30 | Definição, contemplação, taxa de administração, uso do crédito, restituição |
| S-02 | Resolução BCB nº 285, de 19/1/2023 (constituição e funcionamento de grupos) | https://normativos.bcb.gov.br (buscar "Resolução BCB 285") | Vigência adiada para 1º/7/2024 | **Secundária**: Mattos Filho, ABAC, Voto BCB 188/2023. Texto oficial não lido nesta consulta | Regras operacionais dos grupos; revogou a Circular 3.432/2009 |
| S-03 | Resolução BCB nº 362, de 14/12/2023 (adiamento da 285) | normativos.bcb.gov.br | 2023 | **Secundária**. Há também menção a uma "Resolução BCB 216/2023", não conciliada (**CONFLITANTE**) | Vigência da 285 |
| S-04 | Resolução BCB nº 381, de 15/5/2024 (medidas para grupos anteriores) | normativos.bcb.gov.br | 2024 | **Secundária** | Transição |
| S-05 | Circular BCB nº 3.432/2009 | https://www.bcb.gov.br/pre/normativos/circ/2009/pdf/circ_3432_v3_p.pdf | **Revogada** (a partir de 1º/7/2024, pela 285) | Só histórico | Não usar como regra atual |
| S-06 | BCB, Panorama do Sistema de Consórcios, data-base dez/2024 | https://aprendervalor.bcb.gov.br/content/estabilidadefinanceira/panoramaconsorcio/panorama_de_consorcios_2024.pdf | 2025 (data-base 2024) | **Secundária** (números lidos em resumo de busca) | Estatística do setor: taxa média de 18,35% nos grupos novos; 78,3% das contemplações por lance. **Nunca usar como estimativa de caso** |
| S-07 | BCB, Glossário Simplificado de Termos Financeiros | https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf | sem data conferida | Secundária | Linguagem simples para explicar consórcio, contemplação e lance |
| S-08 | Consulta de instituições autorizadas pelo BCB | portal do BCB ("Encontre uma instituição") | — | **Não verificado** | Confirmar que a administradora é autorizada |

## Condições comerciais

| ID | Fonte | Situação |
|---|---|---|
| C-01 | Regulamento / contrato de adesão / tabela vigente da administradora | **PENDENTE: nenhum documento no projeto.** Sem ele, nenhuma taxa, parcela, prazo, grupo, crédito ou linha de produto pode ser tratada como confirmada |

## WhatsApp

| ID | Fonte | URL | Data | Situação | Pontos |
|---|---|---|---|---|---|
| W-01 | WhatsApp Business Messaging Policy | https://whatsappbusiness.com/policy/ | "Last updated: September 23, 2026" | **Verificado** | Opt-in obrigatório, com nome da empresa; respeitar opt-out dentro e fora do WhatsApp; automação permitida na janela de 24 h **com caminho de escalonamento para humano**; proibido pedir número completo de cartão, conta financeira e documento de identificação; proibido repassar dado de um cliente a outro |
| W-02 | Meta for Developers, "Get opt-in for WhatsApp" | https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in | sem data conferida | Secundária | O opt-in pode ser geral (não específico do WhatsApp), desde que cumpra a lei local |
| W-03 | FAQ do WhatsApp, "Uso não autorizado de mensagens automáticas ou em massa" | https://faq.whatsapp.com/5957850900902049 | sem data; cita 7/12/2019 | **Verificado** | Produtos "não foram projetados para o envio de mensagens automáticas ou em massa"; isso viola os Termos; possibilidade de ação judicial |
| W-04 | FAQ do WhatsApp, "Sobre apps não oficiais" | https://faq.whatsapp.com/1217634902127718 | sem data | Secundária | Vincular a conta a versão não oficial viola os Termos e pode levar a banimento |

**Atenção:** o projeto usa a Z-API, uma integração não oficial (descrição do próprio Guilherme). W-01 é a referência de boas práticas, mas formalmente ela se aplica à plataforma oficial (WhatsApp Business Platform). W-03 e W-04 indicam que automação por cliente não oficial já é, por si, contrária aos Termos do WhatsApp. É risco de plataforma e decisão de negócio `[PENDENTE]`; veja o README.

## Proteção de dados e consumidor

| ID | Fonte | URL | Situação | Pontos |
|---|---|---|---|---|
| L-01 | LGPD, Lei nº 13.709/2018 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm | **Verificado** (arts. 5º II, 6º, 7º I e IX, 8º §§2º e 5º, 11, 15, 16, 18 VI e IX) | Finalidade e necessidade; consentimento ou legítimo interesse; ônus da prova do consentimento é do controlador; eliminação ao fim do tratamento; direito de revogar e pedir eliminação |
| L-02 | Código de Defesa do Consumidor, Lei nº 8.078/1990, arts. 37 e 39 | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm | **Não verificado nesta consulta** (citado no comentário de `claude.js:100-104`) | Publicidade enganosa; práticas abusivas |
| L-03 | ANPD, guia sobre legítimo interesse | site da ANPD | **Não verificado** | Necessário se a base legal do contato não for consentimento |

## Velocidade de resposta

Veja `HORARIOS-E-CADENCIA.md`, seção 4: canal, população, data e limites de cada estudo.

| ID | Fonte | Situação |
|---|---|---|
| V-01 | Oldroyd, McElheran, Elkington, HBR 89(3), mar/2011, registro em https://scholarsarchive.byu.edu/facpub/9711 | Bibliografia verificada; números só por fonte secundária |
| V-02 | Lead Response Management Study (InsideSales.com) | Secundária, patrocinada por fornecedor |
| V-03 | Entagl, Response Velocity Study 2026, https://www.entagl.com/blog/response-velocity-study-2026 | Fornecedor, observacional, metodologia não publicada |
