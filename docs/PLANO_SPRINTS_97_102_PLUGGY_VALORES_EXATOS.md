# Plano — Sprints 97 a 102: valores devidos e recebidos iguais aos do Meu Pluggy

Objetivo: todo número de dinheiro que o Celsus mostra para uma conexão Open Finance (saldo da conta, limite usado e
disponível do cartão, total e situação de cada fatura, fatura atual, parcelas futuras, pagamentos agendados, entradas e
saídas do mês) tem que bater **ao centavo** com o que a Pluggy entrega para o Meu Pluggy. Quando não bater, o app
precisa dizer quanto difere e por quê.

Continua a numeração de `docs/PLANO_SPRINTS_90_91_PLUGGY_PROVENTOS_CLASSIFICACAO.md` e da Sprint 92: diagnósticos
D26–D47 e regras R23–R37. Prompts de execução: `docs/PROMPTS_SPRINTS_97_102.md` (fora do git).

**O Apêndice A deste arquivo é o contrato da API Pluggy consolidado em 17/11/2026 pelo MCP `pluggy-docs`** (guias,
OpenAPI, Q&A do suporte e changelog até out/2026). As sprints devem usá-lo como fonte. Só consulte o MCP se o
apêndice não cobrir a dúvida; se fizer isso, acrescente a resposta ao apêndice no mesmo commit.

---

## 1. Como o app calcula hoje (17/11/2026, depois da Sprint 96)

| Valor exibido | Origem hoje | Arquivo |
| --- | --- | --- |
| Saldo de conta corrente Open Finance | `account.balance` da Pluggy (`reported_balance_cents`) | `domain/financeFlow/index.ts` `resolveAccountBalance` |
| Fatura atual do cartão | soma dos lançamentos com `bill_month` = mês calculado por `resolveBillMonth(hoje, closing_day ?? 1, due_day)` | `screens/finance/AccountsScreen.tsx:285-320`, `domain/financeFlow/cards.ts` `summarizeBill` |
| Total de cada fatura | soma dos lançamentos do `bill_month` (despesas − estornos) | `summarizeBill` |
| Pago da fatura | soma dos `transfer_in` pagos do `bill_month` | `summarizeBill` |
| Limite disponível | `credit_limit_cents − Σ openCents` calculado | `cards.ts` `availableLimit` |
| `bill_month` de um lançamento de cartão | `billId` → `bill.dueDate` (se a fatura veio); senão `resolveBillMonth(data, closingDay, dueDay)` com padrão 1/10 | `domain/openFinance/index.ts` `mapPluggyTransaction` + `normalizeCardEntry` |
| Faturas da Pluggy (`/bills`) | gravadas em `fin_bills` (total, vencimento, fechamento, mínimo) e **nunca lidas por nenhuma tela** | `pluggySyncService.ts:272-287`, `finRepository.upsertBill` |
| Identidade do lançamento | `external_id = tx.id` da Pluggy (ou `id:data:valor` no Banrisul) | `deduplicatePluggyAccountTransactions` |
| Remoção | `tx.id` que sumiu da janela de 40 dias ⇒ soft delete (pendente) ou `of_removed_at` (pago) | `detectRemovedOpenFinanceEntries` |

## 2. Diagnóstico

Números do export anonimizado de 17/11/2026 (`docs/json.json`, três conexões Meu Pluggy).

**D26 — "Pgto fatura" depende de sorte para ser pagamento.** Conexão `7ccce4de`: crédito de −2.900,13 em 06/11/2026,
descrição "Pgto fatura", categoria `05000000`. `CARD_PAYMENT_DESCRIPTION_RE` (`classification.ts`) exige `pag…`, e
"pgto" não casa. No aparelho ele aparece como pagamento (provavelmente pelo pareamento com o débito da conta), mas
na fatura errada (D39). Sem esse par, viraria `income` (estorno). O `operationType` (`PAGAMENTO_FATURA`), que resolve
isso, não é lido.

**D27 — O total da fatura fechada é recalculado, e não lido da Pluggy.** As duas conexões com cartão têm 16 faturas
cada em `/bills`, mas a tela soma lançamentos. Qualquer lançamento perdido, duplicado, redatado ou classificado
errado (D26) muda o total. A Pluggy entrega `bill.totalAmount`, que é o valor da fatura do banco.

**D28 — Mês da fatura chutado.** Sem `billId` (fatura aberta e parcelas futuras), o mês vem de
`resolveBillMonth` com `closing_day ?? 1`. Os cartões Open Finance não têm `balanceCloseDate` (sempre `null` em Open
Finance), então o fechamento padrão 1 vale para todos. Em uma fatura que fecha no dia 3, as compras dos dias 1–2 vão
para a fatura errada. A Pluggy entrega `billForecastDate` (mês previsto da fatura, também para pendentes e
futuras), `billPostDate` e, em cada fatura, `billClosingDate` e `dueDate`, que dão o dia de fechamento e vencimento
reais.

**D29 — Limite usado e disponível calculados.** Conexão `7ccce4de`: `creditLimit` 14.410,23, `availableCreditLimit`
3.616,21 e `balance` 10.794,02 (= limite − disponível). Conexão `0dfe1e20`: 9.700,00, 9.160,38 e 539,62. O app grava
`credit_used_cents`, mas o "disponível" da tela vem de `availableLimit(limite − Σ faturas abertas calculadas)`.

**D30 — Pagamento da fatura sem fonte confiável.** Os `payments` de cada fatura (data, valor, modo) não são gravados.
O status "paga/aberta/atrasada" depende de casar um `transfer_in` com o mês. Na conta corrente, o débito do
pagamento só vira transferência se o pareamento achar o crédito no cartão. Se não achar, vira despesa e o gasto
aparece duas vezes: a compra no cartão e o pagamento na conta.

**D31 — Identidade frágil.** A Pluggy apaga e recria transações de cartão com um id novo perto do fechamento. Isso
acontece quando muda a descrição, o valor ou a data, quando a parcela é redatada ou quando o banco some com a linha
por 1 a 3 dias. Ao reconectar, todos os ids mudam. O app só usa `tx.id` e não grava `providerId` (o id do banco,
estável em Open Finance). Uma linha recriada fora da janela de 40 dias, ou depois de uma reconexão, vira duplicata.
Uma linha que reaparece fica marcada como removida para sempre.

**D32 — Remoção mesmo quando a sincronização foi parcial.** Com `executionStatus = PARTIAL_SUCCESS` e
`statusDetail.transactions.isUpdated = false` (ou `creditCards`), a lista pode vir incompleta, e
`detectRemovedOpenFinanceEntries` marca como removidas linhas que continuam no banco.

**D33 — Encargos e operações de crédito do cartão.** `financeCharges` traz linhas informativas e agregadas (ex.:
"Saldo em atraso", "Juros de dívida encerrada"), e juros/IOF/tarifas também aparecem como transações. Parcelamento
de fatura e rotativo (`otherCreditsType` `BILL_INSTALLMENT`/`REVOLVING_CREDIT`) chegam como débitos do cartão e hoje
entram como despesa de novo, embora o consumo já tenha sido contado no mês da compra.

**D34 — Pendentes da conta corrente misturados.** `PENDING` com data no futuro é pagamento agendado (a pagar ou a
receber). `PENDING` com data passada é valor bloqueado ou em processamento. Os dois entram como `pending` comuns. O
agendado precisa aparecer em "A vencer" sem mexer no saldo. O bloqueado fica fora do saldo disponível e dentro do
`closingBalance`.

**D35 — Data em UTC.** `date` vem em ISO UTC. O app faz `slice(0,10)`. Datas `T00:00:00.000Z` são datas puras e estão
certas, mas timestamps com hora (ex.: `2026-11-15T01:30:00.000Z` = 14/11 22:30 em Brasília) caem no dia (e às vezes
no mês) errado.

