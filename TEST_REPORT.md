# Celsus — Relatório de testes

Estado atual da suíte. O histórico sprint a sprint (relatórios antigos, com hashes e tempos) está no git:
`git log -p -- TEST_REPORT.md`.

## Resumo

| Suíte | Comando | Resultado |
| :--- | :--- | :--- |
| App mobile (Jest + Testing Library) | `cd apps/mobile && npx jest --maxWorkers=2 --workerIdleMemoryLimit=700MB` | **190/190 suítes PASS** (**1250/1250 testes PASS**) |
| Motor de mercado (Go) | `npm run test:market` | Todos os 7 pacotes testáveis `ok` (0 falhas, 2 testes "live" pulados por padrão) |
| Tipos (TypeScript) | `cd apps/mobile && npx tsc --noEmit` | **0 erros** nos arquivos de produção (148 erros pré-existentes apenas em 41 arquivos `__tests__` antigos) |
| Integridade dos testes (TDD Lock) | `node scripts/test-lock.js verify` | **206 arquivos protegidos**, SHA-256 íntegros |

## Sprint 90 — Proventos por nome do fundo e diagnóstico sem PII (Fase B concluída)

Identificação de provento pelo nome do fundo (`s/` ou `FII`, normalizado sem stopwords, prefixos/iniciais em ordem e fallback pela raiz de 4 letras do ticker), extração de quantidade `"S/ <n>"` e `unit_amount` em 8 casas (`decimal.js`), execução antes da classificação de transferências incluindo `categoryId 04000000` e contagem de ambiguidade em `counts.ambiguousIncomeCount` (`R15`), redirecionamento de recibo em `TOTAL_WITHDRAWAL` para o ativo-base `ACTIVE` sufixo `11` com `"recibo <ticker>"` em `notes` (`R16`), e diagnóstico Pluggy sem PII (`redactDiagnosticDescription`) com `name` e bloco `app` por investimento e `entriesLast90d` por conta (`R21`).

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint90IncomeNames.test.ts` | S90-T01…T06, S90-T08 | `f3032d0b727609971b7f77978954dadb377816bf59bf713e12dc26d590ba828d` | 7 FAIL |
| `apps/mobile/src/services/pluggy/__tests__/Sprint90IncomeNames.test.ts` | S90-T03 (sync), S90-T07, S90-T09 | `497900d23872b5c2244a4ecd8d9eb152f3e1bd5f50218823aee41af4ab28846b` | 3 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `apps/mobile/src/services/pluggy/__tests__/Sprint90IncomeNames.test.ts:207-214`: ajustados os nomes dos parâmetros da fixture `finRepository.createAccount` de `initial_balance_cents`/`of_account_id` para `initialBalanceCents`/`ofAccountId` (camelCase exigido pela assinatura do repositório).

Execução da Fase B:
- `cd apps/mobile && npx jest --maxWorkers=2 --workerIdleMemoryLimit=700MB`: **190/190 suítes PASS** (**1250/1250 testes PASS**, 37.638 s)
- `cd apps/mobile && npx tsc --noEmit`: **0 erros** em produção (148 pré-existentes em 41 arquivos `__tests__` antigos)
- `node scripts/test-lock.js verify`: **206 arquivos íntegros**

## Sprint 89 — Correções da validação Pluggy (Fase B concluída)

`priceFactor` aplicado também à posição (`resolvePositionPriceFactor`, herança com `warning` quando ausente na posição e uniforme nas transações, e `warning` sem multiplicar quando divergente — `R12`), `OPENING_BALANCE` sem `amountOriginal` mantendo `cost_basis_source = 'UNKNOWN'` e ajuste `SELL` sintético `pluggy-closing-adj:<investmentId>` quando livro > posição (`R13`), e helper puro `isUnknownCost` (`domain/finance/averagePrice.ts`) aplicado em `marketSyncService`, `finGoalsService`, `PortfolioManagementScreen` (usando `of_reported_value` para `INSTITUTION` e divisão por quantidade `< 1` sem `Math.max(1, qty)`) e `IncomeHistoryScreen` (`R14`).

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/services/pluggy/__tests__/Sprint89PluggyValidationFixes.test.ts` | S89-T01…T05 | `2cfcf0d4638cb64f8407a35d8dae498e08bd2eee466dfafb88ddc81bad1e517e` | 5 FAIL |
| `apps/mobile/src/services/__tests__/Sprint89UnknownCostConsumers.test.tsx` | S89-T06…T08 | `7a262ba958b9ddf6fb7fb057b4e1d22cd59cff73044009bfd47e394240a9d29a` | 3 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `apps/mobile/src/services/pluggy/__tests__/Sprint84InvestmentNumbers.test.ts:234,276`: adicionado `docket_code` obrigatório nas fixtures de `createPortfolio` (correção só de tipo).
- `apps/mobile/src/domain/financeFlow/__tests__/Sprint74CardEntryRule.test.ts:32,66`: adicionadas colunas novas obrigatórias (`of_linked_at`, `closing_balance_cents`, `auto_invested_cents`, `credit_used_cents`, `linked_income_id`, `of_removed_at`) nas fixtures `makeAccount` e `makeEntry` (correção só de tipo).
- `apps/mobile/src/screens/__tests__/IncomeHistoryScreen.test.tsx:122`: adicionados `item_id: null` e `asset_id: null` na fixture de `addIncome` (correção só de tipo).
- `apps/mobile/src/services/pluggy/__tests__/Sprint89PluggyValidationFixes.test.ts`: ajuste de setup (`defaultPortfolioId`, `tradeDate` na fixture de `S89-T04`, `calculateDailyPatrimonyCurve` em `S89-T03`).
- `apps/mobile/src/services/__tests__/Sprint89UnknownCostConsumers.test.tsx`: ajuste de chamada (`finGoalsService.getGoalsContext`), consulta escopada (`within(chip)`) e verificação do total `R$ 600,00` em `wallet-colored-body` (`S89-T08`).

Execução da Fase B:
- `cd apps/mobile && npx jest --maxWorkers=2 --workerIdleMemoryLimit=700MB`: **188/188 suítes PASS** (**1240/1240 testes PASS**)
- `node scripts/test-lock.js verify`: **204 arquivos íntegros**

## Sprint 88 — Diagnóstico com dados reais e auditoria de outliers (Fase B concluída)

Relatório JSON anonimizado (`pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics`, sem `owner`, `taxNumber`, `number`, `itemId` em claro e descrições truncadas em 40 chars), auditoria local de outliers (`auditOpenFinanceOutliers`), seção **Qualidade dos dados** com botão **Exportar diagnóstico** em `OpenFinanceScreen` e documentação em `docs/DIAGNOSTICO_PLUGGY.md`. Correção de tipo em `pluggyInvestmentsSyncService.ts:545` (`is_synthetic: 0`).

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint88Audit.test.ts` | S88-T02…T04 | `587a317857038c83bbe8fd901b24a01cccfd2a7552ecb655a7f8cd08b45d54cc` | 3 FAIL |
| `apps/mobile/src/services/pluggy/__tests__/Sprint88Diagnostics.test.ts` | S88-T01, S88-T05 | `9a52242f46065e52a992866eb3e0271daa9b8f2a4f6ae0c3070c757890431ece` | 2 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `apps/mobile/src/screens/__tests__/Sprint73UnifiedSync.test.tsx:119` (`S73-T10`): escopada a consulta `getByText(/XP/i)` para `within(getByTestId('open-finance-item-item-1')).getByText(/XP/i)`, porque o botão `"Exportar diagnóstico"` da Sprint 88 contém a substring `"xp"` (`E[xp]ortar`) e causava falso-positivo de múltiplos elementos.

Execução da Fase B:
- `cd apps/mobile && npx jest --maxWorkers=2 --workerIdleMemoryLimit=700MB`: **184/184 suítes PASS** (**1223/1223 testes PASS**)
- `node scripts/test-lock.js verify`: **200 arquivos íntegros**

## Sprint 87 — Bancos e cartões: janela, exclusões e saldos (Fase B concluída)

Separação de `of_sync_runs.kind` (`FINANCE` | `INVESTMENTS` com migração por prefixo `'of-inv-'`), busca em duas passadas (`createdAtFrom` incremental + reconciliação de 40 dias por `dateFrom`), `detectRemovedOpenFinanceEntries` (`fin_entries.of_removed_at`, soft delete de pendentes, remoção de pagos dos totais/resumo/saldo mantendo visibilidade, conflito com `user_edited_fields`), deduplicação defensiva (`${id}:${date}:${amount}`), recálculo de `initial_balance_cents` na primeira vinculação (`of_linked_at`), persistência de `closing_balance_cents`, `auto_invested_cents` e `credit_used_cents`, rótulo `"Total em aberto"` em cartões Open Finance e backup atualizado.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/services/__tests__/Sprint87FinanceSync.test.ts` | S87-T01…T03, S87-T07…T09 | `9644462f704cc9013ba6f78623930a3880786c81d4dd06880814489d3e8875f7` | 5 FAIL / 1 PASS |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint87Removals.test.ts` | S87-T04…T06 | `b787883371ba8563055f617e9d62a82e8b1e3b3a373369a854861b81aade140a` | 2 FAIL / 1 PASS |

**Testes atualizados com autorização explícita do usuário:**
- `apps/mobile/src/services/__tests__/Sprint87FinanceSync.test.ts:274` (`S87-T08`): expectativa de `masked_number` ajustada para `'3456'` (4 últimos dígitos, consistente com `mapPluggyAccount`).
- `apps/mobile/src/services/__tests__/Sprint65PluggySyncService.test.ts:210` (`S65-S02`): janela atualizada para a regra R10 (inclui passada de reconciliação de 40 dias `'2026-10-08'`).
- `apps/mobile/src/services/__tests__/Sprint69FinanceFixes.test.ts:202` (`S69-S04`): expectativa de `initial_balance_cents` atualizada para `-29950` (`320050 - (500000 - 150000)`), refletindo a regra R11 na primeira vinculação de conta existente.

Execução da Fase B:
- `cd apps/mobile && npx jest --maxWorkers=2 --workerIdleMemoryLimit=700MB`: **184/184 suítes PASS** (**1227/1227 testes PASS**)
- `node scripts/test-lock.js verify`: **200 arquivos íntegros**

## Sprint 86 — Proventos completos (Fase B concluída)

`PluggyClient.request` com `maxRetries` configurável (4 retentativas em `listInvestmentTransactions`), backoff exponencial com jitter e `Retry-After` até 30 s, concorrência 2 no sync de investimentos, status `PARTIAL` com `counts.failedInvestmentIds` preservando custo existente em falha, gravação de `INTEREST` independente do status de reconciliação (com migração ao confirmar), `income_events.item_id`/`asset_id` e `fin_entries.linked_income_id` (schema, migração e backup), `disconnectItemInvestments` isolado por `item_id`, `detectBankIncomeCandidate` (`OPEN_FINANCE_BANK`) integrado ao `pluggySyncService`, e aviso/botão `"Tentar de novo"` na `OpenFinanceScreen`.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/services/pluggy/__tests__/Sprint86Income.test.ts` | S86-T01…T05 | `b1cce2247d4364cc971fb4966c995c13ec74a3a54f5f5bc9f47716a3a366a01b` | 3 FAIL / 1 PASS |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint86BankIncome.test.ts` | S86-T06…T08 | `1431568ae8e3768ebb4ab23ffdd903699ad6b2c245f1724ce30c25af13972e16` | 2 FAIL / 1 PASS |

Execução da Fase B:
- `cd apps/mobile && npx jest --watchAll=false --maxWorkers=2`: **182/182 suítes PASS** (**1218/1218 testes PASS**)
- `node scripts/test-lock.js verify`: **198 arquivos íntegros**

## Sprint 85 — Investimentos: valor de mercado, identidade e histórico (Fase B concluída)

Implementação de `assets.of_reported_value`, `assets.of_reported_at`, `assets.value_source`, `transactions.is_synthetic` (schema, migrações e backup), transação sintética `OPENING_BALANCE` (`pluggy-opening:<investmentId>`, removida se o livro fechar — `R4`), `resolveVariableIncomeValueSource` com tolerância de 15% e `OPTION`/`DERIVATIVES` em `FUNDS` (`R5`), isolamento de identidade por `itemId`/`external_id` e sufixo de colisão apenas no nome (`R7`), histórico patrimonial usando `ofReportedValue`/`manualPositionValue` apenas a partir de `ofReportedAt` (`R6`), e reparo automático de ativos sequestrados (`counts_json.assetsRepaired`).

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/services/pluggy/__tests__/Sprint85MarketValueIdentity.test.ts` | S85-T01…T07, S85-T10 | `67a8a08214f527d2b06adcce2e4f73cd118d494b8da5df35160d8264611ee814` | 8 FAIL |
| `apps/mobile/src/domain/finance/__tests__/Sprint85PortfolioHistory.test.ts` | S85-T08…T09 | `2aeba4e73e73d470c2466116cbfa833a0386280efc46465035a1ee8e01702431` | 2 FAIL |

Execução da Fase B:
- `cd apps/mobile && npx jest --watchAll=false --maxWorkers=2`: **180/180 suítes PASS** (**1211/1211 testes PASS**)
- `node scripts/test-lock.js verify`: **196 arquivos íntegros**

## Sprint 84 — Investimentos: números corretos (Fase B concluída)

