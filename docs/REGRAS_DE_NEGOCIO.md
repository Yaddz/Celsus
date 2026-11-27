# Celsus — Regras de negócio e fórmulas

Como o app calcula cada número que mostra. Todas as regras ficam em `apps/mobile/src/domain` (funções puras, em
`decimal.js`, cobertas por testes bloqueados). A arquitetura está em [`ARQUITETURA.md`](./ARQUITETURA.md).

Notação: **Q** quantidade, **PM** preço médio, **P** preço, **V** valor, **T** meta (%), **A** aporte.

---

## 1. Modelo

```
Usuário (perfil, PIN)                         ← secure-store / app_meta
 └─ Carteira (portfolio)                      ← cor/paleta pela posição na lista, meta de patrimônio, aporte mensal
     ├─ Meta por classe (4 classes)           ← FIXED_INCOME · FII · STOCK · CRYPTO; % + "recebe aporte?"
     ├─ Ativo (asset)                          ← ticker, classe, meta na classe (%), Q, PM, preço manual, dados de RF
     │   └─ Movimentação (transaction)         ← BUY · SELL · SPLIT · INPLIT; data, Q, P, taxas, total
     └─ Provento (income_event)                ← RENDIMENTO · DIVIDENDO · JCP; data, valor, cotas, valor unitário
```

- Um mesmo ticker pode existir em várias carteiras; cada posição é independente.
- **Classes**: Renda fixa (`FIXED_INCOME`), Fundos imobiliários (`FII`), Ações (`STOCK`), Criptomoedas (`CRYPTO`).
  Units como `ALUP11`/`BPAC11` são Ações, não FIIs.
- **Quantidades**: Ações e FIIs em cotas inteiras; Cripto até 8 casas; Renda fixa em valor monetário.
- **Arquivar** uma carteira a tira das listas e do consolidado (`is_archived = 1`); **excluir** apaga em cascata.

---

## 2. Preço atual e valor de mercado

Precedência única em todo o app:

```
P_atual = preço manual (manual_price_override)  →  cotação (cache/rede)  →  PM
V_mercado = Q × P_atual
```

- Sem cotação o ativo vale o custo (rentabilidade 0%) — o app nunca inventa preço.
- Cotação em cache vale 15 min; vencida e sem rede, é usada marcada como desatualizada (`isStale`).
- Na **curva histórica** e no `marketSyncService` o preço manual de um ativo é tratado como **valor da posição**
  (útil para renda fixa, que tem Q = 1). Ver item em aberto em `MELHORIAS.md`.

---

## 3. Preço médio, compra e venda (`averagePrice.ts`, `transactionService.ts`)

**Compra**

```
Custo_novo = Q_ant × PM_ant + Q_compra × P_compra + Taxas
Q_nova     = Q_ant + Q_compra
PM_novo    = Custo_novo / Q_nova
Total da movimentação = Q × P + Taxas
```

**Venda** (o PM não muda)

```
Q_nova             = Q_ant − Q_venda           (venda acima do saldo é recusada: "Saldo insuficiente para venda")
Resultado realizado = (Q_venda × P_venda − Taxas) − Q_venda × PM_ant
Total da movimentação = Q × P − Taxas
Se Q_nova = 0 ⇒ PM_novo = 0,00
```

Validações: Q > 0, P > 0, taxas ≥ 0, ativo existente na carteira. A posição pode ser reconstruída do zero a partir
do histórico (`calculatePositionFromTransactions`).

**Eventos corporativos** (`corporateEvents.ts`) — split/inplit `n:d`:

```
Q_nova = Q_ant × n / d        PM_novo = PM_ant × d / n        (custo total Q × PM permanece constante)
```

São aplicados de forma idempotente: cada evento vira uma movimentação com `external_id`; um evento já gravado não
é aplicado de novo. Se a gravação falhar, o ativo não é alterado (o evento é reaplicado inteiro na próxima vez).

---

## 4. Metas em dois níveis (`weights.ts`, `reactiveWeights.ts`)

- **Meta por classe** `T_c` (soma 100%) e **meta do ativo dentro da classe** `w_i,c` (soma 100% por classe).
- **Meta global do ativo**: `T_i = T_c × w_i,c / 100`.
- **Valores quebrados** são aceitos (ex.: 12,5%); exibição e gravação com 2 casas.

**Edição com cadeado** (`recalculateUnlockedTargets`), ao alterar o item *i* para *v*:

```
L  = soma dos itens travados (exceto i)
v  = max(0, min(100 − L, v))
R  = 100 − L − v               → redistribuído entre os destravados (j ≠ i) proporcionalmente ao valor atual
                                  (se todos estão em 0%, divide igualmente)
Itens travados não mudam.
```

**Modo "peso"** (`convertWeightsToPercentagesWithLocks`): pesos relativos (ex.: 2, 1, 1) viram %:
`p_j = peso_j / Σpesos_destravados × (100 − L)`.

**Arredondamento** (`roundSharesLargestRemainder`): método do maior resto em 2 casas — a soma fecha exatamente em
100,00, ninguém fica negativo e o erro não cai todo num único item. `normalizeTargetsToHundred` reescala listas
que não somam 100 mantendo a proporção.

**Classe desativada**: classe sem meta gravada, com 0% ou com "recebe aporte" desligado não recebe aporte.

---

## 5. Alocação, consolidação e resumo por classe (`consolidatedView.ts`, `classSummary.ts`)

Por carteira: `Investido = Σ Q × PM`, `Mercado = Σ V_mercado`, `Lucro = Mercado − Investido`,
`Rentab. = Lucro / Investido × 100` (0 se nada investido).

Por classe: `% atual = V_classe / V_total × 100`. No **consolidado** de várias carteiras a meta da classe é
**ponderada pelo valor de cada carteira**:

```
T_c(consolidada) = Σ_carteiras (V_carteira × T_c,carteira / 100) / V_total × 100
```

O card de alocação da Home preenche cada classe pela razão `% atual / % meta` e mostra a diferença.

**Resumo por classe** (aba "Resumo" da planilha): `V_meta = V_total × T_c`, `gap = V_meta − V_atual` (positivo =
falta, negativo = sobra) e a parcela do aporte mensal da classe = `A × T_c / Σ T_classes que recebem`.

Holdings consolidados somam Q e custo do mesmo ticker entre carteiras.

---

## 6. Aporte e rebalanceamento

O app **nunca sugere vender**: rebalanceia só com dinheiro novo.

### 6.1 Aporte em duas fases (`contributionPlan.ts`) — usado pelo Simulador

1. **Rateio entre classes**: só as classes que recebem aporte; `A_c = A × T_c / Σ T_c(recebem)`.
2. **Alvo pós-aporte por ativo**: `V_alvo,i = w_i,c × (V_atual,classe + A_c)`;
   `déficit_i = max(0, V_alvo,i − V_atual,i)`.
3. **Fase 1 — alocação proporcional ao déficit**: `aloc_i = A_c × déficit_i / Σ déficit_classe`, convertida em:
   - Ações/FIIs: `floor(aloc_i / P)` cotas inteiras;
   - Cripto: `aloc_i / P` truncado em 8 casas;
   - Renda fixa: o próprio valor.
4. **Fase 2 — troco**: `troco = A − gasto_fase1`. Ativos ordenados pelo **maior gap restante**
   (`V_alvo − V_atual − custo`) ganham **+1 cota** enquanto o troco cobrir o preço (só Ações/FIIs).
5. Saída por ativo: cotas, custo, se ganhou cota extra, % na classe depois do aporte; e o troco final.

### 6.2 Calculadora simples (`rebalance.ts`)

`V_final = V_atual + A`; `D_i = max(0, V_final × T_i − V_atual,i)`; o aporte é rateado por `D_i / ΣD`, com a
mesma conversão em cotas/frações/valor.

### 6.3 Execução (`rebalanceExecution.ts`)

O plano confirmado vira uma sequência de compras (`transactionService.executeTransaction`) na data do dia; o
resultado informa sucessos e falhas item a item.

