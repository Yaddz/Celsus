# Celsus — Plano das sprints 84 a 88: qualidade dos dados da Pluggy

Revisão de 17/11/2026 sobre a branch `feat/sprint-80-spacing-tokens` (último merge: sprint 73). Este documento é a
**fonte de verdade das sprints 84 a 88**; os prompts de execução estão em
[`PROMPTS_SPRINTS_84_88.md`](./PROMPTS_SPRINTS_84_88.md) (fora do git). Caminhos relativos a `apps/mobile/src/`.

Sintomas relatados: investimentos com **valores astronômicos**, **rentabilidades fora do padrão** e **proventos
faltando**, e problemas equivalentes em **cartões e bancos**.

Fontes consultadas: código atual, a especificação OpenAPI da Pluggy (`investments-list`,
`investment-transactions-list`, `/v2/transactions`) e o Q&A oficial de suporte da Pluggy. **Nenhum payload real foi
inspecionado** (a chave de API fica no SecureStore do aparelho). Os itens marcados _(confirmar com payload)_ dependem
de como cada instituição preenche os campos; a sprint 88 cria a ferramenta para confirmar isso com dados reais.

---

## 1. Mapa do fluxo atual

| Etapa | Arquivo | O que faz |
| :--- | :--- | :--- |
| HTTP, auth, paginação | `services/pluggy/pluggyClient.ts` | `GET` com retry 429/5xx (2 tentativas), paginação por página (investimentos, faturas) e por cursor (`/v2/transactions`) |
| Mapeamento de investimento | `domain/openFinance/investments.ts` | `mapPluggyInvestment`, `mapPluggyInvestmentTransaction`, `calculateInvestmentCostBasis`, `matchInvestmentToAsset`, `mapPluggyIncomeEvent` |
| Ticker e nomes | `domain/openFinance/naming.ts` | `buildInvestmentDisplay`, `resolveCollision`, `buildAccountName` |
| Persistência de investimento | `services/pluggy/pluggyInvestmentsSyncService.ts` | grava `assets`, BUY/SELL em `transactions` e INTEREST em `income_events` |
| Valor e rentabilidade | `services/marketSyncService.ts`, `domain/finance/portfolioHistory.ts` | investido = `quantity × average_price`; mercado = `manual_position_value` ou cotação × quantidade; histórico recalcula pelo livro de transações |
| Contas, cartões, faturas | `domain/openFinance/index.ts`, `services/pluggy/pluggySyncService.ts` | `mapPluggyAccount`, `mapPluggyTransaction`, `reconcilePluggyTransactions`, faturas via `/bills` |

---

## 2. Diagnóstico

Severidade: 🔴 causa direta dos sintomas · 🟠 distorce dados com frequência · 🟡 robustez ou precisão.

### 2.1 Investimentos: valores astronômicos e rentabilidade fora do padrão

**D1 🔴 O histórico aplica o saldo de hoje a todas as datas passadas.**
`portfolioHistory.ts:213` usa `manualPositionValue` (o `balance` atual da Pluggy) como valor de mercado **em qualquer
data** da curva, mas o investido vem do livro de transações até aquela data. Num CDB comprado em 2023 com aportes
mensais, o primeiro ponto da curva compara o saldo atual (todos os aportes mais o rendimento) com o primeiro aporte e
mostra rentabilidade de milhares de %. A curva fica sempre "rentável" no começo e converge só no fim.

**D2 🔴 O livro de transações da Pluggy não cobre a posição inteira.**
A Pluggy só devolve as movimentações que a instituição expõe (no Open Finance, em geral 12 meses). Uma posição antiga
tem o `quantity` total em `assets`, mas só parte das compras em `transactions`. O `portfolioHistory` calcula
`st.cost` e `st.qty` **somente pelo livro**: investido muito pequeno contra valor de mercado cheio, e a rentabilidade
explode. Ativo sem nenhuma transação (`st.next === 0`) **some** do histórico. `calculateInvestmentCostBasis` já detecta
o histórico incompleto (`qtyMatches === false`) e cai no `amountOriginal`, mas essa informação não chega ao livro nem
ao histórico.