Precisão de 8 casas decimais em `unit_price` e `average_price` (`R1`), validação de `tx.value` e exclusão de `incomeTax`/`iofProvision` em `fees` (`R2`), mapeamento de taxas de Renda Fixa com `assets.rf_indexer_pct` e faixa plausível (`R3`), custo `'UNKNOWN'` quando sem `amountOriginal` (`R4`), reprocessamento idempotente por `external_id` e formatação `formatUnitPriceBRL` (2 ou 6 casas para cotas `< R$ 1,00`).

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/services/pluggy/__tests__/Sprint84InvestmentNumbers.test.ts` | S84-T01…T10 | `4f8c419db8ccdf64e7f071f8e491efb6f831529eeda986462d10290550c71bf9` | 9 FAIL / 1 PASS |

**Testes atualizados com autorização explícita do usuário:**
- `Sprint66InvestmentsDomain.test.ts` (`S66-D06`, `S66-D07`, `S66-D08`): expectativas de `unitPrice` e `averagePrice` atualizadas para 8 casas decimais (`R1`).
- `Sprint71InvestmentMapping.test.ts` (`S71-T04`, `S71-T05`, `S71-T06`, `S71-T08`): expectativas de `averagePrice` atualizadas para 8 casas decimais e `totalInvested` sem truncamento intermediário de PM (`R1`).

Execução da Fase B:
- `npx jest --watchAll=false src/domain/openFinance/__tests__/ src/services/pluggy/__tests__/`: **14/14 suítes PASS** (**92/92 testes PASS**)
- `node scripts/test-lock.js verify`: **194 arquivos íntegros**

## Sprint 79 — Tema claro em todas as telas (Fase B concluída)

Papéis semânticos completos em `THEME_COLORS` e `getFinUiColors` com contraste WCAG >= 4,5:1, refatoração de `OpenFinanceInvestmentReconciliationSheet` (`AnimatedModalSheet` + `themeMode`), `OpenFinanceScreen`, `StatementImportSheet`, `ReceiptScannerSheet` e telas de Finanças para eliminar cores literais soltas. `app.json` já possui `"userInterfaceStyle": "automatic"` (efeito nativo depende de novo build; o tema exibido continua sendo o selecionado no Perfil).

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/theme/__tests__/Sprint79ThemeRolesAndContrast.test.ts` | S79-T01…T02 | `ec1df65954392371116630548ab406c8e0f386bd86eb878b583d3f67bb9e3a11` | 2 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint79LightThemeCoverage.test.tsx` | S79-T03…T05 | `ca09e464c13f13827536ef9dfd22f0461ba6d6f0e7727657e91372cc8474371e` | 1 FAIL / 2 PASS |
| `apps/mobile/src/__tests__/Sprint79NoLooseColors.test.ts` | S79-T06 | `f0e2cc45c1a9b6c9b109df28125acf00602310398f0b1cc9aa882a8cb0ee2e48` | 1 FAIL |

Execução da Fase B:
- `npm --prefix apps/mobile test -- --watchAll=false Sprint79ThemeRolesAndContrast Sprint79LightThemeCoverage Sprint79NoLooseColors`: **3/3 suítes PASS** (**6/6 testes PASS**)
- `npm --prefix apps/mobile test -- --watchAll=false Sprint64OpenFinanceScreen Sprint69OpenFinanceInvestmentsUI Sprint62StatementImportScreen Sprint67BudgetForecastProfileScreens Sprint56FinanceFidelity`: **5/5 suítes PASS** (**36/36 testes PASS**)
- `node scripts/test-lock.js verify`: **185 arquivos íntegros**

## Sprint 78 — Perfil: estrutura base comum e seções por módulo (Fase B concluída)

Separação do Perfil (`SettingsBackupScreen` / `ProfileTiles`) em base comum (`Identidade`, `GERAL`, `PROTEÇÃO`, `CONEXÕES E DADOS`) e seções por módulo (`Investimentos` e `Finanças`) com `ModuleSectionHeader`, ordenação e colapso por `originModule`, layout em 2 colunas com ambas abertas, unicidade de itens, preservação de `testIDs` e navegação direta para rotas dos dois módulos.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/screens/__tests__/Sprint78ProfileSections.test.tsx` | S78-T01…T04 | `4ca17d14aa83cd3f79696b16c7271bb35b2670d15a4aaf65459c986e7428c12b` | 4 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint78ProfileNavigation.test.tsx` | S78-T05…T07 | `37c6af9f28b53a03da3cce83ec0d714d9da6fa416ebab3e45e024d48c4ca4231` | 3 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `Sprint78ProfileSections.test.tsx`: usa `jest.spyOn(RN.Dimensions, 'get')` para largura (`390` e `820`), `within(col)` para inspecionar colunas e expande `backup-row` antes de verificar `export-dossier-btn`.
- `Sprint78ProfileNavigation.test.tsx`: verifica `settings-backup-screen` em vez de `profile-settings-modal` (o mock de `SafeAreaView` no Jest não repassa `testID`).

Execução da Fase B:
- `npm --prefix apps/mobile test -- --watchAll=false Sprint78ProfileSections Sprint78ProfileNavigation`: **2/2 suítes PASS** (**7/7 testes PASS**)
- `npm --prefix apps/mobile test -- --watchAll=false Sprint19XpSettingsAndLightModeAudit Sprint26PrivacyContrastAndNavbarStabilization Sprint45SecurityProfile Sprint64OpenFinanceScreen Sprint67BudgetForecastProfileScreens`: **5/5 suítes PASS** (**42/42 testes PASS**)
- `node scripts/test-lock.js verify`: **182 arquivos íntegros**

## Sprint 77 — Resumo de Finanças: saldo do mês em carrossel e tiles Receitas/Despesas navegáveis (Fase B concluída)

Carrossel horizontal `MonthBalanceCarousel` com `PanResponder + Animated` (mesmos limiares e mola de `StackedWalletDeck`), indicador em pílulas (`finance-month-pills`), atalho "Hoje" (`finance-month-today-btn`), limite de 24 meses à frente, suporte a `useReducedMotion` e modo privacidade, e tiles Receitas/Despesas navegáveis para `EntriesListScreen` com título dinâmico ("Receitas"/"Despesas"/"Lançamentos").

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/components/ui/__tests__/Sprint77MonthBalanceCarousel.test.tsx` | S77-T01…T06 | `4ee84a45034ceb0e62ae694704f13a9d351566119d1152cbfca175383e51b235` | 6 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint77FinanceHomeMonthAndTiles.test.tsx` | S77-T07…T08 | `bf7f1ee95d283f81c7864e7483180768a131db33225f60e104691ce86aa4e377` | 2 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `Sprint77FinanceHomeMonthAndTiles.test.tsx` (`S77-T08`): usa `getAllByText('Receitas')` / `getAllByText('Lançamentos')` (header + controle segmentado) e aguarda carregamento assíncrono de `EntriesListScreen` com `waitFor`.

Execução da Fase B:
- `npm --prefix apps/mobile test -- --watchAll=false Sprint77MonthBalanceCarousel Sprint77FinanceHomeMonthAndTiles`: **2/2 suítes PASS** (**8/8 testes PASS**)
- `npm --prefix apps/mobile test -- --watchAll=false Sprint56FinanceFidelity Sprint55FinanceReskin Sprint60FinanceArtifactFidelity FinanceModuleScreens Sprint36ActiveWalletSwitch`: **5/5 suítes PASS** (**60/60 testes PASS**)
- `npx tsc --noEmit`: **0 erros** nos arquivos de produção e testes da Sprint 77
- `node scripts/test-lock.js verify`: **180 arquivos íntegros**

## Sprint 76 — Casca compartilhada: header, nav bar única e troca de módulo (Fase B concluída)

`AppModule` (`show-chart` / `account-balance`), `XpMinimalHeader` sem Alert e com ícone do módulo ativo, `FloatingBottomDock` configurável por props (`tabs`, `actions`, prefixos) usado também em Finanças (removido `FinanceDock.tsx`), avatar nas 4 telas raiz de Finanças abrindo `SettingsBackupScreen`, e `switchModule()` em `App.tsx` preservando aba e rota.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/components/ui/__tests__/Sprint76SharedHeader.test.tsx` | S76-T01…T02 | `91d9cefb8268bbba1ee47d4d66d25622f316f1db4c84f069cfd66d334a1e74d4` | 2 FAIL |
| `apps/mobile/src/components/ui/__tests__/Sprint76ConfigurableDock.test.tsx` | S76-T03…T04 | `72ba90c64f2b19b19bb4fc4cfb9a4561425fc8803063137d0f1199fa0223c35a` | 1 FAIL / 1 PASS |
| `apps/mobile/src/screens/__tests__/Sprint76ModuleSwitchEverywhere.test.tsx` | S76-T05…T06 | `69024c55f3e18dfb47ca4d96a873e0560c18995b5f625454a4a8a680d2c92e04` | 2 FAIL |
| `apps/mobile/src/navigation/__tests__/Sprint76BackNavigation.test.ts` | S76-T07 | `de2073c3b0a9972ef34e7e0b9e89689b6cfcb0a517bd4a30c8d37264` | 1 PASS |

**Testes atualizados com autorização explícita do usuário:**
- `Sprint76SharedHeader.test.tsx` (`S76-T01`, `S76-T02`) e `Sprint76ModuleSwitchEverywhere.test.tsx` (`S76-T06`): leitura do nome do ícone via `.props.children` (padrão do mock de `MaterialIcons` em `jest.setup.js`).
- `Sprint55FinanceReskin.test.tsx` (`S55-T03`, `S55-T04`): passado `onSwitchModule={jest.fn()}` no Resumo e atualizado check de `finance-add-entry-btn` para o novo botão do `FloatingBottomDock`.
- `FinanceModuleScreens.test.tsx`: retorno do Resumo de Finanças para Investimentos via `header-globe-button` e conta `checking` para o teste de baixa de lançamento pendente.

Execução da Fase B:
- `npx jest --no-coverage Sprint76 Sprint58FinanceNavbar Sprint60FinanceArtifactFidelity FinanceModuleScreens Sprint55FinanceReskin`: **8/8 suítes PASS** (**53/53 testes PASS**)
- `npx jest --no-coverage` (suíte completa): **157/164 suítes PASS** (**1037/1045 testes PASS**)
- `npx tsc --noEmit`: **0 erros** nos arquivos de produção e nos testes das Sprints 74–76
- `npx expo export --platform web`: **778 módulos** empacotados sem erros
- `node scripts/test-lock.js verify`: **178 arquivos íntegros**

## Sprint 75 — Leitor de cupom: valor total e chave de 44 dígitos (Fase B concluída)

Parser de chave de acesso de 44 dígitos (`parseAccessKey`, modelos 65/55/59), extração de total por pontuação (colunas, troco, confirmação), código de barras `code128`, entrada manual de chave, consulta opcional à SEFAZ (`nfceLookupService`), captura de total por OCR após QR/chave e diagnóstico de texto lido.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/receipt/__tests__/Sprint75AccessKey.test.ts` | S75-T01…T02 | `d1f618ae1f42ce0f58b119409c529ffd29b3ebf883189d6755f2b2a363dffc6d` | 2 FAIL |
| `apps/mobile/src/domain/receipt/__tests__/Sprint75TotalExtraction.test.ts` | S75-T03…T05 | `84cbb9795e41ae9c04722f01e5e58ed8b519d5cff4f065cab37c89d89dea3fa9` | 2 FAIL / 1 PASS |
| `apps/mobile/src/services/__tests__/Sprint75ReceiptFlows.test.ts` | S75-T06…T08 | `369d76ff01d1fb8aff83a99bf047c2dbb5eaccb1f1a1649b9eeca8874e3d19f3` | 3 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint75ReceiptScannerModes.test.tsx` | S75-T09…T11 | `823cdd3447f44ba17d5ec57e0fbe18c205d6b6e9182bb7365a8373333b962cd1` | 3 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `receiptParser.test.ts`: `parseNfceQr` agora aceita modelo 55 (e 59) e rejeita modelos fora de `{55, 59, 65}` (ex.: modelo 57).
- `Sprint75ReceiptFlows.test.ts` (`S75-T06`): cria conta via `finRepository.createAccount` antes de criar o lançamento de duplicidade.

Execução da Fase B:
- `npx jest --no-coverage Sprint75 receiptParser`: **5/5 suítes PASS** (**35/35 testes PASS**)
- `npx tsc --noEmit`: **0 erros** nos arquivos de produção e nos testes da Sprint 75
- `node scripts/test-lock.js verify`: **174 arquivos íntegros**

## Sprint 74 — Cartão de crédito: compra sem vencimento próprio e extrato por fatura (Fase B concluída)

Regra centralizada (`normalizeCardEntry`) em cartão (`due_date` = data da compra, `status = 'paid'`, `paid_date = due_date`, `bill_month` obrigatório), migração idempotente, fontes (formulário, parcelamento, Pluggy, arquivo, cupom), lista de lançamentos por fatura e evolução de `CardBillScreen` para extrato completo.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/financeFlow/__tests__/Sprint74CardEntryRule.test.ts` | S74-T01…T05 | `b2547fe1fe11846859410ed1f48f909015686e9512f61ac05b55a30018762ead` | 4 FAIL / 1 PASS |
| `apps/mobile/src/services/__tests__/Sprint74CardMigrationAndSources.test.ts` | S74-T06…T09 | `f7c9c5ece736f76cc23752fa2445a4b9d2cf395aebe2748f77069a6db9a21d47` | 3 FAIL / 1 PASS |
| `apps/mobile/src/screens/__tests__/Sprint74CardStatement.test.tsx` | S74-T10…T13 | `87a5ec7c9e520125307c81ae390786ccd546bc6e1f9a1b59f00d4ba8b2177bc6` | 4 FAIL |

**Testes atualizados com autorização explícita do usuário:**
- `Sprint65OpenFinanceDomain.test.ts` (`S65-D03`): `mappedRefund` em cartão `PENDING` agora espera `status: 'paid'`, `paidDate: '2026-11-16'`, `paidAmountCents: 5025`.
- `Sprint65PluggySyncService.test.ts` (`S65-S03`): `created.status` em conta `CREDIT_CARD` `PENDING` agora espera `'paid'`.
- `Sprint74CardStatement.test.tsx` (`S74-T10`, `S74-T11`): seleção do chip do cartão via `getAllByText(...).at(-1)!`.

Execução da Fase B:
- `npx jest --no-coverage Sprint74 Sprint65OpenFinanceDomain Sprint65PluggySyncService`: **5/5 suítes PASS** (**26/26 testes PASS**)
- `npx tsc --noEmit`: **0 erros** nos arquivos de produção e nos testes da Sprint 74
- `node scripts/test-lock.js verify`: **170 arquivos íntegros**

## Sprint 73 — Pluggy: botão único "Sincronizar" e carteira automática por corretora (Fase B concluída)

Vínculo `portfolios.of_item_id`, serviço `ensurePortfolioForItem` (reaproveitamento/vinculação por nome/criação automática, proteção de nome renomeado), roteamento em `syncInvestments`, botão único `"Sincronizar"` com progresso por conexão, resumo final, isolamento de erros e reload de `walletsStore`.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/services/pluggy/__tests__/Sprint73PortfolioPerBroker.test.ts` | S73-T01…T06 | `c02651d33d3ba1dedea62bf7287db72dd1789bccc45a476b34c26f4114ec99c9` | 6 FAIL |
| `apps/mobile/src/db/__tests__/Sprint73PortfolioItemLinkMigration.test.ts` | S73-T07…T08 | `33fccf7fa5f52049705e6c04d671d607378f5224cce34572ccf7581f1553eca8` | 2 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint73UnifiedSync.test.tsx` | S73-T09…T10 | `46980d5e0de181f70c519f03c31534a1e4f0c87c2d85dde2074c11df710b6387` | 2 FAIL |

Execução da Fase A: `npx jest Sprint73 --no-coverage` → 10 falhando, 0 passando (10 testes, 3 suítes). 170 arquivos travados.

**Testes antigos atualizados com autorização explícita do usuário:**
- `Sprint69OpenFinanceInvestmentsUI.test.tsx` (`S69-U01`, `S69-U02`, `S69-U03`): adicionado clique em `open-finance-advanced-toggle` antes de `open-finance-sync-investments-btn`.
- `Sprint71OpenFinanceSyncFlow.test.tsx` (`S71-T23`): adicionado clique em `open-finance-advanced-toggle` antes de `open-finance-sync-finance-btn`.

Execução da Fase B:
- `npx jest Sprint69OpenFinanceInvestmentsUI Sprint71 Sprint72 Sprint73 --no-coverage`: **13/13 suítes PASS** (59/59 testes)
- `npx jest --no-coverage` (suíte completa): **149/153 suítes PASS** (**1011/1014 testes PASS**; as únicas 4 falhas são as pré-existentes: `pluggyFixtures.ts`, `receipt/__tests__/fixtures.ts`, `receiptFlow.test.tsx` e `Sprint39GeneralBugsAndHardening.test.tsx`)
- `npx tsc --noEmit`: **0 erros** nos arquivos de produção e nos testes das Sprints 71–73
- `npx expo export --platform web`: **778 módulos** empacotados sem erros
- `node scripts/test-lock.js verify`: **170 arquivos íntegros**

**Merge sprints 73 com 74–81 (nota de integração):** a branch `feat/sprint-73-pluggy-unified-sync` foi criada antes das sprints 74–81 e sua Fase B (10/10 testes locais passando, suítes dependentes `Sprint69OpenFinanceInvestmentsUI`/`Sprint71OpenFinanceSyncFlow` 7/7 passando) foi integrada por merge ao branch principal. Conflitos em `OpenFinanceScreen.tsx` resolvidos preservando o botão único `"Sincronizar"` + toggle `"Opções avançadas"` da 73 com a estilização por tokens (`t.primaryButtonBg`, `space.xs`) das sprints 80–81.

## Sprint 72 — Pluggy: sincronizar proventos (Fase B concluída)

Mapeamento de movimentações `INTEREST` para `income_events`, classificação de `kind` (`JCP`, `DIVIDENDO`, `RENDIMENTO`, `PROVENTO`), deduplicação cruzada Pluggy × B3 × Manual (`findEquivalentIncome`), limpeza de duplicatas antigas, desconexão seletiva e backup ida e volta.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint72PluggyIncome.test.ts` | S72-T01…T06 | `af87fdc03b252bde620e09fd7841d1ec91e80548884f4f6ee68fdb041324ddd2` | 6 FAIL |
| `apps/mobile/src/domain/finance/__tests__/Sprint72IncomeDedup.test.ts` | S72-T07…T13 | `61afb73593e230f359212d27285fc42bf2f7572dc4ae12a18235d112a06fb8c9` | 7 FAIL |
| `apps/mobile/src/services/pluggy/__tests__/Sprint72IncomeSync.test.ts` | S72-T14…T17 | `400b966d7cc108f92021363517a3ba61908cdfdf3bd6ca929808323769e5f0f7` | 3 FAIL, 1 PASS |
| `apps/mobile/src/services/__tests__/Sprint72B3AndPluggyTogether.test.ts` | S72-T18…T20 | `ef69284a443834728989d0cbe6cfdc87ed90ac19594a205f8dfdd04c2f35f8e5` | 3 FAIL |