---

## 7. Renda fixa (`fixedIncome.ts`)

Base 252 dias úteis (fins de semana excluídos).

| Indexador | Fator |
| :--- | :--- |
| `CDI` (% do CDI) | `Π (1 + CDI_dia × taxa/100)` sobre os dias desde a 1ª compra |
| `PRE` (a.a.) | `(1 + taxa/100) ^ (DU / 252)` |
| `IPCA` + taxa | `(1 + IPCA_acumulado) × (1 + taxa/100) ^ (DU / 252)` |

`V_atual = principal × fator`. Preço manual, quando existe, **substitui** a curva teórica.
Séries: CDI = BCB SGS #12, IPCA = SGS #433.

---

## 8. Meta de patrimônio (`goal.ts`)

```
progresso = min(100, max(0, V_atual / meta × 100))      falta = max(0, meta − V_atual)
meses até a meta: V ← V × (1 + r_m) + aporte_mensal, mês a mês (máx. 1200 meses; null se inalcançável)
r_m = (1 + r_anual)^(1/12) − 1
aporte necessário em n meses: requiredMonthlyContribution
```

---

## 9. Evolução patrimonial (`portfolioHistory.ts`) — aba Análises

**Curva diária**: para cada dia entre a primeira e a última movimentação, reconstrói a posição de cada ativo
aplicando as movimentações em ordem (compra soma custo e Q; venda tira `Q × custo/Q` do custo, sem truncar o PM),
e avalia:

- variável (Ações/FIIs/Cripto): última cotação conhecida **até aquele dia**; sem cotação, o custo médio;
- renda fixa: curva do indexador a partir da 1ª compra;
- preço manual: valor da posição.

O cálculo é **incremental** (as datas são crescentes, a posição só avança) — mesmo resultado do cálculo do zero,
dezenas de vezes mais rápido.

**Filtro de período**: 5D, 1M, 1Y, 5Y, Tudo. **Resumo do período**:

```
aportes líquidos = Σ compras (Q×P + taxas) − Σ vendas (Q×P − taxas)   no período
rendimento       = patrimônio_final − patrimônio_inicial − aportes líquidos
rentabilidade    = rendimento / (patrimônio_inicial + aportes positivos) × 100
```

---

## 10. Proventos (`income.ts`, `incomeHistory.ts`)

- **Resumo do ano** (card de Análises): total do ano até hoje e média mensal desde o 1º mês com provento no ano.
- **Histórico** (tela Proventos), sobre o escopo filtrado (carteira, período, classe, tipo, ticker):
  - total, **média mensal** (total ÷ meses do intervalo), **melhor mês**;
  - série mensal contínua (meses vazios = 0,00) e anual (com média ÷ 12);
  - **ranking por ativo** com % pelo método do maior resto (soma 100,00%);
  - **últimos 12 meses** (janela móvel) e **rendimento sobre o custo** = proventos 12m ÷ custo dos ativos do
    escopo (nulo quando custo ≤ 0).

---

## 11. Importação do extrato da B3 (`domain/b3`, `b3ImportService.ts`)

Arquivo "Movimentação" da Área do Investidor (`.xlsx` ou `.csv`), lido 100% no aparelho.

1. **Leitura** (`readStatementFile`): XLSX descompactado com `fflate` e XML lido por *tokens* (sem DOM); CSV com
   delimitador `;`/`,` detectado e BOM tratado; datas em texto ou número serial do Excel. Erros tipados — inclusive
   aviso quando o arquivo é o relatório de **negociação** em vez de **movimentação**.
2. **Normalização**: data `AAAA-MM-DD`, `TICKER - NOME` separado, números pt-BR. Direitos/recibos de subscrição
   (`XXXX12`, `XXXX13`) viram o ticker base (`XXXX11`).
3. **Classificação** de cada linha:

| Movimentação | Resultado |
| :--- | :--- |
| `Transferência - Liquidação` crédito / débito | **Compra** / **Venda** (precisa Q e P > 0, senão *revisar*) |
| Subscrição exercida (com Q e P) | **Compra** do ticker base |
| `Rendimento`, `Dividendo`, `Juros Sobre Capital Próprio` creditados | **Provento** (RENDIMENTO / DIVIDENDO / JCP) |
| Atualização, direitos/recibos/sobras/solicitação de subscrição, "não exercido", transferências sem liquidação | **Ignorada** (sem efeito financeiro) |
| Demais (desdobramentos, grupamentos, empréstimos…) | **Revisar** (mostrada, não aplicada) |

4. **Classe do ativo**: catálogo local → heurísticas (FII pelo nome/sufixo 11, Ações pelos sufixos 3/4/5/6).
5. **Saldo anterior** (`reconcileOpeningBalances`): se o extrato começa no meio da história (venda ou provento
   de ativo sem compra antes), calcula a quantidade que faltava no dia anterior à 1ª linha — com janela de 20 dias
   para proventos — e cria um **saldo inicial** (preço manual informado pelo usuário ou cotação histórica).
6. **Plano** (`buildImportPlan`): ordem cronológica; cada linha ganha `external_id = b3:<hash FNV-1a>` de
   `data|movimentação|ticker|Q|P|valor|instituição|nº da ocorrência`. Linhas cujo id já existe são puladas →
   importar o mesmo arquivo (ou um que se sobrepõe) não duplica nada.
7. **Aplicação**: cria ativos novos, saldos iniciais, executa compras/vendas pelo `transactionService` (uma falha
   não aborta o lote), grava proventos com tipo, cotas e valor unitário, e **verifica** os totais (`matches`).
   O lote fica registrado em `app_meta` (`b3:last_batch`).
8. **Desfazer** (`undoLastImport`): remove as movimentações e proventos do último lote, os ativos que ele criou e
   que ficaram vazios, e recalcula as posições.

---

## 12. Planilha AUVP (`spreadsheetImportService.ts`)

`planilhaSeed.json` (planilha "Controle de investimentos v2") é importada uma vez por instalação na carteira
"AUVP": reaproveita a carteira se existir e insere só o que falta (lançamentos por `external_id`, ativos por
ticker, proventos por ticker+data+valor), com relatório de cada falha. Marca `seed:auvp:v1` impede nova execução,
inclusive depois de "Apagar todos os dados".

---

## 13. Backup `.celsus.zip` (`backupService.ts`)

- Conteúdo: `portfolios.csv`, `class_targets.csv`, `assets.csv`, `transactions.csv`, `income_events.csv` e
  `manifest.json` (versão do esquema, data, contagem e **SHA-256 de cada CSV**).
- Importação valida o manifesto e os hashes (arquivo adulterado ou corrompido é recusado) e roda em dois modos:
  **RESTORE** (substitui tudo) ou **MERGE** (une por UUID: o que já existe é mantido/atualizado, o resto entra).
- Backups antigos sem `income_events.csv` continuam aceitos.
- Segredos (PIN, biometria) **nunca** entram no backup.

---

## 14. Segurança

| Regra | Valor |
| :--- | :--- |
| PIN | 6 dígitos; guardado como `SHA-256(sal + pin)`, sal de 16 bytes por instalação, no Keystore/Keychain |
| Tentativas | 4 erros livres; o 5º bloqueia **30 s**, o 6º **1 min**, o 7º **5 min**, depois **15 min** |
| Mensagem | "PIN incorreto · N tentativas restantes" até o bloqueio |
| Autobloqueio | ao voltar do segundo plano depois de 0 (imediato), 30, 60 (padrão) ou 300 s |
| Biometria | só com PIN; ativada após teste real; *auto-prompt* na tela de bloqueio |
| Esqueci o PIN | biometria ou apagar tudo (digitar "APAGAR") → onboarding |
| Privacidade | capa opaca no multitarefa; olho do header mascara valores (`R$ ••••••`) |

---

## 15. Formatação

