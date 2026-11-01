# CELSUS — Dossiê Oficial e Relatório de Testes (TDD Lock Protocol)

> **DOCKET REF:** `CELSUS-TDD-REPORT-001`  
> **Protocolo:** TDD Estrito com Testes Imutáveis (`tests.lock.json` + `SHA-256` + `ReadOnly`)  
> **Regra de Ouro:** Os testes são derivados diretamente da `SPEC.md` na **Fase A** de cada Sprint e bloqueados. Se um teste falhar na **Fase B**, **o código de produção deve ser ajustado, nunca o teste**.

---

## 1. Resumo Executivo de Execução por Sprint

| Sprint | Escopo da Suite de Testes | Arquivos de Teste | Total de Casos | Passaram | Falharam | Integridade SHA-256 (`test-lock`) | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sprint 1** | Backend Go: Parser COTAHIST, Proxy BRAPI, Taxas Macro e Endpoints REST | 5 | 9 | 9 | 0 | `VERIFIED (5 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 2** | Mobile Foundation: Componentes UI Design System e Schema SQLite/Drizzle | 3 | 22 | 22 | 0 | `VERIFIED (8 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 3** | Motor Financeiro: Pesos 2 Níveis, Preço Médio, Renda Fixa e Calculadora de Aporte | 4 | 37 | 37 | 0 | `VERIFIED (12 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 4** | Fluxo de Transações (`BUY`/`SELL`), Cache Histórico e Simulador de Rebalanceamento | 2 | 20 | 20 | 0 | `VERIFIED (14 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 5** | Série Temporal de Evolução Patrimonial e Cálculos de Rentabilidade/Alocação | 2 | 12 | 12 | 0 | `VERIFIED (16 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 6** | Backup `.celsus.zip` (CSVs + `manifest.json` SHA-256), Restore/Merge e Privacidade | 2 | 16 | 16 | 0 | `VERIFIED (18 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 7** | Integração Local Front+Back, Seed COTAHIST e Sincronização de Cotações | 3 | 24 | 24 | 0 | `VERIFIED (21 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 8** | Paletas por Carteira (`/imgsinsp`), Tema Escuro/Claro, `AmbientOrb` e Header XP | 3 | 22 | 22 | 0 | `VERIFIED (24 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 9** | Card em Pilha (`StackedWalletDeck`), Home Clean v2 e Matriz Direita → Esquerda | 4 | 21 | 21 | 0 | `VERIFIED (28 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 10** | Tela Detalhe da Classe (Donut Oco + Scroll) e Histórico da Movimentação | 3 | 11 | 11 | 0 | `VERIFIED (31 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 11** | Estatísticas v2 (`5D/Mês/Ano/5A/Total` + Linha) e Carteiras Clean v2 | 3 | 27 | 27 | 0 | `VERIFIED (34 arquivos)` | 🟢 Aprovado (100% Green) |
| **Sprint 12** | Header Minimalista XP, Remoção Global de Headers, Perfil/Configurações, Tema Claro e Máscara `*******` | 2 | 14 | 5 | 9 | `VERIFIED (36 arquivos)` | 🔴 Red Phase (Fase A Bloqueada) |
| **TOTAL (S1–S12)** | **Suíte Concluída Integrada (Backend Go + Mobile React Native/Expo)** | **36** | **235** | **226** | **9** | **`VERIFIED (36 arquivos)`** | **🔒 Fase A Bloqueada (TDD Lock)** |

---

## 2. Catálogo Completo de Casos de Teste da Especificação

### 2.1. Sprint 1 — Backend Go (`services/market-api`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S1-T01` | `internal/cotahist/parser_test.go` | `TestParseValidStockLine_245Bytes` | Extração exata de `DATPRE`, `CODBDI="02"`, `CODNEG`, `TPMERC="010"` e `PREULT` dividido por 100 | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🟢 PASS (0.00s) |
| `S1-T02` | `internal/cotahist/parser_test.go` | `TestParseValidFIILine_CODBDI12` | Classificação correta de FII quando `CODBDI == "12"` e `TPMERC == "010"` | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🟢 PASS (0.00s) |
| `S1-T03` | `internal/cotahist/parser_test.go` | `TestIgnoreHeaderTrailerAndOptions` | Ignorar `TIPREG="00"`, `"99"` e mercados de opções (`TPMERC="070"`, `"080"`) | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🟢 PASS (0.00s) |
| `S1-T04` | `internal/cotahist/parser_test.go` | `TestParseZipArchiveStreaming` | Leitura de arquivo `.ZIP` contendo `COTAHIST_AXXXX.TXT` sem estourar memória | `39a7a85bc06b595cc1e513215050ac66e41b1bef3b11d40f0f658fb111a0dd33` | 🟢 PASS (0.00s) |
| `S1-T05` | `internal/cotahist/repository_test.go` | `TestIdempotentBatchUpsert` | Reimportar o mesmo arquivo COTAHIST não duplica linhas (`INSERT OR REPLACE`) | `2b3208f456c5bbe99dc1d7357dd2805f178043a46eb8ca4d4143a7ebd82c0178` | 🟢 PASS (0.00s) |
| `S1-T06` | `internal/brapi/client_test.go` | `TestFetchStockAndFIIQuotesWithCache` | Busca em lote na BRAPI e retorno do cache dentro do TTL sem nova chamada HTTP | `ea2d19693c9f881a430e26657f200906dd12efb150da3dbbdbb7ce2e80638cac` | 🟢 PASS (0.08s) |
| `S1-T07` | `internal/brapi/client_test.go` | `TestFetchCryptoQuotesInBRL` | Cotação de criptomoedas (`BTC`, `ETH`) padronizada em `BRL` | `ea2d19693c9f881a430e26657f200906dd12efb150da3dbbdbb7ce2e80638cac` | 🟢 PASS (0.00s) |
| `S1-T08` | `internal/macro/rates_test.go` | `TestFetchAndStoreDailyCDIAndIPCA` | Armazenamento e consulta da série histórica diária de CDI e IPCA por intervalo de datas | `575b28ebc6e03256deac947e03d67d2bfdac46debc59f6f0cb3a2a921d4f8881` | 🟢 PASS (0.00s) |
| `S1-T09` | `internal/http/handlers_test.go` | `TestEndpoints_Health_Catalog_Quotes_History_Macro` | Contratos JSON e códigos HTTP (`200`, `400`) para todos os 5 endpoints `/v1/*` | `783a97695566ebfc24fe73312152d9d97c164ff4ee3991b081c54306ae49fdc1` | 🟢 PASS (0.05s) |

---

### 2.2. Sprint 2 — Fundação Mobile, Design System & SQLite (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` / `DESIGN_SYSTEM.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S2-T01` | `src/theme/__tests__/tokens.test.ts` | `TestDesignSystemColorAndTypographyTokens` | Cores exatas (`#111315`, `#191B1D`, `#D96628`, `#2E4A44`, `#D5CAA8`, `#C49A45`) e `Space Mono` | `fe51c89542f758616f3fd53093b0ad9a513f74f57106b240502be92a071a9355` | 🟢 PASS (0.01s) |
| `S2-T02` | `src/components/ui/__tests__/AttributeStatBar.test.tsx` | `TestAssetClassToCategoryMapping` | Mapeamento exato das categorias reais: `FIXED_INCOME`->Renda Fixa, `FII`->FIIs, `STOCK`->Ações, `CRYPTO`->Criptomoedas | `065ded5b122ec8bdb02e2f2096c40d71dc7f8e836b6b667c9ffa812da85d5251` | 🟢 PASS (0.24s) |
| `S2-T03` | `src/db/__tests__/schema.test.ts` | `TestSQLiteTablesAndOpenFinanceColumns` | Criação das 6 tabelas locais com UUID v4 e colunas `source`, `external_id`, `institution_id` | `1facc9030adfd09c3fea4bfc8ee265a78d0125f20304443390c0f9a350ce37f7` | 🟢 PASS (0.01s) |

---

### 2.3. Sprint 3 — Motor Financeiro, Carteiras e Pesos em 2 Níveis (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S3-T01` | `src/domain/finance/__tests__/weights.test.ts` | `TestTwoLevelGlobalTargetCalculation` | $T_i = (W_c \times w_{i,c}) / 100$ com validação de soma $100\%$ na classe e na carteira | `df4671fcb67ff92aca272364fb28a6cd41b3ce26666e95a3ed4fe0a41a17f1af` | 🟢 PASS (0.01s) |
| `S3-T02` | `src/domain/finance/__tests__/averagePrice.test.ts` | `TestAveragePriceOnMultipleBuysWithFees` | $PM_{\text{novo}} = (\text{Custo Anterior} + Q \times P + \text{Taxas}) / Q_{\text{total}}$ | `36a6893360a57d4a6d85eaaff72476eb8acaf000182d36eefaef96e8673083ad` | 🟢 PASS (0.01s) |
| `S3-T03` | `src/domain/finance/__tests__/averagePrice.test.ts` | `TestSellDoesNotChangeAveragePrice` | Venda parcial mantém $PM$ intacto, reduz quantidade e calcula lucro realizado exato | `36a6893360a57d4a6d85eaaff72476eb8acaf000182d36eefaef96e8673083ad` | 🟢 PASS (0.01s) |
| `S3-T04` | `src/domain/finance/__tests__/averagePrice.test.ts` | `TestCryptoEightDecimalPlacesPrecision` | Operações fracionadas (ex: `0.00451234 BTC`) sem erro de ponto flutuante via `decimal.js` | `36a6893360a57d4a6d85eaaff72476eb8acaf000182d36eefaef96e8673083ad` | 🟢 PASS (0.01s) |
| `S3-T05` | `src/domain/finance/__tests__/fixedIncome.test.ts` | `TestFixedIncomeCDIPercentageCurve` | Capitalização composta diária (`110% CDI`) sobre série histórica de dias úteis | `8d173807014ef78452c3ca4025f8ffd8f8e7459c9b036dc32f58222141d6b8a3` | 🟢 PASS (0.01s) |
| `S3-T06` | `src/domain/finance/__tests__/fixedIncome.test.ts` | `TestFixedIncomePreAndIPCAPlusAndManualOverride` | Cálculo Pré-fixado (base 252), IPCA+ e precedência de `manual_price_override` | `8d173807014ef78452c3ca4025f8ffd8f8e7459c9b036dc32f58222141d6b8a3` | 🟢 PASS (0.01s) |
| `S3-T07` | `src/domain/finance/__tests__/rebalance.test.ts` | `TestSmartContributionCalculator_NoSells` | Distribuição proporcional ao déficit positivo $D_i = \max(0, V^{\text{meta}}_i - V_{\text{atual},i})$ sem sugerir venda de ativos acima da meta | `be1f8b7a70668dbc39b1430a3a19bc793549205e1bcd36c191415f184f6697a4` | 🟢 PASS (0.01s) |
| `S3-T08` | `src/domain/finance/__tests__/rebalance.test.ts` | `TestSmartContributionIntegerSharesAndCryptoFractions` | Arredondamento inteiro para Ações/FIIs e frações de 8 casas para Cripto | `be1f8b7a70668dbc39b1430a3a19bc793549205e1bcd36c191415f184f6697a4` | 🟢 PASS (0.01s) |

---

### 2.4. Sprint 4 — Movimentações, Integração COTAHIST/BRAPI e Simulador (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S4-T01` | `src/services/__tests__/transactionService.test.ts` | `TestAutoFillHistoricalPriceFromCotahistOnBuy` | Busca do preço de fechamento na data selecionada para pré-preencher o aporte | `80e77f94b663ec4a1242f4408a36ebab83ae504e54a514fec8abd185468cf264` | 🟢 PASS (0.01s) |
| `S4-T02` | `src/services/__tests__/transactionService.test.ts` | `TestAtomicTransactionInsertAndAssetRecalculation` | Inserir compra/venda atualiza atomicamente o saldo e PM do ativo na carteira | `80e77f94b663ec4a1242f4408a36ebab83ae504e54a514fec8abd185468cf264` | 🟢 PASS (0.01s) |
| `S4-T03` | `src/services/__tests__/rebalanceExecution.test.ts` | `TestBatchConfirmSimulatedContributions` | Confirmar sugestões do simulador cria múltiplos lançamentos `BUY` no Livro-Razão | `98cae3fc7bdc822fb608d2d87003f568dbe637eadbc87c331a4ee727023324f8` | 🟢 PASS (0.01s) |

---

### 2.5. Sprint 5 — Evolução Patrimonial e Dashboards (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S5-T01` | `src/domain/finance/__tests__/portfolioHistory.test.ts` | `TestDailyPatrimonyEvolutionCurve` | Cruzamento de transações passadas com preços COTAHIST + curva Renda Fixa gerando `investedCapital` vs `marketValue` | `78439b6b57a9f20e478930b347373f9ebeca871c40cffd1f0037bcf0ca26c268` | 🟢 PASS (0.01s) |
| `S5-T02` | `src/domain/finance/__tests__/consolidatedView.test.ts` | `TestMultiPortfolioConsolidation` | Soma isolada por carteira vs consolidação patrimonial total em BRL na Home | `3056bc65c533bd0932779797e3c461a6f6db22acc41bd41a4ba5959129706c95` | 🟢 PASS (0.01s) |

---

### 2.6. Sprint 6 — Exportação/Importação `.celsus.zip` e Segurança Local (`apps/mobile`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S6-T01` | `src/services/__tests__/backupService.test.ts` | `TestExportZipStructureAndManifestSHA256` | Geração do `.celsus.zip` contendo `manifest.json` + 4 CSVs com hashes SHA-256 e contagem de linhas exatos | `18d17cc3bda2998f7fb2cf2688d92d0d00f4e89d5e143d0d71e41a12ac2fdf90` | 🟢 PASS (0.02s) |
| `S6-T02` | `src/services/__tests__/backupService.test.ts` | `TestRejectTamperedCSVOnImport` | Adulterar 1 byte em `transactions.csv` dentro do ZIP deve abortar a importação com erro de integridade `SHA-256` sem alterar o banco local | `18d17cc3bda2998f7fb2cf2688d92d0d00f4e89d5e143d0d71e41a12ac2fdf90` | 🟢 PASS (0.01s) |
| `S6-T03` | `src/services/__tests__/backupService.test.ts` | `TestImportFullRestoreAndUUIDMerge` | Validação do modo *Restore Completo* (substitui tudo) e *Merge* (mescla por UUID v4 sem duplicar lançamentos) | `18d17cc3bda2998f7fb2cf2688d92d0d00f4e89d5e143d0d71e41a12ac2fdf90` | 🟢 PASS (0.02s) |
| `S6-T04` | `src/services/__tests__/privacyAndAuth.test.ts` | `TestPrivacyRedactionAndBiometricLock` | Ocultação de saldos (`██████,██`) quando `isPrivacyModeEnabled=true` e disparo do bloqueio biométrico | `4d77b41c818c1aacc675bc61d2b47df079a9e4ea5e58566d95f7fec51a3afb54` | 🟢 PASS (0.02s) |

---

### 2.7. Sprint 7 — Ambiente Local Integrado, Busca Real de Tickers e Sincronização (`SPEC v2`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` (v2) Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S7-T01` | `src/services/__tests__/marketApiIntegration.test.ts` | `TestLocalBackendQuotesCatalogAndHistoryIntegration` | Integração `/v1/health`, `/v1/catalog/search`, `/v1/quotes` e `/v1/history` com cache SQLite e fallback offline | `096d33e90c0945289147102f07fe58b8528ad17722f89bf5bfca110111a8383b` | 🟢 PASS (0.01s) |
| `S7-T02` | `src/services/__tests__/marketSyncService.test.ts` | `TestBatchSyncPortfolioTickersAndRecalculatePatrimony` | Sincronização automática de cotações dos ativos das carteiras locais e recálculo do patrimônio | `08c78163330cd3c71aea2769eb17b7eb98b9ac592b1f196c553232de0ef5f491` | 🟢 PASS (0.02s) |
| `S7-T03` | `internal/cotahist/seed_test.go` | `TestLocalMarketSeedBootstrap` | Seed idempotente do catálogo local (Ações, FIIs, Cripto e curvas CDI/IPCA) no backend Go | `762e1cbd2fd7a35f89d810734f141f8272b35a500398d2f90185536aded9db93` | 🟢 PASS (0.00s) |

---

### 2.8. Sprint 8 — Paletas por Carteira (`/imgsinsp`), Tema Escuro/Claro, `AmbientOrb` e Header XP (`SPEC v2`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` (v2) Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S8-T01` | `src/theme/__tests__/palettes.test.ts` | `TestAutoSequentialPortfolioPalettesAndImmutableAssetColors` | Atribuição sequencial automática (`index % 4`: `classic`, `harbor`, `docks`, `tribunal`), sincronização do Card + `AmbientOrb` + acentos ativos na pilha e cores fixas das 4 classes de ativos | `00d9d27295ece1ccbd9553fbdcd821ac4fd470c7aeeed06a5a29b75ffc0baf4b` | 🟢 PASS (0.01s) |
| `S8-T02` | `src/theme/__tests__/themeMode.test.ts` | `TestDarkAndLightThemeModeSwitch` | Alternância entre Tema Escuro (`#111315`) e Tema Claro (`#F4F1EA`) na página de Configurações | `e224ae7f5e9483164e8d9a7b1554acbebdfc79ce936e60080f69b8798c615f8c` | 🟢 PASS (0.01s) |
| `S8-T03` | `src/components/ui/__tests__/XpMinimalHeader.test.tsx` | `TestXpMinimalHeaderAvatarGlobeAndEye` | Avatar do usuário (abre Configurações), botão placeholder do Globo e botão de Olho (Modo Privacidade) | `34aaad57ee512061407ed7bf0a6f19af96630d07fe1db13c19ecf071fcfe9df5` | 🟢 PASS (0.03s) |

---

### 2.9. Sprint 9 — Card em Pilha Interativa (`StackedWalletDeck`), Home Clean v2 e Matriz Direita → Esquerda (`SPEC v2`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` (v2) Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S9-T01` | `src/components/ui/__tests__/StackedWalletDeck.test.tsx` | `TestStackedWalletPullDownUpAndCornerCutout` | Puxar para baixo avança carteira, puxar para cima volta uma, cor estendida até Rentabilidade e recorte curvo `•••• 001` | `8e2f61a0c7bcc0207b75f63debff816f82b7fb792775470a946bf01a3b755e0b` | 🟢 PASS (0.50s) |
| `S9-T02` | `src/components/ui/__tests__/DotMatrixV2.test.tsx` | `TestRightToLeftColumnsRebalanceButtonAndInvestedValue` | Preenchimento em colunas da direita para a esquerda, botão Rebalancear no topo, sem `"Matriz de Pontos"` e valor aportado por classe | `9ecc6212d3fecf3317de0522e846107a3ef597c9b73ba27da8d38d3132ba3adc` | 🟢 PASS (0.35s) |
| `S9-T03` | `src/components/ui/__tests__/QuickActionsMoreMenu.test.tsx` | `TestLargerQuickActionsAndMoreTwoOptionsMenu` | Ícones/textos maiores e botão `"Mais"` exibindo as 2 opções: `Novo Aporte` e `Nova Carteira` | `5ce62884d40eb839caea0b7e2c2a679ea221794e2b76204539179c6cc3227079` | 🟢 PASS (0.40s) |
| `S9-T04` | `src/screens/__tests__/HomeLayoutV2.test.tsx` | `TestHomeCleanLayoutNoSimCardAndGlobalFooter` | Remoção do card de simulação da Home, Movimentações Recentes mais acima e `FloatingBottomDock` em todas as telas | `13b3ba1b5db1a12a66fc7672ea9d3ab4d5117f720d72ad144a37e8b1bceaf22b` | 🟢 PASS (0.85s) |

---

### 2.10. Sprint 10 — Tela de Detalhe da Classe (Donut Oco + Scroll) e Histórico da Movimentação (`SPEC v2`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` (v2) Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S10-T01` | `src/screens/__tests__/ClassDetailScreen.test.tsx` | `TestHollowDonutLongPressTooltipAndTapScroll` | Gráfico de pizza oco da classe: segurar na cor mostra caixa com nome do ativo; clicar na cor faz scroll até o ativo | `eefe06c8b26e2153a7945feb1c095a9ca6e56171c511f896a8788c8b5988a908` | 🟢 PASS (0.35s) |
| `S10-T02` | `src/screens/__tests__/ClassAssetCards.test.tsx` | `TestAssetDetailInformationCards` | Exibição de Saldo Bruto, Quantidade, Preço Médio, Cotação Atual e Rentabilidade de cada ativo da classe | `ed3388a52dba6b975318fffcd5e47aec0b54ee584044738cfd9c37f8b7d0165a` | 🟢 PASS (0.04s) |
| `S10-T03` | `src/screens/__tests__/TransactionDetailHistoryScreen.test.tsx` | `TestTransactionHistoryNavigationAndDetails` | Clicar em movimentação recente abre histórico exibindo Valor Investido, Cotação, Quantidade e Data | `6ce5b4135d04ca1d525365234dcd28c6ce4ad6e8ba30feba6256c626c24b9e56` | 🟢 PASS (0.50s) |

---

### 2.11. Sprint 11 — Estatísticas v2 (`5D/Mês/Ano/5A/Total` + Linha) e Carteiras Clean v2 (`SPEC v2`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC.md` (v2) Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S11-T01` | `src/domain/finance/__tests__/periodSummary.test.ts` | `TestPeriodFilteringAndSummary_5D_1M_1Y_5Y_ALL` | Cálculo da curva e resumo (Patrimônio Inicial, Aportes, Rendimentos, Patrimônio Final) para `5D`, `1M`, `1Y`, `5Y` e `ALL` | `86632148d54ba60ae1eabc11daa3725530b096da910bc3e769139c204e458418` | 🟢 PASS (0.01s) |
| `S11-T02` | `src/screens/__tests__/StatisticsScreenV2.test.tsx` | `TestStatisticsNoHeaderPortfolioSelectorAndLineChart` | Sem header, seletor com nome da carteira + `"Carteiras Consolidadas"`, filtros `5 dias/Mês/Ano/5 anos/Total` e gráfico de linha | `8177d41c9aab6c62fb532e2609a405bdfa84f26af3f5db1eaef2855370e402a1` | 🟢 PASS (0.32s) |
| `S11-T03` | `src/screens/__tests__/PortfolioManagementV2.test.tsx` | `TestPortfolioManagementStackedDeckAndCleanCopy` | Sem header, seletor em pilha reaproveitado da Home e remoção de textos com cara de IA (`"NÍVEL 1"`, `"META GLOBAL Ti"`, etc.) | `d3ae56140c31b61208eb3348e045fb84a39b0e153baa21e0a6c7e82048775552` | 🟢 PASS (0.28s) |

---

### 2.12. Sprint 12 — Header XP, Modal Perfil & Configurações, Remoção Global de Headers, Tema Claro e Máscara `*******` (`SPEC v2`)

| ID | Arquivo de Teste | Caso de Teste | Regra da `SPEC_V2.md` Verificada | Hash SHA-256 do Arquivo | Resultado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `S12-T01` | `src/screens/__tests__/Sprint12HeaderAndProfile.test.tsx` | `TestHeaderMinimalXPGlobalHeaderRemovalAndProfileModal` | Header minimalista XP + AmbientOrb na Home (sem "GESTÃO DE CARTEIRAS"), Modal Perfil & Configurações ao tocar no avatar, e remoção global de `<View style={styles.header}>` em Settings, Transaction e Simulator | `86acd61bf5252b223df2b8742f9442dc90898ba84ccf7085208616120882ebd2` | 🔴 Red Phase (Fase A) |
| `S12-T02` | `src/services/__tests__/Sprint12PrivacyAndLightTheme.test.ts` | `TestPrivacyAsteriskMaskAndLightThemeTokens` | Máscara `PRIVACY_ASTERISK_MASK = '*******'`, `redactWithAsterisks` com retrocompatibilidade, ocultação na Home e tokens do Tema Claro (`#F4F1EA`, `#FFFFFF`, `#111315`) | `f159879f60aa0fb50010c0f2ef32e36188400873d4501cbca8c89ffb610bf8dd` | 🔴 Red Phase (Fase A) |

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

### Sprint 1 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 5 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte (`go test -count=1 ./... -v`):**
  ```text
  === RUN   TestFetchStockAndFIIQuotesWithCache
  --- PASS: TestFetchStockAndFIIQuotesWithCache (0.08s)
  === RUN   TestFetchCryptoQuotesInBRL
  --- PASS: TestFetchCryptoQuotesInBRL (0.00s)
  PASS
  ok  	github.com/pedro/celsus/services/market-api/internal/brapi	1.960s
  === RUN   TestParseValidStockLine_245Bytes
  --- PASS: TestParseValidStockLine_245Bytes (0.00s)
  === RUN   TestParseValidFIILine_CODBDI12
  --- PASS: TestParseValidFIILine_CODBDI12 (0.00s)
  === RUN   TestIgnoreHeaderTrailerAndOptions
  --- PASS: TestIgnoreHeaderTrailerAndOptions (0.00s)
  === RUN   TestParseZipArchiveStreaming
  --- PASS: TestParseZipArchiveStreaming (0.00s)
  === RUN   TestIdempotentBatchUpsert
  --- PASS: TestIdempotentBatchUpsert (0.00s)
  PASS
  ok  	github.com/pedro/celsus/services/market-api/internal/cotahist	1.199s
  === RUN   TestEndpoints_Health_Catalog_Quotes_History_Macro
  === RUN   TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_Health
  --- PASS: TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_Health (0.03s)
  === RUN   TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_CatalogSearch
  --- PASS: TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_CatalogSearch (0.00s)
  === RUN   TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_Quotes
  --- PASS: TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_Quotes (0.00s)
  === RUN   TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_History
  --- PASS: TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_History (0.00s)
  === RUN   TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_RatesMacro
  --- PASS: TestEndpoints_Health_Catalog_Quotes_History_Macro/Endpoint_RatesMacro (0.00s)
  --- PASS: TestEndpoints_Health_Catalog_Quotes_History_Macro (0.05s)
  PASS
  ok  	github.com/pedro/celsus/services/market-api/internal/http	0.229s
  === RUN   TestFetchAndStoreDailyCDIAndIPCA
  --- PASS: TestFetchAndStoreDailyCDIAndIPCA (0.00s)
  PASS
  ok  	github.com/pedro/celsus/services/market-api/internal/macro	1.189s
  Total: 9 testes | 9 PASS | 0 FAIL (100% Green Phase aprovada)
  ```

### Sprint 2 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 3 novos arquivos de teste React Native / Expo bloqueados com `ReadOnly` (total de 8 arquivos no repositório) e registrados em `tests.lock.json`.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 8 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase no Jest):**
  ```text
  FAIL src/theme/__tests__/tokens.test.ts
    ● S2-T01: TestDesignSystemColorAndTypographyTokens › Color Tokens Specification › should have exact primary, secondary, tertiary and neutral hex colors
    ● S2-T01: TestDesignSystemColorAndTypographyTokens › Typography Tokens Specification › should enforce Space Mono as default font family across all variants
  FAIL src/components/ui/__tests__/AttributeStatBar.test.tsx
    ● S2-T02: TestAssetClassToAttributeMapping › Asset Class to Attribute Configuration Mapping › should map FIXED_INCOME to Intellect with teal #2E4A44
    ● S2-T02: TestAssetClassToAttributeMapping › AttributeStatBar Component UI Rendering › should render FIXED_INCOME (Intellect) with current vs meta percentages
  FAIL src/db/__tests__/schema.test.ts
    ● S2-T03: TestSQLiteTablesAndOpenFinanceColumns › Portfolios and Targets Schema Columns › should define portfolios table with UUID primary key and docket metadata
    ● S2-T03: TestSQLiteTablesAndOpenFinanceColumns › Assets Schema and Open Finance Columns › should define assets table with financial position, fixed income fields and Open Finance columns
    ● S2-T03: TestSQLiteTablesAndOpenFinanceColumns › Transactions Schema and Open Finance Columns › should define transactions table with trade data, ledger notes and Open Finance deduplication columns

  Test Suites: 3 failed, 3 total
  Tests:       21 failed, 1 passed, 22 total
  Snapshots:   0 total
  Time:        3.837 s
  Total: 22 testes | 1 PASS | 21 FAIL (Red Phase confirmada sob stubs)
  ```

### Sprint 2 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 8 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte (`npm test` em `apps/mobile`):**
  ```text
  PASS src/theme/__tests__/tokens.test.ts
    S2-T01: TestDesignSystemColorAndTypographyTokens
      Color Tokens Specification
        √ should have exact primary, secondary, tertiary and neutral hex colors (5 ms)
        √ should have exact void floor / background canvas color (1 ms)
        √ should have exact functional modifier colors
        √ should have exact asset class attribute colors
        √ should export cohesive theme tokens object with colors and typography (1 ms)
      Typography Tokens Specification
        √ should enforce Space Mono as default font family across all variants
        √ should have exact typographic scales and font weights (1 ms)
  PASS src/components/ui/__tests__/AttributeStatBar.test.tsx
    S2-T02: TestAssetClassToAttributeMapping
      Asset Class to Attribute Configuration Mapping
        √ should map FIXED_INCOME to Intellect with teal #2E4A44 (8 ms)
        √ should map FII to Psyche with parchment #D5CAA8 (14 ms)
        √ should map STOCK to Physique with amber #D96628 (3 ms)
        √ should map CRYPTO to Motorics with ochre #C49A45 (1 ms)
      AttributeStatBar Component UI Rendering
        √ should render FIXED_INCOME (Intellect) with current vs meta percentages (227 ms)
        √ should render FII (Psyche) with current vs meta percentages (4 ms)
        √ should render STOCK (Physique) with current vs meta percentages (4 ms)
        √ should render CRYPTO (Motorics) with current vs meta percentages (5 ms)
  PASS src/db/__tests__/schema.test.ts
    S2-T03: TestSQLiteTablesAndOpenFinanceColumns
      Local SQLite Database Table Names
        √ should define all 6 required SQLite tables with exact names (5 ms)
      Portfolios and Targets Schema Columns
        √ should define portfolios table with UUID primary key and docket metadata (1 ms)
        √ should define portfolio_class_targets table with portfolio relation and target percentage (1 ms)
      Assets Schema and Open Finance Columns
        √ should define assets table with financial position, fixed income fields and Open Finance columns (1 ms)
      Transactions Schema and Open Finance Columns
        √ should define transactions table with trade data, ledger notes and Open Finance deduplication columns (2 ms)
      Market Cache and Historical Prices Schema Columns
        √ should define market_price_cache table for 24h ticker quotes (1 ms)
        √ should define historical_prices_local table for local COTAHIST closing prices (1 ms)

  Test Suites: 3 passed, 3 total
  Tests:       22 passed, 22 total
  Snapshots:   0 total
  Time:        3.412 s
  Total: 22 testes | 22 PASS | 0 FAIL (100% Green Phase aprovada)
  ```

### Sprint 3 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 4 novos arquivos de teste React Native / TypeScript cobrindo o Motor Financeiro bloqueados com `ReadOnly` (total de 12 arquivos protegidos no repositório) e registrados em `tests.lock.json`.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 12 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase no Jest):**
  ```text
  FAIL src/domain/finance/__tests__/weights.test.ts
    ● S3-T01: TestTwoLevelGlobalTargetCalculation › Global Target Formula: Ti = (Wc * wi,c) / 100
    ● S3-T01: TestTwoLevelGlobalTargetCalculation › Validation of Macro Class Targets (Sum = 100%)
    ● S3-T01: TestTwoLevelGlobalTargetCalculation › Validation of Micro Asset Targets within Class (Sum = 100%)
    ● S3-T01: TestTwoLevelGlobalTargetCalculation › Portfolio Global Targets Calculation Across All Classes
  FAIL src/domain/finance/__tests__/averagePrice.test.ts
    ● S3-T02: TestAveragePriceOnMultipleBuysWithFees › calculateBuyOperation, calculatePositionFromTransactions
    ● S3-T03: TestSellDoesNotChangeAveragePrice › calculateSellOperation, position liquidation and short-selling protection
    ● S3-T04: TestCryptoEightDecimalPlacesPrecision › 8-decimal operations via decimal.js
  FAIL src/domain/finance/__tests__/fixedIncome.test.ts
    ● S3-T05: TestFixedIncomeCDIPercentageCurve › calculateCDIAccrual (% CDI compounding)
    ● S3-T06: TestFixedIncomePreAndIPCAPlusAndManualOverride › Pre-fixed (base 252), IPCA+ and manual_price_override precedence
  FAIL src/domain/finance/__tests__/rebalance.test.ts
    ● S3-T07: TestSmartContributionCalculator_NoSells › calculateSmartContribution (Di = max(0, Vmeta - Vcurr), zero sells)
    ● S3-T08: TestSmartContributionIntegerSharesAndCryptoFractions › Integer shares for Stocks/FIIs, 8 decimals for Crypto, exact currency for Fixed Income

  Test Suites: 4 failed, 3 passed, 7 total
  Tests:       35 failed, 24 passed, 59 total
  Snapshots:   0 total
  Time:        6.738 s
  Total: 37 novos testes da Sprint 3 | 0 PASS sob stubs | 35 FAIL (Red Phase confirmada sob stubs)
  ```

### Sprint 3 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 12 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte (`npm test --prefix apps/mobile`):**
  ```text
  PASS src/theme/__tests__/tokens.test.ts
  PASS src/db/__tests__/schema.test.ts
  PASS src/components/ui/__tests__/AttributeStatBar.test.tsx
  PASS src/domain/finance/__tests__/weights.test.ts
    S3-T01: TestTwoLevelGlobalTargetCalculation
      Global Target Formula: Ti = (Wc * wi,c) / 100
        √ should calculate exact global target for stocks with 40% class target and 25% asset target (SPEC 5.1 example) (1 ms)
        √ should calculate exact global target for stock with 50% target within 40% class target
        √ should calculate exact global target for fixed income with 30% class target and 60% asset target
        √ should calculate exact global target for crypto with 10% class target and 70% asset target (1 ms)
        √ should return 0 when class target or asset target in class is 0
      Validation of Macro Class Targets (Sum = 100%)
        √ should validate successfully when macro class targets sum exactly to 100% (1 ms)
        √ should reject class targets when sum is less than 100%
        √ should reject class targets when sum exceeds 100%
      Validation of Micro Asset Targets within Class (Sum = 100%)
        √ should validate successfully when micro asset targets sum to 100%
        √ should reject micro asset targets when sum does not reach 100% (1 ms)
        √ should reject micro asset targets when sum exceeds 100%
      Portfolio Global Targets Calculation Across All Classes
        √ should compute exact global targets and ensure portfolio sum equals 100% (1 ms)
  PASS src/domain/finance/__tests__/averagePrice.test.ts
    S3-T02: TestAveragePriceOnMultipleBuysWithFees
      √ should calculate initial average price with transaction fees included (1 ms)
      √ should update average price correctly over successive buy operations with brokerage fees (1 ms)
      √ should correctly process position from an array of sequential buy transactions (1 ms)
    S3-T03: TestSellDoesNotChangeAveragePrice
      √ should maintain exact average price intact on partial sell and calculate exact realized gain (1 ms)
      √ should maintain exact average price intact on sell with loss and calculate negative realized PnL
      √ should reset average price to 0.00 when position is fully liquidated (1 ms)
      √ should throw error when attempting to sell more than current position (no short selling) (7 ms)
      √ should accumulate realized PnL across multiple buy and sell transactions (1 ms)
    S3-T04: TestCryptoEightDecimalPlacesPrecision
      √ should handle fractional crypto purchases with 8 decimal places without IEEE 754 precision errors (1 ms)
      √ should handle fractional crypto sale with 8 decimal places and compute exact realized PnL (1 ms)
      √ should fully liquidate crypto position to 0 with 8 decimals precision (1 ms)
  PASS src/domain/finance/__tests__/fixedIncome.test.ts
    S3-T05: TestFixedIncomeCDIPercentageCurve
      √ should calculate exact daily compound accrual for 110% of CDI for a single business day (1 ms)
      √ should calculate compound accrual across multiple business days for 100% of CDI
      √ should calculate compound accrual for 120% of CDI over 5 business days (1 ms)
      √ should return principal with factor 1.000000 when no business days are passed
    S3-T06: TestFixedIncomePreAndIPCAPlusAndManualOverride
      Pre-fixed Accrual (Base 252 Business Days)
        √ should compute exact pre-fixed accrual for half-year (126 business days) at 12.5% a.a.
        √ should compute exact pre-fixed accrual for full financial year (252 business days) (1 ms)
      Hybrid IPCA + Fixed Spread Accrual
        √ should compound accumulated IPCA variation with pro-rata fixed coupon on 252 base
      Precedence of manual_price_override
        √ should prioritize manual_price_override when provided, ignoring theoretical curve (1 ms)
        √ should fall back to theoretical curve when manual_price_override is null or empty
  PASS src/domain/finance/__tests__/rebalance.test.ts
    S3-T07: TestSmartContributionCalculator_NoSells
      √ should allocate 100% of contribution to underweight assets and NEVER suggest selling overweight assets (1 ms)
      √ should proportionally distribute contribution across multiple underweight assets (1 ms)
    S3-T08: TestSmartContributionIntegerSharesAndCryptoFractions
      √ should round stock and FII allocations down to integer shares and report cash remainder (1 ms)
      √ should allocate exact fractional crypto with 8 decimal places precision
      √ should handle multi-class portfolio ensuring integer shares for stocks/FIIs, 8 decimals for crypto and monetary for fixed income (1 ms)

  Test Suites: 7 passed, 7 total
  Tests:       59 passed, 59 total
  Snapshots:   0 total
  Time:        5.038 s
  Total: 37 novos testes da Sprint 3 | 37 PASS | 0 FAIL (100% Green Phase aprovada)
  ```

### Sprint 4 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 2 novos arquivos de teste React Native / TypeScript cobrindo Serviços de Transações e Execução de Rebalanceamento bloqueados com `ReadOnly` (total de 14 arquivos protegidos no repositório) e registrados em `tests.lock.json`.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 14 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase no Jest):**
  ```text
  FAIL src/services/__tests__/transactionService.test.ts
    ● S4-T01: TestAutoFillHistoricalPriceFromCotahistOnBuy
      - Not implemented: TransactionService.getAutoFillPrice (6 testes)
    ● S4-T02: TestAtomicTransactionInsertAndAssetRecalculation
      - Not implemented: TransactionService.executeTransaction (7 testes)
  FAIL src/services/__tests__/rebalanceExecution.test.ts
    ● S4-T03: TestBatchConfirmSimulatedContributions
      - Not implemented: RebalanceExecutionService.executeBatchContributions (7 testes)

  Test Suites: 2 failed, 7 passed, 9 total
  Tests:       20 failed, 59 passed, 79 total
  Snapshots:   0 total
  Time:        8.039 s
  Total: 20 novos testes da Sprint 4 | 0 PASS sob stubs | 20 FAIL (Red Phase confirmada sob stubs)
  ```

### Sprint 4 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 14 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte (`npm test --prefix apps/mobile`):**
  ```text
  PASS src/domain/finance/__tests__/rebalance.test.ts
  PASS src/domain/finance/__tests__/weights.test.ts
  PASS src/theme/__tests__/tokens.test.ts
  PASS src/domain/finance/__tests__/fixedIncome.test.ts
  PASS src/domain/finance/__tests__/averagePrice.test.ts
  PASS src/db/__tests__/schema.test.ts
  PASS src/components/ui/__tests__/AttributeStatBar.test.tsx
  PASS src/services/__tests__/transactionService.test.ts
    S4-T01: TestAutoFillHistoricalPriceFromCotahistOnBuy
      √ should return historical close price when ticker and date exist in local COTAHIST (2 ms)
      √ should normalize lowercase ticker to uppercase before looking up historical price
      √ should fetch from remote market API and cache locally when price is not in local database
      √ should return null when date is a non-trading day (weekend/holiday) and no quote exists
      √ should return null when ticker is not found in market catalog or COTAHIST (1 ms)
      √ should support FIIs and Stock tickers consistently
    S4-T02: TestAtomicTransactionInsertAndAssetRecalculation
      √ should execute BUY transaction and update asset quantity and average price with brokerage fees (1 ms)
      √ should execute SELL transaction maintaining average price intact and returning realized PnL (1 ms)
      √ should liquidate asset position when selling entire quantity and reset PM to 0.00
      √ should reject SELL transaction when quantity exceeds current asset balance (prevent short selling) (7 ms)
      √ should reject transaction with zero or negative quantity or price (1 ms)
      √ should handle fractional crypto transactions with 8 decimal places precision
      √ should throw error and perform no changes if asset does not exist (1 ms)
  PASS src/services/__tests__/rebalanceExecution.test.ts
    S4-T03: TestBatchConfirmSimulatedContributions
      √ should create BUY transactions for all suggestions with positive allocation (2 ms)
      √ should skip assets with zero suggested allocation (1 ms)
      √ should update each asset quantity and average price after batch execution
      √ should accept RebalanceResult suggestions with assetId mapping (executeFromSuggestions) (1 ms)
      √ should handle empty batch or batch where all suggestions are zero allocation
      √ should include default notes marking simulation contribution batch (1 ms)
      √ should abort and throw error if transaction execution fails for any item in batch (1 ms)

  Test Suites: 9 passed, 9 total
  Tests:       79 passed, 79 total
  Snapshots:   0 total
  Time:        3.436 s
  Total: 20 novos testes da Sprint 4 | 20 PASS | 0 FAIL (100% Green Phase aprovada)
  ```

### Sprint 5 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 16 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (incluindo 2 novos arquivos de teste da Sprint 5: `portfolioHistory.test.ts` e `consolidatedView.test.ts`).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 16 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase no Jest):**
  ```text
  FAIL src/domain/finance/__tests__/portfolioHistory.test.ts
    ● S5-T01: TestDailyPatrimonyEvolutionCurve
      - should reconstruct daily curve accurately crossing stock buy transactions with COTAHIST quotes (FAIL)
      - should combine COTAHIST equity quotes with Fixed Income daily CDI and PRE accrual curves (FAIL)
      - should adjust invested capital and market value correctly when SELL operations occur (FAIL)
      - should prioritize manualPriceOverride in Fixed Income assets over theoretical indexer calculation (FAIL)
      - should carry forward the latest available closing price during weekends or non-trading days (FAIL)
      - should aggregate daily points into monthly pill capsules for the statistics dashboard (FAIL)
  FAIL src/domain/finance/__tests__/consolidatedView.test.ts
    ● S5-T02: TestMultiPortfolioConsolidation
      - should accurately consolidate multiple independent portfolios into a unified dossier (FAIL)
      - should maintain strict financial isolation between independent portfolios (FAIL)
      - should aggregate identical tickers across portfolios into consolidated holdings (FAIL)
      - should exclude archived portfolios from default consolidated view while counting them (FAIL)
      - should compute consolidated asset class allocation and portfolio-weighted target percentages (FAIL)
      - should gracefully handle empty portfolios or portfolios with zero assets without errors (FAIL)

  Test Suites: 2 failed, 9 passed, 11 total
  Tests:       12 failed, 79 passed, 91 total
  Snapshots:   0 total
  Time:        4.091 s
  Total: 12 novos testes da Sprint 5 | 0 PASS sob stubs | 12 FAIL (Red Phase confirmada sob stubs)
  ```

### Sprint 5 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 16 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte (`npm test --prefix apps/mobile`):**
  ```text
  PASS src/domain/finance/__tests__/weights.test.ts
  PASS src/domain/finance/__tests__/averagePrice.test.ts
  PASS src/domain/finance/__tests__/fixedIncome.test.ts
  PASS src/domain/finance/__tests__/rebalance.test.ts
  PASS src/domain/finance/__tests__/portfolioHistory.test.ts
    S5-T01: TestDailyPatrimonyEvolutionCurve
      √ should reconstruct daily curve accurately crossing stock buy transactions with COTAHIST quotes (1 ms)
      √ should combine COTAHIST equity quotes with Fixed Income daily CDI and PRE accrual curves (1 ms)
      √ should adjust invested capital and market value correctly when SELL operations occur (1 ms)
      √ should prioritize manualPriceOverride in Fixed Income assets over theoretical indexer calculation
      √ should carry forward the latest available closing price during weekends or non-trading days (1 ms)
      √ should aggregate daily points into monthly pill capsules for the statistics dashboard
  PASS src/theme/__tests__/tokens.test.ts
  PASS src/domain/finance/__tests__/consolidatedView.test.ts
    S5-T02: TestMultiPortfolioConsolidation
      √ should accurately consolidate multiple independent portfolios into a unified dossier (1 ms)
      √ should maintain strict financial isolation between independent portfolios (1 ms)
      √ should aggregate identical tickers across portfolios into consolidated holdings (1 ms)
      √ should exclude archived portfolios from default consolidated view while counting them (1 ms)
      √ should compute consolidated asset class allocation and portfolio-weighted target percentages (1 ms)
      √ should gracefully handle empty portfolios or portfolios with zero assets without errors
  PASS src/db/__tests__/schema.test.ts
  PASS src/components/ui/__tests__/AttributeStatBar.test.tsx
  PASS src/services/__tests__/rebalanceExecution.test.ts
  PASS src/services/__tests__/transactionService.test.ts

  Test Suites: 11 passed, 11 total
  Tests:       91 passed, 91 total
  Snapshots:   0 total
  Time:        4.794 s
  Total: 12 novos testes da Sprint 5 | 12 PASS | 0 FAIL (100% Green Phase aprovada)
  ```

### Sprint 6 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 18 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (incluindo os 2 novos arquivos de teste da Sprint 6: `backupService.test.ts` e `privacyAndAuth.test.ts`).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 18 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase no Jest):**
  ```text
  FAIL src/services/__tests__/backupService.test.ts
    ● S6-T01: TestExportZipStructureAndManifestSHA256
      - should generate a valid .celsus.zip containing manifest.json and 4 CSVs with exact row counts and SHA-256 hashes (FAIL)
      - should handle empty database snapshot with 0 rows and valid CSV headers (FAIL)
      - should compute deterministic SHA-256 hash matching standard NIST vector (FAIL)
    ● S6-T02: TestRejectTamperedCSVOnImport
      - should immediately abort import with SECURITY PROTOCOL: CORRUPTED DOSSIER when 1 byte of transactions.csv is tampered, leaving local DB untouched (FAIL)
      - should reject archive if manifest.json is missing or has unsupported schemaVersion (FAIL)
      - should reject archive if any required CSV file declared in manifest.json is missing from the ZIP (FAIL)
    ● S6-T03: TestImportFullRestoreAndUUIDMerge
      - should completely replace all local records when importing in RESTORE mode (FAIL)
      - should merge records by UUID v4 without duplicating existing transactions and recalculate asset average price in MERGE mode (FAIL)
  FAIL src/services/__tests__/privacyAndAuth.test.ts
    ● S6-T04: TestPrivacyRedactionAndBiometricLock
      - should redact numeric and formatted BRL values with ██████,██ when privacy mode is enabled (FAIL)
      - should display formatted BRL values normally when privacy mode is disabled (FAIL)
      - should redact percentage values when privacy mode is enabled (FAIL)
      - should toggle privacy mode state in PrivacyAndAuthService and format values accordingly (FAIL)
      - should lock the app when biometric lock is enabled and unlock upon successful biometric authentication (FAIL)
      - should keep app locked when biometric authentication fails or is cancelled by user (FAIL)
      - should report biometric availability accurately when hardware or enrollment is missing (FAIL)
      - should return failure with reason when attempting to unlock if biometrics are not enrolled on device (FAIL)

  Test Suites: 2 failed, 11 passed, 13 total
  Tests:       16 failed, 91 passed, 107 total
  Snapshots:   0 total
  Time:        5.101 s
  Total: 16 novos testes da Sprint 6 | 0 PASS sob stubs | 16 FAIL (Red Phase confirmada sob stubs)
  ```

### Sprint 6 — Fase B: Implementação Green Phase & Consolidação Final (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 18 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte Mobile (`npm test --prefix apps/mobile`):**
  ```text
  PASS src/theme/__tests__/tokens.test.ts
  PASS src/db/__tests__/schema.test.ts
  PASS src/components/ui/__tests__/AttributeStatBar.test.tsx
  PASS src/domain/finance/__tests__/weights.test.ts
  PASS src/domain/finance/__tests__/averagePrice.test.ts
  PASS src/domain/finance/__tests__/fixedIncome.test.ts
  PASS src/domain/finance/__tests__/rebalance.test.ts
  PASS src/domain/finance/__tests__/portfolioHistory.test.ts
  PASS src/domain/finance/__tests__/consolidatedView.test.ts
  PASS src/services/__tests__/transactionService.test.ts
  PASS src/services/__tests__/rebalanceExecution.test.ts
  PASS src/services/__tests__/privacyAndAuth.test.ts
    S6-T04: TestPrivacyRedactionAndBiometricLock
      Privacy Mode Value Redaction (██████,██)
        √ should redact numeric and formatted BRL values with ██████,██ when privacy mode is enabled (12 ms)
        √ should display formatted BRL values normally when privacy mode is disabled (1 ms)
        √ should redact percentage values when privacy mode is enabled (1 ms)
        √ should toggle privacy mode state in PrivacyAndAuthService and format values accordingly (1 ms)
      Biometric Lock & Native Authentication Trigger
        √ should lock the app when biometric lock is enabled and unlock upon successful biometric authentication (4 ms)
        √ should keep app locked when biometric authentication fails or is cancelled by user (1 ms)
        √ should report biometric availability accurately when hardware or enrollment is missing
        √ should return failure with reason when attempting to unlock if biometrics are not enrolled on device (1 ms)
  PASS src/services/__tests__/backupService.test.ts
    S6-T01: TestExportZipStructureAndManifestSHA256
      √ should generate a valid .celsus.zip containing manifest.json and 4 CSVs with exact row counts and SHA-256 hashes (17 ms)
      √ should handle empty database snapshot with 0 rows and valid CSV headers (1 ms)
      √ should compute deterministic SHA-256 hash matching standard NIST vector
    S6-T02: TestRejectTamperedCSVOnImport
      √ should immediately abort import with SECURITY PROTOCOL: CORRUPTED DOSSIER when 1 byte of transactions.csv is tampered, leaving local DB untouched (4 ms)
      √ should reject archive if manifest.json is missing or has unsupported schemaVersion (2 ms)
      √ should reject archive if any required CSV file declared in manifest.json is missing from the ZIP (2 ms)
    S6-T03: TestImportFullRestoreAndUUIDMerge
      √ should completely replace all local records when importing in RESTORE mode (2 ms)
      √ should merge records by UUID v4 without duplicating existing transactions and recalculate asset average price in MERGE mode (20 ms)

  Test Suites: 15 passed, 15 total
  Tests:       124 passed, 124 total
  Snapshots:   0 total
  Time:        4.069 s
  ```
- **Execução Final da Suíte Backend Go (`cd services/market-api && go test -count=1 ./... -v`):**
  ```text
  ok  	github.com/pedro/celsus/services/market-api/internal/brapi	1.224s
  ok  	github.com/pedro/celsus/services/market-api/internal/cotahist	0.657s
  ok  	github.com/pedro/celsus/services/market-api/internal/http	0.159s
  ok  	github.com/pedro/celsus/services/market-api/internal/macro	0.650s
  Total Backend Go: 16 testes | 16 PASS | 0 FAIL
  ```
- **Consolidação Final do Projeto Celsus (Sprint 7 Concluída):**
  - **21 arquivos de teste protegidos por `SHA-256` (`tests.lock.json`)**
  - **140 casos de teste automatizados executados (16 em Go + 124 em TypeScript/Jest)**
  - **100% de aprovação (140 PASS / 0 FAIL) sem nenhuma violação de TDD Lock**

### Sprint 8 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 24 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (incluindo os 3 novos arquivos de teste da Sprint 8: `palettes.test.ts`, `themeMode.test.ts` e `XpMinimalHeader.test.tsx`).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 24 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Inicial dos Testes sob Stubs (Red Phase no Jest):**
  ```text
  FAIL src/theme/__tests__/palettes.test.ts
    ● S8-T01: TestAutoSequentialPortfolioPalettesAndImmutableAssetColors
      - should declare all 4 official portfolio palettes with exact tokens (FAIL)
      - should retrieve palette by its valid identifier (FAIL)
      - should automatically assign palettes in cyclic index % 4 order (FAIL)
      - should simulate sequential creation of multiple portfolios with automatic distinct palettes (FAIL)
      - should propagate palette colors when active wallet in stack changes (FAIL)
      - should render AmbientOrb reflecting the active palette tokens (FAIL)
      - should guarantee that the 4 asset class colors remain strictly fixed across all palettes (FAIL)
      - should keep the root background fixed to the global theme regardless of wallet palette (FAIL)
  FAIL src/theme/__tests__/themeMode.test.ts
    ● S8-T02: TestDarkAndLightThemeModeSwitch
      - should define exact Dark Theme tokens with background #111315 (FAIL)
      - should define exact Light Theme tokens with background #F4F1EA (FAIL)
      - should retrieve colors for requested theme mode via getThemeColors (FAIL)
      - should default to dark theme mode (FAIL)
      - should switch theme mode to light and toggle back to dark (FAIL)
      - should preserve immutable asset class colors across theme changes (FAIL)
      - should render theme mode options and trigger onThemeModeChange when selected (FAIL)
  FAIL src/components/ui/__tests__/XpMinimalHeader.test.tsx
    ● S8-T03: TestXpMinimalHeaderAvatarGlobeAndEye
      - should render user avatar with initials and user name (FAIL)
      - should trigger onAvatarPress when user taps the avatar button (FAIL)
      - should render the globe placeholder button and trigger onGlobePress (FAIL)
      - should render eye button with open visibility icon when privacy is disabled (FAIL)
      - should render eye button with crossed visibility-off icon when privacy is enabled (FAIL)
      - should trigger onTogglePrivacy when user taps the eye button (FAIL)
      - should render smoothly when receiving custom active wallet palette and light theme (FAIL)

  Test Suites: 3 failed, 3 total
  Tests:       22 failed, 22 total
  Snapshots:   0 total
  Time:        7.064 s
  Total: 22 novos testes da Sprint 8 | 0 PASS sob stubs | 22 FAIL (Red Phase confirmada sob stubs)
  ```

### Sprint 8 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação.
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 24 arquivos de teste confirmada via SHA-256.
  ```
- **Execução Final da Suíte Mobile (`npm test --prefix apps/mobile`):**
  ```text
  PASS src/theme/__tests__/palettes.test.ts
    S8-T01: TestAutoSequentialPortfolioPalettesAndImmutableAssetColors
      Official Portfolio Palettes Definition (/imgsinsp & Disco Elysium)
        √ should declare all 4 official portfolio palettes with exact tokens (2 ms)
        √ should retrieve palette by its valid identifier (1 ms)
      Automatic Sequential Assignment (index % 4)
        √ should automatically assign palettes in cyclic index % 4 order (1 ms)
        √ should simulate sequential creation of multiple portfolios with automatic distinct palettes (1 ms)
      Active Palette Propagation to Card, AmbientOrb and Active Accents
        √ should propagate palette colors when active wallet in stack changes (1 ms)
        √ should render AmbientOrb reflecting the active palette tokens (15 ms)
      Immutability of 4 Asset Class Colors and Theme Background
        √ should guarantee that the 4 asset class colors remain strictly fixed across all palettes (1 ms)
        √ should keep the root background fixed to the global theme regardless of wallet palette (1 ms)
  PASS src/components/ui/__tests__/XpMinimalHeader.test.tsx
    S8-T03: TestXpMinimalHeaderAvatarGlobeAndEye
      User Avatar on Left Side (Settings Trigger)
        √ should render user avatar with initials and user name (18 ms)
        √ should trigger onAvatarPress when user taps the avatar button (3 ms)
      Globe Placeholder Action on Right Side
        √ should render the globe placeholder button and trigger onGlobePress (3 ms)
      Eye Privacy Mode Action on Right Side
        √ should render eye button with open visibility icon when privacy is disabled (3 ms)
        √ should render eye button with crossed visibility-off icon when privacy is enabled (3 ms)
        √ should trigger onTogglePrivacy when user taps the eye button (2 ms)
      Dynamic Palette and Theme Mode Integration
        √ should render smoothly when receiving custom active wallet palette and light theme (3 ms)
  PASS src/theme/__tests__/themeMode.test.ts
    S8-T02: TestDarkAndLightThemeModeSwitch
      Dark & Light Theme Mode Specification Tokens
        √ should define exact Dark Theme tokens with background #111315 (1 ms)
        √ should define exact Light Theme tokens with background #F4F1EA (1 ms)
        √ should retrieve colors for requested theme mode via getThemeColors (1 ms)
      Theme Mode Service State Transitions
        √ should default to dark theme mode (1 ms)
        √ should switch theme mode to light and toggle back to dark (1 ms)
        √ should preserve immutable asset class colors across theme changes (1 ms)
      Theme Mode Selector in Settings Screen (SettingsBackupScreen)
        √ should render theme mode options and trigger onThemeModeChange when selected (18 ms)

  Test Suites: 18 passed, 18 total
  Tests:       146 passed, 146 total
  Snapshots:   0 total
  Time:        6.263 s
  Total Mobile: 18 suítes | 146 PASS | 0 FAIL
  ```
- **Execução Final da Suíte Backend Go (`cd services/market-api && go test -count=1 ./... -v`):**
  ```text
  ok  	github.com/pedro/celsus/services/market-api/internal/brapi	1.135s
  ok  	github.com/pedro/celsus/services/market-api/internal/cotahist	0.593s
  ok  	github.com/pedro/celsus/services/market-api/internal/http	0.119s
  ok  	github.com/pedro/celsus/services/market-api/internal/macro	0.573s
  Total Backend Go: 16 testes | 16 PASS | 0 FAIL
  ```
- **Consolidação Final do Projeto Celsus (Sprint 8 Concluída):**
  - **24 arquivos de teste protegidos por `SHA-256` (`tests.lock.json`)**
  - **162 casos de teste automatizados executados (16 em Go + 146 em TypeScript/Jest)**
  - **100% de aprovação (162 PASS / 0 FAIL) sem nenhuma violação de TDD Lock**

---

### Sprint 9 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 28 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (4 novos arquivos criados para a Sprint 9).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 28 arquivos de teste confirmada via SHA-256.
  ```
- **Hashes SHA-256 dos Novos Testes Bloqueados:**
  - `src/components/ui/__tests__/StackedWalletDeck.test.tsx`: `8e2f61a0c7bcc0207b75f63debff816f82b7fb792775470a946bf01a3b755e0b`
  - `src/components/ui/__tests__/DotMatrixV2.test.tsx`: `9ecc6212d3fecf3317de0522e846107a3ef597c9b73ba27da8d38d3132ba3adc`
  - `src/components/ui/__tests__/QuickActionsMoreMenu.test.tsx`: `5ce62884d40eb839caea0b7e2c2a679ea221794e2b76204539179c6cc3227079`
  - `src/screens/__tests__/HomeLayoutV2.test.tsx`: `13b3ba1b5db1a12a66fc7672ea9d3ab4d5117f720d72ad144a37e8b1bceaf22b`
- **Execução Inicial dos Testes sob Stubs (Red Phase):**
  - 18 suítes prévias passam com 100% Green (149 testes PASS).
  - 4 novas suítes falham em stubs conforme esperado no ciclo estrito de TDD (Red Phase):
    - `StackedWalletDeck.test.tsx`: Falha aguardando mecânica de pilha vertical, cor estendida e recorte curvo.
    - `DotMatrixV2.test.tsx`: Falha aguardando preenchimento em colunas da direita para a esquerda, botão Rebalancear no topo e valor aportado em R$ sem rótulo de meta.
    - `QuickActionsMoreMenu.test.tsx`: Falha aguardando botões e ícones ampliados e modal com as 2 opções (`Novo Aporte` e `Nova Carteira`).
    - `HomeLayoutV2.test.tsx`: Falha aguardando remoção do card de simulação e rebalanceamento avulso, e movimentações posicionadas mais acima na Home.

### Sprint 9 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação (estrito regime TDD Lock mantido).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 28 arquivos de teste confirmada via SHA-256.
  ```
- **Execução da Suíte Sprint 9 (`npm test --prefix apps/mobile -- StackedWalletDeck DotMatrixV2 QuickActionsMoreMenu HomeLayoutV2`):**
  ```text
  PASS src/components/ui/__tests__/StackedWalletDeck.test.tsx (6 passed, 6 total)
  PASS src/components/ui/__tests__/QuickActionsMoreMenu.test.tsx (4 passed, 4 total)
  PASS src/components/ui/__tests__/DotMatrixV2.test.tsx (5 passed, 5 total)
  PASS src/screens/__tests__/HomeLayoutV2.test.tsx (6 passed, 6 total)
  Test Suites: 4 passed, 4 total
  Tests:       21 passed, 21 total
  ```
- **Execução Completa da Suíte Mobile (`npm test --prefix apps/mobile`):**
  ```text
  Test Suites: 22 passed, 22 total
  Tests:       167 passed, 167 total
  Snapshots:   0 total
  Time:        6.532 s
  Total Mobile: 22 suítes | 167 PASS | 0 FAIL
  ```
- **Execução Final da Suíte Backend Go (`cd services/market-api && go test ./...`):**
  ```text
  ok  	github.com/pedro/celsus/services/market-api/internal/brapi	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/cotahist	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/http	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/macro	(cached)
  Total Backend Go: 16 testes | 16 PASS | 0 FAIL
  ```
- **Consolidação Final do Projeto Celsus (Sprint 9 Concluída):**
  - **28 arquivos de teste protegidos por `SHA-256` (`tests.lock.json`)**
  - **183 casos de teste automatizados executados (16 em Go + 167 em TypeScript/Jest)**
  - **100% de aprovação (183 PASS / 0 FAIL) sem nenhuma violação de TDD Lock**

---

### Sprint 10 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 31 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (3 novos arquivos criados para a Sprint 10).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 31 arquivos de teste confirmada via SHA-256.
  ```
- **Hashes SHA-256 dos Novos Testes Bloqueados:**
  - `src/screens/__tests__/ClassDetailScreen.test.tsx`: `eefe06c8b26e2153a7945feb1c095a9ca6e56171c511f896a8788c8b5988a908`
  - `src/screens/__tests__/ClassAssetCards.test.tsx`: `ed3388a52dba6b975318fffcd5e47aec0b54ee584044738cfd9c37f8b7d0165a`
  - `src/screens/__tests__/TransactionDetailHistoryScreen.test.tsx`: `6ce5b4135d04ca1d525365234dcd28c6ce4ad6e8ba30feba6256c626c24b9e56`
- **Execução Inicial dos Testes sob Stubs (Red Phase confirmada no Jest):**
  - Execução dos testes da Sprint 10 sob stubs vazios de compilação:
    - `ClassDetailScreen.test.tsx`: 3 testes falham aguardando Donut Chart, tooltip em `onLongPress` e auto-scroll em `onPress`.
    - `ClassAssetCards.test.tsx`: 2 testes de métricas detalhadas (Saldo Bruto, Quantidade, PM, Preço Atual, Rentabilidade) e privacidade falham sob stubs; 1 teste passa (ausência de header pesado).
    - `TransactionDetailHistoryScreen.test.tsx`: 4 testes falham aguardando exibição de métricas detalhadas da transação, linha do tempo histórica, privacidade e abertura ao clicar na Home; 1 teste passa (ausência de header pesado).
  - Total da Sprint 10 em Red Phase: 11 testes | 2 PASS | 9 FAIL.

### Sprint 10 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação (estrito regime TDD Lock mantido).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 31 arquivos de teste confirmada via SHA-256.
  ```
- **Execução da Suíte Sprint 10 (`npm test --prefix apps/mobile -- ClassDetailScreen ClassAssetCards TransactionDetailHistoryScreen`):**
  ```text
  PASS src/screens/__tests__/ClassAssetCards.test.tsx (3 passed, 3 total)
  PASS src/screens/__tests__/ClassDetailScreen.test.tsx (3 passed, 3 total)
  PASS src/screens/__tests__/TransactionDetailHistoryScreen.test.tsx (5 passed, 5 total)
  Test Suites: 3 passed, 3 total
  Tests:       11 passed, 11 total
  ```
- **Execução Completa da Suíte Mobile (`npm test --prefix apps/mobile`):**
  ```text
  Test Suites: 25 passed, 25 total
  Tests:       178 passed, 178 total
  Snapshots:   0 total
  Time:        7.384 s
  Total Mobile: 25 suítes | 178 PASS | 0 FAIL
  ```
- **Execução Final da Suíte Backend Go (`cd services/market-api && go test ./...`):**
  ```text
  ok  	github.com/pedro/celsus/services/market-api/internal/brapi	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/cotahist	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/http	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/macro	(cached)
  Total Backend Go: 16 testes | 16 PASS | 0 FAIL
  ```
- **Consolidação Final do Projeto Celsus (Sprint 10 Concluída):**
  - **31 arquivos de teste protegidos por `SHA-256` (`tests.lock.json`)**
  - **194 casos de teste automatizados executados (16 em Go + 178 em TypeScript/Jest)**
  - **100% de aprovação (194 PASS / 0 FAIL) sem nenhuma violação de TDD Lock**

---

### Sprint 11 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 34 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (3 novos arquivos criados para a Sprint 11).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 34 arquivos de teste confirmada via SHA-256.
  ```
- **Hashes SHA-256 dos Novos Testes Bloqueados:**
  - `src/domain/finance/__tests__/periodSummary.test.ts`: `86632148d54ba60ae1eabc11daa3725530b096da910bc3e769139c204e458418`
  - `src/screens/__tests__/StatisticsScreenV2.test.tsx`: `8177d41c9aab6c62fb532e2609a405bdfa84f26af3f5db1eaef2855370e402a1`
  - `src/screens/__tests__/PortfolioManagementV2.test.tsx`: `d3ae56140c31b61208eb3348e045fb84a39b0e153baa21e0a6c7e82048775552`
- **Execução Inicial dos Testes sob Stubs (Red Phase confirmada no Jest):**
  - Execução dos testes da Sprint 11 sob stubs vazios de compilação:
    - `periodSummary.test.ts`: 12 testes falham sob stubs aguardando a implementação dos filtros de período (`5D`, `1M`, `1Y`, `5Y`, `ALL`) e da fórmula financeira de resumo (`initialPatrimony`, `netContributions`, `yieldAmount`, `yieldPercentage`, `finalPatrimony`).
    - `StatisticsScreenV2.test.tsx`: 7 testes falham sob stubs aguardando remoção do header pesado, seletor unificado com `"Carteiras Consolidadas"`, botões de período (`5 dias`, `Mês`, `Ano`, `5 anos`, `Total`) e componentes `patrimony-line-chart-card` e `period-summary-card`.
    - `PortfolioManagementV2.test.tsx`: 4 testes falham sob stubs aguardando reaproveitamento do `StackedWalletDeck` e remoção de textos artificiais com cara de IA (`"SISTEMA DE PESOS EM 2 NÍVEIS"`, `"NÍVEL 1: METAS MACRO (Wc)"`, `"NÍVEL 2: METAS MICRO (wi,c)"`, `"META GLOBAL Ti"`).
  - Total da Sprint 11 em Red Phase: 27 testes | 4 PASS | 23 FAIL.

### Sprint 11 — Fase B: Implementação Green Phase & Auditoria (2026-10-31)
- **Status do Bloqueio:** Nenhum arquivo de teste ou `tests.lock.json` foi modificado durante a implementação (estrito regime TDD Lock mantido).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 34 arquivos de teste confirmada via SHA-256.
  ```
- **Execução da Suíte Sprint 11 (`npm test --prefix apps/mobile -- periodSummary StatisticsScreenV2 PortfolioManagementV2`):**
  ```text
  PASS src/domain/finance/__tests__/periodSummary.test.ts (12 passed, 12 total)
  PASS src/screens/__tests__/StatisticsScreenV2.test.tsx (8 passed, 8 total)
  PASS src/screens/__tests__/PortfolioManagementV2.test.tsx (7 passed, 7 total)
  Test Suites: 3 passed, 3 total
  Tests:       27 passed, 27 total
  ```
- **Execução Completa da Suíte Mobile (`npm test --prefix apps/mobile`):**
  ```text
  Test Suites: 28 passed, 28 total
  Tests:       205 passed, 205 total
  Snapshots:   0 total
  Time:        7.228 s
  Total Mobile: 28 suítes | 205 PASS | 0 FAIL
  ```
- **Execução Final da Suíte Backend Go (`cd services/market-api && go test ./...`):**
  ```text
  ok  	github.com/pedro/celsus/services/market-api/internal/brapi	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/cotahist	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/http	(cached)
  ok  	github.com/pedro/celsus/services/market-api/internal/macro	(cached)
  Total Backend Go: 16 testes | 16 PASS | 0 FAIL
  ```
- **Consolidação Final do Projeto Celsus (Sprint 11 Concluída):**
  - **34 arquivos de teste protegidos por `SHA-256` (`tests.lock.json`)**
  - **221 casos de teste automatizados executados (16 em Go + 205 em TypeScript/Jest)**
  - **100% de aprovação (221 PASS / 0 FAIL) sem nenhuma violação de TDD Lock**

---

### Sprint 12 — Fase A: Lock e Verificação Inicial (2026-10-31)
- **Status do Bloqueio:** 36 arquivos de teste bloqueados com `ReadOnly` e registrados em `tests.lock.json` (2 novos arquivos criados para a Sprint 12).
- **Validação de Integridade (`powershell ./scripts/test-lock.ps1 -Action verify`):**
  ```text
  [TDD VERIFIED] Integridade de todos os 36 arquivos de teste confirmada via SHA-256.
  ```
- **Hashes SHA-256 dos Novos Testes Bloqueados:**
  - `apps/mobile/src/screens/__tests__/Sprint12HeaderAndProfile.test.tsx`: `86acd61bf5252b223df2b8742f9442dc90898ba84ccf7085208616120882ebd2`
  - `apps/mobile/src/services/__tests__/Sprint12PrivacyAndLightTheme.test.ts`: `f159879f60aa0fb50010c0f2ef32e36188400873d4501cbca8c89ffb610bf8dd`
- **Execução Inicial dos Testes sob Stubs (Red Phase confirmada no Jest):**
  - Execução dos testes da Sprint 12 sob stubs vazios de compilação:
    - `Sprint12HeaderAndProfile.test.tsx`: 7 testes falham sob stubs aguardando a integração do `XpMinimalHeader` e `AmbientOrb` na Home de `App.tsx`, a remoção do cabeçalho `"GESTÃO DE CARTEIRAS"`, a abertura do Modal de Perfil & Configurações pelo avatar e a remoção dos blocos `<View style={styles.header}>` de `SettingsBackupScreen`, `TransactionScreen` e `SimulatorScreen`.
    - `Sprint12PrivacyAndLightTheme.test.ts`: 5 testes unitários passam (`PRIVACY_ASTERISK_MASK = '*******'`, `redactWithAsterisks`, compatibilidade com `redactCurrencyValue`, e definição de `LIGHT_THEME_TOKENS`) e 2 testes de integração falham aguardando a conexão da máscara de asteriscos e do Tema Claro (`#F4F1EA`) na árvore de componentes de `App.tsx`.
  - Total da Sprint 12 em Red Phase: 14 testes | 5 PASS | 9 FAIL.
  - Total Global do Projeto Celsus: 36 arquivos protegidos | 235 testes | 226 PASS | 9 FAIL.