**D3 🔴 Preço unitário de transação calculado com `value` sem checar a coerência.**
Em `investments.ts:236-243`, `unitPrice = tx.value` e, sem `quantity`, `quantity = 1`. A doc da Pluggy define `value`
como "valor na data da transação", que em fundos e previdência é **o valor da cota**, e `quantity` pode vir `null`
(Q&A oficial: CDB e fundos não trazem `quantity`). Uma aplicação de R$ 5.000 num fundo com cota de R$ 2,00 e
`quantity: null` vira no livro "1 × R$ 2,00". O investido cai para R$ 2,00 e o mercado continua R$ 5.000. A regra
correta é usar `amount` como fonte do total e derivar `unitPrice = amount / quantity`. Só aceitar `value` quando
`|value × quantity − amount| ≤ 1%`.

**D4 🔴 Preço médio e preço unitário arredondados em 2 casas.**
`calculateInvestmentCostBasis` (`investments.ts:330` e `:342`) e `mapPluggyInvestmentTransaction` (`:272`) gravam
`toFixed(2)`. Em fundos com centenas de milhares de cotas, o erro é de centenas de reais. Com cota abaixo de R$ 0,005, o
preço médio vira `0.00`: o investido zera e **todo o saldo vira lucro** na rentabilidade da carteira. O próprio
`portfolioHistory` já diz "sem truncar o PM no caminho", mas recebe o dado já truncado. Solução: guardar 8 casas em
`average_price` e `unit_price` e arredondar só na exibição.

**D5 🔴 Taxa de renda fixa: o campo errado vai para `rf_rate`.**
`investments.ts:212` usa `rate ?? fixedAnnualRate` para qualquer indexador. Na Pluggy, `rate` é o **percentual do
indexador** (ex.: `rate: 110, rateType: CDI` = 110% do CDI) e `fixedAnnualRate` é a **parte pré** (ex.: IPCA + 6%).
Num IPCA+, `rate` costuma vir `100`, e o motor (`calculateIPCAPlusAccrual`) projeta **IPCA + 100% a.a.**: valor
astronômico onde não há `manual_position_value`. O mesmo erro também quebra o match por `FIXED_INCOME_KEY`. A regra
nova está na seção 3 _(confirmar com payload)_.

**D6 🟠 Renda variável ignora o `balance` informado pela instituição.**
Para ações, FIIs, ETFs e BDRs, `marketValue = null` (`investments.ts:180`): o valor passa a ser
`cotação(ticker) × quantity`. Quando o ticker sai errado (D7), quando há `priceFactor` de lote (campo da Pluggy que
o app **não lê**) ou quando o subtipo é `OPTION`/`DERIVATIVES` (mapeado para `STOCK`), a cotação de outro papel
multiplica a quantidade e o valor vai a qualquer número. Falta uma checagem: comparar `cotação × quantidade` com o
`balance` da Pluggy e, se divergir mais que a tolerância, usar o `balance` e marcar o ativo como "valor da
instituição".

**D7 🟠 Ticker inventado ou com sufixo quebra a cotação.**
Sem `code`, `buildInvestmentDisplay` usa a **primeira palavra do nome** como ticker (ex.: "BANCO", "ITAU"). Com o mesmo
código duas vezes no mesmo item (duas custódias), `resolveCollision` gera `PETR4-2` ou `PETR4 1234`. Nos dois casos, o
`marketSyncService` busca a cotação desse texto: ou não acha (o valor fica igual ao investido) ou acha um papel
homônimo. Opções e derivativos também caem aqui.

