# Plano — Sprints 103 a 113: Finanças × Investimentos integrados, Sandbox e Planejamento

Escrito em 26/11/2026, depois da Sprint 102. Telas de referência (mockups, valores ilustrativos):
canvas **"Celsus — Sandbox e Planejar"** (https://claude.ai/artifact/7C4R2SUBj4HTCewbj7bWM9), artboards 1–9.
Prompts de execução: `docs/PROMPTS_SPRINTS_103_113.md` (fora do git).

## 0. Decisões tomadas com o Pedro (26/11/2026)

| # | Pergunta | Decisão |
| :--- | :--- | :--- |
| DEC-1 | Onde fica o sandbox | **Dentro de Investimentos.** Nada de 3º módulo nem de Home nova. O hub "Simulador" (artboard 1) abre pela aba Análises e pelo "+" da Home; o Simulador de aporte atual vira um dos tiles do hub. Independência e Custo de oportunidade também ficam no hub, com atalho em Finanças › Mais. |
| DEC-2 | Ativos dos EUA | **Ação dos EUA + câmbio.** NVDA é cotada em US$ (Yahoo) e convertida pelo USD/BRL **de cada data**. Exige mudança no motor Go e build nativo. |
| DEC-3 | Compra em Investimentos × Finanças | **Vínculo carteira ↔ conta.** Cada carteira pode ter uma conta do tipo corretora; compra/venda gera transferência, provento gera receita ligada. |
| DEC-4 | IR no sandbox | **Sim, estimado e com opção de desligar.** Sempre rotulado "estimativa". |
| DEC-5 | Módulos e navbar (26/11/2026, revisão das telas) | **Investimentos e Finanças continuam separados.** Nenhuma tela de um módulo mostra blocos do outro (nada de patrimônio misto no Resumo de Finanças nem lista de carteiras em Finanças). A integração é por **dados** (vínculo carteira↔conta, transferência para a corretora, provento ligado) e por **atalhos que trocam de módulo** (`switchModule`) levando o contexto (ex.: valor do aporte). A navbar é a `FloatingBottomDock` de sempre: pílula com as abas do módulo (ativa = creme com ícone + rótulo, inativas só ícone) e o botão `+` laranja isolado à direita. Telas novas não criam dock próprio. |

## 1. Como está hoje (o que impede a integração)

| # | Problema | Onde |
| :--- | :--- | :--- |
| I1 | Dois formatos de dinheiro: Finanças usa centavos inteiros (`*_cents`), Investimentos usa `TEXT` decimal + `Decimal`. Não há conversão única; cada tela converte do seu jeito. | `domain/financeFlow`, `domain/finance`, `utils/formatters.ts` |
| I2 | Compra/venda de ativo não mexe em nenhuma conta. O dinheiro "some" da conta corrente só se o usuário ou o Open Finance lançar algo, e aí costuma cair como **despesa**. | `transactionService.executeTransaction`, `rebalanceExecution` |
| I3 | Transação + atualização do ativo não são atômicas (MELHORIAS 1.2). Adicionar um lançamento em Finanças no mesmo fluxo piora o risco. | `transactionService.ts` |
| I4 | Patrimônio calculado em 3 lugares: `walletsStore`/`refreshAppData` (Home de Investimentos), `NetWorthScreen` e `finGoalsService` (valor de carteira para metas). Precedência de preço pode divergir. | `App.tsx`, `screens/finance/NetWorthScreen.tsx`, `services/finGoalsService.ts` |
| I5 | Duas metas de patrimônio: `portfolios.patrimony_goal`/`monthly_contribution` e `fin_goals` (fonte `portfolio`). | `portfolioRepository`, `finGoalsRepository` |
| I6 | Provento existe como `income_events` (Investimentos) e pode existir como `fin_entries` de receita (Open Finance, `linked_income_id`). O lançamento manual de provento não gera receita em Finanças. | `incomeRepository`, `pluggyIncomeRelinkService` |
| I7 | `fin_accounts.type` só aceita `cash | checking | card`: não há conta de corretora; as carteiras criadas pela Pluggy por corretora (`pluggyPortfolioService`) não têm conta par. | `db/schema.ts` |
| I8 | O motor de mercado só conhece B3 (`.SA`) e cripto (`-BRL`): `ToYahooSymbol` não aceita ação dos EUA nem câmbio. | `services/market-api/internal/yahoo/client.go` |
| I9 | Fluxo de caixa ignora transferências (`budgetsAndCashflow.ts:325`), então "quanto investi no mês" e taxa de poupança não existem. | `domain/financeFlow/budgetsAndCashflow.ts` |

## 2. Funções novas (mapa)

| Função | Artboard | Pergunta que responde | Sprint |
| :--- | :---: | :--- | :---: |
| Vínculo carteira ↔ conta de corretora | 9 | "Essa compra saiu de qual conta?" | 103–104 |
| Resumo de Finanças com o mês em uma linha | 7 | "Quanto entrou, saiu, foi para a corretora e sobrou?" | 105 |
| Fechar o mês (Finanças) → aporte (Investimentos) | 8 | "Sobrou R$ X: quanto separo para investir?" | 106 |
| Motor com EUA e câmbio | — | (dados para tudo abaixo) | 107 |
| Máquina do tempo | 2 | "E se eu tivesse comprado dólar a R$ 4,99 / Nvidia em tal data e vendido em tal data?" | 108–109 |
| Hub Simulador | 1 | Entrada única do sandbox dentro de Investimentos | 109 |
| Carteira fictícia | 3 | "Essa composição, desde tal data, com aporte mensal, teria rendido quanto? E a minha real?" | 110 |
| Meta de dividendos | 4 | "Quanto preciso ter, e em quais ativos, para receber R$ X por mês?" | 111 |
| Independência financeira | 5 | "Com meus gastos reais, qual é o meu número e quando chego lá?" | 112 |
| Custo de oportunidade | 6 | "Essa assinatura investida daria quanto?" | 112 |
| Teste de estresse + Comparar | 1 (tiles) | "Minha carteira atual numa crise do passado" / "ativo × ativo × CDI" | 113 |

## 3. Regras novas

Numeração continua depois da R37 (Sprint 98). As regras de integração vão para `REGRAS_DE_NEGOCIO.md` §18 e as do
sandbox para §19.

### R38 — Dinheiro único (Sprint 103)
- `src/domain/money.ts` é a única ponte: `centsToDecimal(cents)`, `decimalToCents(d)` (arredondamento
  `ROUND_HALF_EVEN` ou o que `toCentsDecimal` já usa — confirmar e manter), `formatBRL(...)` delegando a
  `utils/formatters.ts`. Nenhum `Number` em conta intermediária.
- Moeda estrangeira: `Money = { amount: Decimal, currency: 'BRL' | 'USD' }`; conversão só por `convert(money, rate)`
  com a taxa explícita e a data da taxa guardada junto do resultado.

### R39 — Conta de corretora e vínculo (Sprint 103)
- `fin_accounts.type` ganha `'broker'`. Conta corretora não tem fatura, limite nem dia de fechamento.
- `portfolios.fin_account_id` (nullable). Uma conta corretora pode ter várias carteiras; uma carteira tem no máximo
  uma conta.
- Carteiras criadas pela Pluggy por corretora (`pluggyPortfolioService`) ganham conta corretora par automaticamente,
  com o mesmo nome; idempotente (chave `app_meta` `migration:broker-accounts:v1`).
- Saldo da conta corretora = saldo inicial + transferências − compras + vendas + proventos (regra de saldo de
  Finanças já existente, sem caso especial).

### R40 — Compra e venda viram transferência (Sprint 104)
- Carteira com conta vinculada: BUY grava **na mesma transação SQLite** (`runInTransaction`) a movimentação, a
  atualização do ativo e os lançamentos de Finanças:
  - origem = a própria conta corretora (padrão): um `investment_buy` na corretora;
  - origem = outra conta (ex.: corrente): o par de transferência corrente → corretora (`transfer_out`/`transfer_in`,
    mesmo `transfer_group_id`, via `createTransfer`) **e** o `investment_buy` na corretora.
  SELL é o espelho (`investment_sell`; transferência de volta só se o usuário escolher outra conta de destino).
  Resultado que importa: **nenhuma compra entra como despesa no orçamento**.
- Novo `fin_entries.kind`: `'investment_buy' | 'investment_sell' | 'investment_income'`, sempre na conta corretora,
  com `linked_transaction_id` (BUY/SELL) ou `linked_income_id` (provento). Orçamento e despesas ignoram esses kinds;
  saldo da conta os considera.
- Editar/excluir a movimentação atualiza/exclui o lançamento ligado (resolve também MELHORIAS 3.1 no que toca à
  conta). Excluir o lançamento em Finanças **não** apaga a movimentação: pede para excluir pela carteira.
- Carteira sem conta: comportamento atual, mais um aviso único "Vincular uma conta?" (artboard 9).
- `rebalanceExecution` (aporte em lote) gera **uma** transferência de origem com o total e um `investment_buy` por
  compra.

### R41 — Provento entra uma vez (Sprint 104)
- Provento lançado na carteira com conta ⇒ `investment_income` ligado por `linked_income_id`.
- Open Finance trazendo o mesmo crédito na conta da corretora/corrente: casar pelo `linked_income_id` já existente
  (`pluggyIncomeRelinkService`) e **não** duplicar; o lançamento do Open Finance prevalece como fonte do valor pago,
  o evento da carteira como fonte do ativo.

### R42 — Patrimônio de uma fonte só (Sprint 105)
- `services/patrimonyService.ts` calcula: investido (precedência manual → cotação → PM, igual ao resto do app),
  contas (saldo), cartões (fatura aberta + futuras como passivo) e total. Home de Investimentos, `NetWorthScreen`
  (Finanças › Mais › Patrimônio, que já existe) e `finGoalsService` leem dele. Snapshot diário em
  `net_worth_snapshots` continua. O Resumo de Finanças **não** mostra investimentos (DEC-5): usa só contas e cartões.
- Conta corretora entra em "investido" (é caixa dentro da corretora), não em "contas", para não somar duas vezes
  com a carteira.

### R43 — Mês em uma linha (Sprint 105)
- Receitas (inclui `investment_income`, mostrado à parte como "dos quais proventos"), despesas (exclui transferências
  e `investment_*`), aportes (= `transfer_out` para conta corretora + `investment_buy` sem transferência no mês −
  `investment_sell` resgatado para fora), sobra = receitas − despesas − aportes.
- Taxa de poupança = (receitas − despesas) / receitas, "—" sem receita.

### R44 — Metas unificadas (Sprint 105)
- `fin_goals` passa a ser a única meta de patrimônio. `portfolios.patrimony_goal`/`monthly_contribution` existentes
  viram `fin_goals` com fonte `portfolio` (migração idempotente `migration:portfolio-goals-to-fin-goals:v1`); o
  `GoalEditorSheet` da carteira passa a gravar em `fin_goals`. Colunas antigas ficam (backup antigo) mas deixam de ser
  lidas.

### R45 — Fechar o mês (Sprint 106)
- Sobra disponível = sobra do mês (R43) − contas pendentes até o dia D configurável (padrão 5 do mês seguinte).
- Reserva de emergência = saldo de contas `checking`/`cash` + renda fixa com liquidez diária marcada ÷ média de
  despesas dos últimos 6 meses; meta em meses configurável (padrão 6). Reserva abaixo da meta ⇒ sugestão de parte da
  sobra para a reserva antes do aporte.
- A tela fica em Finanças e só decide **quanto** separar e **de qual conta** sai. "Fechar e aportar em
  Investimentos" grava a marca do mês e troca de módulo (`switchModule`) abrindo o `SimulatorScreen` com o valor e a
  conta de origem pré-preenchidos (contexto `pendingContribution` num store, consumido uma vez). O plano por ativo
  continua sendo o do Simulador de aporte; ao confirmar lá, R40 (uma transferência + N compras). Voltar sem confirmar
  não lança nada em Finanças.
- "Fechar sem aportar" só grava a marca do mês em `app_meta` (`month-close:YYYY-MM`).

### R46 — Motor de mercado com EUA e câmbio (Sprint 107)
- Classe nova `US_STOCK` (inclui ETFs listados nos EUA). Símbolo Yahoo = ticker puro (`NVDA`). Moeda = `USD`.
- Câmbio: tickers sintéticos `USDBRL` (Yahoo `BRL=X`) e, se sair barato, `EURBRL` (`EURBRL=X`). Cotação e histórico
  diário pelas mesmas rotas (`/v1/quotes`, `/v1/history`, `/v1/assets/{t}/history`).
- Toda resposta de cotação/histórico/dividendos passa a ter `currency`. Ausente = `BRL` (compatível com o app atual).
- `historical_prices_local` guarda a moeda (coluna `currency`, padrão `BRL`).
- Catálogo: busca aceita `class=US_STOCK`; sem catálogo local completo, aceita ticker digitado validado por uma
  cotação real (sem cotação ⇒ não cria).

### R47 — Preço numa data (Sprints 108+)
- Preço de um ativo numa data D = fechamento do último pregão **≤ D**. Sem pregão em até 7 dias corridos antes de D
  ⇒ "sem dado" (a simulação mostra "—" e não calcula, nunca interpola).
- Valor em BRL de ativo em USD na data D = preço(D) × USDBRL(D), ambos pela regra acima, cada um no seu calendário.

### R48 — Máquina do tempo (Sprints 108–109)
- Cenário = lista de operações `{ ticker, classe, valor investido em BRL ou quantidade, data de compra, data de venda
  (ou "hoje"), taxas }`.
- Atalhos de data: "na mínima" / "na máxima" do intervalo visível do gráfico, calculados da própria série (nunca de
  uma lista de eventos fixa no código); "tocar no gráfico"; "data exata".
- Proventos no período: reinvestidos (padrão) ou em caixa. Ação dos EUA: retenção de 30% na fonte sobre dividendos.
- Resultado: valor final, ganho em R$ e %, e as mesmas métricas para CDI, IPCA e poupança no mesmo período e com o
  mesmo valor, usando as séries do BCB que o motor já baixa.
- IR estimado (DEC-4) pela tabela da R49, ligável/desligável; benchmarks CDI pagam a tabela regressiva quando o IR
  está ligado, poupança é isenta.

### R49 — Tabela de IR estimado (Sprint 108)
Constante versionada em `domain/sandbox/taxRules.ts` com `validFrom`. **Antes de travar os testes, o agente confere
cada linha com a legislação vigente (Receita Federal) e anota a fonte no relatório; se algo mudou, para e pergunta.**

| Tipo | Regra estimada |
| :--- | :--- |
| Ação B3 (operação comum) | 15% sobre o ganho; isento se as vendas de ações no mês somarem até R$ 20.000 |
| FII | 20% sobre o ganho, sem isenção |
| ETF B3 | 15% sobre o ganho, sem isenção |
| Ação/ETF dos EUA (Lei 14.754/2023) | 15% sobre o ganho em reais, apurado no ano; dividendos já retidos 30% nos EUA |
| Cripto (B3/exchange nacional) | 15% sobre o ganho; isento se as vendas no mês somarem até R$ 35.000 |
| Câmbio (dólar em espécie/conta) | 15% sobre o ganho em reais acima do limite de isenção aplicável — confirmar |
| Renda fixa / CDI de comparação | regressiva 22,5% / 20% / 17,5% / 15% (até 180 d / 360 d / 720 d / acima) |
| Poupança | isenta |

### R50 — Carteira fictícia (Sprint 110)
- Entrada: pesos por ativo (somam 100%), data inicial, aporte inicial, aporte mensal (dia 1º útil), rebalanceamento
  (nunca, 3, 6, 12 meses ou "por aporte": o aporte vai para quem está mais abaixo, mesma lógica de
  `calculateTwoPhaseContribution`).
- Saídas: curva diária, patrimônio final, rentabilidade, pior queda (máximo drawdown), proventos recebidos,
  comparação com a carteira real (curva de `calculateDailyPatrimonyCurve`) e com CDI.
- Fica em `sandbox_portfolios` + `sandbox_portfolio_items` (nunca em `portfolios`). Não entra em patrimônio nem em
  metas. Entra no backup (é dado do usuário), em arquivos próprios.
- "Transformar em carteira real" cria `portfolios` + metas por classe/ativo, **sem** movimentações.

### R51 — Meta de dividendos (Sprint 111)
- Yield de um ativo = soma dos proventos por cota com data de pagamento nos últimos 12 meses ÷ preço atual. Ativo
  sem 12 meses de histórico ⇒ marca "histórico curto" e não entra na sugestão automática.
- Capital necessário = meta mensal × 12 ÷ yield médio ponderado da composição sugerida.
- "Você já tem" = proventos reais (`income_events`) dos últimos 12 meses ÷ 12.
- Sugestão de posições: modo "Seguir minhas metas" (distribui pela meta de classe/ativo da carteira) ou "Livre"
  (candidatos do ranking por DY da classe escolhida), sempre com teto por ativo (padrão 20%) e mínimo de 4 ativos.
- Calendário: soma, por mês do ano, dos pagamentos dos últimos 12 meses escalados para a quantidade sugerida.
- Bola de neve: aporte mensal + reinvestimento dos proventos; preço e yield constantes (rotulado assim).
- Texto fixo na tela: "Baseado nos proventos pagos nos últimos 12 meses. Não é promessa de renda futura."

### R52 — Independência financeira (Sprint 112)
- Gasto mensal = média das despesas dos últimos 12 meses fechados (R43, sem transferências nem `investment_*`); com
  menos de 3 meses de dados ⇒ pede o valor manualmente.
- Número = gasto mensal × 12 ÷ taxa de retirada (padrão 4%). Investido atual = R42 "investido".
- Projeção mês a mês em valores de hoje: retorno real (padrão 4% a.a.) + aporte médio real dos últimos 12 meses (R43).
- "Criar meta" grava `fin_goals` fonte `net_worth`.

### R53 — Custo de oportunidade (Sprint 112)
- Fontes: assinaturas ativas (`fin_recurrences.is_subscription`), média mensal de uma categoria nos últimos 6 meses,
  ou uma compra (à vista ou parcelada, do lançamento).
- Valor futuro de uma série mensal à taxa escolhida (padrão 100% do CDI dos últimos 12 meses, anualizado), em 5, 10 e
  20 anos; mostra aportado e juros separados.
- "Virar aporte mensal" cria recorrência de transferência para a conta corretora vinculada (R39).

## 4. Sprints

| Sprint | Branch | Entrega | Telas |
| :---: | :--- | :--- | :---: |
| 103 | `feat/sprint-103-money-broker-link` | R38, R39: dinheiro único, conta corretora, vínculo carteira↔conta, migração | Contas (tipo corretora) |
| 104 | `feat/sprint-104-buy-sell-transfers` | R40, R41: compra/venda/provento em Finanças, atômico | 9 |
| 105 | `feat/sprint-105-unified-patrimony` | R42, R43, R44: patrimônio único (por trás), mês em uma linha no Resumo, metas unificadas | 7 |
| 106 | `feat/sprint-106-month-close` | R45: fechar o mês em Finanças e passar o valor ao Simulador de aporte | 8 |
| 107 | `feat/sprint-107-market-us-fx` | R46: Go + ponte + `marketApi` com EUA e câmbio; build nativo | — |
| 108 | `feat/sprint-108-sandbox-engine` | R47, R48 (domínio), R49: motor do backtest e IR | — |
| 109 | `feat/sprint-109-time-machine-ui` | Hub Simulador + Máquina do tempo + cenários salvos | 1, 2 |
| 110 | `feat/sprint-110-paper-portfolio` | R50: carteira fictícia | 3 |
| 111 | `feat/sprint-111-dividend-goal` | R51: meta de dividendos | 4 |
| 112 | `feat/sprint-112-fire-opportunity` | R52, R53: independência e custo de oportunidade | 5, 6 |
| 113 | `feat/sprint-113-stress-compare` | Teste de estresse e Comparar (opcional; escopo no prompt) | tiles do 1 |

Ordem: 103 → 104 → 105 → 106 (integração) e 107 → 108 → 109 → 110 → 111 (sandbox). A 112 depende de 105 (gastos e
aportes) e 108 (taxas). A 107 pode rodar em paralelo à 104–106, pois mexe só no Go, na ponte e em `marketApi`.

### Critério de pronto do conjunto
- Uma compra numa carteira vinculada aparece no saldo da conta corretora e **não** no orçamento nem em despesas.
- O patrimônio total é o mesmo na Home de Investimentos e em Finanças › Patrimônio.
- Nenhuma tela de Finanças mostra bloco de Investimentos (e vice-versa); toda tela raiz usa a `FloatingBottomDock`
  padrão com o `+` isolado à direita.
- "Dólar comprado a R$ 4,99 no dia em que o histórico mostra esse fechamento, vendido hoje" dá o mesmo número que a
  conta à mão com as duas cotações do histórico local.
- "Nvidia comprada em D1 e vendida em D2" usa preço em US$ e câmbio de D1 e D2, com IR estimado ligável.
- Meta de R$ 3.000/mês mostra capital necessário, posições, calendário e o quanto o usuário já recebe.
- Nenhum valor inventado: sem cotação/câmbio/série ⇒ "—" e a simulação não fecha.

## 5. Riscos e pontos em aberto
- Mudança no Go só chega ao aparelho com `npm run build:native` + `npx expo run:android` (Sprint 107).
- Yahoo limita requisições: o histórico diário de longo prazo (até `max`) precisa de cache local agressivo e
  *singleflight* (já existe no Go).
- A tabela de IR (R49) depende da lei vigente; o agente confirma antes de travar os testes.
- R40 muda a semântica do saldo das contas para quem já registrava aportes à mão como despesa: a Sprint 104 oferece
  "Reclassificar despesas antigas que parecem aporte" (sugestão, nunca automático).

## 6. Correções da Sprint 114
- **P1**: Remoção da exigência obsoleta do selo `"Em breve"` em `S109-T01`; todos os tiles do hub Simulador navegam para suas respectivas telas e `"Aporte"` abre `SimulatorScreen`.
- **P2**: Importação B3 (`source: 'B3_IMPORT'`) e `OPEN_FINANCE` não lançam mais em Finanças; `undoB3Import`/`undoLastImport` usa `transactionService.deleteTransaction` (limpa `fin_entries` e recalcula posição); migração `migration:remove-b3-import-cash-entries:v1` remove lançamentos legados ligados a `B3_IMPORT` sem tocar lançamentos manuais.
- **P3**: Compra em `TransactionScreen` escolhe a conta corrente/dinheiro com maior saldo quando a corretora vinculada não cobre o total e exibe aviso não-bloqueante se o saldo ficar negativo; `matchOpenFinanceInvestmentOutflow` casa saída Open Finance na conta corrente (janela `[-5, +2]` dias, tolerância `max(1c, 0,5%)`) sem duplicar `transfer_out`; seletor de vínculo aceita `checking`/`cash` e sugere contas OF da conexão (`migration:broker-link-suggest:v2` + marca manual `broker-link:manual:<portfolioId>`); `patrimonyService` mantém `checking`/`cash` em `accountsCents`.
- **P4**: `monthSummary` (R43) calcula aportes como `transfer_in` em contas de investimento vinda de fora + saídas OF `INVESTMENT_MOVE` sem par no app − resgates para fora; `investment_buy`/`investment_sell` nunca entram em aportes.
- **P5**: `transactionService.deleteTransaction` recalcula quantidade e preço médio do ativo via `calculatePositionFromTransactions` dentro do mesmo `runInTransaction`.
- **P6**: `incomeRepository.addIncome` em `runInTransaction`; `updateIncome` propaga alterações para `investment_income` ligado sem sobrescrever crédito Open Finance; `findMatchingOpenFinanceIncomeEntry` busca também nas demais contas Open Finance da mesma conexão (`of_item_id`).
- **P7**: Interruptor `"Liquidez diária"` (`rf_daily_liquidity`) na edição de ativos de renda fixa em `PortfolioManagementScreen`; `monthCloseService` lê valor dos ativos exclusivamente de `patrimonyService.getPatrimony().byAsset`.
- **P8**: `backtest.ts` atualiza `monthlySeries` com cotas reinvestidas e caixa de dividendos até cada mês (último ponto = `finalValueBRL`); retenção de 15% de IR na fonte para JCP de ativos B3 (`"JCP líquido de 15%"`) no `backtest` e em `dividendGoal`; `CompareScreen` e `StressTestScreen` usam `sandboxService` (com `assetClass` e conversão `USDBRL` em `CompareScreen`); §19 documenta cálculo em `number` no sandbox.
- **P9**: Substituição de `ui.accent` inexistente por `ui.primary` em `AccountsScreen.tsx:853`, zerando erros de TypeScript em produção.

## 7. Correções da Sprint 115
- **V1**: `pluggySyncService` passa a gravar `fin_accounts.of_item_id` ao criar e atualizar contas; `finService.migrateFinAccountsOfItemIdIfNeeded` (`migration:fin-accounts-of-item-id:v1`) deduz localmente contas legadas quando há evidência unívoca; `migration:broker-link-suggest:v3` roda ao fim de cada sincronização bem-sucedida (por carteira `broker-link-suggest:v3:<portfolioId>`, respeitando `broker-link:manual:<portfolioId>`), substituindo a `v2` da abertura.
- **V2**: Fonte única `services/investmentAccountsService.ts` (`getInvestmentAccountIds()`) reúne contas `'broker'` + `portfolios.fin_account_id` (não arquivadas) e alimenta `FinanceHomeScreen`, `monthCloseService` e `fireService`.
- **V3**: `resolveDefaultCashSource` (`domain/financeFlow/cashSource.ts`) unifica a origem padrão em `TransactionScreen` e `SimulatorScreen` (que ganha bloco `"Sai de"`, saldo projetado e aviso negativo); `rebalanceExecution` usa `matchOpenFinanceInvestmentOutflow` no total do lote vinculando a transferência à primeira compra.
- **V4**: `fin_entries.of_link_restore` (schema, DDL, migração e `backupService`) guarda `{ kind, transfer_group_id, of_class_reason }` antes de casar; `deleteEntriesByLinkedTransactionId` restaura lançamentos `OPEN_FINANCE` sem apagá-los; `pluggySyncService` preserva `linked_transaction_id` e par em re-syncs.
- **V5**: Transferência casada usa o valor pago do Open Finance (`paid_amount_cents ?? amount_cents`) no `transfer_in` da corretora, mantendo o troco/taxa real na corretora.
- **V6**: `matchAppInvestmentTransferOut` (`domain/financeFlow/openFinanceMatch.ts`) e `pluggySyncService` fazem o casamento inverso quando a saída OF chega entre `-2` e `+10` dias após uma transferência do app, substituindo o `transfer_out` manual e ajustando o `transfer_in`.
- **V7**: Correção dos erros de lint em `screens/sandbox/*.tsx`, `MonthCloseScreen.tsx`, `NetWorthScreen.tsx` e `SimulatorScreen.tsx`; botão `"Nova conta"` (`accounts-add-inline-btn`) preservado em `AccountsScreen` com `hideFab`; gráfico comparativo (`compare-chart`) implementado em `CompareScreen.tsx` sem dependência nativa externa.

## 8. Correções da Sprint 116
- **W1**: Conta vinculada de origem Open Finance ⇒ o extrato manda (`isAppManagedCashAccount`): compra/venda manual, aporte em lote e provento não criam `investment_*` nem transferência; ligação opcional `linked_transaction_id` com a liquidação do pregão (`matchBrokerSettlement`: soma líquida do pregão, `+4` dias úteis, tolerância = taxas B3 ou 0,5%); `TransactionScreen`/`SimulatorScreen` trocam `"Sai de"` pelo texto do extrato; `migration:of-linked-cash-cleanup:v1` limpa o legado (R40, R41).
- **W2**: Aporte do mês = conta não de investimento → conta de investimento, líquido do caminho inverso; liquidação, taxas B3, aplicação/resgate automáticos (`isAutomaticSweep`) e `investment_*` nunca contam (R43). Export de novembro: ~R$ 850 de aporte fantasma deixam de aparecer; sobra só o Pix real de R$ 227,17 de outro banco para a corretora.
- **W3**: `fin_entries.batch_id` liga a transferência do lote e todas as compras; excluir uma compra reduz a transferência, excluir a última apaga e restaura o OF (V4).
- **W4**: Restauração de casamentos antigos sem `of_link_restore` por sinais (`INVESTMENT_MOVE`/grupo ⇒ `transfer_out`) ou pela classificação dos campos crus.
- **W5**: Casamento inverso (V6) só com `INVESTMENT_MOVE` ou conta própria sem par, nunca aplicação automática (`isAppTransferMatchCandidate`).
- **W6**: `TransactionScreen` sem `react-hooks/set-state-in-effect` nem `immutability` nas linhas das Sprints 104 e 114 (estado derivado com `useMemo`).

