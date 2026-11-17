# Celsus — Arquitetura

Referência técnica do estado atual do app: camadas, fluxo de dados, navegação, estado, persistência, motor de
mercado, segurança e decisões de desempenho. As **fórmulas e regras financeiras** estão em
[`REGRAS_DE_NEGOCIO.md`](./REGRAS_DE_NEGOCIO.md); o **roadmap de melhorias** em [`MELHORIAS.md`](./MELHORIAS.md);
tokens e componentes visuais em [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).

---

## 1. Visão geral

Celsus é um **gestor de carteiras de investimentos local-first** em português do Brasil. Tudo o que é do
usuário — carteiras, metas, ativos, movimentações, proventos, perfil, PIN — fica **somente no aparelho**. A
única coisa que sai do aparelho são consultas de dados públicos de mercado (tickers), feitas por um **motor em
Go** que no Android roda **dentro do próprio app** (biblioteca nativa gerada com gomobile), sem servidor.

```
┌──────────────────────────── apps/mobile (Expo SDK 58 · RN 0.88 · React 19 · TS) ────────────────────────────┐
│                                                                                                             │
│  App.tsx ──► AppGate (onboarding / bloqueio) ──► AppContent (abas + camadas por estado)                      │
│     │                                                                                                       │
│     ├─ screens/ ─────── telas (Carteiras, Análises, Busca, Ficha, Proventos, B3, Perfil, Simulador…)          │
│     ├─ components/ui ── design system bento (deck de carteiras, dock, header, tiles, gráficos, sheets)       │
│     ├─ stores/ ──────── estado global mínimo (useSyncExternalStore): carteira ativa, lista, sessão, perfil   │
│     ├─ domain/ ──────── regras PURAS em decimal.js (preço médio, metas, aporte, renda fixa, B3, proventos)    │
│     ├─ services/ ────── orquestração (transações, sync, backup, B3, auth, marketApi)                         │
│     ├─ repositories/ ── acesso ao SQLite (Drizzle ORM + expo-sqlite)                                         │
│     └─ db/ ──────────── esquema, migrações por ALTER TABLE, índices, banco em memória p/ Jest/web            │
│                                                                                                             │
│  services/marketApi.ts ──► módulo nativo `celsus-market` (Kotlin) ──► libgojni.so (Go)      [Android]        │
│                       └──► HTTP  EXPO_PUBLIC_MARKET_API_URL (padrão http://localhost:8080)  [web / dev]      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── services/market-api (Go) ─────────────────────────────┐
│ internal/cotahist      parser COTAHIST B3, catálogo/seed, SQLite                  │
│ internal/yahoo         cotações, histórico (chart), dividendos/splits; failover  │
│ internal/fundamentals  perfil/indicadores (Fundamentus → Yahoo) + ranking + cache │
│ internal/macro         CDI/IPCA (BCB SGS #12 e #433)                              │
│ internal/brapi         provedor opcional de cotações (com token)                  │
│ internal/http          API REST /v1/*                                             │
│ pkg/mobilebridge       funções *JSON exportadas ao gomobile (mesmo código da API) │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Princípios que atravessam o código:

1. **Dinheiro nunca em float.** Valores são `TEXT` no banco e `Decimal` (decimal.js) no domínio; `number` só na
   borda de exibição.
2. **Domínio puro e testado.** `src/domain` não importa React, banco nem rede: recebe dados e devolve resultados.
   Toda fórmula tem teste bloqueado (TDD Lock).
3. **Nada de valor inventado.** Ausência de dado aparece como "—"; o app não preenche cotação, variação ou
   indicador com número fictício.
4. **Uma fonte por informação.** Lista de carteiras (`walletsStore`), carteira ativa (`walletStore`), sessão
   (`sessionStore`) e perfil (`profileStore`) são stores únicos; as telas só leem.
5. **Idempotência nas importações.** Planilha, extrato B3 e eventos corporativos usam `external_id` estável; rodar
   de novo não duplica nada.

---

## 2. Estrutura de pastas

| Caminho | Conteúdo |
| :--- | :--- |
| `apps/mobile/App.tsx` | Raiz: tema global, `AppGate`, `AppContent` (Home + roteamento por estado de todas as telas e modais) |
| `apps/mobile/index.ts` | Registro do app + semente única da planilha AUVP (`runStartupSeedOnce`) |
| `src/setupPolyfills.ts` | Polyfills de runtime (Hermes/Web IDL). **Precisa ser o 1º import** (ver `.agents/rules/runtime-polyfills.md`) |
| `src/components/AppGate.tsx` | Portão de sessão: loading → onboarding → bloqueio → app; capa de privacidade |
| `src/components/ui/` | Design system (≈50 componentes) — ver `DESIGN_SYSTEM.md` |
| `src/screens/` | Telas; `profile/` (tiles do Perfil + hook de configurações), `onboarding/` |
| `src/navigation/backNavigation.ts` | Decisão pura do botão "voltar" do Android |
| `src/stores/` | `walletStore`, `walletsStore`, `sessionStore`, `profileStore` |
| `src/domain/finance/` | Regras financeiras (ver `REGRAS_DE_NEGOCIO.md`) |
| `src/domain/openFinance/` | Mapeamento Pluggy (`index.ts`, `investments.ts`), nomenclatura (`naming.ts`) e diagnóstico/cobertura (`diagnostics.ts`) |
| `src/services/pluggy/` | Cliente Pluggy (`pluggyClient`), sincronizadores (`pluggySyncService`, `pluggyInvestmentsSyncService`) e carteira automática por corretora (`pluggyPortfolioService`) |
| `src/domain/b3/` | Parser/classificador/planejador do extrato da B3 |
| `src/domain/profile.ts` | Derivação de iniciais e validação de nome |
| `src/services/` | `marketApi`, `marketSyncService`, `transactionService`, `rebalanceExecution`, `backupService`, `b3ImportService`, `b3/readStatementFile`, `spreadsheetImportService`, `authService`, `secureStorage`, `biometricProvider`, `privacyAndAuth` |
| `src/repositories/` | `portfolio`, `asset`, `transaction`, `income`, `appMeta`, `profile` |
| `src/db/` | `schema.ts` (Drizzle), `client.ts` (DDL, migrações, índices, reset, mock em memória) |
| `src/theme/` | `tokens.ts` (cores, tipografia, espaçamento, bento, movimento), `palettes.ts` (paletas por carteira, tema claro/escuro) |
| `src/hooks/` | `useHeaderScrollFade` (header que some ao rolar), `useReducedMotion` |
| `src/utils/` | `decimalInput` (entrada pt-BR → decimal), `minLoading` (tempo mínimo de skeleton) |
| `src/data/planilhaSeed.json` | Planilha "Controle de investimentos v2" convertida (semente AUVP) |
| `modules/celsus-market/` | Módulo Expo nativo (Kotlin) + `.jar` e `libgojni.so` gerados do Go |
| `services/market-api/` | Motor de mercado em Go (API REST + ponte gomobile) |
| `scripts/` | `start-all.js` (Go + Expo), `build-native-bridge.js` (gomobile bind), `test-lock.js` (TDD Lock) |

---

## 3. Ciclo de vida da aplicação

### 3.1 Inicialização

1. `index.ts` importa os polyfills, registra `App` e dispara `spreadsheetImportService.runStartupSeedOnce()`
   (importa a carteira AUVP uma vez por instalação; a marca `seed:auvp:v1` em `app_meta` sobrevive a "Apagar
   todos os dados").
2. `App` lê o tema salvo (`themeModeService.hydrate`) e carrega o perfil (`profileStore.ensureLoaded`).
3. `AppGate` → `useAppLock` decide o status da sessão (seção 7).
4. Com a sessão `unlocked`, `AppContent` monta e:
   - pré-carrega a fonte do MaterialIcons (evita "pulo" de layout);
   - `refreshAppData()` — carrega todas as carteiras, resolve cotações (cache → rede em lote), consolida e publica
     a lista em `walletsStore`;
   - `checkHealth()` + uma sonda `fetchQuotes(['PETR4'])` decidem o banner **Modo Offline**;
   - `marketSyncService.syncAllPortfolioTickers()` atualiza todas as cotações em uma chamada e, ao terminar,
     `refreshAppData()` de novo;
   - o efeito da carteira ativa carrega ativos, metas, cotações e movimentações da carteira selecionada.

### 3.2 Troca de carteira

O deck (`StackedWalletDeck`) ou os indicadores chamam `walletStore.setActiveIndex(idx, id)`. Home, Carteiras e
Análises assinam o store. Na Home a troca:

1. incrementa um **número de sequência** (`walletLoadSeq`) — respostas de cargas antigas são descartadas;
2. liga os skeletons **sem limpar** os dados antigos;
3. lê tudo em paralelo, junta as atualizações num array `apply` e aplica **num único commit** dentro de
   `startTransition`, depois de um tempo mínimo de skeleton (`waitRemaining`) para não piscar.

A tela Carteiras segue o mesmo padrão (`loadedPortfolioIdRef`, `startTransition`) e a de Análises usa
`loadSeqRef` para descartar respostas atrasadas.

### 3.3 Retorno do segundo plano

`AppState` → `background/inactive` grava `backgroundedAt` e mostra a **capa de privacidade**. Em `active`, se há PIN
e passou o tempo de autobloqueio (0, 30, 60 ou 300 s), a sessão vai para `locked`. Depois do primeiro desbloqueio,
o app **continua montado** sob a tela de bloqueio (que é apresentada em um `Modal` por cima de qualquer outro
modal): ao desbloquear o usuário volta exatamente onde estava, sem recarregar banco e cotações.

---

## 4. Navegação

Não há Expo Router. A navegação é **por estado** em `AppContent`:

- **Abas do dock** (`FloatingBottomDock`): `home`, `wallets` (Carteiras), `stats` (Análises), `search` (Busca).
  O botão central "+" abre um *speed dial*: Novo aporte, Nova carteira, Adicionar ativo.
- **Camadas** (cada uma é um `if` que devolve outra árvore, em ordem de prioridade): Perfil/Configurações →
  Histórico de proventos → Detalhe da movimentação → Extrato completo → Detalhe da classe → abas.
  A Ficha do ativo é uma camada dentro da aba Busca.
- **Sheets** (`AnimatedModalSheet`) por cima de qualquer tela: Nova movimentação, Gerenciador de carteira (Nova
  carteira / Adicionar ativo), Simulador de aporte, Editor de meta.
- **Modais nativos de tela cheia** (`Modal`): Importação B3 (sobre Perfil ou Proventos), Detalhe da classe, Detalhe
  da movimentação.

O **botão voltar do Android** é decidido por `resolveBackAction(state)` em `src/navigation/backNavigation.ts`,
função pura com matriz de testes. Ordem: bloqueado → minimizar; depois Importação B3, Perfil, Proventos, sheets
(movimentação, simulador, gerenciador), detalhe da movimentação, ficha do ativo, extrato, detalhe da classe; em
outra aba → volta para Home; só a Home sem camadas deixa o sistema fechar o app. O menu "+" aberto e os sheets
tratam o voltar antes (registram o próprio `BackHandler`). **Toda camada nova precisa entrar em `BackState`.**

---

## 5. Estado

| Store | O que guarda | Quem escreve | Quem lê |
| :--- | :--- | :--- | :--- |
| `walletStore` | índice e id da carteira ativa | deck, indicadores, Carteiras, importação B3 | Home, Carteiras, Análises |
| `walletsStore` | lista de cartões de carteira já formatada (saldo com cotação, rentabilidade, paleta) + `loaded` | `App.refreshAppData` | Home e Carteiras (mesma lista, mesmo saldo) |
| `sessionStore` | `loading \| onboarding \| locked \| unlocked`, `backgroundedAt` | `AppGate`, `LockScreen`, Perfil | `AppGate`, `App` (voltar) |
| `profileStore` | nome, iniciais, onboarded | onboarding, Perfil | headers, bloqueio, Perfil |
| `privacyAndAuthService` | modo privacidade de valores | olho do header | todas as telas com valores |
| `themeModeService` | tema claro/escuro (persistido) | Perfil | `App`, `AppGate` |

Todos são objetos simples com `subscribe` + `useSyncExternalStore`. `walletsStore.registerRefresher` permite que
qualquer tela peça ao App para recarregar a lista (após criar/excluir/importar). `onDatabaseReset` limpa os stores
quando o banco é zerado.

---

## 6. Persistência local (SQLite)

Banco `celsus.db` (expo-sqlite + Drizzle). DDL em `src/db/client.ts` (`INITIAL_SCHEMA_SQL`), tipos em
`src/db/schema.ts`. WAL e chaves estrangeiras com `ON DELETE CASCADE` (apagar carteira apaga metas, ativos,
movimentações e proventos).

| Tabela | Papel | Campos-chave |
| :--- | :--- | :--- |
| `portfolios` | carteiras | `name`, `docket_code`, `patrimony_goal`, `monthly_contribution`, `is_archived` |
| `portfolio_class_targets` | meta por classe | `asset_class`, `target_percentage` (REAL), `receives_contribution` |
| `assets` | posição por ativo na carteira | `ticker`, `asset_class`, `target_percentage_in_class`, `quantity`, `average_price`, `manual_price_override`, `rf_*` (renda fixa, incluindo `rf_indexer_pct`), `source`, `external_id`, `of_reported_value`, `of_reported_at`, `value_source` |
| `transactions` | livro-razão | `type` (BUY, SELL, SPLIT, INPLIT…), `trade_date`, `quantity`, `unit_price`, `fees`, `total_amount`, `source`, `external_id`, `is_synthetic` |
| `income_events` | proventos | `ticker`, `pay_date`, `amount`, `kind` (RENDIMENTO/DIVIDENDO/JCP), `quantity`, `unit_amount`, `source`, `external_id`, `item_id`, `asset_id` |
| `app_meta` | chave/valor | perfil, onboarding, buscas recentes, watchlist, lote B3, marcas de semente |
| `market_price_cache` | última cotação por ticker | `current_price`, `change_percent_24h`, `updated_at` (TTL 15 min) |
| `historical_prices_local` | fechamento por ticker/data | PK `(ticker, price_date)` |
| `asset_profile_cache` | perfil/indicadores do ativo | `profile_json`, `updated_at` (12 h) |
| `fin_accounts` | contas do módulo Finanças | `name`, `type` (`cash \| checking \| card`), `initial_balance_cents`, `color`, `archived`, `closing_day`, `due_day`, `credit_limit_cents` |
| `fin_categories` | categorias de receitas/despesas | `name`, `kind`, `icon`, `color`, `parent_id`, `archived` |
| `fin_entries` | lançamentos pessoais | `kind` (`income \| expense \| transfer_out \| transfer_in`), `amount_cents`, `due_date`, `paid_date`, `paid_amount_cents`, `status`, `account_id`, `category_id`, `recurrence_id`, `recurrence_period`, `installment_group_id`, `bill_month`, `transfer_group_id`, `linked_income_id` |
| `fin_recurrences` | recorrências e assinaturas | `kind`, `amount_cents`, `frequency`, `day_of_month`, `start_date`, `end_date`, `is_subscription`, `active`, `variable_amount`, `generated_until` |
| `fin_recurrence_skips` | ocorrências ignoradas | PK `(recurrence_id, period)` — impede recriação após exclusão `"só esta"` |

Operações em lote no módulo Finanças (`generateRecurrenceWindow`, `createInstallmentPurchase`, `updateInstallmentEntries`, `deleteInstallmentEntries`, `updateRecurrence`, `deleteRecurrenceOccurrence`, `pauseSubscription`, `resumeSubscription`, `cancelSubscription`, `createTransfer`, `payCardBill`, `deleteTransferGroup`) executam em transação via `runInTransaction` (`src/db/client.ts`). IDs do módulo Finanças são gerados com `expo-crypto` (`randomUUID`). A tela de fatura/extrato do cartão (`CardBillScreen`) integra a rota `'cardBill'` em `FinanceHomeScreen` (pai `'accounts'`) e responde ao botão voltar do Android, oferecendo seletor horizontal de faturas, período de compras, lançamentos agrupados por dia e bloco de pagamentos; compras de cartão são normalizadas por `normalizeCardEntry` (`src/domain/financeFlow/cards.ts`) com `status = 'paid'` e `bill_month` obrigatório. O leitor de cupom (`ReceiptScannerSheet`) unifica os modos QR/Code 128, foto (OCR via `expo-text-extractor`) e digitação de chave de 44 dígitos (`parseAccessKey`), com consulta opcional à SEFAZ (`nfceLookupService`, UFs `DF/SP/RJ/MG/PR/RS`) e fallback para captura do total por OCR. A casca visual é compartilhada entre os dois módulos (`AppModule` em `src/navigation/appModule.ts`): `XpMinimalHeader` exibe avatar nas 4 telas raiz de Finanças e o ícone do módulo atual (`show-chart` / `account-balance`) com `switchModule()` em todas as telas; `FloatingBottomDock` é a nav bar única com pílula elástica e botão `+` configuráveis por props nos dois módulos.

**Migrações:** colunas novas entram em `SCHEMA_UPGRADES` (um `ALTER TABLE ADD COLUMN` aplicado só se
`PRAGMA table_info` não mostrar a coluna). **Índices** (`SCHEMA_INDEXES_SQL`) são criados **depois** das migrações
— alguns usam colunas que bancos antigos só ganham na migração: `assets(portfolio_id)`,
`portfolio_class_targets(portfolio_id)`, `transactions(portfolio_id, trade_date)`, `transactions(asset_id)`,
`transactions(external_id)`, `income_events(portfolio_id, pay_date)`, `income_events(external_id)`.

**"Apagar todos os dados"** (`resetDatabase`) apaga as linhas de todas as tabelas (o esquema fica), preservando só
`seed:auvp:v1`. No Jest e no web com `?memdb=1` o banco é um motor em memória que imita a API do Drizzle; em
produção uma falha ao abrir o SQLite **é propagada** (cair para memória causaria perda silenciosa de dados).

**Segredos não ficam no SQLite**: PIN, sal, tentativas e preferências de biometria ficam no `expo-secure-store`
(Keystore/Keychain) e nunca entram no backup.

---

## 7. Sessão, onboarding e segurança

- **Status inicial** (`useAppLock`): sem perfil ⇒ `onboarding` (ou fluxo curto de *migração* se já existem
  carteiras no banco); com perfil e sem PIN ⇒ `unlocked`; com PIN ⇒ `locked`.
- **Onboarding** (`OnboardingFlow`): Boas-vindas → Nome (2–40 caracteres) → PIN opcional de 6 dígitos (com
  confirmação e aviso de PIN trivial) → Digital (só se há PIN e o aparelho suporta) → Pronto (Importar extrato B3,
  Criar carteira ou Explorar). Tudo é gravado de forma atômica no fim.
- **PIN** (`authService`): `SHA-256(sal + pin)` com sal aleatório de 16 bytes por instalação. Erro devolve as
  tentativas restantes; o 5º erro bloqueia 30 s, depois 1 min, 5 min e 15 min. O bloqueio é persistido e sobrevive
  ao fechamento do app.
- **Biometria** (`biometricProvider`, `expo-local-authentication`): exige PIN como plano B; só fica ativa depois de
  um teste real bem-sucedido. A tela de bloqueio faz o *auto-prompt* ao abrir.
- **Esqueci o PIN**: recuperação por biometria ou apagamento local (exige digitar "APAGAR"), que volta ao onboarding.
- **Capa de privacidade**: camada opaca com o logo enquanto o app está em `inactive/background` (some da tela de
  multitarefa).
- **Modo privacidade**: o olho do header troca valores por `R$ ••••••` em todas as telas.

---

## 8. Dados de mercado

### 8.1 No app (`services/marketApi.ts`)

`MarketApiService` escolhe o transporte: **ponte nativa** se o módulo `CelsusMarket` existe (Android), senão
**HTTP** para `EXPO_PUBLIC_MARKET_API_URL`.

| Operação | Estratégia |
| :--- | :--- |
| `fetchQuotes(tickers)` | Se **todas** as cotações em cache têm < 15 min, devolve do SQLite. Senão consulta ponte/HTTP, grava no cache e devolve. Falha de rede ⇒ devolve o cache marcado `isStale: true`. `forceRefresh` ignora o cache. |
| `getCachedQuote(ticker)` | Lê `market_price_cache` (sem rede). |
| `getHistoricalPrice(ticker, data)` | `historical_prices_local` → ponte → HTTP `/v1/history` → Yahoo direto; grava o que achar. |
| `getAssetProfile` | ponte/HTTP (só vale com preço > 0) → `asset_profile_cache` (12 h) → `fetchQuotes` → catálogo local. |
| `getRanking` | ponte/HTTP completado com o catálogo da classe; itens sem dado vão para o fim com "—". |
| `searchCatalog` | ponte/HTTP + catálogo estático `STATIC_CATALOG_ASSETS` como reserva. |
| `getCorporateEvents` | splits/inplits do Yahoo (usado por `marketSyncService.syncCorporateEvents`). |

**Precedência de preço atual de um ativo (em todo o app):** `manual_price_override` → cotação em cache/rede →
`average_price`. Sem cotação o ativo vale o custo (rentabilidade 0%), nunca um preço inventado.

As telas resolvem cotações **em lote**: primeiro o cache por ticker único, depois **uma** chamada de rede para os
que faltam. Tickers que falharam na sessão não são reconsultados a cada recarga (a sincronização periódica cuida
deles).

### 8.2 Motor Go (`services/market-api`)

| Rota REST | Função |
| :--- | :--- |
| `GET /v1/health` | status do serviço e data do último COTAHIST |
| `GET /v1/catalog/search?q=&class=` | busca no catálogo (ações, FIIs, renda fixa, cripto) |
| `GET /v1/quotes?tickers=` | cotações (cache com TTL + *singleflight*: pedidos simultâneos do mesmo ticker viram 1) |
| `GET /v1/history?tickers=&from=&to=` | preço histórico |
| `GET /v1/rates/macro?from=` | séries CDI/IPCA |
| `GET /v1/assets/{ticker}/profile` | perfil e indicadores (Fundamentus → Yahoo quoteSummary; cache 12 h) |
| `GET /v1/assets/{ticker}/history?range=` | série de preços (`7d,30d,6m,1y,5y,max`; aceita `1A,5A`) |
| `GET /v1/assets/{ticker}/dividends` | proventos (eventos do Yahoo) |
| `GET /v1/rankings?class=&by=dy\|pvp\|change\|price` | ranking do catálogo, hidratando perfis sob demanda |

Fontes: Yahoo Finance (cotações, histórico, eventos; failover `query1 → query2`), Fundamentus (indicadores de
ações/FIIs; HTML ISO-8859-1 tratado em `internal/fundamentals/fundamentus.go`), COTAHIST B3 (carga histórica;
precedência COTAHIST > Yahoo), BCB SGS (#12 CDI, #433 IPCA). Com `BRAPI_TOKEN` o provedor de cotações passa a ser a
brapi. Todos os clientes HTTP têm timeout (10–15 s) e o servidor tem `ReadHeader/Read/Write/IdleTimeout`.

### 8.3 Ponte nativa Android

`pkg/mobilebridge` expõe `InitEngine`, `FetchQuotesJSON`, `SearchCatalogJSON`, `GetAssetProfileJSON`,
`GetPriceHistoryJSON`, `GetDividendsJSON`, `GetRankingJSON`, `GetHistoricalPriceJSON`, `CheckHealthJSON` etc. O
módulo Kotlin (`modules/celsus-market/android/.../CelsusMarketModule.kt`) as publica como `AsyncFunction`s e o app
as consome via `modules/celsus-market/index.ts`. Os binários (`libs/*.jar`, `jniLibs/*/libgojni.so`) são
versionados: **mudança em Go só chega ao aparelho com `npm run build:native` + novo build nativo**
(`cd apps/mobile && npx expo run:android`). Recarregar o JavaScript não basta.

---

## 9. Fluxos de escrita

| Fluxo | Onde | O que acontece |
| :--- | :--- | :--- |
| Nova compra/venda | `TransactionScreen` → `transactionService.executeTransaction` | valida (qtd > 0, preço > 0, taxas ≥ 0, venda ≤ saldo), grava a transação e atualiza quantidade/preço médio do ativo. O preço é auto-preenchido com o fechamento da data (`marketApiService.getHistoricalPrice`). |
| Adicionar ativo | Carteiras → `assetRepository.createAsset` | busca no catálogo (local + API), valida o ticker por classe (`assetCatalogValidation`), cria com meta na classe. |
| Metas | Carteiras → `portfolioRepository.setClassTargets` / `assetRepository.updateAssetTargetInClass` | recálculo com cadeados que fecha 100%; gravação das metas por ativo com *debounce*. |
| Aporte | `SimulatorScreen` → `calculateTwoPhaseContribution` → `rebalanceExecutionService` | plano em duas fases, confirmação, execução em lote como compras. |
| Meta de patrimônio | `GoalEditorSheet` → `portfolioRepository.setGoal` | valor-alvo e aporte mensal da carteira. |
| Importação B3 | `B3ImportSheet` → `B3ImportScreen` (embedded) → `b3ImportService.preview/apply/undoLastImport` | Bottom sheet com snap em duas alturas (50% em pick, 100% em preview/report; não dispensável em importing); ver `REGRAS_DE_NEGOCIO.md` §8. |
| Backup | Perfil → `backupService.export/importDossierArchive` | `.celsus.zip` com CSVs + `manifest.json` (SHA-256 por arquivo); importação `RESTORE` (substitui) ou `MERGE` (por UUID). |
| Eventos corporativos | `marketSyncService.syncCorporateEvents` | ajusta quantidade/PM em splits/inplits de forma idempotente (`external_id`). |

---

## 10. Desempenho — decisões em vigor

- **Commit único por troca de carteira** (`apply[]` + `startTransition`) e skeleton com tempo mínimo.
- **Sequência/cancelamento** em toda carga assíncrona que depende de seleção (Home, Carteiras, Análises,
  autocompletes de ativo): resposta atrasada nunca sobrescreve a atual.
- **Cotações em lote** e cache SQLite de 15 min; *singleflight* no Go.
- **Índices SQLite** nas consultas por carteira, ativo, data e `external_id`.
- **Uma conexão SQLite** compartilhada entre Drizzle e as consultas cruas.
- **`React.memo` + callbacks estáveis** nos blocos da Home (deck, header, alocação, meta, recentes, dock) e nas
  linhas de ativo da tela Carteiras (handlers por *ref*).
- **Animações no driver nativo** (deck, menu, skeleton, PIN). O pulso dos skeletons é **um único loop
  compartilhado**, ligado só enquanto há skeleton montado.
- **Curva patrimonial e resumos memoizados** em Análises; proventos com `useMemo` por filtro.
- **Carteiras não recalcula saldos** quando já usa a lista compartilhada (os saldos com cotação vêm do App).
- **Lista de ativos rolável com limite de altura** (`maxHeight` 55% da janela, `nestedScrollEnabled: true`) na tela Carteiras para rolagem fluida em carteiras com dezenas/centenas de ativos.
- **App mantido montado** durante o rebloqueio (sem recarga ao desbloquear).

---

## 11. Testes e protocolo TDD Lock

```bash
npm run test:mobile                 # Jest (app)
npm run test:market                 # Go
cd apps/mobile && npx tsc --noEmit  # tipos
npm run test:verify                 # integridade SHA-256 dos testes bloqueados
```

Cada sprint tem **Fase A** (testes escritos e bloqueados: somente leitura + hash em `tests.lock.json`) e **Fase B**
(implementação sem tocar nos testes). Teste que falha se corrige no código de produção. Alterar teste exige
autorização explícita (`node scripts/test-lock.js unlock` → editar → `npm run test:lock` → `npm run test:verify`).
Detalhes em `.agents/rules/tdd-lock.md`; estado atual em [`../TEST_REPORT.md`](../TEST_REPORT.md).
Testes "live" (`CELSUS_LIVE=1 go test ./... -run Live -v`) consultam as fontes reais e ficam desligados por padrão.

> Os arquivos de teste de telas antigas ainda têm erros de **tipo** (props renomeadas, mocks parciais) que não
> afetam a execução do Jest; `tsc` limpo vale para os arquivos de produção.

---

## 12. Como rodar

Requisitos: Node 22+, Go, Android Studio (SDK + NDK) para o build nativo.

```bash
cd apps/mobile && npm install
npm run start                              # (raiz) backend Go na 8080 + Expo
cd apps/mobile && npx expo run:android     # build de desenvolvimento com a ponte Go embutida
npm run backend                            # só o motor de mercado
npm run build:native                       # depois de mudar Go usado pelo Android
```

No web (`expo start --web`) o SQLite precisa de COOP/COEP + `SharedArrayBuffer`; sem isso use `?memdb=1` (banco em
memória, não persiste). `EXPO_PUBLIC_MARKET_API_URL` aponta o app para o serviço HTTP. Variáveis do Go:
`PORT` (8080), `MARKET_DB_PATH` (`market.db`), `BRAPI_TOKEN` (opcional).

## Espaçamento único dos dois módulos (Sprint 80)

- Nenhuma tela ou folha de Finanças (nem `OpenFinanceScreen`, `StatementImportSheet`, `OpenFinanceInvestmentReconciliationSheet`, `FinListCard`) declara `padding*`, `margin*` ou `gap` com número solto: tudo vem de `space`, `layout` e `bento` (`src/theme/tokens.ts`). Exceção só com o comentário `// fora da escala: <motivo>` na mesma linha (hoje são 3). O teste `Sprint80SpacingTokens.test.ts` falha se um número solto voltar.
- Mapeamento usado: 2–5 → `space.xs`; 6–9 → `space.sm`; 10–13 → `space.md`; 14–18 → `space.lg`; 20 → `layout.screenPadding` (margem de tela) ou `space.xl`; 22–26 → `space.xl`; 28–40 → `space.xxl`.
- Tokens novos em `layout`: `safeBottomMin` (16), `dockClearance` (96 = barra de 60 + folga de 36), `fabClearance` (72 = botão de 56 + 16) e `chipGap` (8).
- Padding inferior do conteúdo rolável: `dockContentPaddingBottom(insets.bottom, { withFab })` em `src/theme/layoutMetrics.ts` = `max(safe area, 16) + 96 (+ 72 com botão flutuante)`. Usado pela Home de Investimentos (`App.tsx`) e por todas as telas de Finanças; substitui os valores fixos 96/120/130/170.
- Telas raiz de Finanças (Resumo, Lançamentos, Contas, Mais) usam `sharedStyles.scrollContent`: margem lateral `layout.tabScreenPaddingX` (16), respiro sob o header `layout.tabScreenPaddingTop` (4) e gap `bento.gap` (10), iguais aos da Home de Investimentos.

