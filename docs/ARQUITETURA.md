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

## 4. Design

Ver [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Imagens de inspiração (XP, BTG, Pierre, Investidor10, paletas): `imgsinsp/`.

## 5. Testes e protocolo TDD Lock

- `npm run test:mobile` (Jest), `npm run test:market` (Go), `npx tsc --noEmit` em `apps/mobile`.
- Os arquivos de teste ficam **bloqueados** (somente leitura + SHA-256 em `tests.lock.json`):
  `npm run test:verify` confere, `npm run test:lock` regrava e `node scripts/test-lock.js unlock` libera.
  Edição de testes só com autorização explícita do responsável; depois re-trave e rode `verify`.
- Regras do agente em `.agents/rules/`. Estado atual dos testes em [`TEST_REPORT.md`](../TEST_REPORT.md).
- Testes "live" (`CELSUS_LIVE=1 go test ./... -run Live -v`) consultam o Fundamentus/Yahoo reais e são pulados por padrão.

## 6. Como rodar

```bash
cd apps/mobile && npm install
npm run start            # (raiz) sobe o backend Go + Expo; ou: cd apps/mobile && npx expo start
cd apps/mobile && npx expo run:android   # build de desenvolvimento com a ponte Go embutida
```

No web (`expo start --web`) o SQLite precisa de COOP/COEP + `SharedArrayBuffer`; sem isso use `?memdb=1`
(banco em memória). Variável `EXPO_PUBLIC_MARKET_API_URL` aponta o app para o serviço HTTP.