**D36 — Sem "foto" da Pluggy para conferir.** O app não guarda `item.lastUpdatedAt` (quando o Meu Pluggy atualizou) e
não tem como comparar os números dele com os da Pluggy. O export (`pluggyDiagnosticsService`) não traz os campos de
fatura (`billId`, `billForecastDate`, `billPostDate`, `operationType`, `providerId`) nem os `payments` das faturas.

**D37 — Diferença de sinal não verificada.** O app decide entrada/saída só pelo sinal de `amount`. A Pluggy também
entrega `type` (`CREDIT`/`DEBIT`), já normalizado no cartão (compra = `DEBIT`, pagamento = `CREDIT`). Divergências
entre sinal e `type` passam despercebidas.

### 2.1 Confirmado no aparelho (17/11/2026 17:31, via adb)

Telas do Celsus comparadas com os números crus da Pluggy (`docs/json.json`). O Meu Pluggy web estava deslogado no
celular, então a comparação com a tela dele fica para o checklist da Sprint 102.

| Tela do Celsus | Celsus mostra | Pluggy entrega | Diagnóstico |
| --- | --- | --- | --- |
| Resumo → Atrasadas | R$ 7.496,42 em 11 "contas": faturas Nubank/XP de dez/2025 a ago/2026 ("Venceu 09/12", "10/12", "10/01"…) | faturas antigas (`/bills`) com `payments` | **D38** |
| Cartão XP → fatura nov/2026 | total R$ 2.900,13, **pago R$ 3.139,25** (maior que o total), "Paga" | pagamento "Pgto fatura" 2.900,13 em 06/11 | **D39** |
| Cartão XP → fatura dez/2026 | total R$ 920,96, **pago R$ 2.900,13**, "Paga" (a fatura ainda nem fechou) | o pagamento de 06/11 é da fatura que venceu em 10/11 | **D39** |
| Cartão XP → resumo | "Datas estimadas (fecha dia 1, vence dia 10)" | 16 faturas com `dueDate`/`billClosingDate` | D28 |
| Contas → Nubank Platinum ·· 8926 | Limite disp. **R$ 7.120,22** | `availableCreditLimit` **9.160,38** | D29 / **D40** |
| Contas → Cartão XP Visa Infinite ·· 8297 | Limite disp. **R$ 8.886,32** | `availableCreditLimit` **3.616,21** | D29 / **D40** |
| Contas → Cartão XP | "Dif. calculado: R$ 10.794,02"; fatura atual R$ 920,96 | `balance` (limite usado) 10.794,02 | **D41** |
| Contas e Lançamentos | dois botões "+" sobrepostos no canto inferior direito | — | **D42** |

**D38 — Fatura antiga já paga aparece como atrasada.** Antes da conexão, e sempre que o pagamento não vira
`transfer_in` do cartão no mesmo `bill_month`, `summarizeBill` acha `openCents > 0` com vencimento no passado. Ela
entra nas "Atrasadas" do Resumo. Os `payments` de `/bills` (R27) resolvem os casos com dado. Fatura fechada **sem
nenhuma fonte de pagamento** e com vencimento anterior à 1ª sincronização da conexão fica com situação `sem dados de
pagamento` e fora de "Atrasadas"/"A vencer" (R27).

**D39 — Pagamento contado na fatura errada e em duas faturas.** O pagamento de 06/11 cai em `bill_month` 2026-12 pelo
calendário estimado (fecha dia 1). A fatura de dezembro aparece "Paga" antes de fechar, e a de novembro soma outros
créditos até passar do total. Pela R27, o pagamento é ligado a uma fatura e conta uma vez só. Pagamento nunca recebe
`bill_month` pelo calendário.

**D40 — Disponível calculado diverge do banco em milhares de reais.** Confirma a D29 com números: Nubank +2.040,16 e
XP +5.270,11 a mais que o banco (o app ignora as parcelas futuras que o banco já descontou do limite).

**D41 — "Fatura atual" e "Total em aberto" misturados.** A linha do cartão mostra o limite usado (10.794,02, correto),
mas a pílula "Dif. calculado" compara esse valor com a fatura atual calculada (≈ 0) e sugere erro onde há conceitos
diferentes. Pela R28, as duas grandezas aparecem separadas, com rótulo próprio, e a pílula de diferença só compara a
mesma grandeza.

**D42 — Botão "+" duplicado** nas telas de Contas e Lançamentos (FAB da tela + FAB global). Correção visual na
Sprint 102.

### 2.2 Comparação com o Meu Pluggy (meu.pluggy.ai logado, 17/11/2026 17:38)

O Meu Pluggy é uma vitrine dos dados crus da API. **Não mostra faturas nem limite disponível por cartão.** O que
ele mostra, e o que o Celsus tem que reproduzir:

| Meu Pluggy | Valor | Fonte na API | Celsus hoje |
| --- | --- | --- | --- |
| Overview → Contas bancárias (total) | R$ 75,10 (XP R$ 60,51 · BTG R$ 14,59 · Nubank R$ 0) | Σ `balance` das contas `BANK` | ✓ R$ 75,10 (Contas → Saldo total) |
| Overview → Cartões de crédito (total) | R$ 11.333,64 · "47% utilizado" · Limite R$ 24.110,23 | Σ `balance` dos cartões; Σ `creditLimit` | ✗ não existe total; a soma 539,62 + 10.794,02 bate por cartão |
| Cartão platinum ·· 8926 | R$ 539,62 | `balance` (limite usado) | ✓ "Total em aberto" |
| Cartão XP Visa Infinite ·· 8297 | R$ 10.794,02 | `balance` | ✓ "Total em aberto" |
| Overview → Investimentos | R$ 9.098,21 (Ações 18: R$ 8.815,84 · Fundo 1: R$ 282,37) | Σ `balance` de `/investments` | R$ 9.092,39 pela cotação (D46) |
| Fluxo → Despesas futuras | **R$ 1.536,69** ("transações pendentes", por categoria: Groceries 279,55; Parking 206,66; Online Courses 161,32; Telecommunications 132,91; Services 129,65; Digital services 126,90…) | Σ \|amount\| das transações `PENDING` de saída (`DEBIT`) de todas as contas | ✗ o Resumo mostra "0 pendentes" (as pendentes do cartão nascem `paid`) |
| Fluxo → lista do mês | transações por dia com a categoria da Pluggy (em inglês), filtros Entradas/Saídas e conta | `/v2/transactions` | parcialmente (o Celsus reclassifica) |
| Conexão → contas (contagem) | Nubank conta **329** transações · XP conta ··(R$ 0) **155** · XP conta ··(R$ 60,51) **28** · BTG Investimentos 45 · BTG Banking 8 · cartão platinum 454 · Cartão XP **500** | total de transações da conta na Pluggy | Nubank **233** · XP **127** · XP **18** · BTG 45 ✓ · BTG 8 ✓ (cartões: sem contagem na tela) |
| Conexão → conta | "Reservado: R$ 0" | `bankData.reservedBalances` | não exibido (R34/Sprint 101) |

**D43 — Faltam transações antigas.** As contas com histórico longo têm menos lançamentos no Celsus: Nubank −96, XP
−28 e XP −10. As de histórico curto (BTG) batem exatamente. Causa provável: a 1ª sincronização e a R22 buscam
`dateFrom` = 12 meses (`computeSyncWindowStart`), e o Meu Pluggy guarda mais que isso. Também é possível que
lançamentos pareados, removidos ou ligados a provento não entrem na contagem da tela. A Sprint 97 mede as duas
hipóteses (contagem por ano e por `of_class_reason` no export). A Sprint 98 corrige com a R37.