Execução da Fase A: `npx jest Sprint72 --no-coverage` → 19 falhando, 1 passando (20 testes, 4 suítes). 167 arquivos travados.

**Teste antigo atualizado com autorização explícita do usuário:**
- `Sprint71InvestmentsSyncRobustness.test.ts` (`S71-T09`, linha 138): atualizado de `toHaveLength(0)` para `toHaveLength(1)` porque a Sprint 72 passou a persistir `INTEREST` em `income_events`.

Execução da Fase B:
- `npx jest Sprint71 Sprint72 b3ImportService --no-coverage`: **10/10 suítes PASS** (55/55 testes)
- `node scripts/test-lock.js verify`: **167 arquivos íntegros**

## Sprint 71 — Pluggy: diagnosticar e corrigir a importação (Fase B concluída)

Diagnóstico e cobertura campo a campo, correção de movimentações (`BUY`/`SELL` em `transactions`, `TAX`/`AMORTIZATION`/`TRANSFER` no custo, `INTEREST` separado), taxas via `expenses`, `manual_position_value` nulo para ações/FIIs/BDRs/ETFs, robustez e concorrência no sync de investimentos, nomenclatura legível com preservação de edição do usuário e conciliação em sequência de todos os itens de finanças.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint71InvestmentMapping.test.ts` | S71-T01…T08 | `808ec5b8edd8dbb34300821112c3a510528d94558f5421f8aace3db8f088b22b` | 6 FAIL, 2 PASS (guardas de regressão) |
| `apps/mobile/src/services/pluggy/__tests__/Sprint71InvestmentsSyncRobustness.test.ts` | S71-T09…T14 | `3c32f0ca2c4a2eb55a9ed287536d5ab5f908ebee8fa8fb931b9da500040a9ffb` | 6 FAIL |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint71Diagnostics.test.ts` | S71-T15…T18 | `31fba7bcdb539818e2f26cfd265087c6ed840b2b73d38e35d695f011b8c17b7b` | 4 FAIL |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint71Naming.test.ts` | S71-T19…T22 | `e5ee7092351ce578e5731d0e79823c832bc6254c7bc163dad73628c344edba89` | 4 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint71OpenFinanceSyncFlow.test.tsx` | S71-T23…T25 | `dfa9e974c5435598dbc92387fa310e6c37b7d30b37bef2d06f5b80e673fdaa2a` | 3 FAIL |

Execução da Fase A: `npx jest Sprint71 --no-coverage` → 23 falhando, 2 passando (25 testes, 5 suítes). 163 arquivos travados.

**Testes antigos atualizados com autorização explícita do usuário:**
- `Sprint65OpenFinanceDomain.test.ts` (`S65-D02`, `S65-D03`): atualizados para refletir `buildAccountName` e `cleanTransactionDescription` preservando `descriptionRaw`.
- `Sprint66InvestmentsSync.test.ts` (`S66-S02`, `S66-S04`): atualizados para refletir `manual_position_value === null` em ações e FIIs.

Execução da Fase B:
- `npx jest Sprint71 --no-coverage`: **25/25 PASS** (5 suítes)
- `npx jest Sprint64 Sprint65 Sprint66 Sprint69 Sprint70 pluggyClient`: **18/19 PASS** em paralelo + `Sprint69OpenFinanceInvestmentsUI` **4/4 PASS** isolado
- `node scripts/test-lock.js verify`: **163 arquivos íntegros**

## Sprint 70 — Correções médias da revisão (Fase B concluída)

Transferências na lista de lançamentos, pagamento de fatura vindo do Open Finance, patrimônio pelo valor de
posição, previsão de caixa com atrasados e edição de parcelas/lançamentos no cartão.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/openFinance/__tests__/Sprint70BillPaymentAndForecast.test.ts` | S70-T01…T08 | `d18a9b4c9a0b3d2e30ced981507382ce305e3a9625b92cf6d795cf8eaa5145e3` | 4 FAIL, 4 PASS (guardas de regressão) |
| `apps/mobile/src/services/__tests__/Sprint70MediumFixes.test.ts` | S70-S01…S07 | `519fbfdc2804de84a2c92f0ad5138c9bfb7b5a3e3fcf25581f838632269421b7` | 7 FAIL |
| `apps/mobile/src/screens/__tests__/Sprint70TransfersInEntriesList.test.tsx` | S70-U01…U03 | `100a3ec888ce280ed3389cc15c6a6fe95df2ca03f14cb290dbe9c028f969c767` | 3 FAIL |

Execução da Fase A: `npx jest Sprint70` → 14 falhando, 4 passando (18 testes, 3 suítes). 158 arquivos travados.

Execução da Fase B:

| Verificação | Resultado |
| :--- | :--- |
| `npx jest Sprint70` | **18/18 PASS** (3 suítes) |
| `npx jest` (suíte completa) | 966/969 testes, 140/144 suítes. Falham as mesmas 4 suítes de antes (2 fixtures contadas como suíte, `receiptFlow.test.tsx`, `Sprint39GeneralBugsAndHardening`) |
| Instabilidade observada | Em 2 de 3 execuções completas, testes sensíveis a tempo falharam e passaram ao rodar isolados: `incomeHistory` S48-T05 (limite de 50 ms), `profileStore` S42-T30 e `Sprint69OpenFinanceInvestmentsUI` (3/3 PASS isolado) |
| `npx tsc --noEmit` (produção) | 2 erros pré-existentes (`DotMatrixAllocationCard.tsx:41`, `PortfolioManagementScreen.tsx:1579`) |
| `node scripts/test-lock.js verify` | 158 arquivos íntegros |

## Sprint 69 — Correções da revisão das sprints 59–68 (Fase B concluída)

Quatro correções: mês da fatura quando o cartão fecha depois do dia do vencimento, saldo de conta vinda do
Open Finance, backup de orçamentos e vínculos do Open Finance, e investimentos da Pluggy acessíveis pela tela.

| Arquivo de teste | Casos | SHA-256 | Fase A |
| :--- | :--- | :--- | :--- |
| `apps/mobile/src/domain/financeFlow/__tests__/Sprint69CardBillAndBalance.test.ts` | S69-T01…T08 | `266727bf6f0e233a025c1804adb017d05c3b3434ac82a512a8856843bfc5d8bf` | 5 FAIL, 3 PASS (guardas de regressão) |
| `apps/mobile/src/services/__tests__/Sprint69FinanceFixes.test.ts` | S69-S01…S07 | `a1f7661a940b83ccc41043abfd77b5c66ad2f825230834a19e6cac7f33ad685c` | 5 FAIL, 2 PASS (guardas de regressão) |
| `apps/mobile/src/screens/__tests__/Sprint69OpenFinanceInvestmentsUI.test.tsx` | S69-U01…U04 | `a689d998d02dd337255ba33692a127c691d65db9eadf51c8bb160dbaecab44d9` | 4 FAIL |

Execução da Fase A: `npx jest Sprint69` → 14 falhando, 5 passando (19 testes, 3 suítes). 155 arquivos travados.

Execução da Fase B:

| Verificação | Resultado |
| :--- | :--- |
| `npx jest Sprint69` | **19/19 PASS** (3 suítes) |
| `npx jest` (suíte completa) | 948/951 testes, 137/141 suítes. As 4 suítes que falham já falhavam antes da sprint: 2 arquivos de fixture contados como suíte (`receipt/__tests__/fixtures.ts`, `pluggy/__tests__/pluggyFixtures.ts`), `receiptFlow.test.tsx` (espera conta padrão removida na sprint 59) e `Sprint39GeneralBugsAndHardening` (valor do patrimônio duplicado na tela inicial) |
| `npx tsc --noEmit` (produção) | 2 erros pré-existentes (`DotMatrixAllocationCard.tsx:41`, `PortfolioManagementScreen.tsx:1579`); os 2 de `backupService.ts` foram resolvidos |
| `node scripts/test-lock.js verify` | 155 arquivos íntegros |

## Sprint 68 — Metas financeiras unificadas e patrimônio líquido único (Fase B concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`152` arquivos verificados via SHA-256):
  - `apps/mobile/src/domain/finance/__tests__/Sprint68GoalsAndNetWorth.test.ts` (**S68-T01 a S68-T10**, 10 casos).
  - `apps/mobile/src/services/__tests__/Sprint68GoalsServiceAndBackup.test.ts` (**S68-T11 a S68-T17**, 7 casos).
  - `apps/mobile/src/screens/__tests__/Sprint68GoalsAndNetWorthScreens.test.tsx` (**S68-T18 a S68-T24**, 7 casos).
- **Teste atualizado com autorização explícita do usuário:**
  - `Sprint68GoalsAndNetWorthScreens.test.tsx` (`S68-T20`, linha 156): atualizado `getByText(/atingida/i)` para `getByText(/atingida em/i)` porque o nome da meta (`"Meta Atingida"`) e o selo com data (`"atingida em nov/2026"`) ambos casavam com `/atingida/i`.
- **Fase B:** implementação concluída em `src/db/schema.ts`, `src/db/client.ts` (`fin_goals`, `fin_goal_contributions`, `fin_goal_sources`, `net_worth_snapshots`), `src/domain/finance/goal.ts`, `src/repositories/finGoalsRepository.ts`, `src/services/finGoalsService.ts`, `src/services/backupService.ts`, `src/components/ui/GoalProgressTile.tsx`, `src/components/ui/NetWorthTile.tsx`, `src/components/ui/index.ts`, `src/screens/finance/FinanceMoreScreen.tsx`, `src/screens/finance/GoalsScreen.tsx`, `src/screens/finance/NetWorthScreen.tsx`, `src/screens/finance/FinanceHomeScreen.tsx`, `src/screens/finance/index.ts`, `src/screens/PortfolioManagementScreen.tsx` e `apps/mobile/App.tsx`. **3/3 suítes Sprint 68 (24/24 testes)** e **6/6 suítes com regressão (`goalAndPlan`, `GoalProgressTile`, `backupService`) (47/47 testes)** passando em 3,312 s; `tsc --noEmit` com **0 erros** nos arquivos da Sprint 68; `node scripts/test-lock.js verify` aprovado (`152` arquivos íntegros).

## Sprint 67 — Orçamento mensal por categoria, lembretes de vencimento e previsão de saldo (Fase B concluída)

- **Fase B:** implementação concluída em `apps/mobile/package.json` (`expo-notifications`), `apps/mobile/app.json`, `src/db/schema.ts`, `src/db/client.ts` (`fin_budgets`), `src/domain/financeFlow/budgetsAndCashflow.ts`, `src/repositories/finRepository.ts`, `src/services/finReminderService.ts`, `src/services/finService.ts`, `src/screens/finance/BudgetScreen.tsx`, `src/screens/finance/FinanceMoreScreen.tsx`, `src/screens/finance/FinanceHomeScreen.tsx`, `src/screens/profile/ProfileTiles.tsx`, `src/screens/SettingsBackupScreen.tsx` e `apps/mobile/App.tsx`. **3/3 suítes Sprint 67 (17/17 testes)** passando em 3,115 s; `tsc --noEmit` com **0 erros** nos arquivos da Sprint 67; `node scripts/test-lock.js verify` aprovado (`152` arquivos íntegros).

- **Fase A:** bloqueada em `tests.lock.json` (`152` arquivos verificados via SHA-256; execução `npx jest Sprint67 --no-coverage`: 3/3 suítes e 17/17 casos em Red Phase esperado em 3,644 s; `tsc --noEmit` com 0 erros nos arquivos da Sprint 67):
  - `apps/mobile/jest.setup.js`: mock virtual de `expo-notifications` (SDK 58 `SchedulableTriggerInputTypes.DATE`, agendamento/cancelamento local).
  - Stubs de compilação: `finBudgets` em `src/db/schema.ts`, `src/domain/financeFlow/budgetsAndCashflow.ts`, `src/services/finReminderService.ts` e `src/screens/finance/BudgetScreen.tsx`.
  - `apps/mobile/src/domain/financeFlow/__tests__/Sprint67BudgetAndCashflow.test.ts` (**S67-T01 a S67-T07**, 7 casos): `calculateBudgetUsage` (meses de 28, 29, 30 e 31 dias, `ok`/`atencao` >= 80%/`estourado` >= 100%, ritmo, precedência do mês específico, orçamento sem gasto, gasto sem orçamento, competência no cartão sem transferências), `suggestBudgetLimit` (média dos últimos 3 meses) e `projectCashflow` (projeção dia a dia, menor saldo/data, alerta negativo, pendentes, recorrências, parcelas e faturas pelo vencimento).
  - `apps/mobile/src/services/__tests__/Sprint67RemindersAndBudgets.test.ts` (**S67-T08 a S67-T13**, 6 casos): tabela `fin_budgets`, `finReminderService.rescheduleReminders` idempotente pelos próximos 30 dias com `SchedulableTriggerInputTypes.DATE` e limite <= 60 notificações, fatura de cartão como vencimento único, cancelamento ao dar baixa/excluir, preferências (ligado/desligado, antecedência 0/1/3, horário), modo privacidade sem valores (`R$`), alerta de orçamento 80%/100% no máximo 1x por categoria/mês, e `handleNotificationResponse` abrindo Lançamentos filtrado por `"a vencer"`.
  - `apps/mobile/src/screens/__tests__/Sprint67BudgetForecastProfileScreens.test.tsx` (**S67-T14 a S67-T17**, 4 casos): entrada `"Orçamento"` em `FinanceMoreScreen`, `BudgetScreen` (`DotTrack`, gasto/limite, quanto resta por dia, sugestão 3 meses, `"Definir limite"` inline), `FinanceHomeScreen` (frase de previsão sob Saldo do mês, aviso negativo, modal com `PriceAreaChart`, % do limite em ouro/laranja em Gasto por categoria) e preferências de Lembretes em `SettingsBackupScreen`.

## Sprint 62 — Importação de fatura/extrato e regras de categorização (Fase B concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`138` arquivos na Fase A; `140` arquivos verificados via SHA-256 na Fase B):
  - Fixtures anonimizadas em `apps/mobile/src/domain/statementImport/__tests__/fixtures/`: `nubank_card.ofx`, `nubank_card.csv`, `nubank_checking.csv`, `inter.csv`, `c6.csv`, `itau.csv`, `checking_xml.ofx` e `generic_manual.csv`.
  - `apps/mobile/src/domain/statementImport/__tests__/Sprint62StatementImport.test.ts` (**S62-T01 a S62-T09**, 9 casos).
  - `apps/mobile/src/services/__tests__/Sprint62StatementImportService.test.ts` (**S62-T10 a S62-T15**, 6 casos).
  - `apps/mobile/src/screens/__tests__/Sprint62StatementImportScreen.test.tsx` (**S62-T16 a S62-T20**, 5 casos).
- **Fase B:** implementação concluída em `src/domain/statementImport/index.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/services/backupService.ts`, `src/services/statementImportService.ts`, `src/components/StatementImportSheet.tsx`, `src/screens/finance/CategoryRulesScreen.tsx`, `src/screens/finance/FinanceMoreScreen.tsx`, `src/screens/finance/CardBillScreen.tsx`, `src/screens/finance/FinanceHomeScreen.tsx` e `src/screens/finance/index.ts`. **3/3 suítes (20/20 testes)** passando em 2,714 s; `tsc --noEmit` com **0 erros** nos arquivos de produção da Sprint 62; `node scripts/test-lock.js verify` aprovado (`140` arquivos íntegros).

## Sprint 64 — Fundação do Open Finance com Pluggy / Meu Pluggy (Fase B concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`140` arquivos verificados via SHA-256):
  - `apps/mobile/src/services/pluggy/__tests__/pluggyClient.test.ts` (**S64-T01 a S64-T08**, 8 casos).
  - `apps/mobile/src/services/pluggy/__tests__/pluggySecurityAndStorage.test.ts` (**S64-T09 a S64-T10**, 2 casos).
  - `apps/mobile/src/screens/__tests__/Sprint64OpenFinanceScreen.test.tsx` (**S64-T11 a S64-T16**, 6 casos).
- **Fase B:** implementação concluída em `src/services/pluggy/types.ts`, `src/services/pluggy/pluggyClient.ts`, `src/db/schema.ts`, `src/db/client.ts` (`of_items`, `of_sync_runs`), `src/repositories/openFinanceRepository.ts`, `src/screens/OpenFinanceScreen.tsx`, `src/screens/SettingsBackupScreen.tsx`, `src/screens/profile/ProfileTiles.tsx`, `src/navigation/backNavigation.ts`, `apps/mobile/App.tsx` e `docs/PLANO_FINANCAS_OPEN_FINANCE.md` (seção 5.1). **3/3 suítes Sprint 64 (16/16 testes)** e **5/5 suítes com `backNavigation` (37/37 testes)** passando; `tsc --noEmit` com **0 erros** nos arquivos da Sprint 64; `node scripts/test-lock.js verify` aprovado (`140` arquivos íntegros).

## Sprint 63 — Leitura de compras por foto (OCR) e QR da NFC-e (Fase A concluída — Red Phase)

- **Fase A:** bloqueada em `tests.lock.json` (`140` arquivos verificados via SHA-256):
  - `apps/mobile/jest.setup.js`: mocks dos módulos nativos `expo-camera` (`CameraView`, `useCameraPermissions`), `expo-image-picker` e `expo-text-extractor` (`extractTextFromImage`).
  - `apps/mobile/src/domain/receipt/__tests__/fixtures.ts`: 14 fixtures de cupons fiscais reais (supermercado, farmácia, posto, restaurante, cupom amassado com linhas quebradas, valores com ponto e vírgula, separador de milhar, ano curto, cabeçalho DANFE, CNPJ inválido e cupom ilegível) + 7 fixtures de QR da NFC-e (v2 online SP, v2 offline RJ com `vNF`, v1 MG, DV inválido, modelo 55, chave curta e URL comum).
  - `apps/mobile/src/domain/receipt/__tests__/receiptParser.test.ts` (24 casos): `parseReceiptText` (priorização de total, descarte de troco/desconto/tributos, CNPJ validado por dígito verificador, estabelecimento, forma de pagamento e níveis de confiança `alta`/`baixa`/`ausente`), `parseNfceQr` (chave 44 dígitos módulo 11, UF, AAMM, CNPJ, modelo `65`, `vNF`) e `suggestCategoryFromRules` (`fin_category_rules`).
  - `apps/mobile/src/screens/finance/__tests__/receiptFlow.test.tsx` (5 casos): menu do `+` no Resumo (`Lançar manualmente`, `Fotografar cupom`, `Ler QR da nota`), fluxo OCR com destaque de baixa confiança e campo não lido vazio (nunca zero), persistência com `source: 'OCR'` + `external_id` e bloqueio de NFC-e duplicada, leitura de QR via `CameraView`, e permissão de câmera negada com atalho para configurações e fallback manual.

## Sprint 62 — Importação de fatura/extrato e regras de categorização (Fase A concluída — Red Phase)

- **Fase A:** bloqueada em `tests.lock.json` (`138` arquivos verificados via SHA-256):
  - Fixtures anonimizadas em `apps/mobile/src/domain/statementImport/__tests__/fixtures/`: `nubank_card.ofx` (OFX SGML real), `nubank_card.csv` (CSV real), `nubank_checking.csv`, `inter.csv`, `c6.csv`, `itau.csv`, `checking_xml.ofx` e `generic_manual.csv`.
  - `apps/mobile/src/domain/statementImport/__tests__/Sprint62StatementImport.test.ts` (**S62-T01 a S62-T09**, 9 casos): `parseOfx` (SGML/XML, latin1/UTF-8), `parseCsv` (detecção de separador e perfis Nubank cartão/conta, Inter, C6, Itaú e mapeamento manual), `normalizeStatementRow` (sinais, parcelas `PARC 03/12`, `03/12`, `3 de 12` e `externalId` por FITID ou hash estável com ordem), `applyCategoryRules` (normalização sem acento e especificidade `exact > starts_with > contains`) e `reconcileImportedRows` (`new`, `duplicate`, `settle_pending` em até 5 dias sem casar o mesmo pendente duas vezes).
  - `apps/mobile/src/services/__tests__/Sprint62StatementImportService.test.ts` (**S62-T10 a S62-T15**, 6 casos): schema e migrações (`source`, `external_id`, `import_batch_id`, `fin_category_rules`, índice único por conta), importação em transação única com `bill_month` e parcelas, idempotência (reimportar não duplica), baixa de pendente, `undoImportBatch` reversível, CRUD/hits de regras e backup `.celsus.zip`.
  - `apps/mobile/src/screens/__tests__/Sprint62StatementImportScreen.test.tsx` (**S62-T16 a S62-T20**, 5 casos): entradas em `FinanceMoreScreen` e `CardBillScreen`, fluxo completo da `StatementImportSheet` (arquivo → conta → prévia → `"Sempre usar esta categoria para <trecho>"` → resultado com `"Desfazer importação"`) e `CategoryRulesScreen` (listar, editar e excluir).

## Sprint 64 — Fundação do Open Finance com Pluggy / Meu Pluggy (Fase A concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`135` arquivos verificados via SHA-256):
  - `apps/mobile/src/services/pluggy/__tests__/pluggyClient.test.ts` (**S64-T01 a S64-T08**, 8 casos): `POST /auth` com cache 2h em memória + `SecureStore`, renovação automática em `401` (`PluggyAuthError` se persistir), cursor `next` em `/v2/transactions` por 3 páginas, timeout via `AbortController` (`PluggyNetworkError`), retry exponencial em `429` (`PluggyRateLimitError`), consentimento expirado (`PluggyConsentExpiredError`), respostas vazias em todos os endpoints e `inspectItemCoverage` com contagem de contas, cartões, faturas, investimentos e tipos/subtipos B3.
  - `apps/mobile/src/services/pluggy/__tests__/pluggySecurityAndStorage.test.ts` (**S64-T09 a S64-T10**, 2 casos): isolamento estrito de segredos (`clientId`, `clientSecret`, `apiKey` apenas no `SecureStore`, nunca em erros nem no backup `.celsus.zip`) e persistência SQLite de `of_items` e `of_sync_runs` com limite de 5 itens do Meu Pluggy (`MeuPluggyItemLimitError`).
  - `apps/mobile/src/screens/__tests__/Sprint64OpenFinanceScreen.test.tsx` (**S64-T11 a S64-T16**, 6 casos): guia em 4 etapas com links, campos mascarados (`secureTextEntry`), lista de itens com vencimento em 30 dias e estado expirado, bloqueio do 6º item, relatório de cobertura ao testar conexão, remoção de credenciais com `ConfirmDialog`, entrada em `SettingsBackupScreen` e `resolveBackAction`.

## Sprint 61 — Cartão de crédito, fatura e transferências (Fase B concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`132` arquivos verificados via SHA-256):
  - `apps/mobile/src/domain/financeFlow/__tests__/Sprint61Cards.test.ts` (**S61-T01 a S61-T09**, 9 casos): `resolveBillMonth` (antes, no dia do fechamento, virada de ano, dia 31 em fevereiro comum/bissexto), `billDueDate` com clamp, `summarizeBill` (compras, estorno, pagamento parcial, quitação e status `aberta`/`fechada`/`paga`/`atrasada`), `availableLimit` (`null` quando ausente), `calculateMonthlySummary`/`calculateAccountBalance` (competência do cartão e isolamento de `transfer_out`/`transfer_in`), e `detectOverdueAndDueSoonWithBills`.
  - `apps/mobile/src/services/__tests__/Sprint61CardServiceAndMigration.test.ts` (**S61-T10 a S61-T14**, 5 casos): schema/migrações idempotentes/índices (`closing_day`, `due_day`, `credit_limit_cents`, `bill_month`, `transfer_group_id`), `createTransfer` e `deleteTransferGroup` atômicos, `payCardBill` (parcial/total e reversível), `createInstallmentPurchase` em cartão calculando `bill_month` por parcela, e backup `.celsus.zip` ida e volta.
  - `apps/mobile/src/screens/__tests__/Sprint61CreditCardAndTransfers.test.tsx` (**S61-T15 a S61-T18**, 4 casos): `AccountsScreen` (formulário e resumo do cartão), `CardBillScreen` (fatura, compras e pagamento parcial), `EntryFormSheet` (opção `"Transferência"` com origem/destino) e `FinanceHomeScreen` (navegação para `CardBillScreen`, `BackHandler` do Android e tiles de atenção com faturas).
- **Testes atualizados com autorização explícita do usuário:**
  - `Sprint60FinanceArtifactFidelity.test.tsx` (`S60-T06`, linha 708): atualizado `'Gasto no mês'` para `/Fatura atual/i` devido ao novo resumo da linha do cartão exigido pela Sprint 61.
  - `Sprint61CreditCardAndTransfers.test.tsx` (`S61-T18`, linha 213): corrigido `testID` da aba Contas para `'finance-dock-tab-accounts'` (mantendo o `testID` original de `FinanceDock.tsx`).
- **Fase B:** implementação concluída em `src/db/schema.ts`, `src/db/client.ts`, `src/services/backupService.ts`, `src/domain/financeFlow/cards.ts`, `src/domain/financeFlow/index.ts`, `src/repositories/finRepository.ts`, `src/services/finService.ts`, `src/screens/finance/CardBillScreen.tsx`, `src/screens/finance/AccountsScreen.tsx`, `src/screens/finance/EntryFormSheet.tsx`, `src/screens/finance/FinanceHomeScreen.tsx`, `src/screens/finance/index.ts`, `docs/REGRAS_DE_NEGOCIO.md` e `docs/ARQUITETURA.md`. **116/116 suítes (791/791 testes) passando** em 27,401 s; `tsc --noEmit` com 0 erros em produção e na Sprint 61; `node scripts/test-lock.js verify` aprovado.

## Sprint 60 — Fidelidade visual e funcional ao artifact (Fase B concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`129` arquivos verificados via SHA-256):
  - `apps/mobile/src/screens/__tests__/Sprint60FinanceArtifactFidelity.test.tsx` (**S60-T01 a S60-T08**, 13 casos): Resumo (dois tiles de atenção com `A vencer · 7 dias` gold `#D4A83B` + `Atrasadas` com ícone `warning`, 5 linhas em *Gasto por categoria* com `Outros` e `DotTrack`, tema claro `HomeLight`, modo privacidade, ausência dos 4 atalhos e presença da `FinanceDock`), Lançamentos (seções, chips e subtítulos exatos), Novo lançamento (tiles separados, chip `+ Nova` interativo criando e selecionando categoria, botão 56 px), Recorrências (normalização mensal semanal × 52/12 e anual ÷ 12, `Encerradas` 70% opacidade, `variable_amount = 1` com `-~R$`, `valor variável` em ouro e prompt de valor real na baixa), Assinaturas (herói verde-floresta, expansão sob toque, `Cobra em N dias • dd/mm`), Contas (herói laranja, contagem de lançamentos, `Cartões` com `Gasto no mês`, `Arquivadas` com `Restaurar`), Categorias (edição inline com 7 cores + migração segura das cores padrão antigas sem sobrescrever customizadas) e `DotTrack`.
