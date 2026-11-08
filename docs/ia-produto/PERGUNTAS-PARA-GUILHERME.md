# Perguntas e decisões do Guilherme

Atualizado em 08/11/2026. Documento para revisar com calma antes de qualquer mudança no bot. **Não altera o código nem ativa os envios.**

## O que já foi informado

- **Os leads são frios:** eles ainda não iniciaram uma conversa com o Guilherme. O Guilherme informou que não quer exigir nem guardar comprovante de autorização no CRM. Isso fica registrado como preferência do produto, mas não elimina as regras do canal: a política do WhatsApp Business exige opt-in para mensagens subsequentes. A forma de operar em conformidade continua pendente de validação antes de prospecção ativa.
- **Janela de envio desejada:** de **segunda a sexta, 07:00–20:30**; **sábado, 07:00–12:00**; **domingo, sem envio**. É uma regra escolhida pelo Guilherme, não um horário que estudos tenham demonstrado ser o melhor para leads de consórcio agrícola. Como o sistema usa Brasília, o documento registra esse fuso como referência provisória.
- **Limitação técnica confirmada:** hoje a configuração aceita horas inteiras e o agendador compara a hora inteira. Portanto, 20:30 não pode ser representado corretamente sem uma alteração no código. Não arredondar silenciosamente para 20:00 ou 21:00.

## Respostas preliminares às 16 perguntas

Legenda: **DECIDIDO** = informado pelo Guilherme; **RECOMENDAÇÃO** = proposta apoiada em fonte ou em dado do projeto, ainda precisa de aprovação; **PENDENTE** = só o Guilherme pode confirmar ou fornecer evidência.

### Autorização e dados