**D8 🟠 Match por ticker "sequestra" ativo de outro item ou de outra carteira.**
`matchInvestmentToAsset` (`investments.ts:372-381`) casa por ticker com confiança HIGH contra **todos** os ativos,
inclusive os que já pertencem a outro item Open Finance. Com PETR4 em duas corretoras, cada sync sobrescreve o mesmo
ativo (quantidade, `institution_id`, `external_id`) e arquiva as transações manuais. O resultado é uma posição que
oscila entre as duas e um livro com as compras das duas. Dentro do mesmo item, dois investimentos com o mesmo código
também caem no mesmo ativo e um apaga o outro.

**D9 🟡 Custos e total de venda.**
- `fees` soma **todos** os campos de `expenses`, inclusive `incomeTax` (IR, que não é custo de aquisição) e
  `iofProvision` (provisão, não pago). Isso infla o preço médio nas compras.
- Sem `netAmount`, o total de uma **venda** sai como `amount + fees`, mas deveria ser `amount − fees`.
- A tipagem de `expenses` em `types.ts` está desatualizada: faltam `clearingFee`, `stockExchangeFee`, `custodyFee`,
  `operatingFee`, `iof` e `iofProvision`.

### 2.2 Proventos faltando

**D10 🔴 Erro ao buscar as transações do investimento é engolido.**
`pluggyInvestmentsSyncService.ts:241`: qualquer falha em `/investments/{id}/transactions` (429, timeout de 10 s,
5xx) vira `investmentErrors++` e lista vazia. O sync termina como `SUCCESS`, sem proventos e com custo pelo fallback, e
nada avisa o usuário. Com a concorrência em 3 e só 2 retentativas de até 5 s, carteiras grandes batem no rate limit com
facilidade.

**D11 🔴 Proventos só são gravados se o ativo foi gravado.**
Os ramos `continue` (`:317` e `:320`, match MEDIUM ou sem carteira padrão) pulam também o bloco de proventos (`:469`).
Uma posição zerada também perde o histórico de proventos quando a instituição para de retorná-la.

**D12 🟠 Proventos creditados na conta da corretora não entram.**
Várias corretoras pagam dividendos, JCP e rendimentos de FII **na conta corrente** (transação bancária com categoria
de investimento/dividendos), e não como `INTEREST` do investimento. Hoje essas transações entram só como "receita" em
Finanças, e o módulo de Investimentos nunca as vê. _(Confirmar com payload quais conectores fazem isso.)_

**D13 🟡 Desconectar apaga proventos de outros itens.**
`disconnectItemInvestments` remove os `income_events` com `source = OPEN_FINANCE` por **carteira + ticker**, sem saber
de qual item vieram. Falta `item_id` em `income_events`.

### 2.3 Bancos e cartões

**D14 🔴 Transações removidas pela Pluggy viram duplicatas.**
Segundo o Q&A oficial, na passagem de `PENDING` para `POSTED` a instituição muitas vezes **troca o id**: a Pluggy apaga a
antiga e cria uma nova. O sync só cria e atualiza, nunca remove. O lançamento pendente antigo fica, e a compra aparece
duas vezes no cartão (mais forte em C6 e Nubank). O match "settle_pending" só cobre o que tem valor e data exatos.

**D15 🔴 A janela incremental usa a execução errada.**
`pluggySyncService.ts:84-89` pega o último `SUCCESS` de `of_sync_runs` do item, mas o sync de **investimentos** grava
na mesma tabela. Se o sync de investimentos funcionou e o de finanças nunca rodou (ou falhou), a janela começa 7 dias
antes do sync de investimentos em vez de 12 meses atrás, e o histórico de cartão e conta fica faltando.

**D16 🟠 A janela por data perde lançamentos retroativos.**
A janela usa `dateFrom = último sucesso − 7 dias`. Lançamentos que a instituição publica depois com data antiga
(parcelas de cartão que só aparecem no fechamento, segundo o Q&A da Nubank, e estornos) ficam fora. A API aceita
`createdAtFrom`: o certo é buscar por `createdAtFrom` no incremental e fazer uma janela de reconciliação por data (ex.:
40 dias) para detectar exclusões (D14).

