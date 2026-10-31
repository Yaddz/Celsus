# CELSUS — Dossiê Oficial e Relatório de Testes (TDD Lock Protocol)

> **DOCKET REF:** `CELSUS-TDD-REPORT-001`  
> **Protocolo:** TDD Estrito com Testes Imutáveis (`tests.lock.json` + `SHA-256` + `ReadOnly`)  
> **Regra de Ouro:** Os testes são derivados diretamente da `SPEC.md` na **Fase A** de cada Sprint e bloqueados. Se um teste falhar na **Fase B**, **o código de produção deve ser ajustado, nunca o teste**.

---

## 1. Resumo Executivo de Execução por Sprint

| Sprint | Escopo da Suite de Testes | Arquivos de Teste | Total de Casos | Passaram | Falharam | Integridade SHA-256 (`test-lock`) | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sprint 1** | Backend Go: Parser COTAHIST, Proxy BRAPI, Taxas Macro e Endpoints REST | 5 | 9 | 0 | 9 | `LOCKED (5 arquivos)` | 🔴 Fase A Concluída (Red & Locked) |
| **Sprint 2** | Mobile Foundation: Componentes UI Design System e Schema SQLite/Drizzle | 3 | 12 | 0 | 0 | `PENDENTE FASE A` | ⏳ Aguardando |
| **Sprint 3** | Motor Financeiro: Pesos 2 Níveis, Preço Médio, Renda Fixa e Calculadora de Aporte | 5 | 24 | 0 | 0 | `PENDENTE FASE A` | ⏳ Aguardando |
| **Sprint 4** | Fluxo de Transações (`BUY`/`SELL`), Cache Histórico e Simulador de Rebalanceamento | 3 | 14 | 0 | 0 | `PENDENTE FASE A` | ⏳ Aguardando |
| **Sprint 5** | Série Temporal de Evolução Patrimonial e Cálculos de Rentabilidade/Alocação | 3 | 12 | 0 | 0 | `PENDENTE FASE A` | ⏳ Aguardando |
| **Sprint 6** | Backup `.celsus.zip` (CSVs + `manifest.json` SHA-256), Restore/Merge e Privacidade | 3 | 15 | 0 | 0 | `PENDENTE FASE A` | ⏳ Aguardando |

---

## 2. Catálogo Completo de Casos de Teste da Especificação

### 2.1. Sprint 1 — Backend Go (`services/market-api`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S1-T01` | `internal/cotahist/parser_test.go` | `TestParseValidStockLine_245Bytes` | Extração exata de `DATPRE`, `CODBDI="02"`, `CODNEG`, `TPMERC="010"` e `PREULT` dividido por 100 | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🔴 RED (Stub) |
| `S1-T02` | `internal/cotahist/parser_test.go` | `TestParseValidFIILine_CODBDI12` | Classificação correta de FII quando `CODBDI == "12"` e `TPMERC == "010"` | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🔴 RED (Stub) |
| `S1-T03` | `internal/cotahist/parser_test.go` | `TestIgnoreHeaderTrailerAndOptions` | Ignorar `TIPREG="00"`, `"99"` e mercados de opções (`TPMERC="070"`, `"080"`) | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🔴 RED (Stub) |
| `S1-T04` | `internal/cotahist/parser_test.go` | `TestParseZipArchiveStreaming` | Leitura de arquivo `.ZIP` contendo `COTAHIST_AXXXX.TXT` sem estourar memória | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🔴 RED (Stub) |
| `S1-T05` | `internal/cotahist/repository_test.go` | `TestIdempotentBatchUpsert` | Reimportar o mesmo arquivo COTAHIST não duplica linhas (`INSERT OR REPLACE`) | `2b3208f456c5bbe99dc1d7357dd2805f178043a46eb8ca4d4143a7ebd82c0178` | 🔴 RED (Stub) |
| `S1-T06` | `internal/brapi/client_test.go` | `TestFetchStockAndFIIQuotesWithCache` | Busca em lote na BRAPI e retorno do cache dentro do TTL sem nova chamada HTTP | `ea2d19693c9f881a430e26657f200906dd12efb150da3dbbdbb7ce2e80638cac` | 🔴 RED (Stub) |
| `S1-T07` | `internal/brapi/client_test.go` | `TestFetchCryptoQuotesInBRL` | Cotação de criptomoedas (`BTC`, `ETH`) padronizada em `BRL` | `ea2d19693c9f881a430e26657f200906dd12efb150da3dbbdbb7ce2e80638cac` | 🔴 RED (Stub) |
| `S1-T08` | `internal/macro/rates_test.go` | `TestFetchAndStoreDailyCDIAndIPCA` | Armazenamento e consulta da série histórica diária de CDI e IPCA por intervalo de datas | `575b28ebc6e03256deac947e03d67d2bfdac46debc59f6f0cb3a2a921d4f8881` | 🔴 RED (Stub) |
| `S1-T09` | `internal/http/handlers_test.go` | `TestEndpoints_Health_Catalog_Quotes_History_Macro` | Contratos JSON e códigos HTTP (`200`, `400`) para todos os 5 endpoints `/v1/*` | `783a97695566ebfc24fe73312152d9d97c164ff4ee3991b081c54306ae49fdc1` | 🔴 RED (Stub) |