**D44 — "Despesas futuras" não existe no Celsus.** O Meu Pluggy soma R$ 1.536,69 de pendentes de saída (compras do
cartão ainda não faturadas, parcelas futuras e agendados). No Celsus, toda compra de cartão nasce `paid`
(`normalizeCardEntry`), e o Resumo mostra "0 pendentes". A R23 passa a calcular `pendingOutflowCents` por conexão e
no total. A Sprint 101 o exibe no Resumo como "Despesas futuras (pendentes no banco)", separado de "A vencer"
(contas a pagar do usuário).

**D45 — Total de cartões e % de uso.** O Meu Pluggy mostra o total devido nos cartões (Σ `balance`) e o percentual do
limite total. A Sprint 99 acrescenta isso ao bloco "Cartões" da tela de Contas.

**Fluxo de Caixa (lido inteiro).** O filtro (funil) só escolhe conexões, não período.
- "Despesas R$ 39.121,45 — Transações categorizadas": total de **todo o histórico**. Só as categorias de gasto entram;
  as 8 maiores são Electronics 5.945,59, Groceries 4.397,44, Bookstore 2.904,83, Food delivery 2.815,91, Online
  shopping 2.381,21, Services 2.228,34, Shopping 1.879,18 e Gas stations 1.800,80.
- "Despesas futuras R$ 1.536,69": D44.
- Lista por mês (setas < >) agrupada por dia. Cada linha mostra descrição, conta, categoria da Pluggy (em inglês) e o
  valor com o **sinal cru da API**: débito de conta "R$ -11,99", compra de cartão "R$ 16,17" positiva, crédito
  "+R$ 2,52". Os pendentes (compras do cartão ainda não faturadas, ex.: "SHOPEE … 12/12") entram na lista do mês.
- **Não existe total de receitas nem de despesas por mês.** Por isso a conferência mensal da R23 (entradas/saídas por
  conta) compara com a API, e não com uma tela do Meu Pluggy.

**Ativos (lido inteiro).** "Carteira (19 ativos) R$ 9.098,21". Ações R$ 8.815,84 (FIIs e ações juntos) e Fundo
R$ 282,37. Cada ativo aparece com conexão, tipo, **`balance` informado pela instituição** e % da carteira. MXRF12 e
MXRF13 aparecem com R$ 0.

**D46 — Investimentos: cotação × valor da instituição.** Pelo export de 17/11, o Celsus mostra R$ 9.092,39 e o Meu
Pluggy R$ 9.098,21 (−5,82). A diferença vem da R5: o Celsus usa a cotação de mercado do dia (MXRF11 +44,59, ITUB4
−10,64, VISC11 −8,88, HGLG11 −8,16, SAPR4 +7,41…), e a instituição usa o preço da data dela (`date`). Não é erro,
mas a conferência precisa explicar: cada ativo mostra "Instituição R$ x (data) · Celsus R$ y (cotação de hh:mm)" com
o motivo "Cotação de mercado mais recente". O total "como o Meu Pluggy" (Σ `balance`) aparece ao lado do total do
Celsus.

**D47 — Quantidade do MXRF11 diverge.** O livro de transações do Celsus fecha em 625 cotas, e a Pluggy informa 637. Os
12 de diferença devem vir da conversão dos recibos MXRF13 (Sprint 96), que não entra no livro. O valor exibido usa as
637 (correto). A conferência lista ativos com `ledgerQuantity ≠ quantity` e a diferença, para não mascarar o custo
médio.


## 3. Regras novas

### R23 — Verdade da Pluggy (o que tem que bater)

Função pura `computePluggyTruth(snapshot, todayIso)` em `domain/openFinance/pluggyTruth.ts`. `snapshot` é o retorno
cru da Pluggy de uma conexão: `item`, `accounts`, `transactions` por conta e `bills` por cartão. Todo valor sai em
centavos inteiros (`toCentsDecimal`, `decimal.js`).

- **Conta bancária**
  - `availableCents = balance`
  - `ledgerCents = bankData.closingBalance` (ou `null`)
  - `autoInvestedCents = bankData.automaticallyInvestedBalance` (só exibido, nunca somado; ver A.3)
  - `overdraftUsedCents = bankData.overdraftUsedLimit`
  - `reservedCents = Σ reservedBalances[].availableAmounts[].amount` (só exibido)
  - `scheduled`: transações `PENDING` com data BRT > hoje, separadas em `toPayCents` (DEBIT) e `toReceiveCents` (CREDIT)
  - `processingCents`: `PENDING` com data BRT ≤ hoje
  - Por mês BRT (`AAAA-MM`), só `POSTED`: `inflowCents` = Σ CREDIT, `outflowCents` = Σ |DEBIT|, `count`
- **Cartão**
  - `limitCents = creditLimit`, `availableCents = availableCreditLimit`, `usedCents = balance`
  - `minimumPaymentCents`, `dueDate = balanceDueDate`
  - `closedBills[]`: uma por `bill`, com `{ billId, dueDate, closingDate, totalCents, minimumCents, chargeableChargesCents, paidCents, status }`. `paidCents` e `status` seguem a R27.
  - `openBill`: soma das transações sem `billId` atribuídas ao próximo mês de fatura (R25), despesas − créditos não-pagamento
  - `futureBills[]`: mesmo cálculo para cada mês depois do `openBill` (parcelas futuras)
  - Por mês de fatura: `itemsCents` = Σ das transações atribuídas e `itemsVsTotalDiffCents = itemsCents − totalCents` (só para fechadas)
- **Totais "como o Meu Pluggy"** (D44, D45; §2.2)
  - `bankTotalCents` = Σ `balance` das contas `BANK`
  - `cardsDebtCents` = Σ `balance` dos cartões; `cardsLimitCents` = Σ `creditLimit`
  - `cardsUsagePct` = `cardsDebtCents / cardsLimitCents`, arredondado para inteiro
  - `investmentsCents` = Σ `balance` de `/investments` com status ≠ `TOTAL_WITHDRAWAL`, e por classe
  - `pendingOutflowCents` = Σ \|amount\| das transações `PENDING` + `DEBIT` de todas as contas, e por `category`
  - `txCountByAccount` = quantidade de transações que a Pluggy devolve para cada conta (sem filtro de data)
- **Conexão**
  - `lastUpdatedAt`, `status`, `executionStatus`, `consentExpiresAt`
  - `productsNotUpdated` (produtos com `statusDetail.<p>.isUpdated === false`)
  - `warnings` (códigos de A.8)

`reconcileAppVsPluggy(truth, appNumbers)` compara com os números que as telas usam (mesmas funções das telas, nunca
recalculadas à parte) e devolve `Difference[] = { scope, key, pluggyCents, appCents, diffCents, reason }`. Igual quer
dizer `diffCents === 0`. As sprints 99–102 só terminam quando a conferência das fixtures de cada uma não tem diferença.

### R24 — Campos crus gravados (Sprint 97)

Todo lançamento e toda fatura Open Finance guarda o que veio da Pluggy, para conferir e reprocessar sem nova busca:

- `fin_entries`
  - `of_provider_id`, `of_bill_id`, `of_bill_forecast_month` (`AAAA-MM`), `of_bill_post_date`, `of_operation_type`
  - `of_raw_status` (`PENDING`/`POSTED`), `of_raw_type` (`CREDIT`/`DEBIT`)
  - `of_raw_amount_cents`: o `amount` com sinal, como veio, em centavos; `amountInAccountCurrency` quando presente
  - `of_created_at` (`createdAt` da Pluggy)
  - `of_installment_number`, `of_installment_total` (só para leitura; `installment_number`/`installment_total` continuam os do app)