**D17 🟠 Saldo de conta vinculada a uma conta local existente não fecha.**
O ajuste de `initial_balance_cents` (`pluggySyncService.ts:360`) só roda para conta **recém-criada**. Ao vincular uma
conta manual que já existe (`accountChoices` / `applyAccountLinks`), os lançamentos importados se somam ao saldo
manual e a divergência fica permanente. `applyAccountLinks` também não grava `masked_number`, `owner` e `auto_name`.

**D18 🟡 Outras arestas.**
- Cartão: o limite usado (`creditLimit − availableCreditLimit`) não é gravado. O `balance` do cartão é o total em
  aberto, não a fatura atual (Q&A Nubank). Rotular corretamente na tela.
- Conta: `bankData.closingBalance` (saldo contábil, com o bloqueado) e o "aplicado automaticamente" (Itaú e BB usam
  esse valor no `balance`) são ignorados. Isso explica parte das divergências de saldo.
- Banrisul pode repetir `transactionId`: a deduplicação deve usar `id`, com `date + amount` como verificação extra.
- O sync de finanças busca as transações conta por conta em série. Está correto para o rate limit, mas sem
  backoff global.

---

## 3. Regras novas (fonte de verdade)

**R1 Precisão.** `average_price` e `transactions.unit_price` guardam até **8 casas** (texto decimal). O
arredondamento para 2 casas acontece só na exibição. Totais monetários continuam com 2 casas.

**R2 Transação de investimento.** `total = |amount|` (bruto). `quantity = tx.quantity` quando > 0, senão `1`.
`unitPrice = total / quantity`. `tx.value` entra só como validação (diferença > 1% ⇒ registrar aviso no diagnóstico).
`priceFactor > 1` ⇒ `unitPrice = total / (quantity × priceFactor)` e `quantity = quantity × priceFactor`
_(confirmar com payload)_. `fees` = soma de `brokerageFee, settlementFee, clearingFee, stockExchangeFee,
tradingAssetsNoticeFee, custodyFee, operatingFee, serviceTax, maintenanceFee, registryFee, exchangeFee, iof, other`.
Ficam **fora** `incomeTax` e `iofProvision`, que vão para `notes`. Total da compra: `total + fees`. Total da venda:
`total − fees`, ou `netAmount` quando vier.

**R3 Taxa de renda fixa.** `CDI`/`SELIC` ⇒ `rf_rate = rate` (% do indexador, ex.: 110). `PRE` ⇒
`rf_rate = fixedAnnualRate ?? rate`. `IPCA`/`IGPM` ⇒ `rf_rate = fixedAnnualRate` (spread), e `rate` vai para a nova
coluna `rf_indexer_pct`. Taxa fora da faixa plausível (CDI: 50–200; PRE e spread: 0–30) ⇒ `rf_rate = null` e aviso.

**R4 Custo da posição Open Finance.** Fonte do custo, em ordem:
1. livro completo (quantidade do livro bate com a da Pluggy) ⇒ `TRANSACTIONS`;
2. `amountOriginal` ⇒ `INSTITUTION`;
3. sem custo ⇒ `average_price = null` e rentabilidade "—" (nunca usar `amount` ou `balance` como custo, porque isso
   dá 0% falso).

Com o livro incompleto, o sync grava uma transação sintética **`OPENING_BALANCE`** (tipo BUY, `source = OPEN_FINANCE`,
`external_id = pluggy-opening:<investmentId>`). Ela entra na data de `purchaseDate` ou `issueDate`, ou na data da
primeira transação conhecida, e cobre a diferença de quantidade e custo. Assim livro e posição fecham e o histórico
não explode (D2). Ela é recalculada a cada sync.

**R5 Valor de mercado Open Finance.** Toda posição Open Finance guarda o `balance` em `of_reported_value`
(coluna nova) e a data em `of_reported_at`.
- Renda fixa, fundos e previdência: `manual_position_value = balance` (como hoje).
- Renda variável: usa a cotação **só se** o ticker é válido (`^[A-Z]{4}\d{1,2}$`, ou `^[A-Z]{4}11$` para FII/ETF) e
  `|cotação × qtd − balance| / balance ≤ 15%`. Caso contrário, usa `balance` e marca `value_source = 'INSTITUTION'`.