- Moeda `R$ 1.234,56` (`toLocaleString('pt-BR')`, 2 casas); percentuais com vírgula (`+12,3%`).
- Entrada numérica aceita vírgula ou ponto (`decimalInput`).
- Datas gravadas como `AAAA-MM-DD`, exibidas como `DD/MM/AAAA`.

---

## 16. Módulo Finanças Pessoais (`domain/financeFlow`)

- **Unidade monetária**: todos os valores do módulo são inteiros em **centavos** (`amount_cents`, `paid_amount_cents`, `initial_balance_cents`).
- **Critério de competência e variação mensal da conta (F15)**: tanto o **Resumo mensal** (`calculateMonthlySummary`) quanto a **variação mensal da conta** (`AccountsScreen`) agrupam lançamentos pelo mês da data de vencimento/competência (`due_date`, formato `AAAA-MM`). Na variação mensal da conta entram apenas lançamentos com `status = 'paid'`, utilizando `paid_amount_cents ?? amount_cents` (positivo para `income`, negativo para `expense`).
- **A vencer (7 dias) e Atrasadas (F6, F7)**: contagens e valores nos tiles de atenção consideram apenas **despesas** (`kind = 'expense'`) pendentes (`status = 'pending'`). Receitas atrasadas são apresentadas em linha separada (`"N a receber em atraso"`).
- **Recorrências e Assinaturas (F2, F3, F8, F9, F10)**:
  - Deduplicação por `recurrence_period` (`AAAA-MM` para mensal/anual e `AAAA-MM-DD` para semanal) e tabela `fin_recurrence_skips(recurrence_id, period)` para ocorrências excluídas no escopo `"só esta"`.
  - `nextOccurrenceIso(recurrence, todayIso, pendingEntries)` retorna a menor `due_date` pendente `>= todayIso` ou projeta a próxima data pela frequência (`clampDayOfMonth` para dia 31 e 29/02).
  - Geração sob demanda acompanha o mês exibido até o limite de **24 meses à frente**.
- **Cartão de crédito, faturas e transferências (`domain/financeFlow/cards.ts`, Sprint 61 / Sprint 74)**:
  - **Compra sem vencimento próprio (`normalizeCardEntry`, Sprint 74)**: em contas do tipo `card`, a coluna `due_date` guarda a **data da compra** (sem renomear a coluna); `bill_month` é sempre preenchido por `resolveBillMonth(dataDaCompra, closingDay, dueDay)` (usando padrões `closingDay = 1` e `dueDay = 10` quando não informados, marcando a fatura como "datas estimadas"). Toda compra ou estorno (`expense` | `income`) no cartão nasce com `status = 'paid'`, `paid_date = data da compra` e `paid_amount_cents = amount_cents`, porque a dívida pertence à fatura e a obrigação de pagar existe apenas na fatura. Esta regra é centralizada em `normalizeCardEntry` e aplicada por todas as origens (formulário, parcelamento, importação de arquivo, cupom/OCR e Pluggy) e pela migração idempotente em `db/client.ts` (sem alterar `transfer_in`/`transfer_out`).
  - **Competência da compra vs. caixa**: uma compra no cartão (`kind = 'expense'`) conta como despesa no mês da **data da compra** (`due_date`) para `calculateMonthlySummary`, "Gasto por categoria" e orçamento (`calculateBudgetUsage`), mas **não** altera o saldo de contas correntes/carteiras até que a fatura seja paga; na previsão de saldo (`projectCashflow`), a saída de caixa ocorre apenas no **vencimento da fatura** (`billDueDate`).
  - **Mês da fatura (`resolveBillMonth(purchaseIso, closingDay, dueDay)`)**: compras com dia `< closingDay` (com *clamp* em meses curtos, ex.: dia 31 em fevereiro vira 28/29) entram na fatura que fecha no mês atual; compras **no dia do fechamento ou depois** (`day >= effectiveClosingDay`) entram na fatura do fechamento seguinte. Quando o cartão fecha depois do vencimento (`closingDay > dueDay`), `resolveBillMonth` desloca +1 mês para apontar para o mês de vencimento da fatura. `getBillPeriod` calcula o período de compras (`startIso`..`endIso`), `closingIso` e `dueIso`.
    - *Exemplo*: cartão fecha dia 10 e vence dia 17. Compra em `09/11/2026` → fatura `2026-11` (vence `17/11/2026`). Compra em `10/11/2026` → fatura `2026-12` (vence `17/12/2026`). Compra em `28/02/2026` com fechamento dia 31 → `clamp = 28`, então `28 >= 28` → fatura `2026-03`.
  - **Resumo da fatura (`summarizeBill`)**: `totalCents = Σ despesas − Σ estornos (income)` no `bill_month`; `paidCents = Σ transfer_in` pagos no `bill_month`; `openCents = max(0, totalCents − paidCents)`. Status: `paga` (`openCents = 0` e `totalCents > 0`), `atrasada` (`openCents > 0` e `hoje > dueDate`), `fechada` (`openCents > 0` e `hoje >= closingDate`), caso contrário `aberta`.
  - **Limite disponível (`availableLimit`)**: `credit_limit_cents − Σ openCents` de todas as faturas em aberto do cartão (retorna `null` → `"—"` quando o limite não foi informado).
  - **Transferências e pagamento de fatura (`transfer_out` / `transfer_in`)**: formam um par atômico ligado por `transfer_group_id`. `calculateMonthlySummary` **ignora** `transfer_out` e `transfer_in` (não inflam receitas, despesas nem categorias); `calculateAccountBalance` **subtrai** `transfer_out` e **soma** `transfer_in` na respectiva conta.
    - *Exemplo*: salário de R\$ 5.000,00 na conta corrente + compra de R\$ 800,00 no cartão + pagamento de R\$ 1.000,00 de fatura anterior → `calculateMonthlySummary` mostra R\$ 5.000,00 de receita e R\$ 800,00 de despesa; `calculateAccountBalance` da conta corrente resulta em `5000 - 1000 = R$ 4.000,00`.
  - **Atenção no Resumo (`detectOverdueAndDueSoonWithBills`)**: compras individuais no cartão não aparecem nos tiles "A vencer · 7 dias" e "Atrasadas"; em seu lugar entram as **faturas em aberto** pelo vencimento (`billDueDate`).
- **Leitor de cupom e chave de acesso (`domain/receipt`, Sprint 75)**:
  - **Chave de 44 dígitos (`parseAccessKey`)**: aceita modelos **65 (NFC-e)**, **55 (NF-e)** e **59 (CF-e SAT)**, com validação módulo 11 (`isValidAccessKeyMod11`), ignorando espaços/pontos/quebras de linha e unindo dois blocos de 22 dígitos no SAT. `parseNfceQr` delega para `parseAccessKey`.
  - **Extração de total (`parseReceiptText`)**: usa pontuação de candidatos combinando rótulos em linha única/seguinte, pareamento em colunas (bloco de rótulos seguido por bloco de valores), confirmação por `VALOR PAGO` / forma de pagamento, cálculo `VALOR PAGO − TROCO` quando há troco, e soma de itens como desempate; linhas de `TROCO`, `DESCONTO`, `TRIBUTOS` e `QTD. TOTAL` não são usadas como total direto.
  - **Consulta opcional à SEFAZ (`nfceLookupService`)**: ligada por padrão (`app_meta` chave `receipt.sefaz_lookup`), com interruptor na folha do leitor; envia apenas a URL do QR (nunca fotos) com timeout de 6 s para UFs suportadas (`DF`, `SP`, `RJ`, `MG`, `PR`, `RS`). Se falhar, estiver desligada ou for código de barras/chave digitada sem valor, o leitor solicita captura do total por OCR (com opção de pular para o formulário). Duplicidade é bloqueada por `external_id = accessKey` em todas as vias (QR, Code 128, foto e digitação).

---

## 17. Open Finance / Pluggy (`domain/openFinance`, Sprint 71)

