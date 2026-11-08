# Celsus — Arquitetura e decisões

Documento de referência do estado atual do projeto. Substitui os antigos `SPEC*.md`, `REFACTORING_SPEC.md` e
`implementation_plan.md` (planos de sprints já concluídas; continuam no histórico do git).

## 1. Visão geral

App mobile **local-first** de gestão de carteiras de investimentos (pt-BR). Carteiras, metas, ativos, aportes e
backups vivem só no aparelho (SQLite). Um **motor de dados de mercado em Go** fornece cotações, histórico,
proventos, taxas macro e fundamentos; no Android ele roda **dentro do app** (gomobile), sem servidor.

```
apps/mobile (Expo / React Native, TypeScript)
 ├─ UI (telas + componentes bento) ─ domínio financeiro (decimal.js) ─ repositórios (Drizzle + expo-sqlite)
 └─ services/marketApi.ts ──► ponte nativa Android (módulo Expo `celsus-market` → libgojni.so)
                         └─► HTTP (web/dev) → services/market-api (mesmo código Go)
services/market-api (Go)
 ├─ internal/cotahist      parser COTAHIST B3 + catálogo/seed + SQLite
 ├─ internal/yahoo         cotações, histórico (chart), dividendos/splits (failover query1→query2)
 ├─ internal/fundamentals  perfil/indicadores (Fundamentus → Yahoo quoteSummary) + ranking + cache
 ├─ internal/macro         CDI/IPCA (BCB SGS)
 ├─ internal/brapi         provedor opcional de cotações (exige token)
 ├─ internal/http          API REST /v1/*
 └─ pkg/mobilebridge       funções *JSON exportadas ao gomobile
```

## 2. App mobile (`apps/mobile`)

Stack: Expo SDK 58, React Native 0.88 (nova arquitetura), React 19, TypeScript, Drizzle ORM + `expo-sqlite`,
`decimal.js`, Jest + Testing Library. **Não há** Expo Router: a navegação é por estado em `App.tsx`
(abas + camadas sobrepostas); a regra do botão "voltar" do Android está em `src/navigation/backNavigation.ts`.

| Pasta | Conteúdo |
| :--- | :--- |
| `src/screens` | Home (em `App.tsx`), Carteiras, Estatísticas, Busca, Ficha do ativo, Detalhe da classe, Extrato, Simulador de aporte, Perfil/Configurações |
| `src/components/ui` | Design system (bento, dock, header, cartões, campos, skeletons, gráficos) |
| `src/domain` | Regras puras: financeiro (`finance/`: pesos, preço médio, renda fixa, aporte, meta, proventos, donut, perfil/ranking) e perfil do usuário (`profile.ts`: derivação de iniciais) |
| `src/repositories` | Acesso ao SQLite (carteiras, ativos, transações, proventos, `appMetaRepository`, `profileRepository`) |
| `src/services` | `marketApi` (ponte/HTTP/cache), `authService` (PIN com SHA-256+sal, lockout D5, biometria real, autolock), `secureStorage`, `biometricProvider`, backup `.celsus.zip`, sincronização de cotações, `privacyAndAuthService` (modo privacidade de valores), importação da planilha |
| `src/stores` | `walletStore` (carteira ativa), `walletsStore` (lista compartilhada), `sessionStore` (status da sessão, controle de bloqueio), `profileStore` (perfil reativo) |
| `src/db` | `schema.ts`, `client.ts` (migrações por `ALTER TABLE` protegido; banco em memória no Jest/web com `?memdb=1`) |
| `modules/celsus-market` | Módulo Expo nativo (Kotlin) que expõe as funções Go |

### Telas principais
- **Home:** carteira ativa (cartão empilhado), Aportar/Rebalancear, alocação por classe (preenchimento = % da meta), meta de patrimônio, movimentações recentes. Carrega em paralelo e aplica tudo de uma vez (`startTransition`) para não travar a troca de carteira.
- **Carteiras:** troca de carteira, Metas (por classe e por ativo, com cadeado), lista de ativos com stepper −/+ (aceita valores quebrados, ex. 12,5%), meta de patrimônio.
- **Estatísticas:** consolidado de todas as carteiras, evolução patrimonial, proventos.
- **Busca (3ª aba do dock):** campo único, recentes, ranking por classe (FIIs, Ações, Cripto) ordenável.
- **Ficha do ativo:** cotação, gráfico (6 períodos), indicadores por classe, proventos, "Sobre a empresa" e botão fixo **Adicionar à carteira** (abre o modal de novo ativo pré-preenchido).
- Cabeçalho (`XpMinimalHeader`) e margens (`layout.tabScreenPaddingX/Top`) idênticos em Home, Carteiras e Estatísticas.