- `OPTION` e `DERIVATIVES` não viram `STOCK`: ficam em `FUNDS` com `manual_position_value = balance` e sem busca de
  cotação, até a decisão da pergunta 2 da seção 6.

**R6 Histórico.** No `portfolioHistory`, o `manualPositionValue` só vale **a partir de `of_reported_at`** (ou da data
em que o valor manual foi editado). Antes disso, o valor de mercado do ativo de renda fixa e fundos é o custo
acumulado do livro, e a curva converge para o valor real na data em que ele passa a existir. Ativo sem transações
entra a partir da `OPENING_BALANCE`.

**R7 Identidade.** Match automático por ticker ou ISIN **ignora** ativos `source = OPEN_FINANCE` de outro item ou com
outro `external_id`. Dois investimentos do mesmo item com o mesmo código geram **ativos separados com o mesmo ticker
real** (a unicidade passa a ser por `external_id`, não por ticker). O sufixo de colisão vai só para o **nome**
exibido. Sem `code`: o ticker vem do ISIN (quando houver mapeamento) e, se não, de um rótulo com
`value_source = 'INSTITUTION'`, sem busca de cotação.

**R8 Proventos.** Todo `INTEREST` gera provento, mesmo com o ativo em reconciliação (fica com `asset_id` nulo e
`portfolio_id` da carteira da corretora). `income_events` ganha `item_id`. Falha ao buscar transações: até 4
retentativas com backoff exponencial e jitter, respeitando `Retry-After` até 30 s. O que ainda falhar fica em
`of_sync_runs.counts_json.failedInvestmentIds`, o sync termina como **`PARTIAL`** e a tela mostra "N investimentos sem
movimentações — tentar de novo".

**R9 Proventos via conta da corretora.** Transação bancária de crédito com categoria Pluggy de
dividendos/rendimentos/JCP, ou descrição com `DIVIDENDO|JCP|JUROS S/ CAPITAL|RENDIMENTO` + um ticker reconhecido,
vira candidato a provento. Passa pela deduplicação de `findEquivalentIncome` contra os proventos existentes e é gravado
com `source = OPEN_FINANCE_BANK`. O lançamento em Finanças continua existindo (é dinheiro real na conta), marcado
`linked_income_id`.

**R10 Sync de finanças.** `of_sync_runs` ganha `kind` (`FINANCE` | `INVESTMENTS`) e a janela usa só `FINANCE`.
Incremental: `createdAtFrom = último sucesso FINANCE − 1 dia`. Mais uma passada por `dateFrom = hoje − 40 dias` para
reconciliar. Lançamento Open Finance dentro dessa janela de 40 dias cujo `external_id` não volta mais da Pluggy:
- se estiver pendente, é **apagado** (soft delete com `of_removed_at`);
- se estiver pago, ganha `of_removed_at` e sai dos totais, mas continua visível como "removido pela instituição".

Edição do usuário (`user_edited_fields`) impede a remoção automática e vira aviso.

**R11 Saldos.** Ao vincular uma conta local existente, recalcular `initial_balance_cents` com a mesma regra da conta
nova (saldo da Pluggy − lançamentos pagos importados), mantendo os lançamentos manuais anteriores ao primeiro
importado. Guardar `closing_balance_cents` e `auto_invested_cents`. Cartão: `credit_used_cents =
creditLimit − availableCreditLimit`.

**R12 `priceFactor` na posição (Sprint 89).** `inv.priceFactor > 1` ⇒ `quantity = inv.quantity × priceFactor` (mesma
unidade das transações). Se a posição não trouxer `priceFactor` mas as transações trouxerem fatores `> 1` idênticos,
aplica esse fator à posição e registra `warning`. Se houver fatores divergentes entre posição e transações (ou entre
transações), registra `warning` e não multiplica a posição.