- **Testes antigos atualizados com autorização explícita do usuário:**
  - `FinanceModuleScreens.test.tsx` (linhas 392–425), `Sprint55FinanceReskin.test.tsx` (top 4 categorias + expansão de assinatura ao tocar na linha), `Sprint58FinanceNavbar.test.tsx` (`S58-T02`: dois tiles separados + 4 maiores + `Outros`), `Sprint59FinanceIntegrity.test.tsx` (`waitFor` em `finance-upcoming-tile`).
- **Fase B:** implementação concluída em `src/components/ui/DotTrack.tsx`, `src/components/ui/FinListCard.tsx`, `src/db/schema.ts`, `src/db/client.ts` (`fin_recurrences.variable_amount`), `src/services/backupService.ts`, `src/repositories/finRepository.ts` (`DEFAULT_FIN_CATEGORIES` + `migrateDefaultCategoryColors`), `src/services/finService.ts` e `src/screens/finance/*` (zero hexes soltos, tudo via `finTheme.tsx` / `tokens.ts`). **113/113 suítes (773/773 testes) passando**; `tsc --noEmit` com 0 erros em produção e na Sprint 60; `node scripts/test-lock.js verify` aprovado.

## Sprint 59 — Integridade do módulo Finanças (Fase B concluída)

- **Fase A:** bloqueada em `tests.lock.json` (`128` arquivos verificados via SHA-256):
  - `apps/mobile/src/domain/financeFlow/__tests__/Sprint59Recurrence.test.ts` (**S59-T01 a S59-T03**): deduplicação por `recurrence_period` e `skippedPeriods`, `nextOccurrenceIso(recurrence, todayIso)` (mensal dia 31 em fevereiro, anual 29/02, semanal e pendência >= hoje) e `brToIso` no domínio.
  - `apps/mobile/src/screens/__tests__/Sprint59FinanceIntegrity.test.tsx` (**S59-T04 a S59-T17**): F1–F16 e F18.
- **Teste da sprint 56 alterado com autorização explícita do usuário:** `Sprint56FinanceFidelity.test.tsx` (`S56-T04`, `"excluir pela folha remove o lançamento avulso"`) atualizado para confirmar o `ConfirmDialog` (`"Excluir lançamento?"` → `"Excluir"`) introduzido pelo requisito F11.
- **Fase B:** correções F1–F16 e F18 implementadas em `src/db/schema.ts`, `src/db/client.ts` (`recurrence_period`, `fin_recurrence_skips`, `runInTransaction`), `src/services/backupService.ts`, `src/domain/financeFlow/index.ts`, `src/repositories/finRepository.ts`, `src/services/finService.ts`, `src/stores/finStore.ts` e `src/screens/finance/*`. **112/112 suítes (760/760 testes) passando**; `tsc --noEmit` com 0 erros em produção e na Sprint 59; `node scripts/test-lock.js verify` aprovado.

## Sprint 56 — Fidelidade visual do módulo Finanças (Fase B concluída)

- Novo arquivo `apps/mobile/src/screens/__tests__/Sprint56FinanceFidelity.test.tsx` (S56-T01 a S56-T07): mês atual ao abrir o módulo (`finStore.resetMonthToCurrent`), fonte Space Mono registrada no `expo-font`, trilho do mês e matriz de pontos de uma linha, linhas de lançamentos sem selos/botões e folha de ações, formulário (data dd/mm/aaaa, Vencimento e Conta na mesma linha, aviso sem contas, rodapé fixo), Categorias (tile de edição por tema, sem ícone de arquivar nas linhas, campo com linha laranja, botões 48 px) e cor creme da categoria Mercado.
- **Teste da sprint 54 alterado com autorização explícita do usuário:** `FinanceModuleScreens.test.tsx` — o fluxo "pagar" e "excluir parcela" passa a usar a folha de ações (`entry-actions-sheet`, `entry-action-pay-*`, `entry-action-delete-*`), os asserts dos selos Atrasada/A vencer foram removidos (cobertos pela nova suíte) e o formulário usa a data `13/11/2026` e o seletor de conta `entry-form-account-select`.
- **Fase B:** implementação concluída (mês atual ao abrir pelo globo, Space Mono via `@expo-google-fonts/space-mono`, resumo com trilho do mês e matriz de pontos de uma linha, lançamentos com folha de ações, formulário com data dd/mm/aaaa, Vencimento+Conta na mesma linha e rodapé fixo, categorias com tile de edição por tema e Mercado em creme). 722/722 testes passando.
- **Correção de teste autorizada pelo usuário:** em `Sprint56FinanceFidelity.test.tsx` (S56-T02) o `jest.spyOn(Font, 'loadAsync')` falhava ("Cannot redefine property"); trocado por `jest.mock('expo-font')`, sem mudar a asserção.

## Cobertura por área