### Regras de dados importantes
- **Nada de valor inventado:** ausência de dado aparece como "—" (variação do dia, indicadores, meta fora da carteira).
- Metas em % fecham sempre em 100% (método do maior resto, 2 casas, nunca negativas) e são **persistidas** por ativo.
- Cadeia de perfil do ativo: ponte nativa/HTTP (só vale com preço > 0) → cache SQLite → cotação (`fetchQuotes`) → catálogo local.
- Ranking: ponte/HTTP completado com o catálogo da classe; itens sem dado ficam por último com "—".
- Cotações têm cache de 15 min no SQLite (`isStale` quando servidas vencidas); perfis de ativo, 12 h.

## 3. Motor de mercado (`services/market-api`)

API REST (`go run .`, porta 8080; usada no web e no desenvolvimento):

| Rota | Função |
| :--- | :--- |
| `GET /v1/health` | status do serviço e do COTAHIST |
| `GET /v1/catalog/search?q=&class=` | busca no catálogo (ações, FIIs, renda fixa, cripto) |
| `GET /v1/quotes?tickers=` | cotações (cache TTL + singleflight) |
| `GET /v1/history` | preço histórico em uma data |
| `GET /v1/rates/macro?from=` | séries CDI/IPCA |
| `GET /v1/assets/{ticker}/profile` | perfil e indicadores (Fundamentus → Yahoo; cache 12 h) |
| `GET /v1/assets/{ticker}/history?range=` | série de preços (`7d,30d,6m,1y,5y,max`; aceita também `1A,5A`) |
| `GET /v1/assets/{ticker}/dividends` | proventos (eventos do Yahoo) |
| `GET /v1/rankings?class=&by=dy\|pvp\|change\|price` | ranking do catálogo; hidrata perfis ausentes sob demanda |