---

### 2.2. Sprint 2 — Fundação Mobile, Design System & SQLite (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` / `DESIGN_SYSTEM.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S2-T01` | `src/theme/__tests__/tokens.test.ts` | `TestDesignSystemColorAndTypographyTokens` | Cores exatas (`#111315`, `#191B1D`, `#D96628`, `#2E4A44`, `#D5CAA8`) e `Space Mono` | `-` | ⏳ |
| `S2-T02` | `src/components/ui/__tests__/AttributeStatBar.test.tsx` | `TestAssetClassToAttributeMapping` | Mapeamento exato: `FIXED_INCOME`->Intellect, `FII`->Psyche, `STOCK`->Physique, `CRYPTO`->Motorics | `-` | ⏳ |
| `S2-T03` | `src/db/__tests__/schema.test.ts` | `TestSQLiteTablesAndOpenFinanceColumns` | Criação das 6 tabelas locais com UUID v4 e colunas `source`, `external_id`, `institution_id` | `-` | ⏳ |

---

### 2.3. Sprint 3 — Motor Financeiro, Carteiras e Pesos em 2 Níveis (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S3-T01` | `src/domain/finance/__tests__/weights.test.ts` | `TestTwoLevelGlobalTargetCalculation` | $T_i = (W_c \times w_{i,c}) / 100$ com validação de soma $100\%$ na classe e na carteira | `-` | ⏳ |
| `S3-T02` | `src/domain/finance/__tests__/averagePrice.test.ts` | `TestAveragePriceOnMultipleBuysWithFees` | $PM_{\text{novo}} = (\text{Custo Anterior} + Q \times P + \text{Taxas}) / Q_{\text{total}}$ | `-` | ⏳ |
| `S3-T03` | `src/domain/finance/__tests__/averagePrice.test.ts` | `TestSellDoesNotChangeAveragePrice` | Venda parcial mantém $PM$ intacto, reduz quantidade e calcula lucro realizado exato | `-` | ⏳ |
| `S3-T04` | `src/domain/finance/__tests__/averagePrice.test.ts` | `TestCryptoEightDecimalPlacesPrecision` | Operações fracionadas (ex: `0.00451234 BTC`) sem erro de ponto flutuante via `decimal.js` | `-` | ⏳ |
| `S3-T05` | `src/domain/finance/__tests__/fixedIncome.test.ts` | `TestFixedIncomeCDIPercentageCurve` | Capitalização composta diária (`110% CDI`) sobre série histórica de dias úteis | `-` | ⏳ |
| `S3-T06` | `src/domain/finance/__tests__/fixedIncome.test.ts` | `TestFixedIncomePreAndIPCAPlusAndManualOverride` | Cálculo Pré-fixado (base 252), IPCA+ e precedência de `manual_price_override` | `-` | ⏳ |
| `S3-T07` | `src/domain/finance/__tests__/rebalance.test.ts` | `TestSmartContributionCalculator_NoSells` | Distribuição proporcional ao déficit positivo $D_i = \max(0, V^{\text{meta}}_i - V_{\text{atual},i})$ sem sugerir venda de ativos acima da meta | `-` | ⏳ |
| `S3-T08` | `src/domain/finance/__tests__/rebalance.test.ts` | `TestSmartContributionIntegerSharesAndCryptoFractions` | Arredondamento inteiro para Ações/FIIs e frações de 8 casas para Cripto | `-` | ⏳ |