1. **Os leads autorizaram receber mensagem?** — **DECIDIDO quanto ao CRM:** o Guilherme não quer criar campo para guardar comprovante. **PENDENTE quanto à origem e à autorização real:** ser lead frio não confirma nem nega autorização obtida por outro canal. A política do WhatsApp Business exige que a pessoa tenha fornecido o número e dado permissão para receber mensagens subsequentes; a preferência de não armazenar comprovante não remove essa exigência do canal. Não implementar uma forma de contornar a política. [Política de Mensagens do WhatsApp Business](https://whatsappbusiness.com/policy/)

2. **Consentimento ou legítimo interesse como base legal?** — **PENDENTE de avaliação jurídica.** Não escolher uma base legal por padrão. A ANPD orienta avaliar finalidade, necessidade, balanceamento e salvaguardas para legítimo interesse; isso depende do caso concreto. [Guia da ANPD sobre legítimo interesse](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-lanca-guia-orientativo-sobre-legitimo-interesse)

3. **Quais dados a IA pode perguntar?** — **RECOMENDAÇÃO:** limitar ao necessário para a conversa e para marcar a ligação: bem/equipamento de interesse, horizonte de compra, município/UF e melhor período para ligação. Não pedir CPF, documentos, extratos, renda ou dados bancários no WhatsApp. A LGPD estabelece o princípio da necessidade: limitar o tratamento ao mínimo necessário. [Lei 13.709/2018, art. 6º](https://www.gov.br/mj/pt-br/assuntos/sua-protecao/sedigi/Lei13709.pdf)

4. **Por quanto tempo guardar conversas?** — **PENDENTE.** Definir um prazo por finalidade e categoria com orientação jurídica/privacidade; não inventar um prazo universal. A ANPD informa que a LGPD não fixa um prazo único de retenção aplicável a todos os casos. [Perguntas frequentes da ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes)

### Empresa e produto

5. **Qual é o papel da FourAgro e qual administradora opera os grupos?** — **PENDENTE.** Fornecer razão social, papel comercial e nome da administradora. Não chamar a FourAgro de administradora ou representante autorizado sem comprovação. O Banco Central distingue a administradora, que promove/administra os grupos e precisa de autorização, dos demais participantes comerciais. [Banco Central: administradoras de consórcio](https://www.bcb.gov.br/estabilidadefinanceira/administradoraconsorcio)

6. **Há documentos atuais do produto para anexar?** — **PENDENTE.** Fornecer regulamento, contrato-modelo e materiais comerciais vigentes, sem dados de clientes. Usar esses documentos como fonte antes de a IA explicar uma condição específica.

7. **Quais linhas são oferecidas?** — **PENDENTE de documentação.** Não confirmar máquinas, construção/benfeitorias, fazenda, veículos/caminhões ou capital de giro até cada linha estar sustentada por documento da administradora.

8. **Existe parcela que acompanha o ciclo da safra?** — **RECOMENDAÇÃO:** retirar essa afirmação do prompt e das mensagens até haver documento vigente que prove essa condição. Não apresentar como benefício com base apenas em uma frase antiga do prompt.

### Identidade e canal

9. **Como a IA deve se apresentar?** — **RECOMENDAÇÃO para aprovação:** dizer desde a primeira mensagem que é uma assistente virtual que atende em nome do Guilherme. Não fingir ser uma pessoa humana nem dizer que é funcionária/representante da FourAgro sem confirmação do vínculo. A política do WhatsApp proíbe representar ou induzir o usuário a erro sobre a natureza da empresa/atividade. [Política de Mensagens do WhatsApp Business](https://whatsappbusiness.com/policy/)

10. **Z-API não oficial: avaliar migração?** — **RECOMENDAÇÃO:** sim, avaliar a migração para a WhatsApp Business Platform oficial antes de ampliar a operação. A política oficial descreve condições para automação e exige caminhos claros de escalonamento; as diretrizes também alertam contra clientes não oficiais e automação não autorizada. Migração não substitui opt-in nem resolve a falta de comprovação dos leads. [Política WhatsApp Business](https://whatsappbusiness.com/policy/) · [Diretrizes de Mensagens do WhatsApp](https://www.whatsapp.com/legal/messaging-guidelines)

### Horários e cadência

11. **Qual horário de envio aprovar?** — **DECIDIDO:** segunda a sexta, **07:00–20:30**; sábado, **07:00–12:00**; domingo, sem envio. O horário de Brasília fica como referência provisória porque é o fuso atual do sistema. O sistema atual só aceita hora inteira; será necessário implementar suporte a minutos para parar precisamente às 20:30. A janela é uma preferência operacional, não uma conclusão científica: as fontes consultadas não determinam o melhor horário para prospecção de consórcio agrícola. A operação ainda precisa respeitar as regras de autorização do canal.

12. **Feriados e mensagens recebidas fora da janela?** — **PENDENTE.** Decidir quais dias e feriados bloquear e se a IA responde a uma mensagem iniciada pelo lead à noite/madrugada ou apenas avisa o Guilherme. Manter separados: janela de prospecção ativa e resposta a quem iniciou conversa.

13. **Reduzir o debounce de 12 para 6 segundos?** — **NÃO APROVAR em produção ainda.** Não há estudo específico que prove que 6 segundos seja o ideal. Primeiro testar em ambiente controlado e corrigir/verificar a concorrência de mensagens iguais com IDs diferentes; depois medir latência e respostas duplicadas. A meta de tempo é operacional, não evidência de que um intervalo específico aumente vendas.

14. **Registrar o resultado após o encaminhamento?** — **RECOMENDAÇÃO:** sim. Registrar categorias mínimas, como ligação tentada, ligação realizada, reunião marcada/realizada, proposta, venda e sem avanço. Isso permite avaliar conversão e segurança sem tratar a janela como “melhor” com base em impressão. Definir também quem registra e por quanto tempo os dados ficam guardados.

### Pesquisa e memória

15. **Ativar pesquisa diária às 07h nos dias úteis?** — **RECOMENDAÇÃO:** iniciar como relatório de pesquisa, sem alterar automaticamente prompt, código ou base aprovada. Exigir fonte, data, trecho/contexto, relevância para consórcio rural e revisão humana antes de incorporar qualquer afirmação. A execução local depende do computador/agendador estar disponível; confirmar se 07h é o horário desejado para esse relatório.

16. **Resumo de IA por lead ou qualificação estruturada?** — **RECOMENDAÇÃO:** manter inicialmente só a qualificação estruturada que já existe (bem, prazo e aceitação da incerteza). Só adicionar resumo se um teste mostrar benefício claro para continuidade; avaliar custo e retenção antes. Coletar e guardar apenas o necessário, conforme o princípio da necessidade da LGPD. [Lei 13.709/2018, art. 6º](https://www.gov.br/mj/pt-br/assuntos/sua-protecao/sedigi/Lei13709.pdf)

## Respostas que faltam do Guilherme

1. Como os leads frios foram obtidos e houve opt-in para receber mensagens pelo WhatsApp? O Guilherme decidiu não guardar comprovante no CRM; ainda é preciso validar como a operação atenderá à política do canal, que exige opt-in.
2. Qual base legal foi avaliada com profissional de privacidade/jurídico?
3. Você confirma os campos mínimos sugeridos e a proibição de pedir documentos/dados financeiros pelo WhatsApp?
4. Qual prazo de retenção será aprovado após orientação jurídica?
5. Qual é o papel exato da FourAgro e qual é o nome da administradora dos grupos?
6. Quais documentos sem dados pessoais você pode fornecer para validar o produto?
7. Quais linhas de consórcio esses documentos confirmam?
8. Aprova remover a alegação sobre parcelas acompanharem o ciclo da safra até prova documental?
9. Aprova a apresentação transparente como assistente virtual do Guilherme? A FourAgro pode ser citada como empresa?
10. Aprova apenas estudar a migração da Z-API para a plataforma oficial, sem fazer a migração ainda?
11. A janela foi definida: segunda a sexta, 07:00–20:30; sábado, 07:00–12:00; domingo, sem envio. Brasília fica como referência provisória por ser o fuso atual do sistema. Confirmar se o Guilherme quer manter Brasília para todos os leads ou usar o horário local de cada lead.
12. Quais feriados bloquear? Como tratar mensagens que o lead iniciar fora da janela?
13. Autoriza primeiro um teste controlado de debounce, depois das correções de concorrência, sem ativar 6 segundos em produção agora?
14. Aprova registrar os resultados comerciais mínimos após a ligação? Quem vai atualizá-los?
15. Aprova relatório de pesquisa diário, somente informativo, em dias úteis às 07h? O computador ficará ligado/terá agendador ativo?
16. Aprova manter só qualificação estruturada por enquanto, sem resumo gerado por IA?

## Observação sobre dados de vendas

O estudo da Harvard Business Review citado na documentação trata de leads online e velocidade de resposta em um contexto geral; não determina o melhor horário nem a cadência para leads frios de consórcio agrícola no WhatsApp. Portanto, os horários escolhidos devem ser tratados como regra operacional a validar com dados próprios, nunca como resultado provado por esse estudo. [HBR: The Short Life of Online Sales Leads](https://hbr.org/2011/03/the-short-life-of-online-sales-leads)
