# Plano — Sprints 90 e 91: proventos por nome de fundo e classificação dos lançamentos Open Finance

Origem: diagnóstico anonimizado exportado do app em 17/11/2026, depois da Sprint 89, com três conexões MeuPluggy:
`0dfe1e20` (banco digital + cartão), `7ccce4de` (banco + corretora com MXRF11) e `619d6e17` (corretora com 15 ativos).
Continua a numeração de `docs/PLANO_SPRINTS_84_88_PLUGGY_QUALIDADE_DADOS.md`: diagnósticos D19–D25 e regras R15–R21.

## 1. O que os dados mostram

**Investimentos vêm coerentes da Pluggy.** Nenhum ativo tem `valueQtyMismatchCount > 0`. `priceFactor` é 1 nos ativos
ativos e 0 nos resgatados (MXRF12/13, que o código já ignora porque só aplica o fator quando ele é > 1).
`amountOriginal` é null em todos, e o número de transações quase nunca fecha a posição. Isso é o cenário da R13:
abertura sintética com custo desconhecido. Os erros que sobram estão no app.

O export ainda não traz os números calculados pelo app (preço médio, origem do custo, valor usado, proventos por
ativo). Sem eles não dá para confirmar pelo diagnóstico se as rentabilidades já estão certas.

## 2. Diagnóstico

**D19 — Provento de FII sem ticker na descrição é descartado.** `detectBankIncomeCandidate`
(`domain/openFinance/income.ts`) só aceita o crédito quando um token da descrição é um ticker conhecido. Na conexão
`619d6e17` os créditos vêm como "RENDIMENTOS - À VISTA s/ FII VINCI SC…", "…s/ FII XP LOG C…", "…s/ FII CSHG LOG…" e
"…s/ FII TRX REAL…", ou seja, o nome do fundo e não VISC11, XPLG11, HGLG11 e TRXF11. Os quatro ficam sem provento.
Na conexão `7ccce4de` funciona ("RENDIMENTOS DE CLIENTES MXRF11 S/ 637"), e o "S/ 637" é a quantidade com direito,
igual à da posição. Esse número não é aproveitado hoje.

**D20 — Provento de recibo vai para o ativo resgatado.** "RENDIMENTOS DE CLIENTES MXRF13 S/ 168" casa com MXRF13,
que é recibo de subscrição e já está em `TOTAL_WITHDRAWAL`. O provento fica num ativo zerado em vez do MXRF11.

**D21 — Aplicação, resgate e liquidação de bolsa viram despesa e receita.** Em conta que não é cartão,
`mapPluggyTransaction` (`domain/openFinance/index.ts:373`) decide só pelo sinal. Entram como gasto ou receita:
- a varredura da conta remunerada ("APLICAÇÃO AUTOMÁTICA" −398,36 e −227,17; "RESGATE APLICAÇÃO" +2.127, +700,
  +398,36 e +224,89);
- a liquidação de compra na bolsa ("LIQ BOLSA - VISTA BRUTO" −623,09) e as taxas da B3 (EMOL, TTA, CCP);
- "OPERAÇÕES EM BOLSA … NOTA" −1.097,42, que continua PENDING desde 22/12/2025.

Todos vêm com `categoryId` 03000000 (Investments). A compra já entra no custo do ativo pelas transações de
investimento, então o gasto aparece duas vezes.

**D22 — Transferência entre contas próprias em conexões diferentes não se anula.** O pareamento
(`reconcilePluggyTransactions`, `index.ts:532`) só olha os lançamentos da conexão que está sincronizando. Os Pix
de 432,79, 227,17 e 398,85 saem de uma conexão e chegam em outra, e por isso viram despesa de um lado e receita do outro.
A categoria 04000000 (Same person transfer) indica isso, mas não é usada. Atenção: a mesma categoria 04000000 aparece,
errada, em proventos de MXRF11 de jan–abr/2026. A detecção de provento precisa vir antes.

**D23 — Recarga de conta pelo cartão conta o gasto duas vezes.** O cartão registra RENOVAPAY 10,42 (o gasto real). A
conta recebe "Valor adicionado na conta por cartão" +10 e no mesmo dia paga RENOVAPAY −10. O pareamento ignora
lançamentos da mesma conta, então sobra uma receita de 10 e uma despesa de 10 além do gasto do cartão.