- **Livro-razão de investimentos (`transactions`)**: apenas movimentações `BUY` e `SELL` são gravadas em `transactions` (alinhado a `averagePrice.ts`).
  - `AMORTIZATION`: reduz o custo total (`totalCost = max(0, totalCost - amount)`) sem alterar a quantidade (`Q`).
  - `TAX`: não altera a quantidade (`Q`) nem é gravado como movimentação de livro-razão.
  - `TRANSFER`: só entra no custo e na quantidade quando possuir `quantity > 0` e `unitPrice > 0`, e nunca duplica uma `BUY` já contada na mesma data/quantidade/preço.
  - `INTEREST` (dividendos, JCP, rendimentos): classificado por descrição (`JCP`, `DIVIDENDO`, `RENDIMENTO`, `PROVENTO`) e persistido em `income_events` com `external_id = 'pluggy:<id>'`, `source = 'OPEN_FINANCE'`, usando `netAmount` (ou `amount`) sempre positivo em 2 casas.
- **Deduplicação cruzada de proventos (`domain/finance/incomeDedup.ts`, Sprint 72)**:
  - Dois proventos são equivalentes quando têm ticker normalizado igual (`PETR4F` === `PETR4`), `kind` compatível (`PROVENTO`/`OUTRO`/vazio casa com qualquer um), data de pagamento a até **3 dias corridos** e valor a até **R$ 0,01** (ou relação bruto × líquido de 15% de IR com tolerância de 1% para `JCP`), em **todas as carteiras**.
  - Em `syncInvestments` e `b3ImportService`, equivalentes de outra origem não são duplicados: a linha existente é mantida, tem campos vazios completados e recebe `"Confirmado pelo Open Finance"` em `notes`. Na desconexão (`disconnectItemInvestments`), apenas proventos com `source = 'OPEN_FINANCE'` daquela conexão são removidos.
- **Taxas de movimentação**: usa a soma dos campos numéricos de `expenses` quando presente; só recorre a `|netAmount| − |amount|` quando `expenses` é nulo.
- **Posição e `manual_position_value`**:
  - Ações, FIIs, BDRs e ETFs usam a quantidade informada pela instituição (0 se nula) e mantêm `manual_position_value = NULL`, para que a cotação de mercado seja sempre a fonte do valor.
  - Renda fixa, fundos e previdência recebem quantidade padrão `1` quando `quantity` é nula e `balance > 0`, gravando `manual_position_value = balance`.
- **Nomenclatura e preservação de edição (`naming.ts`)**:
  - Renda fixa/COE: ticker curto `"<SUBTIPO> <EMISSOR>"` e nome `"<Subtipo> <Emissor> · <taxa> · venc. mm/aaaa"`; fundos/previdência: sigla sem *stopwords*; contas: `"<Banco> · <tipo> ·· 1234"`; lançamentos: descrição limpa em capitalização normal mantendo o texto bruto em `description_raw`.
  - Nomes editados pelo usuário não são sobrescritos (comparação com `auto_name` em contas e ativos, e `user_edited_fields` em lançamentos).