- `fin_bills`
  - `payments_json` (array cru de `payments`), `payments_total_cents`
  - `finance_charges_json`, `chargeable_charges_cents` (R27)
  - `allows_installments`
- `fin_accounts`
  - `of_available_limit_cents` (`availableCreditLimit`), `of_minimum_payment_cents`, `of_balance_due_date`
  - `of_overdraft_used_cents`, `of_reserved_cents`
- `of_items`
  - `last_updated_at` (`item.lastUpdatedAt`), `next_auto_sync_at`, `status_detail_json`, `error_code`

### R25 — Mês da fatura de um lançamento de cartão (Sprint 99)

Ordem, parando na primeira que der resposta:

1. `billId` presente e a fatura existe em `/bills` ⇒ mês de `bill.dueDate`.
2. `billForecastDate` presente ⇒ `forecast + offset`, com `offset` inferido por conexão em
   `inferForecastOffset(transactions, bills)`. Nas transações que têm `billId` e `billForecastDate`, compare
   `billForecastDate` com o mês de `dueDate` e com o mês de `billClosingDate` da fatura. Se ≥ 80% casarem com o
   vencimento, `offset = 0`; com o fechamento, `offset = +1` quando o fechamento cai no mês anterior ao do vencimento.
   Com menos de 5 amostras, use `offset = 0` (a OpenAPI diz "período da fatura em que a transação será cobrada").
3. `billPostDate` presente ⇒ `resolveBillMonth(billPostDate, closingDay, dueDay)`.
4. `resolveBillMonth(data BRT, closingDay, dueDay)` com o calendário da R26.

O mês escolhido e a regra usada (`BILL_ID | FORECAST | POST_DATE | CALENDAR`) ficam no lançamento (`bill_month` e
`of_bill_month_source`). Edição manual de `bill_month` (`user_edited_fields`) prevalece.

### R26 — Calendário do cartão vindo das faturas (Sprint 99)

`deriveCardCalendar(bills)`: `dueDay` = dia de `dueDate` da fatura mais recente. `closingDay` = dia de
`billClosingDate` da mais recente que tiver esse campo. Se nenhuma tiver, use a mediana de
`dueDate − billClosingDate` das demais. Se também não houver, `closingDay = dueDay − 7` (com o mesmo clamp do
`resolveBillMonth`). O resultado grava `closing_day`/`due_day` da conta quando eles estão vazios ou foram preenchidos
pelo app (`calendar_source = 'PLUGGY_BILLS'`). Valores digitados pelo usuário não são trocados. O padrão 1/10 deixa
de valer para cartão Open Finance com pelo menos uma fatura.

### R27 — Fatura fechada: total, pagamento e situação (Sprint 99)

- `totalCents = bill.totalAmount`. Fatura com `fin_bills.external_id` sempre mostra esse total. A soma dos itens
  aparece como detalhe, e `itemsVsTotalDiffCents ≠ 0` mostra a faixa "Itens somam R$ x; fatura do banco: R$ y".
- `chargeableChargesCents` = Σ `financeCharges` cujo `type` não é `OTHER`, mais as `OTHER` cujo `additionalInfo`
  normalizado não casa com `/saldo em atraso|saldo anterior|juros de divida encerrada|total|^na$/`. Nunca criam
  lançamento (A.5).