## Diagnóstico Pluggy e Auditoria de Outliers (Sprint 88)

- `services/pluggy/pluggyDiagnosticsService.ts`: gera relatório JSON anonimizado consultando contas, faturas, investimentos e transações de investimento em modo somente leitura (sem persistência em `assets`/`fin_entries`), com truncamento de descrições (40 chars) e hash curto de `itemId`.
- `domain/openFinance/diagnostics.ts` (`auditOpenFinanceOutliers`): audita localmente ativos, contas e lançamentos para exibir alertas na seção **Qualidade dos dados** da `OpenFinanceScreen`, com exportação via `Share.share` (ou callback `onCopyReport`). Documentação operacional em `docs/DIAGNOSTICO_PLUGGY.md`.

## Janela, Exclusões e Saldos Open Finance (Sprint 87)

- `of_sync_runs` separa execuções `FINANCE` e `INVESTMENTS` (`kind`). O sync de finanças executa duas passadas (`createdAtFrom` incremental + `dateFrom` de 40 dias) e reconcilia exclusões via `detectRemovedOpenFinanceEntries` (`domain/openFinance/index.ts`), marcando `fin_entries.of_removed_at`.
- `fin_accounts` persiste `of_linked_at`, `closing_balance_cents`, `auto_invested_cents` e `credit_used_cents` (todos incluídos no schema, migração idempotente e `backupService.ts`).