Fontes: Yahoo Finance (cotações/histórico/eventos), Fundamentus (indicadores de ações e FIIs; página ISO-8859-1 com
rótulos prefixados por "?", tratada em `internal/fundamentals/fundamentus.go`), COTAHIST B3 (carga histórica),
BCB SGS (#12 CDI, #433 IPCA). Precedência de preço histórico: COTAHIST > Yahoo.

### Ponte nativa Android
`pkg/mobilebridge` expõe `InitEngine`, `FetchQuotesJSON`, `SearchCatalogJSON`, `GetAssetProfileJSON`,
`GetPriceHistoryJSON`, `GetDividendsJSON`, `GetRankingJSON`, etc. O módulo Kotlin
(`modules/celsus-market/android/.../CelsusMarketModule.kt`) as publica como `AsyncFunction`s; o app as consome por
`modules/celsus-market/index.ts`. As bibliotecas compiladas (`libs/*.jar`, `jniLibs/*/libgojni.so`) ficam no
repositório: **qualquer mudança em Go só chega ao aparelho depois de `npm run build:native` e de um novo build
nativo** (`cd apps/mobile && npx expo run:android`). Recarregar o JavaScript não basta.

## 4. Segurança, Sessão e Bloqueio

- **Segredo e PIN (`authService`, `secureStorage`)**: O PIN (6 dígitos numéricos) é persistido no Keystore/Keychain do sistema via `expo-secure-store` usando `SHA-256(salt + pin)`, com salt aleatório criptográfico (16 bytes hex) por instalação. Segredos nunca são gravados no banco SQLite (`app_meta`) nem vazam em backups `.celsus.zip`.
- **Lockout e Resiliência**: Limite de tentativas persistido no storage seguro: 5 erros ativam bloqueio de 30s, progredindo para 1m, 5m e 15m. Sobrevive ao fechamento do aplicativo.
- **Biometria Real (`biometricProvider`)**: Provedor nativo baseado em `expo-local-authentication`. Biometria depende estritamente de PIN configurado (plano B) e só é gravada como ativada após validação bem-sucedida em teste real de autenticação.
- **Sessão e Ciclo de Vida (`sessionStore`, `AppGate`, `useAppLock`)**:
  - Estados: `'loading' | 'onboarding' | 'locked' | 'unlocked'`.
  - Transições no boot: sem PIN nem perfil ⇒ onboarding; com PIN ⇒ locked; sem PIN e com perfil ⇒ unlocked direto (Spec D2).
  - Bloqueio automático: detecção de ciclo de vida via `AppState`. Ao suspender/voltar do background após tolerância configurada (`autoLockSeconds`, padrão 60s), bloqueia a sessão.
  - Capa de privacidade (`privacy-cover`): quando o app entra em `inactive` ou `background` e o bloqueio está habilitado, renderiza camada opaca com logo, impedindo vazamento de saldos na visão multitarefa do sistema operacional.
  - Tela de bloqueio (`LockScreen`): tela cheia nativa com `PinDots` (animação nativa de shake), `PinKeypad` (72dp JellyPressable), contador de lockout, auto-prompt de digital e modal de recuperação ("Esqueci o PIN") com biometria ou wipe local seguro exigindo confirmação explícita "APAGAR".
  - Navegação do botão Voltar (`backNavigation`): em estado bloqueado (`isLocked`), o botão físico/gesto de voltar possui prioridade máxima retornando a ação `'minimize'` (`BackHandler.exitApp()`), impedindo evasão da tela de bloqueio.

## 5. Importação de Extrato da B3

- **Leitor e Descompactador (`src/services/b3/readStatementFile.ts`)**:
  - Lê arquivos `.xlsx` (descompactação ZIP pura via `fflate` sem dependência de DOM ou Node, stream tokenizado de XML de `xl/sharedStrings.xml` e planilhas) e `.csv` (com detecção automática de delimitador `;` ou `,` e suporte a BOM UTF-8).
  - Trata datas como texto e números seriais do Excel.
  - Erros tipados: `EmptyFileError`, `UnrecognizedFormatError`, `MissingColumnError`, `UnsupportedStatementError` (detecta e orienta caso enviado relatório de negociação em vez de movimentação).
- **Domínio e Planejamento (`src/domain/b3`)**:
  - `parseStatementRows`: normaliza datas (`YYYY-MM-DD`), instituições, divide `TICKER - NOME` e trata campos nulos/numéricos.
  - `classifyMovement`: classificação exata (COMPRA por liquidação ou subscrição exercida, VENDA por liquidação de débito, PROVENTOS como Rendimento/Dividendo/JCP, IGNORADOS para direitos não exercidos e transferências de custódia, e REVISAR para eventos não automatizados).
  - `normalizeTicker`: direitos e recibos de subscrição (`XXXX12`/`XXXX13` → `XXXX11`).
  - `inferAssetClass`: catálogo estático local (units `ALUP11`/`BPAC11` como `STOCK`), heurísticas de FII no nome e sufixos 3/4/5/6.
  - `reconcileOpeningBalances`: reconciliação de saldo anterior com janela móvel de 20 dias para eventos de provento e proteção contra venda a descoberto.
  - `buildImportPlan`: cria plano cronológico determinístico com `external_id` estável (`b3:<hash>`), controle de duplicatas e somas em `Decimal`.
- **Serviço e Transações (`src/services/b3ImportService.ts`)**:
  - `preview`: cruza dados do arquivo com o banco local.
  - `apply`: criação de novos ativos, lançamento de saldo inicial inferido (preço manual ou cotação histórica), execução atômica via `transactionService` com tolerância a falhas sem abortar o lote, gravação de proventos com tipo/cotas/valor unitário, verificação matemática com `matches = true` e marcação de lote em `app_meta` (`b3:last_batch`).
  - `undoLastImport`: operação reversível que remove transações/proventos do lote e ativos vazios criados por ele.
- **Telas e Navegação (`B3ImportScreen.tsx`)**:
  - Fluxo em 5 etapas: Seleção do arquivo → Leitura/Validação → Pré-visualização → Importação com progresso → Relatório final com botões de Ver carteira, Desfazer e Concluir.
  - Pontos de entrada: Perfil (BackupTile), Onboarding (DoneStep) e Empty states da Home e Carteiras.

### Histórico de Proventos (`incomeHistory.ts` e `IncomeHistoryScreen.tsx`, Sprint 48)

- **Domínio Puro (`src/domain/finance/incomeHistory.ts`)**:
  - Aritmética pura e exata sem floats via `decimal.js`.
  - `filterIncomes`: filtragem combinada por carteira, período (`from`/`to`), tipo (`kind`), ativo (`ticker`) e classe de ativo (`assetClass` via mapa injetado).
  - `monthlySeries`: série mensal cronológica contínua que inclui todos os meses vazios com `0.00`.
  - `yearlySeries`: totais por ano e média mensal dividida por 12 meses.
  - `groupByMonth`: agrupamento decrescente por mês com itens ordenados por data desc.
  - `rankByTicker`: ranking com cálculo proporcional e distribuição do maior resto (Hamilton method), garantindo soma exata de 100,00%.
  - `trailing12m`: cálculo de proventos recebidos nos últimos 12 meses móveis (cruzamento de virada de ano).
  - `yieldOnCost`: proventos de 12 meses divididos pelo custo dos ativos do escopo (`null` quando custo <= 0).
  - `averagePerMonth`: média exata sobre a quantidade de meses do intervalo selecionado.
  - `bestMonth`: identificação do mês de maior recebimento líquido.
- **Repositório (`incomeRepository.ts`)**:
  - Métodos `listFiltered`, `getById`, `updateIncome` e `deleteIncome`.
  - Suporte completo a proventos com cotas, preço unitário e tipo (`RENDIMENTO`, `DIVIDENDO`, `JCP`).
- **Tela e Experiência (`IncomeHistoryScreen.tsx`)**:
  - Bento layout com `XpMinimalHeader` ("Proventos", "Valor líquido recebido").
  - 4 tiles bento de destaque: Total no período, Média mensal, Rendimento sobre o custo (12m) e Melhor mês.
  - Gráfico de barras nativo em Views com alternância Mensal / Anual, destaque do melhor mês e filtro interativo da lista por toque na barra.
  - Seção "Quem mais pagou" com barras proporcionais e percentual do topo.
  - Lista agrupada com subtotais por mês e linhas ricas com avatar de classe, ativo, data, quantidade × valor unitário.
  - Folha de detalhe com Editar e Excluir (diálogo de confirmação com `ConfirmDialog`).
  - Formulário de cadastro/edição manual de provento e botão de acesso rápido fixo.
  - Estado vazio com atalho para Importação de extrato da B3.
  - Suporte total a Modo Privacidade (`R$ ••••••`) e temas claro/escuro.
  - Integração com `StatisticsScreen`: card-resumo ganha botão "Ver histórico" e o formulário antigo é migrado.
  - Android Back handler com ação `'close-income-history'` em `backNavigation.ts`.

## 6. Design

Ver [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Imagens de inspiração (XP, BTG, Pierre, Investidor10, paletas): `imgsinsp/`.

## 6. Testes e protocolo TDD Lock

- `npm run test:mobile` (Jest), `npm run test:market` (Go), `npx tsc --noEmit` em `apps/mobile`.
- Os arquivos de teste ficam **bloqueados** (somente leitura + SHA-256 em `tests.lock.json`):
  `npm run test:verify` confere, `npm run test:lock` regrava e `node scripts/test-lock.js unlock` libera.
  Edição de testes só com autorização explícita do responsável; depois re-trave e rode `verify`.
- Regras do agente em `.agents/rules/`. Estado atual dos testes em [`TEST_REPORT.md`](../TEST_REPORT.md).
- Testes "live" (`CELSUS_LIVE=1 go test ./... -run Live -v`) consultam o Fundamentus/Yahoo reais e são pulados por padrão.

## 7. Como rodar

```bash
cd apps/mobile && npm install
npm run start            # (raiz) sobe o backend Go + Expo; ou: cd apps/mobile && npx expo start
cd apps/mobile && npx expo run:android   # build de desenvolvimento com a ponte Go embutida
```

No web (`expo start --web`) o SQLite precisa de COOP/COEP + `SharedArrayBuffer`; sem isso use `?memdb=1`
(banco em memória). Variável `EXPO_PUBLIC_MARKET_API_URL` aponta o app para o serviço HTTP.