- **Domínio financeiro** (`src/domain/finance/__tests__`): pesos em dois níveis e redistribuição com cadeado (valores quebrados, nunca negativos), preço médio, renda fixa (base 252), aporte em duas fases, meta de patrimônio, proventos, donut, perfil/ranking de ativos, redução de séries para o gráfico.
- **Repositórios, banco e serviços** (`src/**/__tests__`): CRUD das carteiras/ativos/transações, migrações, backup `.celsus.zip` (CSVs + manifest SHA-256), privacidade (`privacyAndAuthService`), segurança e autenticação com PIN/biometria (`authService`, `secureStorage`, `biometricProvider`), sessão de bloqueio (`sessionStore`), perfil do usuário (`profileRepository`, `profileStore`), `marketApi` (ponte nativa, HTTP, cache, fallback quando a ponte devolve "OFFLINE" ou ranking vazio), importação da planilha.
- **Componentes e telas**: header/dock/bento, cartão empilhado, ficha do ativo, busca e ranking, simulador, fluxo da Home (renderização, navegação, modo privacidade, tema claro).
- **Segurança e Tela de Bloqueio (Sprint 43)**: `PinDots` (6 pontos, preenchimento, animação de tremor no erro via driver nativo, `useReducedMotion`), `PinKeypad` (grade 3x4, teclas redondas 72 dp, JellyPressable, botão de digital condicional, suporte a acessibilidade), `LockScreen` (saudação com perfil, bloqueio após 5 erros com timer mm:ss, auto-prompt de biometria ao montar, esqueci PIN com recuperação biométrica ou wipe destrutivo exigindo digitação "APAGAR"), `AppGate` / `useAppLock` (decisão de status loading/onboarding/locked/unlocked, detecção de ciclo de vida com `AppState`, bloqueio automático ao retornar do segundo plano conforme tolerância, capa de privacidade ao suspender app com PIN configurado), `backNavigation` (ação `'minimize'` para `BackHandler.exitApp()` com prioridade máxima quando em estado bloqueado).
- **Onboarding e Perfil Dinâmico (Sprint 44 — Completo / Fase B)**: `OnboardingFlow` (máquina de passos Boas-vindas → Nome → PIN opcional → Digital → Pronto; validação 2–40 caracteres com trim e acentos; avatar dinâmico com iniciais; confirmação e aviso não bloqueante para PINs triviais; "Agora não" pulando PIN e digital; integração biométrica real; persistência estritamente atômica no fim; fluxo abreviado de migração D9 para bancos com carteiras existentes; substituição de "Pedro"/"PL" fixos em todas as telas por `useProfile()`; `AppGate` orquestrando onboarding de novo usuário e migração sem interferir nos mocks das suítes de teste de sprints anteriores).
- **Perfil e Segurança (Sprint 45 — Completo / Fase B)**: `SecurityTile` e `useProfileSettings` (gerenciamento real de PIN: criar, alterar com confirmação e remover; biometria com teste real; seletor de tolerância de autolock 0s, 30s, 60s, 300s; ação bloquear agora acionando `sessionStore.lock()`; campo de nome editável atualizando `profileStore` e iniciais; ação destrutiva de wipe dos dados exigindo digitação de "APAGAR"; compatibilidade preservada com configurações de perfil e testes de telas secundárias).
- **Núcleo de Importação B3 (Sprint 46 — Completo / Fase B)**: `readStatementFile` (leitura e decodificação XLSX com `fflate`, XML streaming tokenizado puro sem DOM/Node, CSV com delimitador autodetectado e BOM, tratamento de datas texto e número serial do Excel, erros tipados `EmptyFileError`, `UnrecognizedFormatError`, `MissingColumnError`, `UnsupportedStatementError`), parsing e normalização de linhas, classificação de movimentação segundo Apêndice A, normalização de tickers (direitos de subscrição e recibos), inferência de classe de ativos por catálogo e heurísticas, reconciliação de saldo anterior com janela móvel de 20 dias para proventos e proteção contra overdraft de vendas, e planejador de importação determinístico com `buildImportPlan` (cálculo Decimal com somas do Apêndice B, ordenação cronológica crescente e idempotência via hashes estáveis `b3:<hash>`).
- **Importação B3: Serviço e Telas (Sprint 47 — Completo / Fase B)**: Testes de especificação (IDs S47-T01 a S47-T10) cobrindo migração de `income_events` (`source`, `external_id`, `kind`, `quantity`, `unit_amount`), exportação/importação retrocompatível de backups `.celsus.zip`, `b3ImportService` (`preview`, `apply` com criação ordenada, saldo inicial inferido com histórico/manual, verificação matemática com `matches = true`, idempotência total e parcial, tolerância a falhas sem abortar o lote, `undoLastImport` reversível) e UI `B3ImportScreen` (seletor, prévia com tiles e seletores de classe/saldo, relatório e navegação com botão voltar).
- **Histórico de Proventos (Sprint 48 — Completo / Fase B)**: Testes de especificação (IDs S48-T01 a S48-T13) cobrindo domínio puro `incomeHistory` (cálculos exatos do Apêndice C com total R$ 404,78, média R$ 67,46 e melhor mês agosto R$ 83,48; séries mensais com meses vazios a R$ 0,00 e séries anuais; filtros combinados por carteira, período, classe, tipo e ticker; ranking com soma 100% via método do maior resto; trailing 12 meses e rendimento sobre o custo com tratamento nulo; benchmark de desempenho < 50ms para 600 proventos), repositório `incomeRepository` (`listFiltered`, `getById`, `updateIncome`, `deleteIncome`), UI `IncomeHistoryScreen` (tiles bento, gráfico de barras nativo mensal/anual com filtro interativo por toque, folha de detalhe com edição e exclusão confirmada por `ConfirmDialog`, empty state com importador B3, Modo Privacidade e integração com `StatisticsScreen`). Arquivos bloqueados e íntegros em `tests.lock.json`.
- **Importação B3 Multi-Arquivo e Separação por Corretora (Sprint 48 — Completo / Fase B)**: Testes de especificação (IDs S48-T01 a S48-T05 em `apps/mobile/src/services/__tests__/b3MultiBrokerImport.test.tsx`) cobrindo:
  - S48-T01: Atualização síncrona/otimista de iniciais no `profileStore.setName()` sem exibir fallback 'U'.
  - S48-T02: Normalização de nomes de instituições financeiras B3 e detecção de corretoras distintas (`normalizeInstitutionName`, `getDistinctBrokers`).
  - S48-T03: Mesclagem multi-arquivo e ordenação cronológica eliminando integralmente déficits artificiais (zero saldos fantasmas de MXRF11).
  - S48-T04: Validação de 637 cotas de MXRF11 e custo patrimonial consolidado exato de R$ 8.841,94 (eliminando a distorção anterior de R$ 13 mil).
  - S48-T05: Importação segregada em carteiras individuais por corretora (`splitByBroker: true`, gerando "BTG Pactual" e "XP Investimentos").
  - UI `B3ImportScreen` atualizada com suporte nativo a múltiplos arquivos (`DocumentPicker` com `multiple: true`), leitor de 4 camadas para compatibilidade no dispositivo móvel, seletor de modo de destino ("Separar por Corretora" vs "Importar em carteira única") e resumo detalhado.
- **Extrato Completo, Proventos na Home, Metas e Tema Claro (Sprint 49 — Completo / Fase B)**: Testes de especificação (IDs S49-T01 a S49-T05 em `apps/mobile/src/screens/__tests__/Sprint49ExtratoHomeProventosLightTheme.test.tsx`) cobrindo:
  - S49-T01: Exibição completa de todas as movimentações no `AllTransactionsScreen` sem corte/truncamento em 5 itens (`transactionRepository.getAllTransactions()`).
  - S49-T02: Renderização do `HomeIncomeTile` ao lado da meta de patrimônio com suporte a valor BRL formatado e mascaramento estrito no Modo Privacidade.
  - S49-T03: Interação de toque no `HomeIncomeTile` acionando a tela de histórico de proventos (`IncomeHistoryScreen`).
  - S49-T04: Fluxo de sugestão e CTA para definir metas e percentuais na conclusão da importação B3 (`onNavigateToPortfolio` com abertura direta do modal de metas).
  - S49-T05: `PatrimonyLineChartCard` com paleta de alto contraste no tema claro (barras com preenchimento 50%, bordas 2.5px e botões de período contrastados em preto/branco).
  - Ajuste de contraste das trilhas das barras no tema claro (`#EAE5D9`) em `IncomeHistoryScreen` e `PriceAreaChart`.
- **Onboarding Pierre Editorial e Transição Zero-Flash B3 (Sprint 50 — Completo / Fase B)**: Testes de especificação (IDs S50-T01 a S50-T03 em `apps/mobile/src/screens/__tests__/Sprint50PierreEditorialOnboarding.test.tsx`) cobrindo:
  - S50-T01: Transição direta sem flash da Home (montagem imediata no frame 0 quando `initialAction === 'import_b3'` com `isB3ImportOpen` inicializado sincronamente e animação direta sem slide sobre a home).
  - S50-T02: Consistência de design Pierre Editorial (Opção B) em todas as etapas do `OnboardingFlow`: botões e inputs em pílula (`borderRadius: 9999`), cartões Bento 20dp/24dp, contraste editorial preto `#111315` no fundo pergaminho claro `#FAF8F3`, avatar circular e tag de ação recomendada.
  - S50-T03: Design Pierre Editorial nas telas de seleção, prévia e relatório da `B3ImportScreen`: formatação BRL de alta legibilidade (`formatBRL`), chips elegantes para múltiplos arquivos XLSX, cartões Bento com destaque em tom creme quente (`#E6DECA`), selo de verificação financeira e pílula escura de ação primária para definir metas.
  - Resolução definitiva do avatar mostrando 'U': avatar sem iniciais exibe ícone limpo de silhueta (`person`), sincronismo imediato de nome e iniciais no onboarding sem delay.
- **Animações Fluidas no Onboarding e Detalhamento de Movimentações Sem Efeito (Sprint 51 — Completo / Fase B)**: Testes de especificação (IDs S51-T01 a S51-T02 em `apps/mobile/src/screens/__tests__/Sprint51OnboardingAnimationsAndIgnoredDetails.test.tsx`) cobrindo:
  - S51-T01: Transições animadas suaves entre as etapas do `OnboardingFlow` (fade e slide com wrapper `onboarding-animated-step` operando a 240ms com driver nativo).
  - S51-T02: Detalhamento interativo das movimentações ignoradas ("Sem efeito") na `B3ImportScreen` através do `b3-ignored-tile`, acionando modal explicativo `b3-ignored-modal` com esclarecimento pedagógico sobre movimentações escriturais (direitos de subscrição, atualizações cadastrais) e listagem scrollável dos lançamentos com ticker, data e tipo.
- **Início Limpo sem Dados Pré-Preenchidos ou Carteiras Base (Sprint 52 — Completo / Fase B)**: Testes de especificação (IDs S52-T1 a S52-T4 em `apps/mobile/src/screens/__tests__/Sprint52CleanAppZeroSeed.test.tsx`) cobrindo:
  - S52-T1: Inicialização do banco de dados 100% limpo com zero carteiras, zero ativos, zero transações e zero proventos.
  - S52-T2: Estado inicial vazio na tela Home sem criação automática da carteira AUVP ou qualquer outra carteira fictícia.
  - S52-T3: `resetDatabase()` limpando integralmente metadados sem manter chaves residuais de seed.
  - S52-T4: Ausência de qualquer movimentação residual nos lançamentos do extrato na inicialização limpa.
- **Modal B3 em Duas Alturas e Rolagem da Lista de Ativos (Sprint 53 — Completo / Fase B)**: Testes de especificação (IDs S53-T01 a S53-T10) cobrindo:
  - S53-T01: `AnimatedModalSheet` sem props novas mantém comportamento retrocompatível padrão.
  - S53-T02: `AnimatedModalSheet` modo snap calcula altura ~50% colapsado e ~100% expandido.
  - S53-T03: `AnimatedModalSheet` com `dismissible=false` bloqueia fechamento via backdrop e botão voltar.
  - S53-T04: `B3ImportSheet` abre no passo `pick` colapsado e expande para tela cheia ao selecionar arquivo XLSX.
  - S53-T05: `B3ImportSheet` renderiza resumo de compras/vendas/proventos/ignorados e aciona `b3-ignored-modal`.
  - S53-T06: `B3ImportSheet` confirmação avança para etapa `importing` (não dispensável) e exibe `b3-report` e metas CTA.
  - S53-T07: `B3ImportScreen` em modo `embedded` aciona callback `onStepChange` e preserva `xp-header-back`.
  - S53-T08: `PortfolioManagementScreen` lista de ativos rolável com `testID="portfolio-assets-list"`, `nestedScrollEnabled={true}` e `maxHeight`.
  - S53-T09: `PortfolioManagementScreen` monta todos os 30 ativos no contêiner com rolagem interna.
  - S53-T10: `PortfolioManagementScreen` com 0 ativos mantém `portfolio-assets-empty` e não renderiza a lista.
- **Módulo Finanças Pessoais (Sprint 54 — Fase B Completo em `feat/modulo-financas`)**: Implementação concluída em 4 sub-fases sob bloqueio estrito TDD Lock (**3/3 suítes PASS, 33/33 testes PASS**; suíte mobile completa **106/106 suítes, 691/691 testes PASS** em 14,17 s):
  - `apps/mobile/src/domain/financeFlow/__tests__/financeFlow.test.ts` (**15/15 PASS**, SHA-256 `eb1616dc6c5d6280120e1824dc027e0fb8a5eea326e5e1451daf7b2568086f0e`): formatação BRL/privacidade, `clampDayOfMonth` e anos bissextos, recorrências (mensal dia 31, anual 29/02, semanal, `end_date`, inativas, idempotência), divisão de parcelas sem perda de centavos (`first`/`last`, dia-âncora 31), saldo da conta e totais mensais, atrasados e a vencer em 7 dias, totais mensal e anual de assinaturas.
  - `apps/mobile/src/services/__tests__/finServiceAndMigration.test.ts` (**9/9 PASS**, 5,468 s, SHA-256 `e9914b359604dfe2e360d8ea996a45d78283c13605e17e6ffd3de0bb7cff70d1`): esquema SQL e índices `fin_*`, compatibilidade com seed zero (Sprint 52), semeadura idempotente de categorias padrão pt-BR, CRUD/arquivamento de contas e categorias, baixa de lançamento com data e valor reais, geração preguiçosa e idempotente de recorrências, pausar/retomar/cancelar assinatura preservando histórico pago, criação e edição/exclusão por escopo de parcelamentos (`only_this`, `this_and_next`, `all`), backup e restauração `.celsus.zip`.
  - `apps/mobile/src/screens/__tests__/FinanceModuleScreens.test.tsx` (**9/9 PASS**, 14,009 s, SHA-256 `ef2f5faef0a83500624c71df0735b344e5ec66ab1a369695d615548a532070d4`): globo abrindo o módulo Finanças com `XpMinimalHeader` (voltar + título `"Finanças"`) e `onMais` isolado mantendo o alerta de desenvolvimento, estados vazios e fluxos de `FinanceHomeScreen`, `EntriesListScreen`, `EntryFormSheet`, `SubscriptionsScreen`, `RecurrencesScreen`, `AccountsScreen` e `CategoriesScreen`, e ocultação de valores no Modo Privacidade.
  - Ajuste autorizado em `apps/mobile/src/screens/__tests__/Sprint17HeaderDonutAndRoutes.test.tsx` (**PASS**, SHA-256 `89d9d2bd6e3762e8a2902aa7ea8d399d2b11d3ec370ee21e39983eac66b36d0f`) refletindo a abertura do módulo Finanças no globo do header.
  - Fases implementadas: migração aditiva SQLite/in-memory em `db/client.ts` + backup CSV `.celsus.zip` retrocompatível, domínio puro `financeFlow`, repositório `finRepository`, store `finStore`, serviço `finService`, integração de rota/voltar Android em `App.tsx` e `backNavigation.ts`, e telas `FinanceHomeScreen` (donut por categoria, resumo mensal, alertas 7 dias/atrasadas, atalhos), `EntriesListScreen`, `EntryFormSheet`, `RecurrencesScreen`, `SubscriptionsScreen`, `AccountsScreen` e `CategoriesScreen`.