**R13 Fechamento do livro sem `amountOriginal` e excesso no livro (Sprint 89).**
- Quando faltam unidades (`livro < posição`) e não há `amountOriginal`, cria `OPENING_BALANCE` (`pluggy-opening:<id>`,
  `is_synthetic = 1`) com a quantidade faltante, `unit_price =` preço médio do livro (quando houver compras) ou
  `balance ÷ quantidade da posição`, mantendo `cost_basis_source = 'UNKNOWN'` (`average_price = null`, rentabilidade `"—"`).
- Quando o livro tem mais unidades que a posição (`livro > posição`), cria transação sintética `SELL`
  (`pluggy-closing-adj:<id>`, `is_synthetic = 1`) pela diferença ao preço médio do livro, datada de `última transação + 1 dia`.
  Ambas as sintéticas são recalculadas ou removidas a cada sync quando o livro fechar.

**R14 Custo desconhecido nos consumidores (Sprint 89).** A função pura `isUnknownCost(asset)` (`domain/finance/averagePrice.ts`)
centraliza a detecção (`cost_basis_source === 'UNKNOWN'` ou `average_price` nulo/vazio). Aplicada em `marketSyncService`,
`finGoalsService` (ativo entra no patrimônio, mas fica fora do investido e do valor no cálculo de `annual_return_percent`),
`PortfolioManagementScreen` (usa `of_reported_value` quando `value_source = 'INSTITUTION'`, nunca usa `average_price` vazio e
divide pela quantidade real sem `Math.max(1, quantity)`) e `IncomeHistoryScreen` (`costBasis` do YoC).

---

## 4. Plano de implementação

| Sprint | Tema | Diagnósticos | Regras |
| :--- | :--- | :--- | :--- |
| **84** | Investimentos: números corretos (precisão, transação, taxa, custo) | D3, D4, D5, D9 | R1, R2, R3, R4 (sem OPENING_BALANCE) |
| **85** | Investimentos: valor de mercado, identidade e histórico | D1, D2, D6, D7, D8 | R4 (OPENING_BALANCE), R5, R6, R7 |
| **86** | Proventos completos | D10, D11, D12, D13 | R8, R9 |
| **87** | Bancos e cartões: janela, exclusões e saldos | D14, D15, D16, D17, D18 | R10, R11 |
| **88** | Diagnóstico com dados reais e auditoria de outliers | confirma os itens "_(confirmar com payload)_" | — |

Ordem recomendada: **88 primeiro** (só leitura, um dia de trabalho) quando der para rodar no aparelho com a conta
real, porque confirma R2, R3 e R9 antes de codar. Sem acesso ao aparelho agora, seguir 84 → 85 → 86 → 87 e rodar a 88
no fim como validação.

Cada sprint migra os dados já gravados: na primeira execução depois da atualização, um **re-sync completo** dos itens
existentes, com o recálculo idempotente pelos `external_id`. Nenhum dado manual é apagado.

---

## 5. Decisões e premissas

- Valor da instituição (`balance`) vence a cotação quando os dois divergem. É o número que o usuário confere no app do
  banco.
- Rentabilidade sem custo confiável aparece como "—", nunca como 0%.
- A transação sintética `OPENING_BALANCE` é melhor que esconder o ativo do histórico: deixa o livro e a posição
  coerentes e é recalculável.
- Remoção de lançamento pela instituição é soft delete, auditável e reversível pelo usuário.
- Webhooks (`transactions/deleted`) ficam fora: o app é local-first e não tem backend recebendo eventos. A
  reconciliação por janela (R10) cobre o mesmo caso.

## 6. Perguntas em aberto

1. Quais conectores você usa hoje (corretoras e bancos)? Isso define a prioridade de R9 e de D18.
2. Para opções e derivativos: criar uma classe "Outros" no app ou manter em Fundos com valor da instituição?
3. Ao remover um lançamento já pago (R10), prefere que ele saia dos totais automaticamente ou que fique pendente de
   confirmação sua?