## Correções da Validação Pluggy (Sprint 89)

- `domain/openFinance/investments.ts`: `resolvePositionPriceFactor` aplica `priceFactor` também na posição (`R12`), e `calculateInvestmentCostBasis` produz `openingAdjustment` sem `amountOriginal` (`UNKNOWN`) e `closingAdjustment` (`SELL` sintético `pluggy-closing-adj:<id>`) quando o livro excede a posição (`R13`), ambos gerenciados em `pluggyInvestmentsSyncService.ts`.
- `domain/finance/averagePrice.ts` (`isUnknownCost`): helper puro compartilhado entre `marketSyncService.ts`, `finGoalsService.ts`, `PortfolioManagementScreen.tsx` e `IncomeHistoryScreen.tsx` (`R14`).

## Proventos por Nome de Fundo e Diagnóstico Estendido (Sprint 90)

- `domain/openFinance/income.ts` (`detectBankIncomeCandidate`): aceita `KnownIncomeAsset[]` (`{ ticker, name, status }`), executando busca por ticker → nome do fundo (após `"s/"` ou `"FII"`, normalizado sem stopwords) → raiz de 4 letras do ticker (`R15`), extração de `quantity`/`unitAmount` em `"S/ <n>"` (8 casas) e redirecionamento de recibos `TOTAL_WITHDRAWAL` para o ativo-base `ACTIVE` sufixo `11` (`R16`).
- `services/pluggy/pluggySyncService.ts` + `domain/openFinance/index.ts`: detecção de proventos executada antes de `reconcilePluggyTransactions` (inclusive para `categoryId 04000000`), excluindo proventos do pareamento de transferências e contabilizando `counts.ambiguousIncomeCount`.
- `domain/openFinance/diagnostics.ts` (`redactDiagnosticDescription`) + `services/pluggy/pluggyDiagnosticsService.ts`: redação de PII em `sampleTransactions[].description`, inclusão de `name` e bloco `app` por investimento e `entriesLast90d` por conta (`R21`).

