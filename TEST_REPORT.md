# Celsus — Relatório de testes

Estado atual da suíte. O histórico sprint a sprint (relatórios antigos, com hashes e tempos) está no git:
`git log -p -- TEST_REPORT.md`.

## Resumo

| Suíte | Comando | Resultado |
| :--- | :--- | :--- |
| App mobile (Jest + Testing Library) | `npm run test:mobile` | **3/3 suítes Sprint 62 (20/20 testes)** passando; **123/126 suítes (855/856 testes)** no total (3 falhas pré-existentes de WIP Sprint 63/64) |
| Motor de mercado (Go) | `npm run test:market` | Todos os 7 pacotes testáveis `ok` (0 falhas, 2 testes "live" pulados por padrão) |
| Tipos (TypeScript) | `cd apps/mobile && npx tsc --noEmit` | **0 erros** nos arquivos de produção da Sprint 62 |
| Integridade dos testes (TDD Lock) | `node scripts/test-lock.js verify` | **167 arquivos protegidos**, SHA-256 íntegros |

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