- **Reskin Visual Bento do Módulo Finanças (Sprint 55 — Fase A / Red Phase & Lock em `feat/modulo-financas`)**: 1 nova suíte com **14 testes** (IDs S55-T01 a S55-T08) especificada e bloqueada antes de alterar as 7 telas/folhas:
  - `apps/mobile/src/screens/__tests__/Sprint55FinanceReskin.test.tsx` (SHA-256 `336afc920a181992691660d95118a31bfdb1734cb5ef068650692d7fa68f5754`, 31.841 bytes): paleta aprovada e tokens dark/light (`finTheme.tsx`), mapeamento de ícones Material e cores por categoria padrão + contraste sobre `#2E4A44`, formatação BRL com sinal e privacidade (`formatSignedCentsBRL`), `FinListCard` / `FinListRow` (tile único `#1C1E20` / `#FFFFFF` com raio 28, filetes `#26292C` / `#F0EBE1` e sem filete na última linha), `XpMinimalHeader` com título/subtítulo/olho nas 6 telas e globo laranja ativo (`#D96628`) no Resumo, `FinanceHomeScreen` (seletor de mês, Bento tiles, matriz de pontos top 5 categorias, atalhos 2×2, FAB 56 px), `EntriesListScreen` & `EntryFormSheet` (`SegmentedControl`, seções `EM ATRASO` / `PRÓXIMOS DIAS` / `LIQUIDADOS`, `BentoSection`s e botão `Salvar lançamento`), `RecurrencesScreen` & `SubscriptionsScreen`, `AccountsScreen` & `CategoriesScreen` (edição inline `EDITAR · <nome>` e swatches 30 px), e estados vazio/carregamento/erro nos temas escuro e claro.
  - Execução Fase A (Red Phase): `npm --prefix apps/mobile test -- --watchAll=false src/screens/__tests__/Sprint55FinanceReskin.test.tsx` → `1 suite failed, 14 failed, 14 total` (5,912 s) contra os stubs e telas atuais; `FinanceModuleScreens.test.tsx` permaneceu **9/9 PASS** (2,521 s); `tsc --noEmit` sem erros nos arquivos novos; `node scripts/test-lock.js verify` aprovado com 123 arquivos.
- **Reskin Visual Bento do Módulo Finanças (Sprint 55 — Fase B / Green Phase em `feat/modulo-financas`, 14/11/2026)**:
  - Implementação concluída sob bloqueio de testes em `XpMinimalHeader.tsx`, `FinListCard.tsx`, `finTheme.tsx`, `FinanceHomeScreen.tsx`, `EntriesListScreen.tsx`, `EntryFormSheet.tsx`, `RecurrencesScreen.tsx`, `SubscriptionsScreen.tsx`, `AccountsScreen.tsx`, `CategoriesScreen.tsx` e `DESIGN_SYSTEM.md`.
  - **Jest completo (`npm --prefix apps/mobile test -- --watchAll=false`)**: **107/107 suítes PASS, 705/705 testes PASS** (18,045 s), incluindo todos os 14 testes de `Sprint55FinanceReskin.test.tsx` (S55-T01 a S55-T08, SHA-256 `336afc920a181992691660d95118a31bfdb1734cb5ef068650692d7fa68f5754`) e 9/9 de `FinanceModuleScreens.test.tsx`.
  - **`tsc --noEmit` (`apps/mobile`)**: 0 erros nos arquivos de produção e em `Sprint55FinanceReskin.test.tsx`.
  - **Integridade (`node scripts/test-lock.js verify`)**: `[TDD VERIFIED] Integridade de todos os 123 arquivos de teste confirmada via SHA-256.`
- **Go** (`services/market-api`): parser COTAHIST, cliente Yahoo (failover, eventos), BCB, API REST, ponte `mobilebridge`, perfil/ranking de fundamentos com **páginas reais do Fundamentus** como fixtures (`internal/fundamentals/testdata`).

## Última execução — revisão de desempenho e bugs (08/11/2026)

Mudanças só em código de produção (nenhum teste alterado; `verify` íntegro). Detalhes em
[`docs/MELHORIAS.md`](./docs/MELHORIAS.md) §0.

- Jest: 95/95 suítes, 628/628 testes. Go (`go test -short ./...`): todos os pacotes OK (44 testes, 2 "live" pulados).
- `tsc --noEmit`: 0 erros em arquivos de produção (os erros restantes são de tipo em arquivos de teste antigos).
- Verificação extra (temporária, não versionada) da nova curva patrimonial incremental: resultado idêntico à
  versão anterior em 40 cenários aleatórios (compras, vendas, taxas, RF CDI/PRE/IPCA, preço manual, datas fora de
  ordem e repetidas); 3 anos × 30 ativos × 600 movimentações: 1.216 ms → 69 ms.

## Testes "live" (manuais)

Consultam as fontes reais e ficam desligados por padrão:

```bash
cd services/market-api
CELSUS_LIVE=1 go test ./internal/fundamentals ./pkg/mobilebridge -run Live -v
```

O de `pkg/mobilebridge` exercita o mesmo caminho do Android (banco novo, ranking de FIIs, perfil da PETR4), sem JNI.

## O que a suíte não cobre

- Execução no aparelho/emulador Android (ponte nativa carregada de verdade, ordem de desenho de camadas, desempenho real).
- Disponibilidade das fontes externas (Fundamentus, Yahoo): se mudarem de formato, o app mostra cotação/catálogo com "—".

## Protocolo

Os testes são bloqueados (somente leitura + SHA-256 em `tests.lock.json`). Para alterar um teste: `node scripts/test-lock.js unlock`,
editar, `npm run test:lock` e `npm run test:verify`. Detalhes em `.agents/rules/tdd-lock.md` e `docs/ARQUITETURA.md`.


## Sprint 57 — Resumo Finanças: alinhamento e gasto por categoria navegável
- Fase A: `Sprint57FinanceHomePolish.test.tsx` (7 testes, travado).
- Fase B: linhas de categoria e "Ver tudo" abrem Lançamentos filtrados; "A vencer" e "Atrasadas" agora usam o mesmo contêiner (largura igual, cabeçalho de mesma altura); espaço inferior da rolagem 130.
- Resultado: 110 suites / 739 testes passando; `test-lock verify` OK (125 arquivos).


## Sprint 58 — Navbar de Finanças, Home enxuta e voltar correto
- Fase A: `Sprint58FinanceNavbar.test.tsx` (10 testes, travado).
- Fase B: `FinanceDock` (Resumo/Lançamentos/Contas/Mais), tela `FinanceMoreScreen` (Assinaturas, Recorrências, Categorias), voltar do Android sobe um nível dentro do módulo (só o Resumo sai para o App), Home sem atalhos 2x2, card único "Atenção" e top 3 categorias.
- Testes das sprints 54, 55 e 57 atualizados com autorização do usuário (atalhos → navbar, top 5 → top 3, tile A vencer).
- Resultado: 110 suites / 739 testes passando.


## Sprint 65 — Sincronizar finanças pessoais da Pluggy
- Fase A (Red Phase & Lock):
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint65OpenFinanceDomain.test.ts` (8 testes: `toCentsDecimal`, `mapPluggyAccount`, `mapPluggyTransaction`, `mapPluggyCategory`, reconciliação `external_id`, pendente manual/recorrência exato e ±15%, transferência e pagamento de fatura com casos positivos e negativos, `user_edited_fields`, janela de sync, auto-sync > 12h, divergência e formatações)
  - `apps/mobile/src/services/__tests__/Sprint65PluggySyncService.test.ts` (5 testes: schema/migrações, `syncFinance` + janela 12m/-7d + idempotência, promoção `PENDING` → `POSTED` + preservação `user_edited_fields` + estorno, rollback em erro parcial no meio da sincronização, `syncIfStale` 12h + conciliação de 1ª sync)
  - `apps/mobile/src/screens/__tests__/Sprint65OpenFinanceFinanceUI.test.tsx` (3 testes: selo "Open Finance" em contas e lançamentos, saldo informado + "saldo de dd/mm" + diferença do calculado, bloqueio de edição de saldo inicial, prompt de `closing_day` nulo, "Atualizado há N h" e aviso discreto de erro com "Tentar de novo")
  - Execução Fase A: 3 suites / 16 testes falhando (Red Phase), 144 arquivos bloqueados via `node scripts/test-lock.js lock`.


## Sprint 66 — Investimentos pela Pluggy (Open Finance) e item 1.1 (preço manual × posição)
- Fase A (Red Phase & Lock):
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint66InvestmentsDomain.test.ts` (12 testes: `S66-D01` a `S66-D12` — mapeamento de todos os tipos/subtipos Pluggy incluindo nova classe `FUNDS` "Fundos e Previdência" com cor da paleta, campos nulos como `"—"`, transações `BUY`/`SELL`/`INTEREST`/`AMORTIZATION`/`TAX`/`TRANSFER` com `fees` e `external_id`, custo com histórico completo `TRANSACTIONS` e incompleto `INSTITUTION`, casamento por ISIN / ticker normalizado / chave RF, cobertura por classe, ausência `dd/mm`, e cenários mistos em `consolidatedView` e `portfolioHistory` com item 1.1).
  - `apps/mobile/src/services/pluggy/__tests__/Sprint66InvestmentsSync.test.ts` (6 testes: `S66-S01` a `S66-S06` — migração do item 1.1 `manual_position_value` e `archived_at`, conciliação + precedência + arquivamento de movimentações manuais/B3, idempotência, investimento que some sem zerar posição × `TOTAL_WITHDRAWAL`, restauração ao desligar, e aviso de conflito na importação B3).
  - `apps/mobile/src/screens/__tests__/Sprint66InvestmentsUI.test.tsx` (1 teste: `S66-U01` — conciliação lado a lado, seleção de carteira por instituição e cobertura por classe).
  - Execução Fase A: 3 suítes / 19 testes falhando (Red Phase esperado), 152 arquivos bloqueados via `node scripts/test-lock.js lock`.
- Fase B (Green Phase & Report):
  - Item 1.1 (`manual_position_value` × `manual_price_override`) e migração SQLite idempotente em `src/db/schema.ts`, `src/db/client.ts`, `src/repositories/assetRepository.ts`, `src/repositories/transactionRepository.ts`, `src/services/backupService.ts`, `src/domain/finance/consolidatedView.ts`, `src/domain/finance/portfolioHistory.ts`, `src/domain/finance/fixedIncome.ts`, `src/services/marketSyncService.ts`, `App.tsx`, `src/screens/PortfolioManagementScreen.tsx` e `src/screens/StatisticsScreen.tsx`.
  - Nova classe `FUNDS` (*Fundos e Previdência*) com cor da paleta em `src/theme/palettes.ts`, `src/domain/finance/types.ts` e mapas de UI.
  - Domínio puro em `src/domain/openFinance/investments.ts`, orquestração em `src/services/pluggy/pluggyInvestmentsSyncService.ts` e conciliação em `src/components/OpenFinanceInvestmentReconciliationSheet.tsx`.
  - Resultado: **3/3 suítes da Sprint 66 (19/19 testes)** e **10/10 suítes com regressão (70/70 testes)** passando em 3,945 s; **0 erros de TypeScript** nos arquivos de produção da Sprint 66; `node scripts/test-lock.js verify` aprovado (**152 arquivos íntegros**).
- Fase B (Green Phase & Report):
  - Domínio puro em `apps/mobile/src/domain/openFinance/index.ts`: `toCentsDecimal` (`decimal.js`), `mapPluggyAccount` (`BANK` → `checking`, `CREDIT` → `card` com `creditData` e sem inventar `closing_day` nulo), `mapPluggyTransaction` (`POSTED`/`PENDING`, sinais de cartão, parcelas, `billId`, `descriptionRaw`), `mapPluggyCategory` (1º regras locais, 2º de-para Pluggy nível 1, 3º `Outros`), `reconcilePluggyTransactions` (reaproveitando `reconcileImportedRows`, match por `external_id`, pendente manual/recorrência até 5 dias e ±15% para `variable_amount = 1`, pares de transferência e pagamento de fatura até 2 dias), preservação de `user_edited_fields`, janela de sync (12 meses vs −7 dias), `shouldAutoSync` (>12 h) e formatações.
  - Schema e migrações (`apps/mobile/src/db/schema.ts`, `apps/mobile/src/db/client.ts`, `apps/mobile/src/repositories/finRepository.ts`): `of_account_id`, `source`, `reported_balance_cents`, `reported_balance_at` em `fin_accounts`; `description_raw`, `user_edited_fields` em `fin_entries`.
  - Serviço `apps/mobile/src/services/pluggy/pluggySyncService.ts`: `syncFinance(itemId)` transacional por item com registro em `of_sync_runs`, rollback completo em erro parcial, `previewAccountReconciliation`, `applyAccountLinks`, `syncIfStale`.
  - Telas: selo `"Open Finance"` em `AccountsScreen.tsx` e `EntriesListScreen.tsx`; saldo informado com `"saldo de dd/mm"` e divergência do calculado + bloqueio de saldo inicial + aviso para informar `closing_day` nulo em `AccountsScreen.tsx`; preservação de `user_edited_fields` em `EntryFormSheet.tsx`; `"Atualizado há N h"`, pull-to-refresh, auto-sync não-bloqueante (>12 h) e banner discreto com `"Tentar de novo"` em `FinanceHomeScreen.tsx`; conciliação inicial e disparo de sync em `OpenFinanceScreen.tsx`.
  - Resultado Sprint 65: 3 suites / 16 testes passando (100%). Suíte geral: 134 suites / 924 testes passando (4 suites pré-existentes de Fase A de sprints 63/68 e arquivos de fixtures); `node scripts/test-lock.js verify` OK (144 arquivos).


## Sprint 80 — Espaçamentos de Finanças pelos tokens de Investimentos
- Fase A (Red Phase & Lock), sem parada entre fases (decisão do usuário em 16/11/2026):
  - `apps/mobile/src/__tests__/Sprint80SpacingTokens.test.ts` — `S80-T01` escala e tokens existentes intactos; `S80-T02` tokens novos `layout.safeBottomMin`, `layout.dockClearance`, `layout.fabClearance`, `layout.chipGap`; `S80-T03`/`S80-T04` helper `dockContentPaddingBottom` (com e sem botão flutuante); `S80-T05` (19 arquivos-alvo) nenhum padding/margin/gap com número solto, salvo 0 e linhas com `// fora da escala: <motivo>`; `S80-T06` exceções com motivo e no máximo 12; `S80-T07` fim dos paddings inferiores fixos 130/170; `S80-T08` Home de Investimentos usa o mesmo helper.
  - `apps/mobile/src/screens/__tests__/Sprint80FinanceLayoutParity.test.tsx` — `S80-T09` `sharedStyles.scrollContent`; `S80-T10` Resumo; `S80-T11` Lançamentos; `S80-T12` Contas; `S80-T13` Mais (margem lateral, respiro sob o header, gap de tiles e padding inferior iguais aos tokens); `S80-T14` testIDs preservados.
  - Execução Fase A: 2 suítes / 28 testes falhando e 4 passando (Red Phase esperado; stub `src/theme/layoutMetrics.ts`).
- Fase B (Green Phase & Report):
  - Troca mecânica de ~290 declarações de espaçamento por tokens em 19 arquivos; tokens novos em `src/theme/tokens.ts`; helper `src/theme/layoutMetrics.ts`; testIDs novos `entries-scroll`, `accounts-scroll`, `finance-more-scroll` (nenhum removido).
  - Testes antigos alterados COM autorização do usuário (16/11/2026): `Sprint57FinanceHomePolish.test.tsx` (S57-T03, linha 145) e `Sprint60FinanceArtifactFidelity.test.tsx` (S60-T01, linha 173): `paddingBottom >= 120` → `>= 112`, porque o Resumo passa a usar o mesmo cálculo da Home de Investimentos (16 + 96).
  - Resultado: Sprint 80 — 2 suítes / 32 testes PASS. Suíte geral: 160 suítes / 1070 testes PASS; 7 testes falhando em 4 suítes que JÁ falhavam antes da sprint (`receiptFlow.test.tsx`, `Sprint17HeaderDonutAndRoutes`, `Sprint34XpHeaderStandardAndE2E`, `Sprint39GeneralBugsAndHardening`), mais 2 arquivos de fixtures sem testes. `tsc --noEmit`: nenhum erro novo (2 erros de produção pré-existentes). `node scripts/test-lock.js verify` OK (180 arquivos).
  - Não validado: conferência visual no navegador/aparelho (360 px, tablet, dois temas).