## Classificação de Lançamentos Open Finance (Sprint 91)

- `domain/openFinance/classification.ts`: `classifyOpenFinanceBankEntry` (R17/R18), `mapPluggyCategory`/`resolveCategoryByPluggyId` (R20, prefixo do `categoryId`), `findOwnTransferPairs` (R18) e `findCardTopupPairs` (R19), todas puras. `stalePending.ts` guarda `isStaleOpenFinancePending` (janela de 40 dias), usado por `financeFlow`.
- `services/pluggy/pluggyClassificationService.ts`: `pairOwnTransfersAcrossItems()` (chamado dentro da transação de `syncFinance`, depois de gravar os lançamentos) e `reclassifyOpenFinanceEntries()` (passada única).
- Schema: `fin_entries.of_category_id` e `of_class_reason` (DDL, ALTER idempotente, backup). Diagnóstico: `entriesLast90d.transfersByReason` e `stalePendingCount` por conta.

## Correções da Revisão (Sprint 92)

- `domain/openFinance/income.ts`: `extractFundQueryWords` devolve vazio sem `"s/"`/`"FII"`; nome e raiz do ticker só procuram nesse trecho.
- `domain/openFinance/classification.ts`: `isTransferCompatibleCategoryId` (sem categoria, `04*`, `05*`) filtra `findOwnTransferPairs` e o pareamento de `reconcilePluggyTransactions`; `findOwnTransferPairs` aceita `windowStart`.
- `services/pluggy/pluggyClassificationService.ts`: `pairOwnTransfersAcrossItems(today, { windowStart })` desfaz pares `of-tr-` incompatíveis antes de parear.
- `services/pluggy/pluggySyncService.ts`: busca única do histórico completo por conexão (`OF_HISTORY_BACKFILL_META_PREFIX`), terceira chamada paralela às duas da R10.
- `domain/openFinance/diagnostics.ts`: mascaramento de contraparte por padrão de descrição (Pix/TED/DOC/transferência).