- **Qualidade de dados de investimentos (Sprint 84 — R1, R2, R3, R4 parcial)**:
  - **Precisão (`R1`)**: `average_price` e `transactions.unit_price` no Open Finance são gravados com **8 casas decimais** (texto decimal); a exibição (`formatUnitPriceBRL`) formata com 2 casas (ou 6 casas para cotas `< R$ 1,00`).
  - **Transação (`R2`)**: `total = |amount|`, `quantity = tx.quantity > 0 ? tx.quantity : 1` (multiplicado por `priceFactor` quando `> 1`), `unitPrice = total / quantity`. `tx.value` apenas valida (divergência `> 1%` registra em `warnings`). `fees` exclui `incomeTax` e `iofProvision` (registrados em `notes`, ex.: `"IR retido R$ x"`). `BUY` soma `fees`; `SELL` usa `netAmount ?? max(0, total − fees)`.
  - **Renda fixa (`R3`)**: `CDI`/`SELIC` → `rf_rate = rate` (50–200); `PRE` → `rf_rate = fixedAnnualRate ?? rate` (0–30); `IPCA`/`IGPM` → `rf_rate = fixedAnnualRate` (0–30) e `rate` em `assets.rf_indexer_pct`. Valores fora da faixa resultam em `rf_rate = null` e `warnings`.
  - **Custo e rentabilidade (`R4`)**: fallback de custo usa apenas `amountOriginal`; sem `amountOriginal`, `cost_basis_source = 'UNKNOWN'`, `averagePrice = null` (`''` no SQLite), o ativo entra no patrimônio mas fica fora do investido e do mercado no cálculo de rentabilidade (exibindo `"—"` quando nenhum ativo tem custo conhecido). Quando o livro de transações não fecha com `quantity` da instituição e há `amountOriginal`, o sync grava/atualiza uma transação sintética `BUY` (`external_id = pluggy-opening:<investmentId>`, `is_synthetic = 1`) na data `purchaseDate ?? issueDate ?? (1ª transação − 1 dia) ?? inv.date`, removendo-a se o livro passar a fechar.
  - **Valor de mercado (`R5`)**: toda posição Open Finance grava `of_reported_value = balance` e `of_reported_at`. Em renda variável, `resolveVariableIncomeValueSource` só usa `QUOTE` se o ticker for B3 válido (`^[A-Z]{4}\d{1,2}$`) e `|cotação × qtd − balance| / balance ≤ 15%`; caso contrário (ou sem `code`/ISIN), usa `value_source = 'INSTITUTION'` e `of_reported_value`. `OPTION` e `DERIVATIVES` vão para `FUNDS` com `manual_position_value = balance`.
  - **Histórico (`R6`)**: em `portfolioHistory.ts`, `manualPositionValue`/`ofReportedValue` só valem a partir de `ofReportedAt` (ou `updatedAt` para manual sem data); antes disso, Renda Fixa usa o motor de accrual com o custo do livro e Fundos usam o custo do livro. Ativos sem transações reais entram no histórico a partir da `OPENING_BALANCE`.
  - **Identidade e reparo (`R7`)**: `matchInvestmentToAsset` recebe `itemId` e ignora candidatos `OPEN_FINANCE` de outro item ou com `external_id` diferente. Dois investimentos com o mesmo `code` no mesmo item mantêm o ticker real e diferenciam apenas o `name`. No sync, transações `OPEN_FINANCE` presas em outro ativo "sequestrado" são reparadas movendo-as para o ativo correto por `external_id` sem duplicar (`counts_json.assetsRepaired`).
  - **Proventos completos (`R8`, `R9`)**:
    - `PluggyClient.listInvestmentTransactions` usa `maxRetries = 4` com backoff exponencial, jitter e respeito a `Retry-After` até 30 s; concorrência do sync de investimentos reduzida para 2.
    - Falhas por investimento são registradas em `counts.failedInvestmentIds`, o run termina como `PARTIAL`, o custo gravado anteriormente não é sobrescrito e a `OpenFinanceScreen` exibe o aviso com botão **"Tentar de novo"** apenas para os IDs que falharam.
    - `INTEREST` sempre grava proventos (mesmo em reconciliação, com `asset_id = null` na carteira da corretora e migração ao confirmar a reconciliação). `income_events` armazena `item_id` e `asset_id`; `disconnectItemInvestments` remove apenas proventos do `item_id` desconectado.
    - `detectBankIncomeCandidate` (`domain/openFinance/income.ts`) detecta créditos bancários com categoria `"Proceeds interests and dividends"` (`0407*`) ou descrição de dividendos/JCP/rendimentos associada a um ticker conhecido, gravando em `income_events` com `source = 'OPEN_FINANCE_BANK'` (deduplicado via `findEquivalentIncome`) e preenchendo `fin_entries.linked_income_id`.
  - **Reprocessamento idempotente**: re-syncs atualizam in-place transações `OPEN_FINANCE` existentes por `external_id` quando `unit_price`, `fees`, `total_amount`, `quantity`, `trade_date` ou `notes` mudam, sem duplicar.
  - **Diagnóstico anonimizado e auditoria de outliers (Sprint 88)**: `pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics` realiza leitura somente-leitura na Pluggy (sem gravar em `assets` ou `fin_entries`), omitindo `owner`, `taxNumber`, `number`, nomes de pessoa e `itemId` (substituído por hash curto), com descrições truncadas em 40 caracteres. `auditOpenFinanceOutliers` (`domain/openFinance/diagnostics.ts`) detecta localmente rentabilidade extrema (`> +300%` ou `< -90%`), divergência de valor de mercado (`> 15%` vs. `of_reported_value`), custo médio ausente (`quantity > 0`), taxa de renda fixa fora da faixa, ticker não-B3 com `value_source = 'QUOTE'`, duplicatas `OPEN_FINANCE` (±1 dia, mesmo valor/tipo/conta, `external_id` diferente) e divergência de saldo em contas (`> R$ 1,00`).
  - **Bancos e cartões: janela, exclusões e saldos (Sprint 87 — R10, R11)**:
    - `of_sync_runs.kind` (`FINANCE` | `INVESTMENTS`, inferido na migração pelo prefixo `'of-inv-'`); `computeSyncWindowStart` considera apenas execuções `FINANCE`.
    - Busca em duas passadas: incremental por `createdAtFrom` (último `FINANCE` − 1 dia; primeira vez 12 meses por `dateFrom`) + reconciliação por `dateFrom = hoje − 40 dias`, com deduplicação defensiva (`${id}:${date}:${amount}` quando mesmo `id` volta com valores/datas diferentes).
    - `detectRemovedOpenFinanceEntries`: pendente removido na janela de 40 dias sofre soft delete; pago removido recebe `of_removed_at` e sai dos totais/saldos/projeções (mantido na lista como removido pela instituição); edição prévia (`user_edited_fields`) impede remoção e conta em `removalConflicts`.
    - `R11`: na primeira vinculação de conta existente (`of_linked_at` nula), recalcula `initial_balance_cents = reported_balance_cents − lançamentos pagos importados` preservando manuais anteriores; grava `masked_number`, `owner`, `auto_name`, `closing_balance_cents`, `auto_invested_cents` e `credit_used_cents` (`creditLimit − availableCreditLimit`), exibindo `"Total em aberto"` para cartões Open Finance.
  - **Correções da validação Pluggy (Sprint 89 — R12, R13, R14)**:
    - `R12`: `mapPluggyInvestment` e `calculateInvestmentCostBasis` multiplicam `inv.quantity` por `priceFactor` quando `> 1` (ou herdam fator único `> 1` das transações com `warning`); fatores divergentes geram `warning` e mantêm a posição sem multiplicação.
    - `R13`: sem `amountOriginal` e com livro menor que a posição, gera `OPENING_BALANCE` (`pluggy-opening:<id>`, `is_synthetic = 1`) com custo do livro ou `balance ÷ posição` e `cost_basis_source = 'UNKNOWN'`; com livro maior que a posição, gera `SELL` sintético (`pluggy-closing-adj:<id>`, `is_synthetic = 1`) em `última transação + 1 dia` ao PM do livro. Ambos são removidos automaticamente quando o livro fecha.
    - `R14`: `isUnknownCost` (`domain/finance/averagePrice.ts`) uniformiza o tratamento em `marketSyncService`, `finGoalsService` (exclui custo desconhecido do cálculo de `annual_return_percent`), `PortfolioManagementScreen` (usa `of_reported_value` para `INSTITUTION` e divisão por quantidade `< 1` sem `Math.max(1, qty)`) e `IncomeHistoryScreen`.
  - **Proventos por nome de fundo, recibos e diagnóstico sem PII (Sprint 90 — R15, R16, R21)**:
    - `R15`: `detectBankIncomeCandidate` (`domain/openFinance/income.ts`) aceita `KnownIncomeAsset[]` (`{ ticker, name, status }`), mantendo compatibilidade com lista/Set de tickers. Busca em ordem: ticker na descrição → nome do fundo (trecho após `"s/"` ou `"FII"`, normalizado sem stopwords, prefixos/iniciais em ordem) → raiz de 4 letras do ticker (`"XP LOG"` ⇒ `XPLG`). Mais de um ativo compatível não atribui e incrementa `ambiguousIncomeCount`. `"S/ <n>"` inteiro preenche `quantity = n` e `unit_amount = amount ÷ n` (`decimal.js`, 8 casas). A detecção roda antes da classificação de transferências e vale também para `categoryId 04000000`.
    - `R16`: se o ativo casado estiver em `TOTAL_WITHDRAWAL` e houver ativo `ACTIVE` da mesma raiz de 4 letras com sufixo `11`, o provento é atribuído ao ativo-base com `"recibo <ticker original>"` em `notes`.
    - `R21`: `redactDiagnosticDescription` (`domain/openFinance/diagnostics.ts`) mascara contrapartes em `04*`/`05*` após `"|"`, `" para "` ou `" de "` como `<contraparte>`, remove CPF/CNPJ, remove palavras do nome do titular (`owner` sem acento) e troca sequências de 4+ dígitos por `####` preservando datas e tickers. O export de diagnóstico inclui `name` e `app` (`ledgerQuantity`, `hasAveragePrice`, `costBasisSource`, `valueSource`, `displayedValue`, `incomeCount12m`) por investimento e `entriesLast90d` (`total`, `byKind`, `outrosCount`, `outrosPct`) por conta.
  - **Classificação dos lançamentos de conta Open Finance (Sprint 91 — R17–R20)**:
    - `R18` (ordem): `classifyOpenFinanceBankEntry` (`domain/openFinance/classification.ts`) decide `kind`, `categoryId` e `reason` de lançamentos de conta (cartão não muda): provento (R9/R15) → investimento (R17) → conta própria (`04*`) → pagamento de fatura → sinal. O pagamento de fatura debitado na conta segue `expense` aqui; o pareamento com o crédito do cartão o converte em transferência (comportamento anterior).
    - `R17`: `categoryId` `03*` exceto `0306*`, ou descrição com APLICAÇÃO AUTOMÁTICA, RESGATE APLICAÇÃO, LIQ BOLSA, OPERAÇÕES EM BOLSA ou taxas B3 (EMOL/TTA/CCP) ⇒ `transfer_out`/`transfer_in` sem par, `reason = INVESTMENT_MOVE`. Saem de receitas, despesas e orçamento; continuam no saldo da conta. PENDING Open Finance com mais de 40 dias (`isStaleOpenFinancePending`) fica fora de `calculateMonthlySummary` (quando recebe `todayIso`), da previsão (`projectCashflow`) e de `detectOverdueAndDueSoon*`; o diagnóstico mostra `stalePendingCount` por conta.
    - `R18` (pareamento global): `pluggyClassificationService.pairOwnTransfersAcrossItems()` roda ao fim de cada sync de conexão sobre os lançamentos Open Finance de contas correntes dos últimos 40 dias, sem `transfer_group_id`, sem `kind`/`category_id` em `user_edited_fields`, sem vínculo a provento e que não sejam `INVESTMENT_MOVE`. Critérios: mesmo valor em centavos, direção oposta, contas diferentes, até 2 dias; desempate: `04*` em algum lado, depois a menor diferença de datas. Grava `of-tr-<out>-<in>` nos dois lados (`reason = OWN_ACCOUNT_PAIRED`). Lançamento `04*` sem par fica `transfer_*` com `OWN_ACCOUNT_UNPAIRED` (exceto provento). Um par global já gravado não é desfeito por sincronizações seguintes.
    - `R19`: crédito de conta com "adicionado na conta por cartão" / "recarga … cartão" e débito do mesmo valor na MESMA conta em até 1 dia ⇒ `of-topup-<out>-<in>`, ambos transferência (`CARD_TOPUP`). O gasto real permanece no cartão.
    - `R20`: prioridade regras do usuário → `categoryId` (prefixo mais longo) → nome → Outros. 0701/09 ⇒ Assinaturas; 0702 ⇒ Educação; 0703/18 ⇒ Saúde; 07 ⇒ Serviços; 08 ⇒ Compras; 10 ⇒ Mercado; 11 ⇒ Alimentação; 12/14/21 ⇒ Lazer; 17 ⇒ Moradia; 19 ⇒ Transporte; 0101 ⇒ Salário. Crédito com categoria de despesa ⇒ Outros recebimentos. Categorias novas no seed (`cat-alimentacao`, `cat-educacao`, `cat-servicos`, `cat-compras`), inseridas uma vez em bases já semeadas (`fin:categories:seeded:s91`) e incluídas no backup. A árvore da documentação Pluggy (guia "Transaction Categorization") confere com a tabela; os prefixos numéricos vêm da ordem da árvore, pois a doc não lista os ids além dos exemplos.
    - Reclassificação única (`reclassifyOpenFinanceEntries`, marcada em `app_meta` `fin:of:reclassify:s91`): sobre lançamentos Open Finance de conta ainda em Outros, sem `kind`/`category_id` editados, sem par e sem provento. Usa `fin_entries.of_category_id` (novo; só existe nos lançamentos regravados pelo sync) e a descrição. Resumo no log `fin:of:reclassify:s91:log` e em `counts_json` do sync (`reclassified`, `reclassifiedByReason`). Para desfazer: edite o lançamento (a edição prevalece). Colunas novas: `fin_entries.of_category_id` e `of_class_reason`.
  - **Correções da revisão das sprints 90 e 91 (Sprint 92)**:
    - `R15` (ajuste): a busca pelo nome do fundo e pela raiz do ticker só usa o trecho depois de `"s/"` ou `"FII"`. Sem esse marcador, só vale o ticker explícito. A descrição inteira fazia rendimento de conta remunerada virar provento de ativos com letras parecidas (ex.: CSAN3).
    - `R18` (ajuste): só formam par de transferência, dentro da conexão ou entre conexões, lançamentos sem `categoryId` ou com `04*`/`05*` nos dois lados. Valor igual entre compra e salário não é transferência. Pares gravados pela Sprint 91 que violam a regra são desfeitos no sync seguinte (os dois lados voltam a receita/despesa), exceto quando o usuário editou o `kind` de um dos lados. O motivo `OWN_ACCOUNT_PAIRED` é preservado nas sincronizações seguintes.
    - `R22`: cada conexão sincronizada antes da Sprint 92 busca uma única vez o histórico completo (`dateFrom` da primeira sincronização), além das duas passadas da R10, para gravar `of_category_id` e reclassificar os lançamentos antigos. Marca em `app_meta` `fin:of:backfill:s92:<itemId>`; a primeira sincronização de uma conexão nova já grava a marca. Nessa sincronização, o pareamento entre contas usa a janela do histórico completo em vez de 40 dias.
    - `R21` (ajuste): a contraparte é mascarada em descrições de Pix/TED/DOC/transferência de qualquer categoria, e em `04*`/`05*` que não sejam provento. O CNPJ parcial de MEI (`62.985.265`) também é removido.
  - **Contrato completo, campos crus e conferência Pluggy × app (Sprint 97 — R23, R24, R35 função)**:
    - `R24`: `fin_entries` persiste os campos crus `of_provider_id`, `of_bill_id`, `of_bill_forecast_month`, `of_bill_post_date`, `of_operation_type`, `of_raw_status`, `of_raw_type`, `of_raw_amount_cents`, `of_created_at`, `of_installment_number`, `of_installment_total` e `of_bill_month_source`; `fin_bills` persiste `payments_json`, `payments_total_cents`, `finance_charges_json`, `chargeable_charges_cents` e `allows_installments`; `fin_accounts` persiste `of_available_limit_cents`, `of_minimum_payment_cents`, `of_balance_due_date`, `of_overdraft_used_cents` e `of_reserved_cents`; `of_items` persiste `last_updated_at`, `next_auto_sync_at`, `status_detail_json` e `error_code` (todos no schema, migração idempotente e `backupService.ts`).
    - `R23`: `computePluggyTruth`, `collectAppNumbers` (usando `resolveAccountBalance`, `summarizeBill`, `availableLimit` e `summarizeCardAccountForScreen`) e `reconcileAppVsPluggy` em `domain/openFinance/pluggyTruth.ts` calculam os números oficiais da Pluggy e listam diferenças (`APP_RECOMPUTED`, `ITEMS_VS_TOTAL`, `MISSING_BILL`, `SIGN_MISMATCH`) sem alterar nenhum valor exibido nas telas.
    - `R35` (função): `toBrtDate` e `toBrtMonth` em `domain/openFinance/dates.ts` convertem timestamps UTC para UTC−3 fixo preservando datas puras.
    - Diagnóstico v3 (`pluggyDiagnosticsService.ts`): inclui `fieldPresence`, `txCount`, `txCountByYear`, `localEntriesSummary`, `bills`, `forecastVsBill`, `categoryMap`, `item` e `reconciliation` sem PII.
  - **Identidade estável, restauração e reconexão sem duplicar (Sprint 98 — R31, R32, R33, R37)**:
    - `R31`: `matchFetchedToExisting` (`domain/openFinance/identity.ts`) casa cada lançamento buscado na ordem `external_id` → `(account_id, of_provider_id)` → impressão digital (`accountId|brtDate|absAmountCents|normalize(description)|ordinal`, com fallback para `amount_cents`/`due_date`/`description_raw ?? description` em registros pré-97). Atualizações por `providerId` ou impressão digital trocam `external_id`, limpam `of_removed_at` (`counts.restored`) e preservam `user_edited_fields`. Um existente nunca casa duas vezes.
    - `R32`: `detectRemovedOpenFinanceEntries` só roda para contas de conexões com `executionStatus ∈ {SUCCESS, PARTIAL_SUCCESS}` e cujo produto correspondente (`transactions.isUpdated` ou `creditCards.isUpdated`) não é `false`; caso contrário grava `counts.removalSkippedReason`.
    - Limpeza única `fin:of:dedupe:s98` (`app_meta`, log em `fin:of:dedupe:s98:log`): remove duplicatas com mesma impressão digital base, mesmo `kind` e `external_id` diferente onde apenas um veio na busca, preservando edições quando só um lado foi editado (`DUPLICATE_MERGED`, ou `counts.dedupeConflicts` se ambos editados).
    - `R33`: `previewAccountReconciliation` sugere conta Open Finance antiga de conexão anterior pela chave `(COMPE/instituição, tipo, últimos 4 dígitos)` para reconectar sem duplicar o histórico.
    - `R37`: 1ª sincronização da conexão busca sem `dateFrom`; conexões antigas executam uma migração única sem `dateFrom` marcada em `fin:of:fullhistory:s98:<itemId>`.
  - **Faturas do cartão iguais às da Pluggy (Sprint 99 — R25, R26, R27, R28)**:
    - `R25`: `assignBillMonth` atribui `bill_month` na ordem `BILL_ID` → `FORECAST` (com `inferForecastOffset` por conexão, mínimo 5 amostras e ≥ 80% de concordância) → `POST_DATE` → `CALENDAR`, gravando `of_bill_month_source` e preservando `bill_month` em `user_edited_fields`. Migração única `fin:of:billmonth:s99` (log em `fin:of:billmonth:s99:log`) reatribui lançamentos antigos não editados.
    - `R26`: `deriveCardCalendar(bills)` extrai `due_day` e `closing_day` das faturas da Pluggy e grava `calendar_source = 'PLUGGY_BILLS'` quando a conta não tem `calendar_source = 'USER'`.
    - `R27`: `summarizeOpenFinanceBill` usa `total_amount_cents` de `fin_bills`, calcula `paidCents` na ordem `NEXT_BILL_PAYMENTS` → `SAME_BILL_PAYMENTS` (mais recente, `paymentDate >= closing_date`) → `APP_ENTRIES`, e classifica em `paga` / `parcial` / `atrasada` / `fechada` / `aberta` / `sem saldo` / `sem dados de pagamento` (D38). Pagamento de fatura nunca recebe `bill_month` pelo calendário (`assignPaymentBillMonth`, D39).
    - `R28`: `AccountsScreen` exibe `Limite usado`, `Disponível` (`of_available_limit_cents`, sem chamar `availableLimit()`), `Fatura atual`, `Próximas`, `Fechada a pagar` e o total agregado `"Total nos cartões R$ X · Y% do limite de R$ Z"` (D45); `CardBillScreen` exibe total e status da Pluggy, faixa de diferença itens × total, pagamentos e encargos informativos; `projectCashflow`, `detectOverdueAndDueSoonWithBills` e `finGoalsService` usam `total − pago` das faturas fechadas Open Finance.
  - **Pagamento de fatura, estorno, cashback, tarifa e rotativo (Sprint 100 — R29, R30)**:
    - `R29`: `classifyOpenFinanceCardEntry` (`domain/openFinance/classification.ts`) decide direção por `type` (D37, fallback pelo sinal) e classifica créditos em `CARD_BILL_PAYMENT` (`transfer_in`, por `PAGAMENTO_FATURA`, regex estendida de `isCardBillPayment` ou categoria), `CARD_REFUND` (`ESTORNO`, abate da categoria da compra nos últimos 90 dias), `CARD_CASHBACK` (`CASHBACK`) ou `CARD_CREDIT_OTHER`; e débitos em `CARD_FEE` (`TARIFA`, `cat-taxas-bancarias`), `CARD_DEBT_ROLLOVER` (`BILL_INSTALLMENT`/`REVOLVING_CREDIT`, entra na fatura mas sai de `calculateMonthlySummary` e `calculateBudgetUsage`), `CARD_LOAN` (`cat-emprestimos`) ou `SIGN`. Pagamento sintético `"Pagamento recebido"` com par do banco em até 3 dias recebe `of_removed_at` e `CARD_PAYMENT_DUPLICATE`.
    - `R30`: `classifyOpenFinanceBankEntry` marca débitos de pagamento de fatura como `CARD_BILL_PAYMENT_CANDIDATE`, e `pluggyClassificationService.pairCardBillPayments` pareia em `of-cardpay-<out>-<in>` com `CARD_BILL_PAYMENT` do cartão (até 5 dias), ou `transfer_out` `CARD_BILL_PAYMENT_BILL_MATCH` por `fin_bills.payments_json` (até 3 dias), ou mantém `expense` `CARD_BILL_PAYMENT_UNMATCHED`. Reclassificação única `fin:of:reclassify:s100` (log em `fin:of:reclassify:s100:log`) respeita `kind` editado.
  - **Conta corrente, saldos, pendentes e datas BRT (Sprint 101 — R34, R35; D34–D36, D44)**:
    - `R35` / `D34`: todas as datas da Pluggy (`tx.date`, `tx.tradeDate`, `creditCardMetadata.billPostDate`/`billForecastDate`, `creditData.balanceDueDate`, `bills.dueDate`/`billClosingDate`/`payments.paymentDate`) usam `toBrtDate`/`toBrtMonth` (UTC−3 fixo, preservando datas puras). Migração única `fin:of:brtdates:s101` (`fin:of:brtdates:s101:log`) corrige lançamentos antigos respeitando `due_date` em `user_edited_fields`.
    - `R34`: `PENDING` em conta corrente com `brtDate <= todayIso` vira `PROCESSING` (não altera saldo e sai de `detectOverdueAndDueSoon*` e `projectCashflow`); com `brtDate > todayIso` vira `SCHEDULED` (entra em `A vencer` / `projectCashflow` e em `computeAppPendingOutflowCents`). Cancelamentos removidos na busca sofrem soft delete (`of_removed_at`).
    - `D35` / `D36` / `D44`: `monthlyAccountFlows` soma entradas e saídas efetivadas do mês incluindo transferências; `AccountsScreen` exibe em conta Open Finance `"Em processamento"`, `"Agendado"`, `"Cheque especial usado"`, `"Reservado (caixinhas)"`, `"Saldo contábil"` (quando difere do disponível) e fluxo mensal; `FinanceHomeScreen` exibe `"Despesas futuras"` (`computeAppPendingOutflowCents`) separado de `"A vencer · 7 dias"`; `collectAppNumbers`/`reconcileAppVsPluggy` conferem fluxos mensais e `pendingOutflowCents`.
  - **Saúde da conexão, consentimento e tela "Conferir com o Meu Pluggy" (Sprint 102 — R36; D36, D42, D46, D47)**:
    - `R36`: `OpenFinanceScreen` exibe `"Dados do Meu Pluggy de dd/mm às hh:mm"` (`last_updated_at` em BRT via `formatPluggyLastUpdatedBrt`), próxima atualização quando houver, status/execução em pt-BR (`domain/openFinance/itemStatus.ts`, A.7), avisos de `status_detail_json` em pt-BR (`domain/openFinance/warnings.ts`, A.8 com `providerMessage`), o aviso fixo de janela de 24 h do Meu Pluggy e banners de consentimento amarelo (≤ 30 dias) e vermelho (vencido ou `USER_AUTHORIZATION_EXPIRED`) com o passo a passo de renovação via conector `MeuPluggy` e reconexão R33.
    - `OpenFinanceReconciliationScreen` (botão `"Conferir com o Meu Pluggy"`): realiza leitura somente-leitura na Pluggy, compara cada conta, cartão, fatura fechada e contagem de transações (`computePluggyTruth` + `collectAppNumbers` + `reconcileAppVsPluggy` + diferença de itens locais × total da fatura) exibindo motivos em pt-BR, além da seção informativa de Investimentos (`D46` `QUOTE_VS_INSTITUTION`, `D47` divergência de cotas livro × instituição, sem contar como falha) e botão `"Exportar conferência"` sem PII.
    - `D42`: `AccountsScreen` e `EntriesListScreen` recebem `hideFab` dentro do `FinanceHomeScreen` para manter apenas o botão `"+"` global do `FloatingBottomDock`.
  - **Correções da validação no aparelho (Sprints 102b/102c)**:
    - `createEntriesBatch` grava em lotes de `floor(900 / colunas)` linhas (`SQLITE_MAX_VARIABLES = 900`): o SQLite do Android recusa comandos com mais variáveis ("too many SQL variables").
    - Pagamento de fatura no cartão é reconhecido por `operationType = PAGAMENTO_FATURA`, pela descrição ou pela categoria (`isCardBillPayment`), em todo cálculo de itens/fatura aberta; as conexões Meu Pluggy não trazem `operationType`.
    - Compra PENDENTE de cartão sem `billId` nunca é atribuída a fatura já devolvida pela Pluggy (`keepPendingOutOfClosedBills`): vai para a primeira fatura em aberto.
    - Conferência: despesas futuras comparadas só com as contas da conexão; valor de investimento = valor exibido (`resolveDisplayedAssetValue`); livro = transações (`computeLedgerQuantity`).
    - Importação do histórico completo (R37) refecha o saldo inicial das contas correntes (R11), também uma vez para conexões que já o importaram (`app_meta` `fin:of:reclose:s102b:<itemId>`).