## Sprint 81 — Alinhamento visual de Finanças ao design de Investimentos
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/__tests__/Sprint81TypographyTokens.test.ts` — `S81-T01` variantes intactas; `S81-T02` tamanhos novos `typography.sizes.lead/display/hero`; `S81-T03` inventário da pasta; `S81-T04`/`T05`/`T06` nenhum `fontSize`, `fontWeight`, `lineHeight` literal em `src/screens/finance` (exceção: `// fora da escala:`); `S81-T07` nenhuma máscara de privacidade própria; `S81-T08` sem `Modal` próprio nem `Alert.alert`; `S81-T09` `finTheme.tsx` só com o que é de Finanças; `S81-T10` `DESIGN_SYSTEM.md` atualizado.
  - `apps/mobile/src/components/ui/__tests__/Sprint81FinHeroTile.test.tsx` — `S81-T11` a `S81-T17` `FinHeroTile` (anatomia, tokens, variantes, tema, privacidade, ação, valor secundário); `S81-T18` `SectionHeader`; `S81-T19` `EmptyState`; `S81-T20` `ErrorState` e `LoadingState`.
  - `apps/mobile/src/screens/__tests__/Sprint81FinanceVisualParity.test.tsx` — `S81-T21` heróis de Contas, Assinaturas e Patrimônio usam `FinHeroTile`; `S81-T22` estados vêm de `src/components/ui`; `S81-T23` a `S81-T27` regressão dos números exibidos (Contas R$ 1.484,56, Patrimônio R$ 1.484,56, Assinaturas R$ 0,00/R$ 0,00) e privacidade, para um banco de exemplo.
  - Execução Fase A: 3 suítes / 53 testes falhando e 30 passando (Red Phase esperado; stubs em `src/components/ui`).
- Fase B (Green Phase & Report) — ENTREGA PARCIAL do checklist (item 15 do prompt):
  - Feito: item 1 (tipografia: ~200 declarações de `fontSize`/`fontWeight`/`lineHeight` de `src/screens/finance` passaram para `typography.*`, sem mudar valores; tokens novos `typography.sizes.lead/display/hero`); item 3 (`FinHeroTile` em Contas, Assinaturas e Patrimônio); item 5 (`SectionHeader` criado em `src/components/ui`); item 7 (folha do gráfico de previsão do Resumo virou `AnimatedModalSheet`; não havia `Alert.alert`); item 8 (`LoadingState`, `ErrorState`, `EmptyState` em `src/components/ui/ScreenStates.tsx`); item 11 (máscara única `PRIVACY_CURRENCY_MASK`); item 12 (`finTheme.tsx` sem os estados e sem `sectionLabel`); item 13 (`DESIGN_SYSTEM.md`).
  - Já estava conforme: item 9 no que toca a durações e molas (nenhuma literal em Finanças).
  - PENDENTE: heróis do Resumo (Saldo do mês — a sprint 77 está trocando esse tile pelo carrossel) e da fatura (`CardBillScreen` não tem um valor herói hoje); item 2 (auditoria de contêineres feitos à mão); item 4 (auditoria de linhas fora de `FinListRow`); item 5 (adotar `SectionHeader` nas seções existentes); item 6 (controles); item 9 (~70 `Pressable`/`TouchableOpacity` ainda não são `JellyPressable`); item 10 (ícones em 12/14/18/22/28 → 16/20/24).
  - Teste antigo alterado: `Sprint55FinanceReskin.test.tsx` (S55-T08) — SÓ o import: `FinLoadingView`/`FinErrorView`/`FinEmptyState` passam a vir de `components/ui/ScreenStates` (com alias); nenhuma asserção mudou. Feito sob a instrução do usuário "não me pergunte mais nada, só execute" (16/11/2026).
  - Resultado: Sprint 81 — 3 suítes / 83 testes PASS. Suíte geral: 163 suítes / 1154 testes PASS; as falhas restantes (4 suítes: `receiptFlow`, `Sprint17`, `Sprint34`, `Sprint39`; mais 2 arquivos de fixtures sem testes) já existiam antes da sprint 80. `Sprint69OpenFinanceInvestmentsUI` falhou em uma execução e passou nas seguintes (instável). `tsc --noEmit`: nenhum erro novo. `test-lock verify` OK (183 arquivos).
  - Não validado: conferência visual no navegador/aparelho e capturas de tela lado a lado.


## Integração das sprints 77–79 com as sprints 80–81 (17/11/2026)
- Merge de `20ffd1a` (sprints 77–79) em `feat/sprint-81-alinhamento-visual` na branch `feat/sprints-77-81-integracao`. Conflitos em 9 telas e em `tests.lock.json`: ficou o lado das sprints 77–79 (cores por tema) e os tokens de espaçamento e tipografia das sprints 80–81 foram reaplicados por cima.
- Correções feitas na integração: botão "Retomar" de Assinaturas tinha ficado sem cor de fundo na sprint 79 (S55-T06) — voltou a usar a cor primária do tema; folha do gráfico de previsão do Resumo segue como `AnimatedModalSheet` com as cores de gráfico do tema.
- Teste antigo alterado: `Sprint55FinanceReskin.test.tsx` (S55-T01, linha 102): `light.warning` `'#D4A83B'` → `'#8C6200'`, porque a sprint 79 escureceu o alerta no tema claro para cumprir o contraste 4,5:1 exigido por S79-T02 (os dois testes travados se contradiziam). Decisão tomada sob a instrução do usuário de corrigir sem perguntar.
- Resultado: 170 suítes / 1174 testes PASS. Falham só os casos que já falhavam antes da sprint 80 (`receiptFlow`, `Sprint17`, `Sprint34`, `Sprint39`; `receiptFlow` tem um terceiro caso instável sob carga) e 2 arquivos de fixtures sem testes. `tsc --noEmit`: 2 erros de produção pré-existentes, nenhum novo. `test-lock verify` OK (190 arquivos).


## Ajustes gerais antes do APK (17/11/2026)
- Correções de código: botão de trocar de módulo nas 5 telas internas de Investimentos que não o tinham (`IncomeHistoryScreen`, `TransactionDetailHistoryScreen`, `AllTransactionsScreen`, `ClassDetailScreen`, `AssetDetailScreen`; a camada fecha e o módulo troca); variante `obsidian` do bento (classe Fundos e Previdência apontava para uma variante inexistente); `ClassDetailScreen` aceita `onBack`; `getClassColor` com cor padrão. `tsc --noEmit`: zero erros em produção.
- Sprint 81 (continuação): `FinListCard` usa `SectionHeader` no cabeçalho; ícones de Finanças em 16/20/24 (21 trocas).
- `package.json`: `testMatch` do jest só aceita `*.test.*`/`*.spec.*` (os arquivos de fixtures deixavam de contar como suíte falha).
- Testes antigos atualizados por estarem desatualizados em relação a sprints já aprovadas (sob a instrução do usuário de corrigir sem perguntar): `Sprint17HeaderDonutAndRoutes` (volta do Resumo pelo botão de módulo, sprint 76), `Sprint34XpHeaderStandardAndE2E` (passa `onSwitchModule`, sprint 76), `Sprint39GeneralBugsAndHardening` (3× `getByText` → `getAllByText`, o valor aparece em dois tiles), `receiptFlow.test.tsx` (rótulos do menu "+" das sprints 75/76; cria a própria conta).
- Resultado: 173 suítes / 1180 testes PASS; 1 teste instável sob carga (`receiptFlow` — OCR da galeria) que passa isolado (5/5). `test-lock verify` OK (190 arquivos).
- Ainda pendente da sprint 81: ~70 `Pressable`/`TouchableOpacity` fora do `JellyPressable`, heróis da fatura e do Resumo, auditoria de contêineres e controles. Sprint 73 segue fora desta linha (WIP em stash).


## Sprint 91 — Classificação dos lançamentos Open Finance (investimento, conta própria, recarga, categoryId)
- Baseline antes da sprint (branch `feat/sprint-90-pluggy-income-names`): 190 suítes / 1250 testes PASS; `tsc --noEmit` 148 erros (todos pré-existentes, em arquivos de teste); `test-lock verify` OK (206 arquivos).
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint91Classification.test.ts` — `S91-T01` aplicação automática ⇒ transfer_out INVESTMENT_MOVE, fora das despesas, saldo −227,17; `S91-T02`/`T02b` 0306 continua receita e RESGATE APLICAÇÃO vira transfer_in; `S91-T03` LIQ BOLSA e TX EMOL B3; `S91-T04` PENDING de 22/12/2025 fora de "a pagar" e da previsão; `S91-T06`/`T06b`/`T06c` desempate do pareamento (04, menor diferença, exclusões); `S91-T07` 04 sem par ⇒ OWN_ACCOUNT_UNPAIRED; `S91-T08` provento com 04 continua income; `S91-T10`/`T10b` categorias pelo prefixo do categoryId.
  - `apps/mobile/src/services/pluggy/__tests__/Sprint91Classification.test.ts` — `S91-T05` pareamento entre conexões; `S91-T07 (sync)` + diagnóstico por reason; `S91-T04 (diagnóstico)` stalePendingCount; `S91-T09` recarga pelo cartão `of-topup-`; `S91-T11` reclassificação única e idempotente; `S91-T12` backup/restore.
  - Stubs de compilação: `domain/openFinance/classification.ts`, `services/pluggy/pluggyClassificationService.ts`; colunas `fin_entries.of_category_id` e `of_class_reason` (schema, DDL, ALTER idempotente, backup, repositório).
  - Execução Fase A: 2 suítes / 16 testes falhando e 2 passando (Red Phase esperado, pelos motivos certos). `test-lock verify` OK (208 arquivos).
- Fase B (Green Phase & Report):
  - Implementação: `classification.ts` e `stalePending.ts` (domínio), `pluggyClassificationService.ts`, mapper e sync (`index.ts`, `pluggySyncService.ts`), seed + migração das 4 categorias (`finRepository.ts`), previsão/resumo/"a pagar" ignoram PENDING antigo (`financeFlow`), `FinanceHomeScreen` passa a data de hoje, diagnóstico (`transfersByReason`, `stalePendingCount`).
  - Resultado: Sprint 91 — 2 suítes / 18 testes PASS. Suíte geral: 192 suítes / 1268 testes PASS (antes: 190 / 1250). `tsc --noEmit`: 149 erros (antes 148; o a mais é `Sprint74CardEntryRule.test.ts`, fixture tipada de `FinEntry` sem as 2 colunas novas — teste travado, não editado; zero erros em produção). `test-lock verify` OK (208 arquivos).
  - Não validado: sync real (exige aparelho e credenciais) e conferência visual das telas.


## Sprint 92 — Correções da revisão das sprints 90 e 91
- Baseline antes da sprint (branch `feat/sprint-91-of-entry-classification`): 192 suítes / 1268 testes PASS; `tsc --noEmit` 149 erros (todos em arquivos de teste); `test-lock verify` OK (208 arquivos).
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint92ReviewFixes.test.ts` — `S92-T01` raiz do ticker não usa a descrição inteira (CSAN3/RECR11 falsos); `S92-T02` raiz continua valendo depois de "s/ FII" e ticker explícito vence; `S92-T03`/`T04` pareamento entre contas só com 04, 05 ou sem categoria; `S92-T05` mesmo critério no pareamento dentro da conexão, mantendo o pagamento de fatura; `S92-T06` mascaramento de contraparte em Pix/TED/transferência de qualquer categoria e CNPJ parcial.
  - `apps/mobile/src/services/pluggy/__tests__/Sprint92ReviewFixes.test.ts` — `S92-T07` busca única do histórico completo em conexão anterior à 92, reclassificando 04 e categoryId; `S92-T08` pareamento de Pix 05 com mais de 40 dias depois do histórico completo; `S92-T09` motivo OWN_ACCOUNT_PAIRED preservado nas sincronizações seguintes.
  - Execução Fase A: 2 suítes / 7 testes falhando e 2 passando (Red Phase esperado; S92-T02 e S92-T04 documentam comportamento que precisa continuar valendo).
- Fase B (Green Phase & Report):
  - Implementação: `income.ts` (nome e raiz do ticker só no trecho depois de "s/"/"FII"), `classification.ts` (`isTransferCompatibleCategoryId`, `windowStart` em `findOwnTransferPairs`), `index.ts` (mesmo filtro no pareamento dentro da conexão), `diagnostics.ts` (contraparte mascarada por padrão de descrição, CNPJ parcial), `pluggyClassificationService.ts` (desfaz pares `of-tr-` incompatíveis gravados pela 91, janela configurável), `pluggySyncService.ts` (busca única do histórico completo por conexão em `fin:of:backfill:s92:<itemId>`, pareamento com a janela do histórico nessa sync, motivo OWN_ACCOUNT_PAIRED preservado).
  - Resultado: Sprint 92 — 2 suítes / 9 testes PASS. Suíte geral: 194 suítes / 1277 testes PASS (antes: 192 / 1268). `tsc --noEmit`: 149 erros, os mesmos do baseline, zero em produção. `test-lock verify` OK (210 arquivos).
  - Sem teste travado: o desfazimento de pares incompatíveis já gravados foi conferido com um teste temporário (par restaurante × salário volta a despesa e receita, sem grupo), apagado em seguida.
  - Não validado: sync real (exige aparelho e credenciais).


## Sprint 93 — Backup .celsus.zip gravado, compartilhado e importado de arquivo
- Origem: a exportação completa só montava o pacote em memória (`useProfileSettings.exportDossier`); nada era gravado nem compartilhado, e "Importar" reimportava esse mesmo pacote.
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/services/__tests__/Sprint93BackupShare.test.ts` — `S93-T01` grava no cache com o nome do pacote e compartilha como `application/zip`; `S93-T01b` sobrescreve pacote de mesmo nome; `S93-T02` sem compartilhamento ⇒ arquivo mantido e `shared=false`; `S93-T03` seletor devolve os bytes do arquivo escolhido; `S93-T03b` cancelado ⇒ null; `S93-T03c` arquivo que não é .zip é recusado.
  - `apps/mobile/src/screens/__tests__/Sprint93BackupShareProfile.test.tsx` — `S93-T04` exportar chama o compartilhamento; `S93-T05` sem compartilhamento o aviso mostra onde o arquivo ficou; `S93-T06` erro ao gravar ⇒ "ERRO AO EXPORTAR BACKUP"; `S93-T07` importar usa o arquivo escolhido e o modo selecionado, nunca o pacote em memória; `S93-T08` seletor cancelado não importa nem mostra erro; `S93-T09` arquivo recusado ⇒ aviso de erro.
  - Stub de compilação: `services/backupFileService.ts`. Dependência nova: `expo-sharing` (~58.0.23, config plugin em `app.json`; exige novo build nativo).
  - Execução Fase A: 2 suítes / 12 testes falhando (Red Phase esperado).
- Fase B (Green Phase & Report):
  - Implementação: `services/backupFileService.ts` (grava o pacote em `Paths.cache` com `File.write`, abre `Sharing.shareAsync` como `application/zip`; sem compartilhamento devolve a URI; `pickArchive` usa `expo-document-picker` e lê os bytes com `File.bytes()`), `screens/profile/useProfileSettings.ts` (exportar compartilha e o aviso diz o destino; importar lê o arquivo escolhido, cancelado não faz nada).
  - Resultado: Sprint 93 — 2 suítes / 12 testes PASS. Suíte geral: 196 suítes / 1289 testes PASS. `tsc --noEmit`: 149 erros, os mesmos do baseline, zero em produção. `expo lint` nos arquivos alterados: 1 erro pré-existente (`set-state-in-effect` em `loadWallets`, linha não alterada). `test-lock verify` OK (212 arquivos).
  - Não validado: compartilhamento e seletor no aparelho — `expo-sharing` é módulo nativo e exige novo build (`npx expo run:android` ou EAS).

## Sprint 94 — Importação da B3 e de extrato lendo o arquivo pela API nova do expo-file-system
- Origem: `B3ImportScreen.tsx` e `StatementImportSheet.tsx` chamavam `FileSystem.readAsStringAsync` / `FileSystem.EncodingType` do import principal de `expo-file-system`; no SDK 58 esses métodos são stubs que lançam erro em runtime (`build/legacyWarnings.d.ts`), então importar planilha da B3 e extrato pelo seletor falhava no aparelho.
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/services/__tests__/Sprint94PickedFileReader.test.ts` — `S94-T01` devolve os bytes de uma URI `file://` via `File.bytes()`; `S94-T02` aceita URI `content://`; `S94-T03` propaga o erro de leitura e nunca recorre à API legada.
  - `apps/mobile/src/screens/__tests__/Sprint94FileSystemNewApi.test.tsx` — `S94-T04` `StatementImportSheet` lê o CSV escolhido com `File` e mostra a prévia (2 novos); `S94-T05` arquivo ilegível ⇒ erro na tela, sem prévia; `S94-T06` `B3ImportScreen` lê a planilha escolhida (fora das fixtures, `fetch` indisponível) com `File` e mostra a prévia; `S94-T07` nenhuma leitura funciona ⇒ "Não foi possível ler o arquivo"; `S94-T08` as duas telas não referenciam mais `readAsStringAsync`, `EncodingType` nem `expo-file-system/legacy`. Todos verificam que a API legada nunca é chamada.
  - Stub de compilação: `services/pickedFileReader.ts` (`readPickedFileBytes`).
  - Execução Fase A: 2 suítes / 8 testes falhando (Red Phase esperado).