## Contrato Completo Pluggy, Campos Crus e Conferência (Sprint 97)

- `services/pluggy/types.ts`: tipos completos da OpenAPI Pluggy (Apêndice A.3–A.7), incluindo `statusDetail`, `bankData.reservedBalances`/`overdraftUsedLimit`, `creditData.disaggregatedCreditLimits`, `creditCardMetadata` completo (`billForecastDate`, `billPostDate`, `paymentType`, `feeType`, `otherCreditsType`), `paymentData` e `PluggyBill.payments`/`financeCharges`.
- `domain/openFinance/dates.ts`: `toBrtDate` e `toBrtMonth` (UTC−3 fixo preservando datas puras).
- `domain/openFinance/pluggyTruth.ts`: `computePluggyTruth`, `collectAppNumbers`, `reconcileAppVsPluggy` e `computeChargeableChargesCents`.
- `domain/financeFlow/cards.ts`: `summarizeCardAccountForScreen` extraída de `AccountsScreen.tsx` sem alterar resultados.
- `db/schema.ts`, `db/client.ts` e `services/backupService.ts`: persistência e backup das colunas `of_*` em `fin_entries`, `fin_bills`, `fin_accounts` e `of_items`.
- `services/pluggy/pluggyDiagnosticsService.ts`: export v3 com `fieldPresence`, `txCountByYear`, `localEntriesSummary`, `bills`, `forecastVsBill`, `categoryMap`, `item` e `reconciliation` anonimizados.