---

## 18. Integração Finanças × Investimentos (Sprints 103+)

- **R38 — Dinheiro único (`domain/money.ts`, Sprint 103)**:
  - Única ponte entre centavos inteiros (Finanças) e `Decimal` (Investimentos): `centsToDecimal(cents)` e `decimalToCents(value)` (arredondamento `ROUND_HALF_UP`, reutilizado por `toCentsDecimal` em `domain/openFinance/index.ts`), além de `formatBRL`.
  - Moeda estrangeira: `Money = { amount: Decimal, currency: 'BRL' | 'USD' }`; `addMoney` proíbe somar moedas distintas sem `convert(money, rate, rateDate)` (que preserva `{ money, rate, rateDate }` com arredondamento em 2 casas `ROUND_HALF_UP`).
- **R39 — Conta de corretora e vínculo carteira ↔ conta (Sprint 103)**:
  - `fin_accounts.type` aceita `'broker'` (`FinAccountType`). Conta corretora não possui fatura, limite nem dia de fechamento, e seu saldo segue a regra comum (`calculateAccountBalance`).
  - `portfolios.fin_account_id` (nullable, índice `idx_portfolios_fin_account_id`). Uma conta corretora pode atender várias carteiras; uma carteira vincula-se a no máximo uma conta.
  - Migração idempotente `migration:broker-accounts:v1` (`app_meta`, executada em `finService.initializeFinanceModule`) cria uma conta `'broker'` de saldo inicial 0 com o mesmo nome para cada carteira Pluggy (`of_item_id != null`) ainda sem conta vinculada, sem tocar carteiras manuais. `pluggyPortfolioService.ensurePortfolioForItem` já cria a conta par ao criar carteira nova.