- Fase B (Green Phase & Report):
  - Implementação: `services/pickedFileReader.ts` (`readPickedFileBytes(uri)` = `new File(uri).bytes()`); `screens/B3ImportScreen.tsx` (as estratégias 3/4 via `readAsStringAsync` base64/UTF-8 viraram uma leitura por `readPickedFileBytes`, mantidas as estratégias `file.arrayBuffer()` e `fetch`); `components/StatementImportSheet.tsx` (lê com `readPickedFileBytes`; removido `decodeBase64ToBytes`, sem uso); `jest.setup.js` (mock global de `expo-file-system` ganhou `File`/`Paths`).
  - Desbloqueio autorizado pelo usuário: `apps/mobile/src/screens/__tests__/Sprint62StatementImportScreen.test.tsx`. O mock local só tinha `readAsStringAsync`; ganhou uma classe `File` cujo `bytes()` devolve o CSV, no lugar dos dois `readAsStringAsync.mockResolvedValue(base64)`. Nenhuma asserção mudou. Arquivo re-travado (`test-lock lock`, 214 arquivos).
  - Resultado: Sprint 94 — 2 suítes / 8 testes PASS; Sprint 62 (tela) — 5/5 PASS. Suíte geral: 197 suítes PASS, 1 FAIL; 1296/1297 testes PASS. A falha é `screens/finance/__tests__/receiptFlow.test.tsx` (Sprint 63, OCR → `entry-form-amount`): pré-existente, reproduzida também no commit base `a708ab3` (Sprint 93, suíte completa), passa 3/3 isolada e não toca leitura de arquivo. `tsc --noEmit`: 154 erros; zero em produção, 7 no teste novo `Sprint94FileSystemNewApi.test.tsx` (tipos de Node `fs`/`path`/`__dirname`/`global.fetch`, mesma classe dos erros de baseline em testes). `expo lint` nos arquivos alterados: 1 erro pré-existente (`set-state-in-effect` em `StatementImportSheet.tsx`, linha não alterada). `test-lock verify` OK (214 arquivos).
  - Não validado: leitura no aparelho (planilha B3 e extrato via `content://`/`file://`).


## Sprint 95 — Taxas da nota de corretagem e proventos já gravados na conta
- Origem: backup `.celsus.zip` de 17/11/2026. (1) As 15 compras de 26/10 e as 6 de 06/11 da corretora `d2f7` receberam como "taxa" o total da nota (R$ 2.828,74 e R$ 623,43 = bruto + 2 × taxas da B3): a corretora manda o total da nota em `expenses` e repete as taxas da nota em cada operação. Investido R$ 49.896 × mercado R$ 3.633 (−92,7%); sem as taxas infladas, −2,5%. (2) Os 8 créditos "RENDIMENTOS DE CLIENTES MXRF11…" de dez/2025 a ago/2026 foram gravados 1 s antes de os ativos existirem (sync da conta antes do de investimentos) e nunca mais foram reavaliados, porque as sincronizações seguintes só buscam 40 dias.
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint95NoteFees.test.ts` — `S95-T01` despesa ≥ valor da operação é o total da nota e fica fora da taxa (com aviso); `S95-T01b` mapeamento expõe `brokerageNumber` e `grossAmount`; `S95-T02` `other` pequeno continua taxa; `S95-T03` mesma taxa nas operações da mesma nota é rateada pelo valor (0,84 → 0,08/0,17/0,59); `S95-T03b` venda rateada, total líquido = bruto − parte; `S95-T04` não rateia taxas diferentes, operação única ou notas diferentes; `S95-T05` sem número de nota agrupa pelo pregão; `S95-T05b` INTEREST fora do rateio.
  - `apps/mobile/src/services/pluggy/__tests__/Sprint95NoteFeesAndIncomeRelink.test.ts` — `S95-T06` preço médio de PETR4/HGLG11 com a parte rateada das taxas; `S95-T07` re-sync idempotente; `S95-T08` créditos "RENDIMENTOS…" já gravados sem provento viram provento do ativo (recibo MXRF13 → MXRF11, quantidade "S/ n"), lançamento ligado e reclassificado `INCOME_LINKED`, removidos e Pix ignorados; `S95-T09` reprocessar não duplica; `S95-T10` provento equivalente já lançado é reaproveitado.
  - Stub de compilação: `prorateSharedNoteFees` em `domain/openFinance/investments.ts`.
  - Execução Fase A: 2 suítes / 9 testes falhando e 4 passando (S95-T02, T04, T05b e T07 documentam comportamento que precisa continuar valendo). S95-T06 reproduz o bug: preço médio do PETR4 = 323,06.
- Fase B (Green Phase & Report):
  - Implementação: `domain/openFinance/investments.ts` (despesa ≥ valor da operação fica fora da taxa com aviso; `brokerageNumber` e `grossAmount` no mapeamento; `prorateSharedNoteFees` rateia pelo valor bruto a taxa idêntica repetida nas compras/vendas da mesma nota — ou do mesmo pregão sem número de nota —, com o resíduo de centavos na maior operação), `services/pluggy/pluggyInvestmentsSyncService.ts` (rateio entre todos os investimentos do item antes do custo médio; reprocessamento de proventos ao fim do sync, `counts.incomesRelinked`), `services/pluggy/pluggyIncomeRelinkService.ts` (lançamentos OPEN_FINANCE `income`/`transfer_in` sem provento, sem par e não removidos passam pela detecção de provento; provento na carteira do ativo, reaproveitando equivalente; lançamento ligado e reclassificado `INCOME_LINKED`).
  - Transações já gravadas com a taxa inflada são corrigidas na próxima sincronização (atualização por `external_id`), e o preço médio é recalculado.
  - Resultado: Sprint 95 — 2 suítes / 13 testes PASS. Suíte geral: 200 suítes / 1310 testes, 1309 PASS; falha só `receiptFlow` (instável sob carga, passa isolado 5/5). `tsc --noEmit`: zero erros em produção; os 5 erros a mais em relação à Sprint 93 estão em `Sprint94FileSystemNewApi.test.tsx` (tipos de Node), não nesta sprint. `expo lint` nos arquivos alterados: 0 erros. `test-lock verify` OK (216 arquivos).
  - Não validado: sync real no aparelho.


## Sprint 96 — Nome real da instituição (Meu Pluggy), recibos de subscrição e ações da linha de conta
- Origem: backup de 17/11/2026 19:50 (depois da Sprint 95: rentabilidade −2,49% e 14 proventos, confirmando a 95). Restam: contas "MeuPluggy · Conta corrente ·· 3671" e carteiras "Corretora 6ef1"/"Corretora d2f7" (o conector é sempre "MeuPluggy"; o COMPE do banco está em `bankData.transferNumber` e não era usado); MXRF12/MXRF13 vêm com subtype STOCK e aparecem como ação; na tela de Contas, a fileira de pílulas (Open Finance, Dif. calculado, Informar fechamento, Arquivar) não quebra linha e vaza do cartão.
- Fase A (Red Phase & Lock), sem parada entre fases:
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint96InstitutionNames.test.ts` — `S96-T01` COMPE do transferNumber → instituição (348/102 XP, 260 Nubank, 208 BTG Pactual, 033 Santander, 341 Itaú); `S96-T02` conta Meu Pluggy usa o banco do próprio transferNumber; `S96-T03` cartão usa a instituição da conexão e não repete banco já citado; `S96-T04` "MeuPluggy" nunca entra no nome; `S96-T05` ordem: conector real → investimentos (COMPE, depois nome) → contas; `S96-T06` carteira da conexão com o nome da corretora; `S96-T07` final 12–15 é FII (direito/recibo de subscrição), units e ações continuam ação; `S96-T08` nome "Recibo/Direito de subscrição MXRF11".
  - `apps/mobile/src/services/pluggy/__tests__/Sprint96InstitutionNamesSync.test.ts` — `S96-T09` sync nomeia conta e cartão pelo COMPE e mantém nome editado; `S96-T10` nome genérico já gravado é trocado; `S96-T11` carteira "Corretora xxxx" vira "BTG Pactual" e renomeada pelo usuário fica; `S96-T12` recibo já gravado como ação passa a FII.
  - `apps/mobile/src/screens/__tests__/Sprint96AccountRowActions.test.tsx` — `S96-T13` contêiner `account-actions-<id>` com `flexWrap: 'wrap'` e `rowGap`.
  - Stub de compilação: `domain/openFinance/institutions.ts`.
  - Execução Fase A: 3 suítes / 13 testes falhando (Red Phase esperado).
- Fase B (Green Phase & Report):
  - Implementação: `domain/openFinance/institutions.ts` (tabela COMPE → instituição, `parseTransferNumberCompe`, `resolveInstitutionName`: conector real → `institution.number`/`name` dos investimentos → COMPE das contas), `naming.ts` (`buildAccountName` usa o COMPE da própria conta, depois a instituição da conexão; "MeuPluggy" nunca entra; banco já citado no nome do cartão não repete; nome todo minúsculo ganha inicial maiúscula), `index.ts`/`pluggySyncService.ts` (instituição da conexão resolvida pelas contas e passada ao mapeamento; também em `applyAccountLinks`), `pluggyPortfolioService.ts` (`resolveBrokerDisplayName` com contas; carteira com nome automático "Corretora xxxx" é renomeada quando a corretora é conhecida, nome dado pelo usuário fica), `pluggyInvestmentsSyncService.ts` (busca as contas da conexão só para o nome, sem interromper o sync se falhar), `investments.ts` (`resolveFiiSubscription`: final 12 = direito, 13–15 = recibo; classe FII e nome "Recibo/Direito de subscrição XXXX11"), `AccountsScreen.tsx` (`account-actions-<id>` com `flexWrap: 'wrap'` e `rowGap`).
  - Contas e ativos já gravados com nome automático são renomeados na próxima sincronização (nome = `auto_name`).
  - Resultado: Sprint 96 — 3 suítes / 13 testes PASS. Suíte geral: 203 suítes / 1323 testes, 1322 PASS; falha só `receiptFlow` (instável sob carga, passa isolado 5/5). `tsc --noEmit`: zero erros em produção (154, os mesmos da Sprint 95). `expo lint`: 1 erro pré-existente (`set-state-in-effect`, `AccountsScreen.tsx:126`, linha não alterada). `test-lock verify` OK (219 arquivos).
  - Não validado: o formato real de `transferNumber` nas contas Meu Pluggy (documentação: `<compe>/<agência>/<conta>`). Se vier vazio, os nomes caem para "Conta corrente ·· 3671" sem "MeuPluggy".


## Sprint 97 — Contrato completo, campos crus e conferência Pluggy × app (sem mudar nenhum número)
- Origem: `docs/PLANO_SPRINTS_97_102_PLUGGY_VALORES_EXATOS.md` (D36, D37; R23, R24, R35 só a função).
- Fase A (Red Phase & Lock):
  - `apps/mobile/src/domain/openFinance/__tests__/Sprint97PluggyTruth.test.ts` (SHA-256 `fc6558d2448b762906fbff28a452f5c6652c7882074102a1f7a4df33d2948ea6`) — `S97-T01` `toBrtDate`/`toBrtMonth`; `S97-T05` limites do cartão 7ccce4de; `S97-T06` soma de itens da fatura vs `totalAmount` (`itemsVsTotalDiffCents`); `S97-T07` conta bancária `POSTED` por mês BRT e `PENDING` futuro em `scheduled.toPayCents`; `S97-T08` `reconcileAppVsPluggy` (`APP_RECOMPUTED` e lista vazia); `S97-T09` `SIGN_MISMATCH`; `S97-T12` regressão `calculateMonthlySummary`/`summarizeBill`; `S97-T13` totais "como o Meu Pluggy".
  - `apps/mobile/src/services/pluggy/__tests__/Sprint97RawContract.test.ts` (SHA-256 `a593f33c9d023cadf7bc55835044372ed34bb8e64d12a0f40fd88644d3f54d39`) — `S97-T02` sync grava `of_*` e re-sync atualiza in-place; `S97-T03` fixture sem campos OF grava `null`; `S97-T04` `upsertBill` grava `payments_json`, `payments_total_cents`, `allows_installments` e `chargeable_charges_cents`; `S97-T11` backup preserva colunas novas e aceita backup antigo sem elas.
  - `apps/mobile/src/services/pluggy/__tests__/Sprint97DiagnosticsV3.test.ts` (SHA-256 `4a1fc102ea80a2ac03fe31c68a38ed0c447b0b46a71a08d79c5363237fc17ab3`) — `S97-T10` diagnóstico v3 (`fieldPresence`, `bills`, `forecastVsBill`, `categoryMap`, sem PII); `S97-T14` `txCount`, `txCountByYear` e `localEntriesSummary`.
  - Stubs de compilação: `services/pluggy/types.ts`, `domain/openFinance/dates.ts`, `domain/openFinance/pluggyTruth.ts`.
  - Execução Fase A: 3 suítes / 13 FAIL, 1 PASS (S97-T12 regressão).
- Fase B (Green Phase & Report):
  - Implementação: `services/pluggy/types.ts` (tipos completos A.3–A.7), `domain/openFinance/dates.ts` (`toBrtDate`, `toBrtMonth`), `domain/openFinance/pluggyTruth.ts` (`computePluggyTruth`, `collectAppNumbers`, `reconcileAppVsPluggy`, `computeChargeableChargesCents`), `domain/financeFlow/cards.ts` (`summarizeCardAccountForScreen` extraída de `AccountsScreen.tsx`), `db/schema.ts`, `db/client.ts` e `services/backupService.ts` (colunas `of_*` em `fin_entries`, `fin_bills`, `fin_accounts`, `of_items`), `repositories/finRepository.ts`, `repositories/openFinanceRepository.ts`, `domain/openFinance/index.ts`, `services/pluggy/pluggySyncService.ts` e `services/pluggy/pluggyDiagnosticsService.ts` (diagnóstico v3).
  - Resultado: Sprint 97 — 3 suítes / 14 testes PASS. Suíte geral: **206/206 suítes PASS** (**1337/1337 testes PASS**, 46.905 s). `tsc --noEmit`: 0 erros em produção (161 pré-existentes apenas em `__tests__`). `expo lint`: 1 erro pré-existente (`set-state-in-effect`, `AccountsScreen.tsx:123`, linha não alterada). `test-lock verify`: OK (222 arquivos protegidos).
  - Pendência/Checkpoint: gerar export de diagnóstico v3 no aparelho e salvar em `docs/json.json` antes da Sprint 98.