**D24 — A maioria dos gastos cai em "Outros".** `PLUGGY_L1_EXPENSE_CATEGORY_MAP` (`index.ts:183`) compara o nome da
categoria inteiro. Ficam de fora "Eating out", "Food delivery", "Gas stations", "Online shopping", "Services",
"Internet", "Gyms and fitness centers", "Online Courses" e "Food and drinks". O `categoryId` hierárquico (8 dígitos,
dois por nível) não é usado.

**D25 — O diagnóstico vaza dados pessoais e não mostra o lado do app.** `sampleTransactions[].description` traz
nomes de pessoas ("PEDRO GABRIEL…", "DANILLO ARAUJO…") e números de conta ("CTA 13017707"). O export não tem o
`name` do investimento (necessário para validar a D19) nem os números calculados pelo app.

## 3. Regras novas

**R15 Provento identificado pelo nome do fundo (Sprint 90).** `detectBankIncomeCandidate` recebe os ativos conhecidos
com `{ ticker, name, status }` e mantém compatibilidade com a lista de tickers. Ordem de busca:
1. ticker na descrição (como hoje);
2. nome: o trecho depois de "s/" ou "FII" é normalizado (sem acento, maiúsculas, sem as palavras FII, FUNDO,
   INVESTIMENTO, IMOBILIARIO, RENDIMENTOS, A, VISTA, DE, CLIENTES). Cada palavra restante precisa ser prefixo de uma
   palavra do nome do ativo, na mesma ordem. Isso cobre o corte da instituição ("VINCI SC" × "VINCI SHOPPING
   CENTERS"). Também vale para a raiz do ticker ("XP LOG" × XPLG11).
3. Mais de um ativo compatível ⇒ não atribui e conta em `ambiguousIncomeCount` no diagnóstico.

Quando a descrição tiver "S/ <n>" com n inteiro, `quantity = n` e `unit_amount = valor ÷ n` (decimal.js). A
deduplicação com o INTEREST das transações de investimento continua por `findEquivalentIncome`.

**R16 Provento de recibo vai para o ativo-base (Sprint 90).** Se o ativo que casou está em `TOTAL_WITHDRAWAL` e há
um ativo ACTIVE da mesma raiz de 4 letras com sufixo 11, o provento vai para o ativo-base. A nota recebe
"recibo <ticker original>".

**R17 Movimentação de investimento na conta é transferência (Sprint 91).** Num lançamento de conta (não cartão),
`categoryId` que começa com 03 e não com 0306 vira `transfer_out` ou `transfer_in` sem par, e por isso sai de
receitas, despesas e orçamento, mas continua no saldo da conta. O mesmo vale, mesmo sem categoria, para descrições
com APLICAÇÃO AUTOMÁTICA, RESGATE APLICAÇÃO, LIQ BOLSA, OPERAÇÕES EM BOLSA e as taxas B3 (EMOL, TTA, CCP). 0306
(rendimentos e dividendos) continua receita. Lançamento PENDING de conta com mais de 40 dias (fora da janela da R10)
não entra em previsão nem em "a pagar" e aparece no diagnóstico como pendente antigo.

**R18 Transferência entre contas próprias (Sprint 91).** Ordem de classificação de um lançamento de conta:
provento (R9/R15) → investimento (R17) → conta própria → pagamento de fatura → sinal.
- Depois do sync de cada conexão roda um pareamento global entre todas as contas Open Finance. Ele usa os últimos
  40 dias, os lançamentos ainda sem par, o mesmo valor em centavos, direção oposta, contas diferentes e no máximo
  2 dias de diferença. Quando houver mais de um candidato, prefere quem tem 04 em algum lado e depois a menor
  diferença de datas.
- Lançamento com 04 que não achou par vira transferência sem par (conta própria fora do app), exceto se já virou
  provento.
- Não altera lançamento com `kind` ou `category_id` em `user_edited_fields`.

**R19 Recarga de conta pelo cartão (Sprint 91).** Crédito de conta com "adicionado na conta por cartão" (ou "recarga
… cartão") seguido, na mesma conta e em até 1 dia, de débito do mesmo valor forma um par interno
(`of-topup-<out>-<in>`), com os dois lados como transferência. O gasto real fica no cartão.

**R20 Categoria pelo `categoryId` (Sprint 91).** Classificação pelo prefixo mais longo do `categoryId`. A ordem de
prioridade é: regras do usuário, depois `categoryId`, depois o nome (mapa atual) e por fim "Outros". Mapeamento
(confirmar a árvore em `pluggy-docs`):

| Prefixo Pluggy | Categoria Celsus |
|---|---|
| 0101 Salary | cat-salario |
| 07010000 Telecommunications, 07010001 Internet, 09 Digital services | cat-assinaturas |
| 0702 Education / Online courses | cat-educacao (nova) |
| 0703 Wellness / Gyms, 18 Healthcare | cat-saude |
| 07 Services (restante) | cat-servicos (nova) |
| 08 Shopping | cat-compras (nova) |
| 10 Groceries | cat-mercado |
| 11 Food and drinks (eating out, delivery) | cat-alimentacao (nova) |
| 12 Travel, 14 Gambling, 21 Leisure | cat-lazer |
| 17 Housing | cat-moradia |
| 19 Transportation | cat-transporte |
| demais | cat-outros-despesa / cat-outros-receita |

Crédito com categoria de despesa (ex.: "Transferência Recebida" em Groceries) vira `cat-outros-receita`. As quatro
categorias novas entram no seed com migração idempotente e no backup. Lançamentos Open Finance já gravados em
"Outros", sem edição do usuário e sem regra aplicada, são recategorizados uma vez.

**R21 Diagnóstico sem dados pessoais e com o lado do app (Sprint 90).** Em `sampleTransactions[].description`:
- sequências de 4 ou mais dígitos viram "####", exceto datas e tickers;
- CPF e CNPJ são removidos;
- as palavras do nome do titular (owner das contas do item) são removidas;
- em lançamentos 04 e 05, o trecho depois de "|", " para " ou " de " vira "<contraparte>".

Por investimento, o export ganha `name` e um bloco `app` com quantidade do livro, `average_price` preenchido ou não,
`cost_basis_source`, `value_source`, valor exibido e número de proventos nos últimos 12 meses. Por conta, ganha a
contagem dos últimos 90 dias por `kind` e o percentual em "Outros".

## 4. Sprints

| Sprint | Branch (base) | Escopo | Regras | Testes |
|---|---|---|---|---|
| 90 | `feat/sprint-90-pluggy-income-names` (de `feat/sprint-89-pluggy-validation-fixes`) | Proventos por nome do fundo, quantidade "S/ n", recibo → ativo-base, diagnóstico sem PII e com o lado do app | R15, R16, R21 | S90-T01…T09 |
| 91 | `feat/sprint-91-of-entry-classification` (de `feat/sprint-90-…`) | Investimento na conta como transferência, pareamento global entre conexões, conta própria sem par, recarga pelo cartão, categorias por `categoryId` e recategorização | R17–R20 | S91-T01…T12 |

## 5. Decisões e premissas

- Transferência sem par usa os `kind` que já existem (`transfer_out` e `transfer_in`), que os totais já ignoram
  (`budgetsAndCashflow.ts:318`, `financeFlow/index.ts:431`). Não há schema novo para isso.
- Taxas B3 debitadas na conta são tratadas como movimentação de investimento, porque o custo do ativo já inclui as
  despesas das transações de investimento. Assim o gasto não é contado duas vezes.
- Investback (cashback da corretora) continua receita. A TED de saída do mesmo valor fica como está, porque não dá
  para saber se a conta de destino é do usuário.
- Categorias novas: Alimentação, Educação, Serviços e Compras. "Restaurantes" deixa de cair em Lazer.
- O saldo do cartão com parcelas futuras já é tratado pela Sprint 87 ("Total em aberto"). Fica fora daqui.

## 6. Perguntas em aberto

- Qual é o `name` que a Pluggy devolve para FIIs dessas corretoras? O diagnóstico da Sprint 90 vai mostrar. Se ele
  não ajudar, a alternativa é uma tabela de apelidos que o usuário confirma na primeira ocorrência.
- A TED de saída depois do Investback é para conta própria? Se for, uma regra do usuário resolve.