---

### 2.4. Sprint 4 — Movimentações, Integração COTAHIST/BRAPI e Simulador (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S4-T01` | `src/services/__tests__/transactionService.test.ts` | `TestAutoFillHistoricalPriceFromCotahistOnBuy` | Busca do preço de fechamento na data selecionada para pré-preencher o aporte | `-` | ⏳ |
| `S4-T02` | `src/services/__tests__/transactionService.test.ts` | `TestAtomicTransactionInsertAndAssetRecalculation` | Inserir compra/venda atualiza atomicamente o saldo e PM do ativo na carteira | `-` | ⏳ |
| `S4-T03` | `src/services/__tests__/rebalanceExecution.test.ts` | `TestBatchConfirmSimulatedContributions` | Confirmar sugestões do simulador cria múltiplos lançamentos `BUY` no Livro-Razão | `-` | ⏳ |

---

### 2.5. Sprint 5 — Evolução Patrimonial e Dashboards (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S5-T01` | `src/domain/finance/__tests__/portfolioHistory.test.ts` | `TestDailyPatrimonyEvolutionCurve` | Cruzamento de transações passadas com preços COTAHIST + curva Renda Fixa gerando `investedCapital` vs `marketValue` | `-` | ⏳ |
| `S5-T02` | `src/domain/finance/__tests__/consolidatedView.test.ts` | `TestMultiPortfolioConsolidation` | Soma isolada por carteira vs consolidação patrimonial total em BRL na Home | `-` | ⏳ |

---

### 2.6. Sprint 6 — Exportação/Importação `.celsus.zip` e Segurança Local (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S6-T01` | `src/services/__tests__/backupService.test.ts` | `TestExportZipStructureAndManifestSHA256` | Geração do `.celsus.zip` contendo `manifest.json` + 4 CSVs com hashes SHA-256 e contagem de linhas exatos | `-` | ⏳ |
| `S6-T02` | `src/services/__tests__/backupService.test.ts` | `TestRejectTamperedCSVOnImport` | Adulterar 1 byte em `transactions.csv` dentro do ZIP deve abortar a importação com erro de integridade `SHA-256` sem alterar o banco local | `-` | ⏳ |
| `S6-T03` | `src/services/__tests__/backupService.test.ts` | `TestImportFullRestoreAndUUIDMerge` | Validação do modo *Restore Completo* (substitui tudo) e *Merge* (mescla por UUID v4 sem duplicar lançamentos) | `-` | ⏳ |
| `S6-T04` | `src/services/__tests__/privacyAndAuth.test.ts` | `TestPrivacyRedactionAndBiometricLock` | Ocultação de saldos (`██████,██`) quando `isPrivacyModeEnabled=true` e disparo do bloqueio biométrico | `-` | ⏳ |

---

## 3. Histórico de Execuções e Logs de Auditoria TDD

### Sprint 1 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 5 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json`.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 5 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase):**
  ```text
  --- FAIL: TestFetchStockAndFIIQuotesWithCache (client_test.go: esperava 1 requisição ao servidor mock, obtido 0)
  --- FAIL: TestFetchCryptoQuotesInBRL (client_test.go: cotação de BTC ausente na resposta)
  --- FAIL: TestParseValidStockLine_245Bytes (parser_test.go: esperava que a cotação fosse incluída)
  --- FAIL: TestParseValidFIILine_CODBDI12 (parser_test.go: esperava que FII CODBDI 12 fosse incluído)
  --- FAIL: TestParseZipArchiveStreaming (parser_test.go: esperava 2 cotações extraídas do ZIP, obtido 0)
  --- FAIL: TestIdempotentBatchUpsert (repository_test.go: esperava 1 cotação para PETR4, obtido 0)
  --- FAIL: TestEndpoints_Health_Catalog_Quotes_History_Macro (handlers_test.go: 5 endpoints com 501 Not Implemented nos stubs)
  --- FAIL: TestFetchAndStoreDailyCDIAndIPCA (rates_test.go: esperava 2 observações de CDI no período, obtido 0)
  Total: 9 testes | 0 PASS | 9 FAIL (Red Phase confirmada)
  ```
