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