- **R40 — Compra, venda e aporte em lote viram lançamento/transferência atômica (Sprint 104)**:
  - `fin_entries.kind` passa a aceitar `'investment_buy' | 'investment_sell' | 'investment_income'` (definidos em `FIN_ENTRY_KINDS` em `domain/financeFlow/index.ts`) e ganha a coluna `linked_transaction_id` (índice `idx_fin_entries_linked_transaction`).
  - Em carteira com `fin_account_id` vinculado, `transactionService.executeTransaction` grava movimentação, atualização do ativo e lançamentos de Finanças num único `runInTransaction` (resolvendo `MELHORIAS 1.2`). Valor em centavos calculado sobre `total_amount` (com taxas) via `decimalToCents` (`domain/money.ts`).
  - `BUY` com `cashSource` = corretora (padrão) gera apenas `investment_buy` na corretora; `BUY` com `cashSource` = outra conta gera `finService.createTransfer` (origem → corretora) + `investment_buy` na corretora. `SELL` gera `investment_sell` na corretora (e transferência de volta apenas se `cashSource` for outra conta). `cashSource: null` omite lançamento em Finanças.
  - `rebalanceExecution.executeBatchContributions` gera uma única transferência da origem com o total e um `investment_buy` por compra na mesma transação.
  - `transactionService.deleteTransaction` remove a transação e os `fin_entries` ligados atomicamente. Em Finanças (`finService.deleteEntry` e `EntriesListScreen`), excluir lançamento `investment_*` é bloqueado com a mensagem `"Esse lançamento vem da carteira <nome>. Exclua a movimentação por lá."`.
  - `domain/financeFlow` (`calculateMonthlySummary`, `calculateBudgetUsage`, `suggestBudgetLimit`, `detectOverdueAndDueSoonWithBills`, `projectCashflow`): `investment_*` nunca entram em despesas, receitas mensais nem orçamento; `calculateAccountBalance` e saldo inicial de `projectCashflow` consideram `investment_buy` como saída e `investment_sell`/`investment_income` como entrada.
  - `TransactionScreen` (artboard 9): exibe o bloco `"Pagar com saldo de uma conta"` (ligado por padrão quando há vínculo), chips `"Sai de"` (corretora + contas `checking`/`cash`) e linha `"Saldo … → …"`; em carteira sem vínculo, exibe uma única vez por carteira (`app_meta` `link-prompt:<portfolioId>`) o aviso `"Vincular uma conta?"`.
  - `FinanceMoreScreen` (`ReclassifyAportesSheet` + `findExpenseAporteCandidates`): lista despesas antigas que parecem aporte para corretora; o usuário marca e confirma manualmente (nunca automático).