- Pagamentos que contam para a fatura N, em ordem:
  1. `payments` da fatura **N+1** (regra da documentação: "quitada quando os pagamentos do ciclo seguinte cobrem
     `totalAmount(N)` + encargos cobráveis de N+1").
  2. Se N é a mais recente, os `payments` da própria N com `paymentDate ≥ billClosingDate(N)` (o exemplo da OpenAPI
     traz o pagamento dentro da própria fatura).
  3. Lançamentos `transfer_in` do cartão com `reason = CARD_BILL_PAYMENT` e data entre o fechamento de N e o
     fechamento de N+1.
  Use a primeira fonte que tiver algum valor e grave em `paid_source`. Um pagamento nunca conta em duas faturas
  (deduplicação por id do payment ou por valor e data ±1 dia).
- Situação (centavos, tolerância 0):
  - `paga` se `paid ≥ total + encargosCobráveis(N+1)`
  - `parcial` se `0 < paid < total`
  - `atrasada` se `paid < total` e hoje > `dueDate`
  - `fechada` se hoje ≥ fechamento e hoje ≤ vencimento
  - senão `aberta`
  - `total ≤ 0` ⇒ `sem saldo`
  - nenhuma das três fontes tem dado e `dueDate` < 1ª sincronização da conexão ⇒ `sem dados de pagamento` (D38),
    fora de "Atrasadas", "A vencer" e da previsão de caixa
- Um lançamento `CARD_BILL_PAYMENT` nunca recebe `bill_month` pelo calendário. Ele vai para a fatura **já fechada** N com
  `fechamento(N) ≤ data < fechamento(N+1)`, ou seja, a fatura que esperava pagamento naquele dia (exemplo: pagamento
  de 06/11 ⇒ fatura que fechou em ~03/11 e vence em 10/11). Se os pagamentos de N já cobrem o total, o excedente fica
  em N como "pago a mais" e não passa para outra fatura (D39).

### R28 — Cartão na tela de Contas (Sprint 99)

Para cartão Open Finance:

- "Limite usado" = `balance` (`credit_used_cents`)
- "Disponível" = `availableCreditLimit`
- "Limite" = `creditLimit`
- "Fatura atual" = `openBill` da R23
- "Próximas faturas" = Σ `futureBills`
- "Fatura fechada a pagar" = Σ (total − pago) das fechadas em `fechada`/`parcial`/`atrasada`

`availableLimit()` calculado só vale para cartão manual. A previsão de caixa (`projectCashflow`) e o
`finGoalsService` usam, por fatura, `total − pago` na data de vencimento. Na aberta e nas futuras usam a soma dos
itens.

### R29 — Créditos e débitos especiais do cartão (Sprint 100)

Ordem para crédito no cartão (`type = CREDIT` ou `amount < 0`):

1. `operationType = PAGAMENTO_FATURA` ⇒ `transfer_in`, `reason = CARD_BILL_PAYMENT`.
2. Descrição (sem acento, minúscula) casa com
   `/\b(pag(amento|to|mto)?|pgto|pgt|pagt[oa]?)\b.*\b(fatura|recebido|efetuado|realizado|cartao)\b|\bpayment received\b|^pagamento recebido$/`
   ⇒ igual ao passo 1.
3. Categoria "Credit card payment" ou `descriptionTranslated` "Pagamento de cartão de crédito" ⇒ igual ao passo 1.
4. `operationType = ESTORNO` ⇒ `income`, `reason = CARD_REFUND` (abate da fatura e do gasto da categoria original
   quando houver compra de mesmo valor nos últimos 90 dias; senão Outros recebimentos).
5. `operationType = CASHBACK` ⇒ `income`, `reason = CARD_CASHBACK`, categoria Outros recebimentos.
6. Restante ⇒ `income`, `reason = CARD_CREDIT_OTHER`.

Pagamento sintético da Pluggy ("Pagamento recebido", `PAGAMENTO_FATURA`) e pagamento informado pelo banco com o mesmo
valor em até 3 dias ⇒ fica só o do banco. O outro recebe `of_removed_at` e `reason = CARD_PAYMENT_DUPLICATE`.

Débito no cartão:

- `operationType = TARIFA` ⇒ `expense`, categoria Taxas bancárias, `reason = CARD_FEE` (`feeType` em `notes`).
- `operationType = OPERACOES_CREDITO_CONTRATADAS_CARTAO` com `otherCreditsType` `BILL_INSTALLMENT` ou
  `REVOLVING_CREDIT` ⇒ continua `expense` na fatura (entra no total), mas `reason = CARD_DEBT_ROLLOVER`, e
  `calculateMonthlySummary`, "Gasto por categoria" e orçamento ignoram (o consumo já foi contado na compra).
- `LOAN` ⇒ `expense` com categoria Empréstimos e `reason = CARD_LOAN`.

### R30 — Pagamento da fatura na conta corrente (Sprint 100)

Débito de conta classificado como pagamento de fatura (categoria "Credit card payment", descrição de A.6, ou
`paymentData.paymentMethod = BOLETO` com valor igual a `bill.totalAmount` ou a um `payment` de cartão conectado):

1. Par com `transfer_in` `CARD_BILL_PAYMENT` de cartão Open Finance de qualquer conexão: mesmo valor em centavos,
   até 5 dias ⇒ `of-cardpay-<out>-<in>`, os dois lados `transfer_*`.
2. Sem par, mas existe `payment` de fatura (de `payments_json`) do mesmo valor, até 3 dias ⇒ `transfer_out`,
   `reason = CARD_BILL_PAYMENT_BILL_MATCH`.
3. Sem nada disso ⇒ continua `expense` (cartão não conectado), `reason = CARD_BILL_PAYMENT_UNMATCHED`, e aparece na
   conferência.

Edição de `kind` pelo usuário prevalece.

### R31 — Identidade estável (Sprint 98)

Ao gravar um lançamento buscado, procure o existente nesta ordem e pare no primeiro:

1. `external_id = tx.id`.
2. Mesma conta e `of_provider_id = tx.providerId` (não nulo).
3. Impressão digital: mesma conta, mesma data BRT, mesmo `|amount|` em centavos, descrição normalizada igual e
   mesma posição entre idênticos do dia (`order`). Só entre existentes cujo `external_id` não veio nesta busca.

Achou pelo 2 ou 3 ⇒ atualiza no lugar (troca `external_id`, apaga `of_removed_at`, mantém campos editados). Não achou
⇒ cria. Linha marcada como removida que volta pelo 1, 2 ou 3 é restaurada (`of_removed_at = null`).

### R32 — Remoção só com produto atualizado (Sprint 98)

`detectRemovedOpenFinanceEntries` não roda para as contas de uma conexão quando:

- `executionStatus ∉ {SUCCESS, PARTIAL_SUCCESS}`
- `statusDetail.transactions.isUpdated === false` (contas `BANK`) ou `statusDetail.creditCards.isUpdated === false` (cartões)
- a conta não veio em `/accounts`
- a busca daquela conta falhou
- o consentimento está expirado (R35)

Nesses casos o sync registra `removalSkippedReason` em `counts_json`.

### R33 — Reconexão sem duplicar (Sprint 98)

Conexão nova (outro `itemId`) com conta cuja chave `(COMPE do transferNumber | instituição, subtype, últimos 4
dígitos de number)` bate com uma conta local Open Finance de conexão antiga (desconectada ou com consentimento
vencido) ⇒ `applyAccountLinks` sugere a mesma conta local (pré-selecionada). Os lançamentos passam pela R31. Os
`providerId` e as impressões digitais evitam duplicar o histórico. Os lançamentos antigos sem equivalente ficam como
estão.

### R37 — Histórico completo (Sprint 98)

- A 1ª sincronização de uma conexão busca **sem `dateFrom`**: `GET /v2/transactions?accountId=` pagina tudo o que a
  Pluggy tem.
- Para conexões já sincronizadas, uma migração única por conexão (app_meta `fin:of:fullhistory:s98:<itemId>`) faz a
  mesma busca. Tudo o que entra passa pela R31, então não duplica.
- Dali em diante continuam as duas passadas da R10 (`createdAtFrom` + 40 dias).
- A conferência compara, por conta, `txCountByAccount` (Pluggy) com os lançamentos `OPEN_FINANCE` da conta no Celsus,
  incluindo removidos, pareados e ligados a provento. Diferença ≠ 0 vira linha com o motivo.

### R34 — Pendentes da conta corrente (Sprint 101)

- `PENDING` e data BRT > hoje ⇒ `pending`, `reason = SCHEDULED`. Entra em "A vencer" (despesa) ou "A receber"
  (receita), na previsão de caixa na data e fora do saldo. Quando vira `POSTED` (mesmo id), passa a `paid` em
  `paid_date = data`. Agendamento cancelado some da lista e sofre soft delete (já coberto pela remoção de pendente).
- `PENDING` e data BRT ≤ hoje ⇒ `pending`, `reason = PROCESSING`. Fora de "A vencer" e "Atrasadas". A tela de conta
  mostra "Em processamento R$ x" (Σ). `closingBalance` (saldo contábil, "balance + bloqueado") aparece só como
  informação quando ≠ `balance`. A documentação não garante que ele seja igual a `balance − Σ PROCESSING`, então
  nenhuma conta deriva dele. A regra da Sprint 91 (pendente parado há mais de 40 dias) continua valendo.

### R35 — Data BRT e mês (Sprint 101; função criada na Sprint 97)

`toBrtDate(iso)`:

- `^\d{4}-\d{2}-\d{2}$` ⇒ igual.
- `T00:00:00(\.0+)?Z$` ⇒ `slice(0,10)` (data pura).
- Caso contrário ⇒ converte para UTC−3 fixo (o Brasil não tem horário de verão desde 2019) e corta.

Vale para `date`, `billPostDate`, `paymentDate`, `dueDate` e `billClosingDate`. `transactionDateTime` só serve para
exibir a hora.

### R36 — Conexão: atualização, avisos e consentimento (Sprint 102)

- Cabeçalho de cada conexão: "Dados do Meu Pluggy de dd/mm às hh:mm" (`lastUpdatedAt` em BRT) e "Próxima
  atualização dd/mm hh:mm" (`nextAutoSyncAt`, se vier). As conexões Meu Pluggy se atualizam a cada 24 h e não
  aceitam atualização manual (A.1).
- Avisos de `statusDetail.*.warnings` em pt-BR pela tabela A.8, com `providerMessage` quando vier.
- Consentimento: faltam ≤ 30 dias para `consentExpiresAt` ⇒ faixa amarela. Vencido ou `USER_AUTHORIZATION_EXPIRED`
  ⇒ faixa vermelha com o passo a passo de renovação (A.1) e nenhuma remoção/zeramento de dado local.
- Tela "Conferir com o Meu Pluggy" (`OpenFinanceReconciliationScreen`): por conexão, a lista da R23 lado a lado
  (Pluggy × Celsus), com ✓ quando `diff = 0` e a diferença com o motivo quando não. Botão "Exportar conferência"
  (texto anonimizado como o export de diagnóstico).

---

## 4. Sprints

| Sprint | Branch | Entrega | Diagnósticos / regras |
| --- | --- | --- | --- |
| 97 | `feat/sprint-97-pluggy-raw-contract` | Tipos completos da OpenAPI, campos crus gravados, `toBrtDate`, `computePluggyTruth` + `reconcileAppVsPluggy` (só leitura), export de diagnóstico v3 | D36, D37 · R23, R24, R35 (função) |
| 98 | `feat/sprint-98-pluggy-stable-identity` | Identidade por `providerId`/impressão digital, restauração, remoção só com produto atualizado, reconexão sem duplicar | D31, D32, D43 · R31, R32, R33, R37 |
| 99 | `feat/sprint-99-pluggy-card-bills` | Mês da fatura pela Pluggy, calendário pelas faturas, total/pago/situação da fatura pela Pluggy, cartão na tela de Contas e na previsão | D27, D28, D29, D30 (parte cartão), D38, D39, D40, D41, D45 · R25, R26, R27, R28 |
| 100 | `feat/sprint-100-pluggy-card-payments` | Pagamento de fatura por `operationType`/descrição, estorno, cashback, tarifas, rotativo/parcelamento, pareamento com a conta corrente | D26, D30, D33 · R29, R30 |
| 101 | `feat/sprint-101-pluggy-checking-pending` | Agendados (a pagar/a receber), em processamento, datas BRT em todo o mapeamento, entradas/saídas brutas por mês, cheque especial e saldo reservado | D34, D35, D44 · R34, R35 |
| 102 | `feat/sprint-102-pluggy-reconciliation-ui` | Cabeçalho de atualização, avisos, consentimento, tela de conferência e teste ponta a ponta com a fixture do export | D36, D42, D46, D47 · R36 |

Cada sprint parte da branch da anterior. Entre a 97 e a 98, **checkpoint do usuário**: gerar no aparelho o export de
diagnóstico v3 e salvar em `docs/json.json` (substituindo o atual). As sprints 98–102 usam esse arquivo para conferir
os números reais. Se ele não existir, as regras continuam valendo, porque as decisões dependentes de dados
(`inferForecastOffset`, fonte do pagamento) são feitas em tempo de execução.

### Critério de pronto do conjunto

Na fixture `pluggyRealSnapshot.ts` (montada na Sprint 102 a partir do export v3 anonimizado), `reconcileAppVsPluggy`
devolve zero diferenças para:

- saldo de toda conta
- limite usado e disponível de todo cartão
- total, pago e situação de toda fatura fechada
- fatura atual e futuras
- entradas e saídas brutas de todo mês dos últimos 12

E, no aparelho, os números da tela de conferência batem com o app Meu Pluggy (checklist da Sprint 102).

---

## Apêndice A — Contrato da API Pluggy (consolidado em 17/11/2026)

### A.1 Meu Pluggy (o caso do Celsus)

- O Celsus usa o conector **MeuPluggy (id 200)** como proxy: cada banco conectado em meu.pluggy.ai vira um item na
  aplicação. Uso pessoal, até 5 conexões, gratuito.
- O item MeuPluggy tem `connector.isOpenFinance = false`, mas os dados vêm das conexões Open Finance do Meu Pluggy:
  o export de 17/11 já mostra `categoryId`, parcelas datadas por fatura e 16 faturas por cartão. **A presença dos
  campos só de Open Finance (`providerId`, `billId`, `billForecastDate`, `billPostDate`, `operationType`,
  `paymentType`) tem que ser medida com o export v3 (Sprint 97), nunca presumida.** Toda regra precisa funcionar com
  e sem eles.
- Atualização automática a cada 24 h, feita pelo próprio Meu Pluggy. O item **não pode ser atualizado manualmente**
  (não chame `PATCH /items/{id}`) e `GET /v2/items` não está disponível para contas do Meu Pluggy. O `itemId` é
  guardado pelo app.
- A autorização da aplicação para ler o Meu Pluggy **dura 1 ano** e aparece em `consentExpiresAt`. Quando vence:
  - as leituras (contas, transações, faturas) voltam **vazias**;
  - o item pode continuar `UPDATED` sem erro até a próxima atualização;
  - depois disso, `status = LOGIN_ERROR`, `error.code = USER_AUTHORIZATION_EXPIRED`.
  Renovação: Dashboard Pluggy → Aplicações → a aplicação → Demo → Conectar Conta → escolher **MeuPluggy** (não o
  banco) → entrar com a conta do Meu Pluggy. Isso começa outro ano. **Depois de renovar, o itemId pode mudar.**
  Reconcilie por ids próprios (R31/R33).
- Suporte do Meu Pluggy: meu-suporte@pluggy.ai.

### A.2 Autenticação e limites

- `POST /auth { clientId, clientSecret }` ⇒ `{ apiKey }`, válida por **2 h**. Reutilize. Header `X-API-KEY`.
  - `401 CLIENT_KEYS_UNAUTHORIZED` = par errado
  - `CLIENT_DISABLED` = aplicação desligada
  - Secrets novos começam com `pluggy_sk_` e só são mostrados uma vez.
- Limites **por endpoint, por IP, por minuto**: 360 para `/auth`, `/accounts`, `/transactions`, `/investments`,
  `/investments/{id}/transactions`, `/consents` e `/items/{id}/resources`; 20 para `PATCH /items/{id}`.
  - `429` traz `RateLimit-Limit`, `RateLimit-Reset` (segundos até reabrir) e `Retry-After` (sempre 60).
  - Espere `RateLimit-Reset`.
- Erro: `{ code, message, codeDescription?, data? }`.

### A.3 Contas — `GET /accounts?itemId=&type=BANK|CREDIT` (paginado por página, `pageSize` máx. 500)

- Campos: `id`, `type` (`BANK`/`CREDIT`), `subtype` (`CHECKING_ACCOUNT`, `SAVINGS_ACCOUNT`, `CREDIT_CARD`), `number`
  (cartão: últimos 4), `name`, `marketingName`, `balance`, `currencyCode`, `owner`, `taxNumber`, `itemId`,
  `createdAt`, `updatedAt`.
- `bankData`:
  - `transferNumber` = `<COMPE>/<agência>/<conta>` (o COMPE diferencia, por exemplo, Banco XP 348 de XP CCTVM 102 no mesmo item)
  - `closingBalance` = saldo contábil = `balance` + bloqueado (`null` se o banco não informa o bloqueado; não é o saldo do dia anterior)
  - `automaticallyInvestedBalance`, `overdraftContractedLimit`, `overdraftUsedLimit`, `unarrangedOverdraftAmount`
  - `hasReservedBalance`, `reservedBalances[] { name, identification, availableAmounts[] { amount, currencyCode, remuneration? } }` (caixinhas e bloqueios judiciais)
- Saldo bancário em Open Finance:
  - `balance` = disponível.
  - No Itaú (601/618), Banco do Brasil (611/662) e Banrisul (659/660), quando `automaticallyInvestedBalance > 0`,
    ele **já é o `balance`**. Não some. Esse dinheiro não aparece em `/investments`.
  - Se `balance = 0` e `overdraftUsedLimit > 0`, `balance` vem como **−overdraftUsedLimit**.
- `creditData`:
  - `creditLimit`, `availableCreditLimit`, `minimumPayment` e `balanceDueDate` (os dois últimos geralmente só com fatura aberta)
  - `balanceCloseDate` (**sempre `null` em Open Finance**)
  - `balanceForeignCurrency`, `level`, `brand`, `brandAdditionalInfo`, `isLimitFlexible`
  - `status` (Open Finance devolve só `ACTIVE`), `holderType` (`MAIN`/`ADDITIONAL`), `additionalCards[] { number }`
  - `disaggregatedCreditLimits[] { creditLineLimitType, consolidationType, lineName (CREDITO_A_VISTA | CREDITO_PARCELADO | SAQUE_CREDITO_BRASIL | SAQUE_CREDITO_EXTERIOR | EMPRESTIMO_CARTAO_CONSIGNADO | OUTROS), usedAmount, limitAmount, availableAmount, … }`
- Saldo do cartão:
  - Em Open Finance, `balance` = **limite usado** do cartão. Nos dados reais, `creditLimit − availableCreditLimit` bate exatamente.
  - Fórmula da documentação: `creditLimit = availableCreditLimit + balance + dívida da fatura anterior`.
  - `balance` negativo = pagou a mais na fatura anterior.
- `GET /accounts/{id}/balance` (saldo em tempo real) **só funciona em conta Open Finance**. Em outras devolve erro.
  Não use com MeuPluggy, a menos que o export v3 mostre `isOpenFinance = true`.

### A.4 Transações — `GET /v2/transactions` (cursor)

- Parâmetros:
  - `accountId` (obrigatório)
  - `dateFrom` / `dateTo` (`yyyy-mm-dd`)
  - `createdAtFrom` (ISO). **Não pode ser combinado com `dateFrom`.**
  - `ids` (vírgula, máx. 500; acima disso, `400 IDS_PARAMETER_EXCEEDS_MAX_LENGTH`)
  - `after` (cursor)
- Resposta: `{ results, next }`, até 500 por página. `next` é uma query string pronta: `GET /v2/transactions{next}`.
  Pare quando `next = null`. Não existe `page`/`totalPages`.
- Para achar novas, use `createdAtFrom`, **nunca `dateFrom`**: transações chegam com data no passado (pagamento de
  fatura datado no fechamento, comerciante que liquida semanas depois). Não há filtro "mudou desde". Mudanças de
  status chegam pelo mesmo id.
- **Não envie `dateTo` = hoje**: os agendamentos têm data futura e somem.
- Campos:
  - `id`, `accountId`, `description`, `descriptionRaw`, `currencyCode`
  - `amount`; `amountInAccountCurrency` (só se a moeda for diferente)
  - `date` (ISO UTC; converter para BRT, R35)
  - `type`: `CREDIT` = entrou, `DEBIT` = saiu. No cartão já vem normalizado: compra `DEBIT`, pagamento `CREDIT`.
  - `status`: `POSTED` ou `PENDING`
  - `balance` (saldo após a transação; só em alguns conectores diretos)
  - `category`, `categoryId` (8 dígitos, 2 por nível)
  - `providerCode`
  - `providerId` (**id do banco; só Open Finance; o único id estável do lado do banco**)
  - `operationType`, `operationTypeAdditionalInfo`, `paymentData`, `creditCardMetadata`, `merchant`
  - `order` (posição entre transações do mesmo dia), `createdAt` (quando a Pluggy recebeu), `updatedAt`
- Sinal:
  - Conta: crédito positivo, débito negativo (export: DEBIT −33, CREDIT +33).
  - Cartão: **compra positiva, pagamento/crédito negativo**.
  - Use `type` como direção. O sinal é conferência (D37).
- `PENDING`:
  - No cartão: compra ainda não incluída em fatura fechada (inclusive parcelas futuras).
  - Na conta: em processamento/bloqueada, ou **pagamento agendado** com `date` no futuro. Os agendados vêm do Itaú
    601/618 e do C6 626/726, até 90 dias à frente, e outras instituições estão entrando. O agendado vira `POSTED` com
    o mesmo id ou é apagado se cancelado. Não afeta `balance`.
- `operationType`:
  - Conta: `TED`, `DOC`, `PIX`, `TRANSFERENCIA_MESMA_INSTITUICAO`, `BOLETO`, `CONVENIO_ARRECADACAO`,
    `PACOTE_TARIFA_SERVIÇOS`, `TARIFA_SERVIÇOS_AVULSOS`, `FOLHA_PAGAMENTO`, `DEPOSITO`, `SAQUE`, `CARTAO`,
    `ENCARGOS_JUROS_CHEQUE_ESPECIAL`, `RENDIMENTO_APLIC_FINANCEIRA`, `PORTABILIDADE_SALARIO`,
    `RESGATE_APLIC_FINANCEIRA`, `OPERACAO_CREDITO`, `OUTROS`.
  - Cartão: `PAGAMENTO`, `PAGAMENTO_FATURA`, `TARIFA`, `OPERACOES_CREDITO_CONTRATADAS_CARTAO`, `ESTORNO`,
    `CASHBACK`, `OUTROS`.
  - O pagamento de fatura que **a Pluggy monta a partir da fatura** quando o banco não o informa tem descrição
    "Pagamento recebido" e `operationType = PAGAMENTO_FATURA` (desde set/2026; antes vinha `null`).
- `paymentData`:
  - `payer`/`receiver` `{ name, branchNumber, accountNumber, routingNumber (COMPE), routingNumberISPB, documentNumber { type CPF|CNPJ, value } }`
  - `paymentMethod` (`PIX`, `TED`, `DOC`, `TEV`, `BOLETO`), `referenceNumber`, `receiverReferenceId`, `authenticationCode`, `reason`
  - `boletoMetadata { digitableLine, barcode, baseAmount, interestAmount, penaltyAmount, discountAmount }`: boleto **já pago**. A Pluggy não tem DDA.
- `creditCardMetadata`:
  - `installmentNumber`, `totalInstallments`
  - `totalAmount` (**só conectores diretos**; o Open Finance nunca manda o total da compra parcelada)
  - `purchaseDate`, `payeeMCC`, `cardNumber` (adicional/virtual pode diferir)
  - `billId` (Open Finance; ausente enquanto a fatura não fechou/venceu)
  - `billForecastDate` (`AAAA-MM`, mês previsto da fatura, **inclusive para pendentes e futuras**; Open Finance; só em conexões criadas depois de jul/2026)
  - `billPostDate` (`AAAA-MM-DD`, data em que o banco lançou na fatura, sem ajuste da Pluggy; `null` = ainda não lançada)
  - `paymentType`: a OpenAPI diz `SINGLE` | `INSTALLMENT`, o changelog diz `A_VISTA` | `A_PRAZO`. **Aceite os quatro.**
  - `transactionDateTime`
  - `feeType` (`ANNUAL_FEE`, `ATM_WITHDRAWAL_DOMESTIC`, `ATM_WITHDRAWAL_INTERNATIONAL`, `EMERGENCY_CREDIT_EVALUATION`, `CARD_REISSUE`, `BILL_PAYMENT_FEE`, `SMS`, `OTHER`), `feeTypeAdditionalInfo`
  - `otherCreditsType` (`REVOLVING_CREDIT`, `BILL_INSTALLMENT`, `LOAN`, `OTHER`), `otherCreditsAdditionalInfo`
  - Campos sem retroatividade: chave ausente = `null`.
- `merchant { name, businessName, cnpj, cnae, category }`.
- Identidade:
  - A Pluggy mantém o **mesmo `id`** entre sincronizações e casa por `date` + `amount` + `description` com tolerância
    quando o banco troca o próprio id. `PENDING → POSTED` chega como atualização.
  - Quando não consegue casar, apaga e cria com **id novo**, e nada liga o antigo ao novo. No cartão, a chave é o id
    do banco ou (`description`, `amount`, `date`, posição entre idênticos do dia). **Mudar descrição, valor ou data =
    transação nova.**
  - Linhas podem sumir por 1 a 3 dias (fim de semana, instabilidade) e voltar com id novo.
  - **Reconectar cria item novo e ids novos**, sem deduplicação entre itens.
  - O Banrisul pode repetir o mesmo id em transações diferentes (use id + data + valor).
- Retenção: um item apagado tem os dados apagados. Item de sandbox sem atualização por 30 dias é removido.

### A.5 Faturas — `GET /bills?accountId=` (paginado por página, padrão 500)

- Campos:
  - `id`, `dueDate`, `billClosingDate` (pode ser `null`; só em conexões criadas depois de jul/2026)
  - `totalAmount`, `totalAmountCurrencyCode`, `minimumPaymentAmount`, `allowsInstallments`
  - `financeCharges[] { id, type (LATE_PAYMENT_REMUNERATIVE_INTEREST | LATE_PAYMENT_FEE | LATE_PAYMENT_INTEREST | IOF | OTHER), amount, currencyCode, additionalInfo }`
  - `payments[] { id, valueType (FULL_PAYMENT | INSTALLMENT_PAYMENT | OTHER_PAYMENT), paymentDate, paymentMode (DEBIT_ACCOUNT | BANK_SLIP | PAYROLL_DEDUCTION | PIX | null), amount, currencyCode }`
- Toda conexão Open Finance com cartão devolve faturas. Nos conectores diretos, só Inter PF e Itaú Cartões.
- **A fatura aberta não vem** até fechar ou vencer. Antes disso, o banco só manda as transações (7 dias de
  "recentes", `PENDING`, sem `billId`). Quando a fatura aparece, as transações dela ganham `billId` e passam a
  `POSTED`. Algumas linhas (parcelas futuras) só aparecem na lista da fatura. "Vencida" = passou do vencimento, não
  tem a ver com pagamento.
- `financeCharges` é **informativo**:
  - Linhas `OTHER` como "Saldo em atraso" (saldo devedor) e "Juros de dívida encerrada" (soma de linhas de juros já
    listadas) **não são encargos**.
  - Juros, tarifas e IOF também aparecem como transações do cartão. **Nunca crie lançamentos a partir de
    `financeCharges`.**
- Quitação (documentação): `totalAmount(N) + Σ encargos cobráveis(N+1) = Σ payments(N+1)`. Exemplo:
  500,00 + 12,50 = 512,50 ⇒ janeiro quitado. O exemplo da OpenAPI traz um payment dentro da própria fatura, na data
  do vencimento. Por isso a R27 tem fallback.
- Para conferir faltas: some as transações com aquele `billId` e compare com `totalAmount`.

### A.6 Parcelas e ciclo do cartão (Open Finance)

- Conexão inicial: 12 meses. Atualizações diárias: últimos 7 dias, mais as transações de cada fatura nova.
- Bancos que lançam todas as parcelas de uma vez (padrão A): a 1ª parcela vem na data da compra, as demais na data
  da fatura em que caem (`billPostDate`). O export de 17/11 mostra isso: "Panini 5/12…12/12" datadas no dia 13 de
  cada mês até jun/2027.
- Bancos que lançam mês a mês (padrão B, o mais comum): a parcela aparece quando a fatura fecha, já com `billId`.
- Entre o fechamento e o vencimento (7–10 dias), o banco pode gerar a parcela da próxima fatura.
- BTG Pactual Investimentos (614) devolve parcelas futuras como `PENDING` na 1ª conexão. XP Banking (602) pode mostrar
  a compra parcelada inteira como uma transação sem `billId`.
- **Não existe id de grupo de parcelas.** Agrupe por `installmentNumber`, `totalInstallments`, a data da 1ª parcela e
  o comerciante.
- Transação de cartão com data no futuro não é erro.
- Limite operacional do Open Finance (por CPF, por instituição, por mês): 240 chamadas de recentes, **4 de
  histórico**, 30 de lista de faturas. Vale para a Pluggy junto ao banco. Para o Celsus, que lê da Pluggy, não muda nada.

### A.7 Item — `GET /items/{id}`

- Campos:
  - `id`, `connector { id, name, isOpenFinance, products, health { status, incidents[] } }`
  - `status` (`UPDATING`, `LOGIN_ERROR`, `OUTDATED`, `WAITING_USER_INPUT`, `UPDATED`)
  - `executionStatus`:
    - finais de sucesso: `SUCCESS`, `PARTIAL_SUCCESS`
    - de erro: `ERROR`, `MERGE_ERROR`, `INVALID_CREDENTIALS`, `ALREADY_LOGGED_IN`, `SITE_NOT_AVAILABLE`,
      `INVALID_CREDENTIALS_MFA`, `USER_INPUT_TIMEOUT`, `ACCOUNT_LOCKED`, `ACCOUNT_NEEDS_ACTION`,
      `USER_NOT_SUPPORTED`, `ACCOUNT_CREDENTIALS_RESET`, `CONNECTION_ERROR`, `USER_AUTHORIZATION_NOT_GRANTED`,
      `USER_AUTHORIZATION_REVOKED`
    - intermediários: `WAITING_USER_INPUT`, `USER_AUTHORIZATION_PENDING`
    - em andamento: `CREATED`, `LOGIN_IN_PROGRESS`, `…_IN_PROGRESS`, `MERGING`
  - `error { code, message, providerMessage }`
  - `lastUpdatedAt` (última sincronização), `nextAutoSyncAt`, `consentExpiresAt`
  - `statusDetail { accounts, creditCards, transactions, investments, investmentsTransactions, identity, paymentData, loans }`: cada um `{ isUpdated, lastUpdatedAt, warnings[] { code, message, providerMessage } }`. Presente em `PARTIAL_SUCCESS` ou com avisos.
  - `products`, `resourcesCollectedAt`, `hasResourcesPendingAuthorization`
- `PARTIAL_SUCCESS`: `statusDetail.<produto>.isUpdated = false` diz qual produto não veio. `executionStatus` e
  `statusDetail` sempre concordam.
- Consentimento vencido ou revogado (`USER_AUTHORIZATION_REVOKED`) ⇒ endpoints de dados vazios.

### A.8 Avisos (`statusDetail.<produto>.warnings[].code`) — textos pt-BR para a R36

| Código | Mensagem no app |
| --- | --- |
| `ACCT_001` | Você não autorizou o compartilhamento de contas. |
| `ACCT_002` | Uma conta está aguardando autorização no banco. |
| `ACCT_003` | Uma conta está temporariamente indisponível no banco. |
| `ACCT_004` | Uma conta está indisponível no banco. |
| `ACCT_005` | Limites do cheque especial não autorizados. |
| `ACCT_006` | Mais de 260 contas; só as 260 primeiras foram lidas. |
| `CC_001` | Você não autorizou o compartilhamento de cartões. |
| `CC_002` | Um cartão está aguardando autorização no banco. |
| `CC_003` | Um cartão está temporariamente indisponível. |
| `CC_004` | Um cartão está indisponível. |
| `CC_005` | Faturas do cartão não autorizadas. |
| `CC_006` | Transações do cartão não autorizadas. |
| `CC_007` | O banco não informa o limite deste cartão. |
| `TXN_001` | Transações da conta não autorizadas. |
| `TXN_002` | Nenhuma conta disponível para ler transações. |
| `TXN_003`, `TXN_006` | Limite de consultas do banco atingido; transações podem estar incompletas. |
| `TXN_004` | Contas não autorizadas; transações não lidas. |
| `TXN_005` | Erro ao ler contas; transações não lidas. |
| `INV_001`…`INV_005` | Investimentos: não autorizado / aguardando autorização / não suportado / limite mensal atingido / tipo não suportado. |
| `LOAN_*`, `ID_*` | Empréstimos / identidade (só exibir a mensagem). |
| outro código | Mostrar `providerMessage ?? message`. |

### A.9 Categorias

- `GET /categories` ⇒ `{ id, description, descriptionTranslated, parentId, parentDescription }`. Árvore de 8
  dígitos, 2 por nível.
- Ids confirmados nos dados reais:
  - `05000000` Transfers, `05070000` Transfer - PIX
  - `04000000` Same person transfer
  - `03000000` Investments (`0306*` = proventos)
  - `07000000` Services, `07010000` Telecommunications, `07010001` Internet, `07020001` Online Courses
  - `08010000` Online shopping
  - `10000000` Groceries
  - `11010000` Eating out, `11020000` Food delivery
  - `18020000` Pharmacy
  - `19050001` Gas stations, `19050002` Parking
- "Pagamento com cartão de crédito" (`Credit card payment`) fica em Transfers. **O id não aparece na documentação.**
  O export v3 registra o mapa `categoryId → category` visto. Até lá, compare pelo nome.
- Sem o recurso de categorização (premium depois do teste), `category` vem `null`.

### A.10 Fora do escopo do Celsus

Webhooks (o app não tem servidor: usa as duas passadas da R10 e as regras acima), Pluggy Connect/connect token,
pagamentos, Pix Automático, boleto, Smart Transfers, SCR, Insights e Enrichment API.