- **R41 — Provento entra uma vez sem duplicar com Open Finance (Sprint 104)**:
  - Ao criar `income_event` em carteira vinculada (`incomeRepository.addIncome`), cria `investment_income` com `linked_income_id` na corretora vinculada, a menos que já exista lançamento Open Finance equivalente.
  - Regra explícita de casamento (`findMatchingOpenFinanceIncomeEntry` em `domain/finance/incomeDedup.ts`): conta igual à conta vinculada da carteira, data dentro de `±3` dias e valor equivalente (`± R$ 0,01` ou JCP bruto × líquido 85% dentro de `1%`).
  - Nos dois sentidos (provento antes + Open Finance depois via `pluggyIncomeRelinkService`/`pluggySyncService`, ou Open Finance antes + provento depois via `incomeRepository.addIncome`), o lançamento do Open Finance prevalece como valor pago e o `income_event` permanece como evento do ativo, removendo o `investment_income` sintético para nunca duplicar o crédito no saldo.
- **R42 — Patrimônio de uma fonte só (Sprint 105)**:
  - `services/patrimonyService.ts` (`getPatrimony`) calcula `investedCents`, `accountsCents`, `cardsCents`, `totalCents`, `byPortfolio[]` e `byAccount[]` usando a precedência única (`of_reported_value` institucional → `manual_position_value` → `manual_price_override` → cotação em lote → preço médio, 0 se `cost_basis_source === 'UNKNOWN'`).
  - Contas `type === 'broker'` entram em `investedCents` (caixa dentro da corretora) e não em `accountsCents`, evitando dupla contagem. `App.tsx/refreshAppData`, `NetWorthScreen` e `finGoalsService` leem dessa mesma fonte.
- **R43 — Mês em uma linha (Sprint 105)**:
  - `domain/financeFlow/monthSummary.ts` (`monthSummary`): receitas (`income` + `investment_income`, destacando `dividendIncomeCents` como `"dos quais proventos"`), despesas (`expense`), aportes (`transfer_out` para corretora + `investment_buy` sem transferência no mês − `investment_sell` resgatado para fora, sem duplicar transferência + `investment_buy`), sobra (`receitas − despesas − aportes`) e taxa de poupança (`(receitas − despesas) / receitas`, `"—"` sem receita).
  - `FinanceHomeScreen` (Resumo, artboard 7, `DEC-5`) exibe `"Saldo em contas"`, `"O mês em uma linha"`, `"Reserva"` (`"—"` até Sprint 106) e `"Próximos 7 dias"` sem exibir nenhum bloco de Investimentos.
- **R44 — Metas unificadas (Sprint 105)**:
  - Migração idempotente `migration:portfolio-goals-to-fin-goals:v1` (`app_meta`, executada em `finService.initializeFinanceModule` e `finGoalsService.migrateLegacyGoalsIfNeeded`) converte `portfolios.patrimony_goal` e `monthly_contribution` para `fin_goals` fonte `'portfolio'`.
  - `App.tsx` e `PortfolioManagementScreen` (`GoalProgressTile` + `GoalEditorSheet`) passam a ler e gravar diretamente em `fin_goals` via `finGoalsService.savePortfolioGoal`; as colunas antigas em `portfolios` não são mais lidas (mantidas apenas para importação de backups legados).
- **R45 — Fechar o mês (Sprint 106)**:
  - `domain/financeFlow/monthClose.ts`: `availableSurplus` = sobra do mês (`R43`) − despesas pendentes até o dia D configurável (padrão 5 do mês seguinte); `emergencyReserve` = (`checking` + `cash` + renda fixa com `rf_daily_liquidity === 1`, `NULL` = não líquida) ÷ média de despesas dos últimos 6 meses fechados (`"—"` sem histórico; sugere reforço quando abaixo da meta, padrão 6 meses).
  - `services/monthCloseService.ts`: grava `month-close:YYYY-MM` em `app_meta`, publica `{ amountCents, sourceAccountId, month }` em `stores/pendingContributionStore.ts` (consumido uma vez) ao escolher `"Fechar e aportar em Investimentos ›"` e troca para Investimentos abrindo `SimulatorScreen` pré-preenchido (confirmar lá executa `R40` com 1 transferência + N compras; fechar sem confirmar limpa o pendente e não lança nada).
  - `services/finReminderService.ts` (`checkAndNotifyMonthClose`): no dia 1º dispara `"Feche <mês anterior>"` quando não houver marca `month-close:YYYY-MM`.
