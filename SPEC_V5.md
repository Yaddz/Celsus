# SPEC_V5 — Auditoria (Fase 1) + Plano de Correções (Fase 2) + Propostas (Fase 3)

> Gerado em 2026-11-02. **Fase 1 = somente leitura.** Nenhum código/teste foi alterado. Este é o único arquivo criado.
> Convenção: `arquivo:linha` refere-se ao estado do repositório no commit `ef7cf12` (Sprint 35 concluída).
> **Nível de evidência:** achados marcados **[LIDO]** foram confirmados lendo o código; **[HIPÓTESE]** precisam de reprodução em dispositivo/teste antes de serem tratados como fato. Nada foi executado (sem `jest`, sem `go test`, sem device).

---

## 0. Decisões do usuário (2026-11-02) — vinculantes para as Fases 2 e 3

| # | Decisão | Consequência no plano |
|---|---|---|
| Q1 | **Carteira ativa** governa a Home. O **consolidado** (todas as carteiras) fica na página de **Estatísticas**. | Sprint 36: Home = dados da carteira ativa; `StatisticsScreen` passa a exibir o **consolidado** (`consolidatePortfolios` sobre todas as carteiras), **sem** depender da carteira ativa. Isso substitui a ideia de "passar `portfolioId` para Estatísticas". |
| Q2 | **Carga inicial = COTAHIST** (local, SQLite); **Yahoo apenas para consultas específicas** (cotação pontual de um ticker, detalhe de ativo, preenchimento de preço). | Sprint 37: ordem de fontes = **cache SQLite/COTAHIST (carga inicial e histórico) → Yahoo (consulta pontual sob demanda) → BRAPI só se houver token (opcional)**. Fim das varreduras periódicas de todos os tickers no Yahoo; `marketSyncService.syncAllPortfolioTickers` deve usar COTAHIST para a carga e consultar Yahoo só para tickers pedidos/expirados. Resolve D3/D5 a favor desta regra. |
| Q3 | Ativo fora da carteira, resposta "Não" ⇒ **bloqueia a movimentação**. | Sprint 37: "Não" fecha o popup, mantém o formulário sem ativo vinculado e `Salvar` desabilitado. |
| Q4 | Margem lateral global = **16 dp** (`spacing.md`). | Sprint 38: Home passa de 20 para 16. |
| Q5 | A 3ª aba (hoje "Extrato"/`history`) é **substituída por Pesquisa**. | Fase 3 F3-1 passa a ser a tela da 3ª aba; o `dock-tab-history` deixa de ser placeholder. O extrato continua acessível por "Ver tudo" em Movimentações Recentes (`AllTransactionsScreen`). **Supersede** `REFACTORING_SPEC.md` §"Interceptação de Botões em Desenvolvimento" para o 3º ícone (nota adicionada lá). Impacto: `DockTab` (`'history'` → `'search'`), `FloatingBottomDock.tsx:16,39,114`, `App.tsx:953`; testes **bloqueados** que citam `dock-tab-history` podem conflitar ⇒ exige autorização (ver nota abaixo). |
| Q6 | Campos sem fonte (P/VP, liquidez diária, nº de cotistas, risco) são **omitidos**. | F3-1 só exibe campos com fonte (Yahoo/COTAHIST/cálculo local). |
| Q7 | Alvo = **APK** (bridge nativa Go presente). | Motor local é o caminho principal; HTTP `/v1/*` vira fallback de desenvolvimento/desktop. Expo Go **não suportado** para cotações: o app mostra aviso claro em vez de falhar em silêncio. `EXPO_PUBLIC_MARKET_API_URL` mantido apenas para dev. Prompts exigem validar em APK (`scripts/build-gomobile-android.ps1`, `TEST_REPORT.md` "não validado" se não houver device). |
| Q8 | **Menor impacto = ajustar a documentação ao código** (D1, D2), não migrar. | Mantém `walletStore` próprio (`useSyncExternalStore`) e navegação por estado em `App.tsx`; **não** adiciona Zustand nem Expo Router. Docs atualizadas (README, SPEC.md §Estado, REFACTORING_SPEC). Expo Router vira F3-6 (opcional, não agendado). |
| Q9 | **Sim** — ordem proposta Sprints 36 → 37 → 38 → 39, executadas manualmente por você, uma por vez. | Fase 2 roda nas Sprints 36–39; Fase 3 entra a partir da Sprint 40. |
| Q10 | **Sim** — descrever todas as 32 imagens de `imgsinsp/` individualmente. | §2.4 atualizado com a análise individual das 32 imagens (100% inspecionadas). |
| Q11 | **Incluir todos os itens propostos da Fase 3** (F3-1 a F3-9). | Fase 3 organizada em Sprints 40 a 44 (§4 e §6), com prompts autocontidos P40–P44. |
| Q12 | **Sim** — troca da 3ª aba da dock ocorre na Sprint 40 (Fase 3), e não nas Sprints 36–39. | Evita conflito prematuro com testes bloqueados da dock durante a Fase 2. |

> **Atenção testes bloqueados (Q5):** se testes travados referenciarem `history`/"Extrato" na dock, **não editá-los**; parar e pedir autorização (regra TDD Lock) — por isso a troca da aba entra na Fase 3 (Sprint 40), não nas Sprints 36–39.

---

## 1. Resumo executivo

| Item | Causa raiz (resumo) | Sev. |
|---|---|---|
| **A. Troca de carteira** | O gesto do baralho nunca chama `cycleNext/cyclePrev` em runtime real: `onResponderRelease={handleRelease}` (`StackedWalletDeck.tsx:556`) **sobrescreve** o release do `PanResponder` e `handleRelease` recebe `dy = 0`; além disso o `PanResponder` é criado uma única vez (`:353`) com *closure* obsoleta (`items=[]` do 1º render). Mesmo corrigindo o gesto, a Home exibe **dados consolidados de todas as carteiras** (`App.tsx:202-292`), não da carteira ativa. | Crítico |
| **B. Preço da cota** | Integração Yahoo **existe** no Go (`internal/yahoo/client.go`), mas o app lê `q.price \|\| q.close_price` (`TransactionScreen.tsx:162`) enquanto `MarketQuote` expõe `currentPrice` → string vazia → **nunca preenche**. Base URL fixa `http://localhost:8080` (`marketApi.ts:65,76`) e `Expo Go` não carrega o módulo nativo → sem rede para o motor. Falhas são engolidas em silêncio. Campo de ativo só aceita ativos já na carteira. | Crítico |
| **C. Layout** | Home usa `paddingHorizontal: 20` (`App.tsx:1025`) com header **dentro** do `ScrollView`; demais telas usam 16 com header **fora**. Botão excluir: `paddingVertical:6`, fonte 11, sem largura (`PortfolioManagementScreen.tsx:2249-2268`). `App.tsx` repete o mesmo bloco `SafeAreaView` 8× e o `FloatingBottomDock` 6×. | Alto |
| **Outros** | Home calcula patrimônio com preço médio (nunca cotação) → rentabilidade sempre 0; detalhe de movimentação mostra dados errados após refresh; vazamento de valores no modo privacidade; hack `new Function` + `util.inspect`; erros engolidos; backend sem `singleflight` e responde 200 vazio em falha. | Alto/Médio |

**Divergências:** todas decididas em §0 (Zustand/Expo Router → docs ajustadas ao código; 3ª aba → Pesquisa; provedor → COTAHIST inicial + Yahoo pontual; Home por carteira ativa, consolidado em Estatísticas).

---

## 2. Relatório da Fase 1

### 2.1 Bugs explícitos

| # | Sev. | Local | Descrição / causa provável | Evid. |
|---|---|---|---|---|
| B1 | **Crítico** | `StackedWalletDeck.tsx:555-556` | `{...panResponder.panHandlers}` seguido de `onResponderRelease={handleRelease}`: a prop posterior substitui o handler de release do PanResponder. `handleRelease(e)` recebe só o evento de toque → `dy = e?.gestureState?.dy ?? e?.nativeEvent?.translationY ?? 0` (`:334`) = 0 → sempre cai no ramo `Animated.spring` de volta. Explica "movimento visual OK, carteira não muda". | LIDO |
| B2 | **Crítico** | `StackedWalletDeck.tsx:353-363` | `PanResponder.create` dentro de `useRef(...).current`: capturado no 1º render. Em `App.tsx:185` `walletsList=[]` no 1º render ⇒ `items=[]` ⇒ `handleRelease` obsoleto executa `items.length <= 1` e retorna. Closures de `cardHeight`/`items`/`onPortfolioChange` nunca atualizam. | LIDO |
| B3 | **Alto** | `StackedWalletDeck.tsx:292-322` vs `:439-447` | `cycleNext/cyclePrev` chamam `onPortfolioChange` **inclusive para o card "Nova Carteira"** (`__add_wallet_card__`); `selectIndex` tem guarda, ciclo não. Na Home (`App.tsx:860-863`) não há guarda ⇒ `activeWalletIndex` = índice do card fantasma, `walletStore.activePortfolioId = '__add_wallet_card__'`; `allPortfolios[idx]` → `undefined` → *fallback* para a 1ª carteira (`App.tsx:295,364`). Na tela de carteira há guarda (`PortfolioManagementScreen.tsx:678`). | LIDO |
| B4 | **Crítico** | `App.tsx:202-292`, `:393`, `:774` | Totais, alocação, gráficos e `StatisticsScreen` não dependem da carteira ativa (`consolidatePortfolios(inputs)` sobre todas; `StatisticsScreen` não recebe wallet). Só `portfolioAssets` e `transactionsList` reagem a `activeWalletIndex` (`:360-391`). **Mesmo com o gesto corrigido, "dados continuam os mesmos".** Quando `walletsList.length === 1` o saldo do deck é sobrescrito pelo consolidado (`:856-857`). | LIDO |
| B5 | **Crítico** | `TransactionScreen.tsx:162` | `price = String(q.price \|\| q.close_price \|\| '')`, mas `MarketQuote` (`marketApi.ts:12-19`) tem `currentPrice`. `''` → `parseFloat('')` NaN → mensagem "Cotação não encontrada". Cotação **de hoje** nunca preenche. | LIDO |
| B6 | **Alto** | `TransactionScreen.tsx:154` | `new Date().toISOString().slice(0,10)` é data **UTC**; após 21h (UTC-3) "hoje" vira amanhã → ramo histórico → `null`. | LIDO |
| B7 | **Alto** | `marketApi.ts:65,76,106,165,327` | Base URL padrão `http://localhost:8080` sem `EXPO_PUBLIC_*`/config: em celular físico/Expo Go aponta para o próprio aparelho. `CelsusMarketModule` é `null` no Expo Go (`modules/celsus-market/index.ts:13-17`) → cai no HTTP quebrado. A screenshot `imgsinsp/Screenshot_20261031_234620_Expo Go.*` indica uso em Expo Go. | LIDO (causa provável do "nada acontece") |
| B8 | **Médio** | `marketApi.ts:132-147` | Com bridge nativa, falha em `getHistoricalPrice` retorna `null` e **não** tenta HTTP (`return null` no fim do bloco). Erros sem log/telemetria local. | LIDO |
| B9 | **Alto** | `handlers.go:93-150` | `/v1/quotes`: erros do provedor ignorados (`if err == nil`); responde **200 com `quotes:{}`** — app não distingue "ticker inexistente" de "Yahoo caiu/429". Sem campo `source`. | LIDO |
| B10 | **Médio** | `handlers.go:153-200` | `/v1/history` consulta só o COTAHIST local; sem fallback Yahoo (a bridge faz, o HTTP não) ⇒ comportamento divergente entre os dois canais. | LIDO |
| B11 | **Médio** | `yahoo/client.go:196-300` | `FetchQuotes` chama `ToYahooSymbol(tkr, "")` sem `assetClass`: cripto fora da lista fixa (`isKnownCryptoTicker`, 13 moedas) vira `XXX.SA`. Sem `singleflight` (grep vazio), sem backoff/cache negativo em 429, sem tratamento de cookie/crumb. | LIDO |
| B12 | **Alto** | `App.tsx:219` | `currentPrice: a.manual_price_override \|\| a.average_price` — o patrimônio nunca usa cotação de mercado (cache `market_price_cache`); rentabilidade da Home/Classe fica 0. `App.tsx:617-619` hardcode `'+0,00%'`, `'R$ 0,00'`, `currentPrice = avgNum`. | LIDO |
| B13 | **Alto** | `App.tsx:133-158` vs `:303-320` | `getInitialTransactions` inclui `unitPrice/quantity/fees`; `refreshAppData` e o efeito (`:370-382`) **descartam** esses campos. Detalhe (`:514-516`) cai em `unitPrice = amountText`, `quantity='1'`, `fees='R$ 0,00'` → dados errados na tela de detalhe após o 1º refresh. | LIDO |
| B14 | **Médio** | `App.tsx:513-516` | Modo privacidade: `investedAmount` mascarado, mas `unitPrice`, `quantity`, `fees` e `portfolioName` não → vazamento (viola regra `[REDACTED]`). | LIDO |
| B15 | **Médio** | `App.tsx:91-131` | `extractSyncResolvedValue` lê estado de Promise via `util.inspect` + `new Function(...)`: frágil, depende de `globalThis.__node_util__`, avalia string como código. | LIDO |
| B16 | **Médio** | `App.tsx:324-326, 388` | `catch {}` vazios em `refreshAppData` e `updateActiveWalletData`; sem estado de erro nem log. Além disso, quando não há carteira (`activePortId` indefinido) o efeito `:360-391` **não limpa** `portfolioAssets/transactionsList` (dados fantasmas após excluir a última carteira). | LIDO |
| B17 | **Médio** | `App.tsx:187-194` e `walletStore.ts:32-38` | Subscrição re-criada a cada mudança de índice; `reset()` limpa **todos** os listeners (quebra assinantes ativos). Três fontes de verdade para a carteira ativa: `useState` do App, `walletStore`, estado local da `PortfolioManagementScreen` (`:127`) e `currentIndex` do deck. | LIDO |
| B18 | **Médio** | `App.tsx:340` | "Health check" usa `fetchQuotes(['PETR4'])` fixo; `isOffline` reflete falha desse ticker, não do motor. Cache TTL de 15 min pode mascarar offline. | LIDO |
| B19 | **Médio** | `PortfolioManagementScreen.tsx:645-660` | Deck usa `profitText: '0,0% no ano'` fixo e `balance` de `portfolioBalances` próprio; ordem/filtro de carteiras (`getAllPortfolios` na tela vs `listPortfolios(false)` no App) pode divergir ⇒ índices diferentes entre Home e Carteiras. | HIPÓTESE (ler repositórios) |
| B20 | **Médio** | `App.tsx:509` | Nome do ativo hardcoded: `'PETR4' → 'Petróleo Brasileiro S.A.'`, demais `"X Ativo"`. | LIDO |

### 2.2 Pontos de melhoria

**Arquitetura / duplicação**
- `App.tsx` (1110 linhas) repete **8×** o mesmo `SafeAreaView` (`:399, 429, 459, 493, 552, 625, 706, 762, 797`) e **6×** o `FloatingBottomDock` com os mesmos 5 callbacks → extrair `ScreenContainer` + `AppShell`. (Alto)
- Navegação por `if (...) return` encadeados desmonta a Home a cada modal (perde scroll e estado). `apps/mobile/AGENTS.md` prescreve Expo Router em `src/app/` — não existe. (Alto – decisão pendente §3.1)
- Telas gigantes: `PortfolioManagementScreen` 2657 linhas, `SettingsBackupScreen` 1084, `ClassDetailScreen` 846, `StackedWalletDeck` 840. (Médio)
- `WalletCardFace.getCardColor` duplicado em `StackedWalletDeck.tsx:72` e `:428`. (Baixo)
- Dinheiro em `parseFloat`/`toLocaleString` (`App.tsx:230-241, 605-617`) enquanto o domínio usa `Decimal`. (Médio)
- Tipagem `any` generalizada em `App.tsx` (`portfolioAssets: any[]`, `as any`). (Médio)

**Desempenho**
- `walletsList.map(...)` recria o array de props do deck a cada render (`App.tsx:854-858`); sem `useMemo`. (Baixo)
- N+1 queries em `refreshAppData` (por carteira: ativos + metas; por transação: `getAssetById`) — usar JOIN/consulta em lote. (Médio)
- `refreshAppData` chamado em cascata (onClose + onTransactionSuccess + sync). Sem *debounce*/cancelamento. (Médio)

**Acessibilidade**
- Deck: textos "fantasma" com `opacity: 0.001` / `0.01` (`StackedWalletDeck.tsx:233-251`) criados para os testes, mas lidos duas vezes por leitores de tela. (Médio)
- Pills de carteira da Home são pontos de 6×6 dp (`App.tsx:1100-1105`) — alvo de toque ≪ 44 dp. (Médio)
- Botão excluir 11 sp, `paddingVertical 6` ⇒ alvo ≈ 30 dp. (Médio)
- Gesto vertical sem alternativa acessível no deck (as pills são a alternativa, mas minúsculas). (Médio)
- [HIPÓTESE] `accessibilityLabel`/`role` ausentes em vários `TouchableOpacity` das telas grandes — varrer com lint a11y na Sprint 39.

**Tratamento de erros**
- Catches vazios (B16), mensagens de falha de cotação genéricas (`TransactionScreen.tsx:178-185`), backend com 200 vazio (B9).

**Consistência com DESIGN_SYSTEM.md** [HIPÓTESE parcial — não reli todo o documento linha a linha contra cada tela]
- Cores hardcoded fora de `src/theme/tokens.ts`/`palettes.ts`: `#E05252`, `#FDECEC`, `#C92A2A` (excluir), `#1E2023`, `#191B1D`, `#25282B` (deck/notch), `#2A1F1D/#593B33/#D4A373` (banner offline, `App.tsx:1001-1011`), `#DB5A42` (`App.tsx:620`), `#3A3D42/#D1CCC0` (drag handle). Mover para tokens semânticos (`danger`, `surfaceMuted`...).
- Espaçamentos mágicos (`padding: 16`, `marginTop: 24`, `gap: 6`) em vez de `spacing.*`.
- Máscara de privacidade: deck usa literais `'R$ ••••••'`/`'••••••'` (`StackedWalletDeck.tsx:85,88,403`; `PortfolioManagementScreen.tsx:648,654`) enquanto o app define `PRIVACY_*_MASK` em `privacyAndAuth.ts` → centralizar.

**Backend Go**
- Sem `singleflight`: N requisições simultâneas ao mesmo ticker disparam N chamadas Yahoo. Cache em memória por `map` com `RWMutex` apenas. (Alto p/ B)
- Sem rate-limit/backoff/cache negativo; `User-Agent` fixo de navegador (risco de bloqueio/ToS).
- `handleQuotes`: `ticker` bruto vindo da query não é validado (regex `^[A-Z0-9.\-]{1,12}$` recomendada), sem limite de quantidade de tickers (DoS/abuso do proxy). (Médio)
- `main.go`: escolhe BRAPI **se houver token**, senão Yahoo (documentado como o inverso). (Médio – divergência)
- Binário `services/market-api/bin/market-api` e `market.db-wal` versionados/presentes no working tree apesar de `.gitignore` (verificar com `git ls-files`). (Baixo)

### 2.3 Divergências documentação × código

| # | Doc | Diz | Código | Sev. |
|---|---|---|---|---|
| D1 | `SPEC.md:90`, `README.md:114` | Estado global com **Zustand** + TanStack Query | `walletStore.ts` é store caseiro com `useSyncExternalStore`; `package.json` do mobile **não** lista `zustand` (conferido por `grep`, sem ocorrência no trecho lido) | Médio |
| D2 | `apps/mobile/AGENTS.md` | Expo Router em `src/app/` | Nenhuma rota; navegação por estado em `App.tsx` | Alto |
| D3 | `README.md:25` | Mercado = COTAHIST + **BRAPI** | `SPEC_V3.md` e `bridge.go` usam **Yahoo**; `main.go` HTTP usa BRAPI se houver token | Alto |
| D4 | `SPEC_V3.md:5` | Sem servidor externo; motor Go embarcado (gomobile) | Há fallback HTTP `localhost:8080` e Expo Go não tem a bridge; o fluxo "real" só funciona em *dev build/APK* | Alto |
| D5 | `SPEC_V3.md:11` | `COTAHIST` > `YAHOO` por `(ticker,date)` | `/v1/history` HTTP nunca consulta Yahoo; bridge sim — precedência só existe em um canal | Médio |
| D6 | `REFACTORING_SPEC.md:115` | 3º ícone da dock (`dock-tab-history`) = placeholder "em desenvolvimento" | Implementado; **conflita** com o pedido de tela de Busca na 3ª aba (`FloatingBottomDock.tsx:16,39`, `App.tsx:953`). Dock chama a 3ª aba "Extrato" (`receipt-long`) | Médio — **decisão sua** |
| D7 | `REFACTORING_SPEC.md:53` | Todas as telas usam `XpMinimalHeader` padronizado | Usam o componente, porém com composições diferentes (Home: avatar+olho+globo, dentro do scroll; demais: título/voltar, fora do scroll) | Alto |
| D8 | `.agents/rules/tdd-lock.md` | Scripts PowerShell | Ambiente Linux; existe `scripts/test-lock.js` (equivalente Node). Flags a confirmar | Médio |
| D9 | `tests.lock.json` | — | 55 arquivos de teste ⇔ 55 hashes (**consistente**, conferido por contagem) | OK |
| D10 | `TEST_REPORT.md:328-332` | Testes `FAIL` | São registros da *Red phase* históricos; resumo final: Go 25/25 PASS (`:2414`). Sem FAIL residual identificado | Baixo |
| D11 | `SPEC_V3` §Yahoo | Proxy com cache TTL 15 min | Existe; **sem** `singleflight` como o seu pedido de requisito sugere | Médio |

### 2.4 Análise das imagens (`imgsinsp/` — 32/32 inspecionadas individualmente)

#### A. Paletas Disco Elysium (`*.webp` — 3 arquivos)
| Arquivo | O que mostra | Padrões extraídos |
|---|---|---|
| `disco-elysium-colors-charts-v0-a7v6mgkbkec81.webp` | Cena isométrica noturna no porto (containers avermelhados sob holofotes) + faixa inferior com 8 amostras de cor (`#1A1826`, `#453D4F`, `#F2E8B6`, `#EFC574`, `#D9514A`, `#4C2024`, `#5A3A1B`, `#3A3F38`). | Base da paleta *Bureaucratic Brutalism* do `DESIGN_SYSTEM.md`: fundos ardósia/carvão, creme pergaminho, ocre dourado, vermelho-ferrugem e verde-musgo oxidado. |
| `disco-elysium-colors-charts-v0-lhhbfdkbkec81.webp` | Cena isométrica industrial com iluminação amarela intensa no piso + paleta de 8 cores: marrom-escuro (`#261D1A`), ocre-terra (`#6E4F28`), laranja-âmbar (`#F0A03C`), amarelo-ácido (`#EDE24A`), creme-quente (`#F2D8A7`), azul-gelo pálido (`#D3DFF2`), roxo-acinzentado (`#594F59`), carbono-noite (`#1C1926`). | Referência para acentos secundários (âmbar/ouro para alertas/badges e azul-gelo para linhas comparativas de benchmark). |
| `disco-elysium-colors-charts-v0-z1bl1dkbkec81.webp` | Cena externa na neve/lama (tribunal mercenário) com disparo luminoso + paleta de 8 cores: carvão (`#222426`), azul-aço (`#49525E`), taupe-pedra (`#8C877A`), pergaminho claro (`#DDD7C6`), amarelo-mostarda (`#F0BD22`), terracota/ferrugem (`#A84824`), verde-oliva (`#70733E`), verde-pântano (`#525947`). | Referência direta para o modo claro (`#DDD7C6` / `#8C877A`) e para as cores de classes de ativos (terracota, mostarda, oliva, aço). |

#### C. Pierre (3 arquivos)
| Arquivo | O que mostra | Padrões extraídos |
|---|---|---|
| `Screenshot_20261026_200644_Pierre.jpg` | Home escura com aura gradiente no topo, avatar + olho + badge "Pierre Pro", chips `Contas / Cartão / Investimentos`, saudação, card `+ Conectar bancos`, `Saldo em contas R$ 2.827,73` com barra de proporção roxa e lista de instituições, card comparativo com gráfico de linha/área (`CDB Pierre` verde-limão vs `dinheiro parado` tracejado), cards `Seus agentes` e `Gastos do mês`, barra inferior com input `"Pergunte ao Pierre"`. | Micrográfico comparativo direto (carteira vs benchmark tracejado); barra horizontal de participação por conta/carteira. |
| `Screenshot_20261026_200657_Pierre.jpg` | Continuação do scroll da Home Pierre: header compacto fixo, grid 2×2 de widgets (`Fluxo de caixa` com barra verde, `Limite usado` com donut, `Parcelamentos`, `Fatura Atual`), lista `Transações recentes` (ícone circular, título em caixa alta, data + subtítulo truncado, valor em verde à direita), botão pílula central `+ Adicionar widgets`. | Layout da lista de transações recentes (muito próximo ao `RecentTransactionsCard` do Celsus) e grid modular 2×2 para métricas rápidas. |
| `Screenshot_20261026_200856_Pierre.jpg` | Tela interna `Saldo em 2 contas`: header com botão voltar circular (esquerda) e olho circular (direita); valor grande `R$ 2.827,73`; barra horizontal azul; lista de contas com percentual (`100%`, `0%`) e saldo; botão full-width `Adicionar conta`; seção `Últimos lançamentos` com empty state (`Não há lançamentos`). | **Header simétrico** (voltar circular 40 dp + ação circular 40 dp), CTA secundário de **largura útil total** e empty state discreto em container arredondado. |

#### D. BTG Investimentos (10 arquivos)
| Arquivo | O que mostra | Padrões extraídos |
|---|---|---|
| `Screenshot_20261031_183247_BTG Investimentos.jpg` | Home "Investimentos" (topo verde): avatar `PL` + saudação, sino e lupa; `Patrimônio R$ 3.141,52` + olho, variação 12m, linhas `Conta investimento`, `Total investido`, `Lançamentos Futuros`; botão `Ir para portfólio` + dots de carrossel; barra de ações (`Investir`, `Transferir`, `Resgatar`); card informativo azul; abas `Alocação / Performance / Evolução patrimonial`; FAB `Menu`. | Resumo executivo no hero (Patrimônio + Total investido + Saldo em trânsito) e navegação analítica em 3 abas. |
| `Screenshot_20261031_183253_BTG Investimentos.jpg` | Aba `Alocação` — filtro `Visão por: Mercado ▾`: gráfico **semi-donut (arco 180°)** azul/amarelo; lista com barra vertical colorida à esquerda (`Renda Variável 87,32% / R$ 2.743,16 / -R$ 64,20 (-2,27%) nos últimos 12 meses` e `Conta Investimento 12,68%`); rodapé `"Dados consolidados em 31/10/2026"` e card `Agregador de contas`. | Semi-donut + linhas de classe com **barra lateral da cor da fatia**, valor, `%` e rentabilidade em R$ e `%`; carimbo explícito da data de consolidação. |
| `Screenshot_20261031_183301_BTG Investimentos.jpg` | Aba `Evolução patrimonial` (parte superior): `"Seu patrimônio em 30/09/2026 foi de R$ 700,25"`, seletor `Ano 2026 ▾` com gráfico de barras mensais (`J..D`), seletor `Mês Setembro ▾` com gráfico de linha/área diário (`01/set..30/set`). | Dupla visão temporal na evolução patrimonial: **barras mensais no ano + curva diária no mês selecionado**. |
| `Screenshot_20261031_183311_BTG Investimentos.jpg` | Aba `Evolução patrimonial` (parte inferior): tabela de decomposição mensal (`Patrimônio em 01/09/2026: R$ 700,03`, `Entradas/Saídas: R$ 0,00`, `Rendimentos: R$ 0,22`, `Impostos: R$ 0,00`, `Patrimônio em 30/09/2026: R$ 700,25`). | **Decomposição contábil do período** (Saldo inicial + Aportes/Retiradas + Rendimentos = Saldo final) — excelente insumo para F3-4 na `StatisticsScreen`. |
| `Screenshot_20261031_183314_BTG Investimentos.jpg` | Tela `Lançamentos Futuros` (`0 operações agendadas`) + extrato histórico agrupado por data (`quinta-feira 29/out`, `quarta-feira 28/out`, `segunda-feira 26/out`) com ícones circulares verdes (`TED`, `$↓`, `$↑`), descrição, valor e conta. | Agrupamento de extrato por cabeçalho de data por extenso. |
| `Screenshot_20261031_183328_BTG Investimentos.jpg` | Aba `Alocação` — filtro `Visão por: Estratégia ▾`: mesmo semi-donut agora reclassificado em `Alternativo (47,69%)`, `Renda Variável (39,63%)`, `Conta Investimento (12,68%)`. | Seletor de dimensão de agrupamento sobre o mesmo componente de gráfico/lista. |
| `Screenshot_20261031_183334_BTG Investimentos.jpg` | Aba `Alocação` — filtro `Visão por: Liquidez ▾`: semi-donut por prazo de resgate (`De 0 a 1 dias: 12,68%`, `De 2 a 5 dias: 87,32%`). | Mesma estrutura visual reaproveitada para outra faceta da carteira. |
| `Screenshot_20261031_183345_BTG Investimentos.jpg` | Detalhe da classe `Renda Variável`: header verde com saldo `R$ 2.743,16` e variação 12m; seletores `Período: 12 meses ▾` e `Benchmark: CDI ▾`; gráfico de linha comparando `Carteira` (linha contínua verde) vs `CDI` (linha tracejada cinza); banner `Ver proventos ›`; sub-abas `Ações / Fundos listados`. | **Gráfico Carteira vs Benchmark (CDI/IPCA)** com seletor de período e de índice (base direta para F3-4). |
| `Screenshot_20261031_183352_BTG Investimentos.jpg` | Sub-aba `Ações` (`Ordenar por: Nenhum ▾`): cards de ativos (`ALUP11` R$ 31,50 `+1,23%`, `BBDC4` R$ 13,86 `-11,34%`) com logo circular, ticker, nome/tipo, cotação e variação no topo, e linhas divisórias para `Saldo bruto`, `Quantidade`, `Preço médio`, `Proventos da posição`, `Resultado com proventos`, link `Mais detalhes ›`. | Card de posição de ação completo: separa cotação do dia (topo) dos dados da posição do investidor (linhas chave-valor). |
| `Screenshot_20261031_183400_BTG Investimentos.jpg` | Sub-aba `Fundos listados`: cards de FIIs (`BTLG11` R$ 98,10 `-1,72%`, `HGLG11` R$ 149,47 `-0,82%`) com avatar de iniciais (`BT`, `HG`), `Categoria: Fii`, `Saldo bruto`, `Quantidade`, `Preço médio`, `Proventos da posição`, `Resultado com proventos`. | Avatar com 2 letras do ticker quando não há logo (totalmente alinhado ao local-first, sem depender de CDN externo). |

#### E. XP Investimentos (3 arquivos)
| Arquivo | O que mostra | Padrões extraídos |
|---|---|---|
| `Screenshot_20261031_183437_XP Investimentos.jpg` | Tela `Fundos Listados` (tema escuro): header com botão voltar circular à esquerda e 2 botões circulares à direita; resumo com mini-donut amarelo `96%` + `Total investido • Atualizado em 31/10/2026 / R$ 5.599,23`; card `MXRF11` com badge `Risco Médio 17`, linhas `Saldo`, `Preço atual`, `Preço médio`, `Proventos acumulados (▲ R$ 1.093,92)`, `Rentabilidade (12M) (▲ 7,53%)`, `Resgate (A mercado)` e 2 botões largos `Resgatar` / `Investir` (50%/50%). | Inspirou a `ClassDetailScreen` do Celsus; mostra botões de ação ocupando 100% da largura útil do card. |
| `Screenshot_20261031_183447_XP Investimentos.jpg` | Home `Patrimônio` XP (tema escuro): **header minimalista** (avatar circular `PL` com badge + `"Pedro"` à esquerda; botões circulares de lupa e olho à direita); `Meu Patrimônio R$ 5.807,10` + seletor `BRL ▾` + cotação do dólar; chips `Filtrar ▾` e `Últimos 12 meses ▾`; gráfico de barras verticais estilo pílula (`N..O`); lista `100% Nacional XP / 0% Global XP / 0% Open Finance`; link amarelo `"Quando esses valores foram atualizados?"`; navbar inferior de 5 ícones. | **Origem exata do `XpMinimalHeader`** do Celsus e do link/indicador de frescor dos dados (F3-5). |
| `Screenshot_20261031_234532_XP Investimentos.jpg` | Tela de Perfil/Configurações XP: header com voltar circular + ações circulares; bloco de identificação (`PL`, `Digital | Pedro`); listas agrupadas em cards escuros com ícone à esquerda e chevron à direita (`Mais informações`, `Personalização` com switch `Modo Bolsa` e `Aparência`, `Minha conta`, `Gestão financeira`); botão full-width `Sair do app` no rodapé + versão do app. | Inspirou a `SettingsBackupScreen`; **botão de ação final ocupando 100% da largura útil no rodapé** (referência direta para o botão `Excluir Carteira` do item C). |

#### F. Investidor10 — pasta `imgsinsp/gerenciador de carteira/` (11 arquivos)
| Arquivo | O que mostra | Padrões extraídos |
|---|---|---|
| `Screenshot_20261101_211703_Investidor10.jpg` | Home do Investidor10 com modal `Biometria ("Deseja ativar a biometria? Sim / Não")`: saudação, card de carteira (`Carteira 1 ▾`, olho, `0 ativos | R$ 0,00 | 0.00%`), card `Rankings`, card `Agenda de Dividendos`, banner PRO, navbar inferior (`Home`, `Carteira`, `Busca`, `Ranking`, `Menu`). | **3ª aba da navbar é `Busca` (lupa)**; seletor rápido de carteira em dropdown (`Carteira 1 ▾` → F3-3). |
| `Screenshot_20261101_211741_Investidor10.jpg` | Detalhe do FII `KNCR11`: header com voltar + ícone de prédio + `KNCR11 Kinea Rendimentos Imobiliári...` + coração (favorito); pills `Visão Geral / Indicadores / Proventos / Comparadores`; grade 2×3 de indicadores (`Cotação R$ 104,98`, `Variação (12 meses) 14,28% ▲`, `KNCR11 DY (12M) 14,32%`, `KNCR11 P/VP 1,02`, `Liquidez Diária 29M`, `Número de cotistas 593.704`); segmented control `Cotação ajustada | Cotação padrão`; chips de período `7 D / 30 D / 6 M / 1 A / 5 A / 10 A`; gráfico de área bege; card `"Se você tivesse investido R$ 100,00 há 1 ano, hoje você teria..."`. | **Template principal da tela de detalhe da Pesquisa (F3-1)** e do botão de favorito/watchlist (coração no header → F3-7). P/VP, Liquidez e Cotistas serão omitidos conforme Q6. |
| `Screenshot_20261101_211750_Investidor10.jpg` | Mesma tela de detalhe do `KNCR11` em captura estendida (scroll longo): inclui tudo da `211741` e revela abaixo do card de R$ 100 um card `Rentabilidade ▾` com grade 3×2 de retornos por janela (`1 Mês -0,50%`, `3 Mês +1,17%`, `1 ano +11,50%`, `2 Anos +31,25%`, `5 Anos +101,06%`, `10 Anos +134,89%`). | **Grade de retornos multi-período (1M, 3M, 1A, 2A, 5A)** calculável localmente a partir do histórico de preços na tela do ativo (F3-1). |
| `Screenshot_20261101_211802_Investidor10.jpg` | Tela de Ranking `Valor Patrimonial`: filtros `Todos os setores ▾` e `Filtros e Colunas ▾`; tabela ordenável (`Ativo ⇅`, `Patrimônio Líquido ⇅`, `P/VP ⇅`) listando ~25 FIIs; paginação `Anterior | 1 | Próximo`; carrossel `Confira mais Rankings`. | Padrão de tabela compacta com cabeçalho ordenável. |
| `Screenshot_20261101_211821_Investidor10.jpg` | **Tela inicial da aba `Busca`** (`Buscar ativos ou empresas`): header com botão voltar + input de busca arredondado com ícone de lupa; chips horizontais de filtro por classe (`Ações`, `FIIs`, `Stocks`, `BDRs`, `Cripto`); seção `"Os mais buscados:"` listando ativos com avatar/logo, `TICKER - NOME`, preço atual, badge pill de variação (`20,01% ▲`, `12,50% ▼`) e rótulo `(12 meses)`. | **Layout exato do estado inicial da 3ª aba `Pesquisa` (F3-1)**: input de busca no topo + chips de filtro por classe (`Todos`, `Ações`, `FIIs`, `Cripto`) + lista de ativos (do catálogo local / carteira / favoritos) com cotação e variação. |
| `Screenshot_20261101_211832_Investidor10.jpg` | Aba `Menu` (`MINHA CONTA` + `FERRAMENTAS` + `MAIS OPÇÕES`): lista vertical limpa com ícone à esquerda, título e chevron (`Minha Carteira`, `Buscar Ativos`, `Favoritos`, `Últimas Notícias`, `Agenda de Dividendos`, `Calculadoras`, `Configurações de Conta`, etc.). | Confirma `Favoritos` (F3-7) e `Agenda de Dividendos` (F3-2) como ferramentas de 1º nível. |
| `Screenshot_20261101_211857_Investidor10.jpg` | Tela `Agenda de Dividendos`: chips de classe (`Ações`, `FIIs`, `Stocks`, `BDRs`); segmented control `Data Com | Data Pagamento` + botão de busca; seletor de mês (`‹ Novembro 2026 ›`); lista de eventos com logo, ticker (`BBDC4`, `BEES4`, `CXSE3`...), colunas `Data Com`, `Pgto` e tipo (`JSCP` / `Dividendos`) com valor unitário em verde (`R$ 0,02`, `R$ 0,35`). | **Referência direta para a Agenda de Proventos (F3-2)**: filtro por classe, seletor mensal e lista com data-base e valor por cota. |
| `Screenshot_20261101_211927_Investidor10.jpg` | Tela da Carteira (`teste ▾`) com bottom-sheet modal **`Porcentagem ideal por tipo de ativo`**: card escuro de patrimônio ao fundo; sheet branca com linhas por classe (`Ações`, `ETFs`, `FIIs`, `Tesouro Direto`), botões `−` e `+` ladeando o input `25%` + ícone de lixeira, link `+ Adicionar tipo de ativo`, barra de validação verde `✔ Distribuição total dos ativos: 100%`, rodapé com `Cancelar` e botão `Salvar`. | Já espelhado no modal de metas do Celsus; valida o padrão de rodapé com indicador de soma = 100%. |
| `Screenshot_20261101_215215_Investidor10.jpg` | Final da Home do Investidor10: card de notícias + card `Meus recursos` (`Busca de Ativos`, `Minha Carteira`, `Últimas Notícias`, `Rankings`, `Agenda de Dividendos`, `Carteiras Recomendadas`, `Calculadoras`, `Guia do Iniciante`). | Lista de atalhos com ícones circulares em tom ocre/dourado. |
| `Screenshot_20261101_215717_Investidor10.jpg` | **Tela `Adicionar ativo` (formulário de movimentação)**: toggle segmentado `Compra` (verde) / `Venda` (vermelho); dropdown `Tipo de ativo` (`Ações`); campo `Ativo` (`PETR4 - Petrobras`) com hint vermelho `"Selecione um ativo"`; linha dupla `Data de compra (01/11/2026)` e `Quantidade (10)`; linha dupla `Preço em R$ (52,71)` e `Outros custos (0,00)`; faixa cinza `Valor total: R$ 527,10`; botão full-width escuro `+ Adicionar ativo`. | **Referência direta para a `TransactionScreen` (Item B / Sprint 37)**: seleção/busca de ativo validada (sem ativo selecionado exibe erro e bloqueia envio — Q3), autopreenchimento do `Preço em R$`, cálculo em tempo real do `Valor total` e CTA de largura total. |
| `Screenshot_20261101_215750_Investidor10.jpg` | Página da carteira (`teste ▾` + botão `+`): abas `Resumo / Proventos / Rentabilidade`; cabeçalho `Meus ativos (1)` + botão `+ Adicionar ativo`; cards por classe (`Ações (1)`, `FIIs (0)`, `ETFs Nacionais (0)`, `Tesouro Direto (0)`) com 4 colunas (`Valor total`, `Rentabilidade`, `Variação`, `% na Carteira: 100% / 25%`). | Mostra a relação `% atual / % meta` lado a lado e o seletor rápido de carteira no topo (`teste ▾` → F3-3). |

**Padrões funcionais consolidados (das 32 imagens):**
1. **3ª aba = Pesquisa (`211821`, `211741`, `211750`):** tela inicial com barra de busca + chips de classe (`Ações`, `FIIs`, `Cripto`) + lista de ativos com preço e variação; tela de detalhe com favorito (coração), grade de indicadores disponíveis, toggle `Cotação ajustada | Cotação padrão` (`adj_close` vs `close`), períodos `7D..5A`, simulação de `R$ 100` e grade de retornos por janela (`1M, 3M, 1A, 2A, 5A`).
2. **Formulário de movimentação (`215717`):** `Compra/Venda`, busca de ativo obrigatória (bloqueia submissão se não vinculado — Q3), data + quantidade + preço unitário autopreenchido + taxas + `Valor total` calculado e botão full-width.
3. **Estatísticas consolidadas (`183253`, `183301`, `183311`, `183345`):** evolução mensal/diária, tabela de decomposição do período (Patrimônio inicial, Entradas/Saídas, Rendimentos, Patrimônio final) e gráfico comparativo Carteira vs CDI/IPCA.
4. **Agenda de Proventos (`211857`):** filtro por classe, navegação por mês e lista de eventos com data-com e valor por cota.
5. **Seletor rápido de carteira (`211703`, `215750`)** + **indicador de atualização/fonte (`183447`, `183253`)** + **CTAs de largura útil total (`183437`, `234532`, `200856`, `215717`)**.

**Conflitos com `DESIGN_SYSTEM.md`:** as inspirações usam fundos brancos puros/verdes saturados; no Celsus preserva-se integralmente a paleta *Bureaucratic Brutalism* extraída das 3 imagens `.webp` de Disco Elysium (`tokens.ts`/`palettes.ts`), adotando das screenshots de corretoras/Investidor10 **apenas a arquitetura de informação, hierarquia e espaçamento (16 dp)**.

### 2.5 Itens A, B, C — investigação detalhada

#### A. Troca de carteira pelo baralho
Fluxo real: `PanResponder` → `onPanResponderRelease` (**anulado por `:556`**) → `handleRelease` → `cycleNext/cyclePrev` → `onPortfolioChange(idx,item)` → Home: `setActiveWalletIndex` + `walletStore.setActiveIndex` → efeito `updateActiveWalletData` (`App.tsx:360`) recarrega **apenas** ativos/transações.
- Home **e** tela da carteira usam o mesmo `StackedWalletDeck` ⇒ **B1/B2 ocorrem nas duas**. Na tela da carteira o conteúdo (ativos, excluir) usa `activePortfolioId` local, então a mudança por **toque nas camadas de fundo** (`selectIndex`, `:439`) funciona; o gesto de arrastar não.
- Testes Sprint 35 (`Sprint35PortfolioCardStackGestures.test.tsx`, bloqueado) provavelmente chamam handlers diretamente (não passam por `onResponderRelease` real) — por isso verde com bug em device. [HIPÓTESE: não executei nem li o teste completo.]
- O store **não é Zustand** (D1).

#### B. Preço da cota via Yahoo
Estado da integração: **existente e funcional no Go** (`internal/yahoo/client.go`, testes com fixtures `testdata/*.json`; bridge `mobilebridge` usa Yahoo), **parcial** quanto a robustez (sem singleflight/crumb/429), **quebrada no app** (B5, B7).
Fluxo e ponto de quebra:
1. `TransactionScreen` seleciona ativo → `useEffect` (`:188-194`) → `fetchQuoteForAsset`.
2. Hoje: `marketApiService.fetchQuotes([ticker])` → cache SQLite (15 min) → bridge `fetchQuotes` **ou** `GET {base}/v1/quotes?tickers=PETR4`.
3. Go: `handleQuotes` → `yahoo.FetchQuotes` → `ToYahooSymbol` (`PETR4.SA`, `BTC-BRL`) → `query1/query2 /v8/finance/chart` → `meta.regularMarketPrice`.
4. Retorno `{quotes:{PETR4:{ticker,price,change_24h,updated_at}}}` → app normaliza para `currentPrice` ✔ (`marketApi.ts:331-343`).
5. **Quebra principal:** `TransactionScreen.tsx:162` lê `q.price`/`q.close_price` (inexistentes em `MarketQuote`). **Quebra de ambiente:** `localhost:8080` / Expo Go sem bridge (B7). **Silêncio:** B8/B9.
Viabilidade Yahoo: sem API oficial; `v8/finance/chart` hoje costuma responder sem crumb, mas `v7/quote` e outros exigem cookie+crumb; há 429 por IP; mudanças sem aviso; ToS do Yahoo restringem uso automatizado/comercial → risco aceitável só para uso pessoal/baixo volume e **com fallback** (COTAHIST/BRAPI/cache). Local-first: apenas ticker sai do dispositivo (já documentado em `SPEC_V3.md:28`).

#### C. Layout e header (medidas exatas)
| Elemento | Home | Estatísticas | Carteira |
|---|---|---|---|
| Container | `SafeAreaView` + `View testID=home-screen-root` (2 `flex:1` aninhados, `App.tsx:796-818`) | `View container` dentro do `SafeAreaView` do App (`:762`) | idem Estatísticas |
| Posição do header | **dentro** do `ScrollView` (`:829`) | **fora** (`StatisticsScreen.tsx:187`) | **fora** (`:667`) |
| Padding lateral do conteúdo | `spacing.margin = 20` (`App.tsx:1025`) | `spacing.md = 16` (`:317`) | `padding: 16` (`:1578`) |
| Recuo efetivo do header | 20 + 16 = **36 dp** | **16 dp** | **16 dp** |
| `paddingTop` do conteúdo | `spacing.xs = 4` | 4 | 16 |
| Conteúdo do header | avatar 38 dp + nome 15 sp; olho + globo 40 dp | título "Análises"; sem voltar | voltar 40 dp + título "Carteiras" |
| Largura útil do card | `W − 40` | `W − 32` | `W − 32` |
| Botão "Excluir Carteira" | — | — | `paddingVertical 6`, `paddingHorizontal 12`, fonte 11, sem `width`/`alignSelf`, dentro de wrapper com `justifyContent:'center'` + `paddingHorizontal:16` (soma ao 16 do scroll ⇒ inset 32) |
`XpMinimalHeader` (container `paddingHorizontal 16, paddingVertical 12`) é único; as diferenças vêm de **onde é colocado** e **das props**. Justifica `ScreenContainer` (safe area + fundo por tema + padding lateral único + scroll opcional + header opcional) e um `AppHeader` que encapsule variantes (`home` | `title` | `back`).

---

## 3. Fase 2 — Correções

> **Regras comuns a todos os prompts da Fase 2** (repetidas em cada prompt): seguir `.agents/rules/tdd-lock.md` (Fase A: escrever testes novos + `lock`; commit `test(sprint-X)`; Fase B: implementar sob bloqueio; `verify`; commit `feat(sprint-X)`); **nunca** editar testes listados em `tests.lock.json`; respeitar `DESIGN_SYSTEM.md` (tokens, sem cores hardcoded novas) e modo Privacidade (`[REDACTED]`/máscaras de `privacyAndAuth.ts`); sem dependência nova sem justificativa; atualizar `TEST_REPORT.md`; seguir `apps/mobile/AGENTS.md` (`npx tsc --noEmit` e `npx expo lint` antes de concluir). Em Linux, usar o equivalente Node do lock (`node scripts/test-lock.js …`; confirmar flags) quando o PowerShell não existir.

### Sprint 36 — Item A: Troca de carteira ativa
**Diagnóstico:** B1, B2, B3, B4, B17.
**Decisão (Q1):** Home = **carteira ativa** (saldo, alocação, gráficos, movimentações). **Estatísticas = consolidado de todas as carteiras.**
**Plano (ordem):**
1. Fase A — testes novos (arquivos novos, ex.: `Sprint36ActiveWalletSwitch.test.tsx`, `walletStore.test.ts`): (a) disparar eventos reais de `PanResponder` (`onResponderGrant/Move/Release` com `gestureState.dy`) e esperar `onPortfolioChange` com a carteira correta; (b) release chamado **uma única vez**; (c) deck re-renderizado com nova lista (async) usa itens atuais; (d) ciclo nunca emite `__add_wallet_card__`; (e) Home: após mudar a carteira, saldo/alocação/transações/`StatisticsScreen` refletem a carteira; (f) `walletStore` único como fonte de verdade, `reset()` não remove listeners.
2. `StackedWalletDeck`: remover `onResponderRelease` duplicado; manter handlers em *refs atualizadas a cada render* (`latestRef.current = {items, cardHeight, ...}`) ou recriar `PanResponder` com `useMemo` por dependências; guardar `__add_wallet_card__` em `cycleNext/cyclePrev` (pular o card ou só `onCreatePortfolioPress`).
3. `walletStore`: expor `useActivePortfolioId()` como única fonte; Home/Carteiras/Estatísticas derivam `activePortfolio` dele (por **id**, não por índice) e removem `useState` duplicados.
4. `App.tsx`: Home calcula com `consolidatePortfolios([carteiraAtiva])` (função pura já existente); `StatisticsScreen` recebe/consulta **todas** as carteiras e exibe o consolidado (rotular "Consolidado — todas as carteiras"), independente da carteira ativa.
5. Acessibilidade: pills ≥ 44 dp de área de toque (`hitSlop`).
**Critérios de aceite:**
- Ao concluir o gesto (|dy| ≥ 50% da altura do card), `walletStore.activePortfolioId` muda e **saldo, alocação, gráficos e transações da Home** refletem a nova carteira, **na Home e na tela Carteiras**.
- **Estatísticas** mostra o consolidado de todas as carteiras e **não muda** ao trocar a carteira ativa.
- Nunca é possível ativar o card "Nova Carteira" por gesto.
- Gesto abaixo do limiar volta com spring sem trocar.
- Teste que reproduz B1/B2 falha antes e passa depois.
**Prompt pronto:** ver §6-P36.

### Sprint 37 — Item B: Cotação (Yahoo via backend Go) + campo de ativo livre
**Diagnóstico:** B5–B11.
**Plano:**
1. Fase A — testes novos: TS (`TransactionScreen` preenche `unitPrice` com `currentPrice`; data local "hoje"; mensagens distintas para erro/ticker inexistente/offline; ativo digitado fora da carteira dispara popup; confirmar adiciona ativo à carteira e seleciona; recusar mantém ticker livre sem adicionar). Go (`handlers_test.go`/`yahoo`): `singleflight` (N chamadas concorrentes ⇒ 1 requisição upstream, usando servidor mock com contador), cache TTL, cache negativo, status 502/`error` quando provedor falha, validação de tickers, `assetClass` propagado, `source` no JSON, `/v1/history` com fallback Yahoo.
2. Corrigir app: ler `currentPrice`; usar data local (`dayjs`/`Intl` já no projeto? se não, `toLocaleDateString('sv-SE')`); remover `''` silencioso; distinguir erros.
3. Config de base URL: `EXPO_PUBLIC_MARKET_API_URL` (+ fallback documentado) e detecção de bridge ausente (Expo Go) com aviso "motor local indisponível — usando servidor"; sem novas libs.
4. Go: `golang.org/x/sync/singleflight` (**dependência nova, justificada:** stdlib-adjacente, mantida pela equipe Go, evita rajada ao Yahoo — alternativa sem lib: mapa de `chan` por chave, mais código); backoff + cache negativo curto (60 s) em 429; headers/`User-Agent` configuráveis; limite de 20 tickers e regex de validação; `source:"YAHOO|BRAPI|CACHE"` por cotação; erro HTTP 502 com JSON quando todos falham; `/v1/history` consulta COTAHIST e, se vazio, Yahoo (`FetchChartHistory`) com gravação marcada `source=YAHOO` (precedência COTAHIST mantida).
5. Campo ativo livre: `TransactionScreen` ganha input de ticker com autocomplete (`marketApiService.searchCatalog`, já existe) + chips dos ativos da carteira; ao confirmar ticker não pertencente à carteira ⇒ `Alert`/modal "Adicionar {TICKER} à carteira {nome}?" (Sim → `assetRepository` cria ativo com `asset_class` do catálogo e qty 0 e o seleciona; **Não → bloqueia a movimentação** (Q3): `Salvar` permanece desabilitado até haver ativo da carteira selecionado).
6. Ordem de fontes (**Q2, decidido**): carga inicial e histórico via **COTAHIST/SQLite**; **Yahoo só para consulta específica** (ticker pedido pelo formulário/busca/detalhe, ou cache expirado do ticker consultado); BRAPI só se houver token (opcional); cache SQLite como último recurso (`isStale`). Revisar `marketSyncService.syncAllPortfolioTickers` para não varrer todos os tickers no Yahoo na abertura.
7. **APK (Q7):** o caminho principal é a bridge nativa; HTTP `localhost`/`EXPO_PUBLIC_MARKET_API_URL` só para dev. No Expo Go mostrar aviso "motor local indisponível neste ambiente".
**Critérios de aceite:**
- Dado `PETR4` na carteira e backend/bridge disponíveis, ao selecionar o ativo (data de hoje) o campo "Preço unitário" é preenchido com o `currentPrice` em ≤ 3 s; para data passada usa fechamento histórico.
- Backend fora do ar ⇒ mensagem "Sem conexão com o motor de cotações (digite manualmente)", campo editável.
- Ticker inexistente ⇒ "Ticker não encontrado".
- 50 chamadas concorrentes ao mesmo ticker geram **1** chamada ao Yahoo (teste Go).
- Somente tickers (sem dados pessoais) trafegam; verificado por teste que inspeciona a query.
- `BTC` → `BTC-BRL`; `PETR4` → `PETR4.SA`.
- Digitar ativo fora da carteira mostra popup; "Sim" cria e seleciona; "Não" não cria e mantém `Salvar` desabilitado (movimentação bloqueada).
**Prompt pronto:** §6-P37.

### Sprint 38 — Item C: `ScreenContainer`, `AppHeader`, botão Excluir
**Diagnóstico:** tabela §2.5-C, D7.
**Plano:**
1. Fase A — testes novos: snapshot/estilo de `ScreenContainer` (padding lateral = `spacing.md`; fundo por tema; safe area), `AppHeader` (alturas, posição fora do scroll, variantes), Home e Carteiras e Estatísticas com **mesma largura útil e mesmo header (altura/padding)**, botão excluir `alignSelf:'stretch'`/largura total e altura ≥ 48 dp, a11y.
2. Criar `src/components/ui/ScreenContainer.tsx` (props: `themeMode`, `header?`, `scroll?`, `footer?`, `testID`) e `AppHeader` (reusa `XpMinimalHeader`, não duplica).
3. Padronizar margem lateral em `spacing.md` = **16 dp** (Q4, decidido; Home sai de 20).
4. Header sempre **fora** do `ScrollView`; Home usa variante `home`.
5. Extrair `AppShell` em `App.tsx` para eliminar os 8 blocos `SafeAreaView` e 6 `FloatingBottomDock`.
6. Botão "Excluir carteira": largura útil total, `minHeight 48`, fonte do token `labelMd`, cores por token `danger`.
**Aceite:** Home, Estatísticas e Carteira têm cards com a mesma largura e header idêntico (mesma altura/padding/posição); botão ocupa 100% da largura útil; `App.tsx` ≤ ~600 linhas sem regressão; testes bloqueados existentes seguem verdes (`verify`).
**Prompt:** §6-P38.

### Sprint 39 — Demais bugs (B12–B20 + melhorias priorizadas)
Escopo: B12 (preço de mercado no patrimônio via cache de cotações + rentabilidade real), B13/B14 (detalhe da transação completo e mascarado), B15 (remover `new Function`/`util.inspect` — carregar inicial assíncrono com *skeleton*), B16 (estado de erro + limpeza ao excluir última carteira), B17/B18/B20, a11y (remover textos `opacity:0.001`, `hitSlop`), tokens para cores hardcoded, `Decimal` nas contas, N+1.
**Atenção:** remover o hack de `extractSyncResolvedValue` pode quebrar testes **bloqueados** (Sprint25/27/32 usam leitura síncrona?). Se isso ocorrer, **parar e pedir autorização** (regra TDD Lock).
**Aceite:** patrimônio = Σ(qtd × cotação em cache, fallback PM); detalhe mostra quantidade/preço/taxas reais; nenhum valor monetário aparece em modo privacidade; zero `catch {}` vazios sem log; `tsc` e `lint` limpos.
**Prompt:** §6-P39.

---

## 4. Fase 3 — Melhorias e novas funcionalidades (propostas — nada implementado)

| ID | Proposta | Valor | Esforço | Impacto backend | Riscos | Local-first |
|---|---|---|---|---|---|---|
| **F3-1** | **Tela Pesquisa de Ativos — substitui a 3ª aba "Extrato" (Q5)**; campos sem fonte omitidos (Q6): campo de busca (autocomplete local via catálogo SQLite), resultados com cotação; **Detalhe do ativo** com abas *Visão Geral / Proventos*: Cotação (Yahoo `meta.regularMarketPrice`), **Último fechamento** (`chartPreviousClose` ou última barra), **Variação do dia** (`regularMarketChangePercent`/calculada), **Variação 12m** (calculada de `range=1y`), Mín/Máx 52 sem. (`fiftyTwoWeekLow/High` do `meta`), Volume (`indicators.quote.volume`), gráfico com 7D/30D/6M/1A/5A (`range`), "Se tivesse investido R$100" (cálculo local), Proventos/DY 12M (`events=div` → soma 12m ÷ preço), splits (`events=splits`), botão "Adicionar à carteira / Nova movimentação". Cada dado exibe a **fonte** (ex.: "Yahoo • 15 min • 02/11 19:20") e selo `isStale`. | Alto | **G** | Novo endpoint `GET /v1/asset/{ticker}?range=` (+ bridge `getAssetDetailJSON`); reaproveita `FetchChartHistory`; cache TTL + singleflight | Campos P/VP, Liquidez diária, Nº cotistas e Risco **omitidos (Q6)**. `v10/quoteSummary` exige crumb ⇒ **não usar** na v1 | Só tickers saem; histórico guardado em SQLite |
| F3-2 | **Agenda de proventos** (por mês, Data Com × Pagamento) da carteira | Alto | M | Reusar `events=div`; Data Com = ex-date; pagamento nem sempre disponível | Yahoo não fornece data de pagamento de forma confiável | Calculado sobre posições locais |
| F3-3 | **Seletor de carteira rápido** (dropdown/chip) como alternativa acessível ao baralho | Médio | P | — | — | Total |
| F3-4 | **Rentabilidade real** por ativo/classe (TWR/MWR simples) e comparativo vs CDI/IPCA (BCB já integrado) | Alto | M | Nenhum extra | Complexidade de fluxo de caixa | Total |
| F3-5 | **Health/indicador de fonte de dados** na Home (substitui `fetchQuotes(['PETR4'])`) com último sync | Médio | P | `/v1/health` já existe | — | Total |
| F3-6 | **Navegação com Expo Router** (resolve D2 e perda de estado) | Alto | G | — | Refatoração ampla, testes bloqueados dependem de `App.tsx` | Total |
| F3-7 | **Watchlist** (favoritos ⇒ coração) com alertas locais de preço | Médio | M | Poll agrupado | Notificação em background exige permissões/dev build | Alertas locais |
| F3-8 | **Quebra do código monolítico** (`PortfolioManagementScreen` 2657 l., etc.) | Médio | G | — | Regressões; fazer por sprint | — |
| F3-9 | **Decomposição de dados 2º provedor** (BRAPI/COTAHIST como fallback transparente na UI) | Médio | M | Já existem clientes | Orquestração de precedência | Total |

**Mapa de campos da Busca × fonte (F3-1):**
| Campo | Ações | FIIs | Cripto | Fonte |
|---|---|---|---|---|
| Cotação | ✔ | ✔ | ✔ | Yahoo chart `meta.regularMarketPrice` (BRAPI fallback) |
| Último fechamento | ✔ | ✔ | ✔ | `meta.chartPreviousClose` / COTAHIST `PREULT` |
| Var. dia / 12m | ✔ | ✔ | ✔ | calculado (Yahoo) |
| Mín/Máx 52s | ✔ | ✔ | ✔ | `meta.fiftyTwoWeekLow/High` (confirmar presença no fixture) |
| Volume | ✔ | ✔ | ✔ | Yahoo `indicators.quote.volume` |
| DY 12m / proventos | ✔ | ✔ | — | Yahoo `events=div` |
| P/VP, Liquidez, Cotistas | ✗ | ✗ | — | **sem fonte confiável** (Q6) |
| Gráfico 7D–10A | ✔ | ✔ | ✔ | Yahoo `range`/`interval` |

---

## 5. Perguntas — status

**Resolvidas:** Q1–Q9 (ver §0).

**Em aberto:**
- **Q10 —** Descrever as 21 imagens restantes antes da Sprint 40?
- **Q11 —** Quais itens da Fase 3 além de F3-1 entram (F3-2 agenda de proventos, F3-3 seletor rápido, F3-4 rentabilidade real, F3-5 indicador de fonte, F3-7 watchlist)?
- **Q12 —** Aceita que a troca da 3ª aba (Q5) seja a Sprint 40 (Fase 3) e não antes, por causa de possíveis testes bloqueados da dock?

---

## 6. Prompts por fase (autocontidos)

> Cada prompt cita `SPEC_V5.md` como fonte de verdade. Executar **um por vez**.

### P36 — Sprint 36 (Item A)
```
Contexto: repo Celsus (Expo/RN/TS em apps/mobile; Go em services/market-api). Fonte de verdade: SPEC_V5.md (§2.1 B1-B4,B17; §2.5-A; §3 Sprint 36). Leia também README.md, SPEC.md, DESIGN_SYSTEM.md, TEST_REPORT.md e apps/mobile/AGENTS.md.
Tarefa: corrigir a troca de carteira ativa pelo baralho (StackedWalletDeck) na Home e na PortfolioManagementScreen.
Regras obrigatórias: protocolo TDD Lock (.agents/rules/tdd-lock.md). Fase A: escreva APENAS testes novos (arquivos novos; nunca edite testes listados em tests.lock.json) cobrindo os critérios de aceite da Sprint 36 do SPEC_V5.md, rode `lock`, atualize TEST_REPORT.md, commit "test(sprint-36): ...". PARE e aguarde meu "ok" antes da Fase B se a regra pedir; na Fase B implemente sob bloqueio, corrija o CÓDIGO (nunca os testes), rode `verify`, atualize TEST_REPORT.md e commit "feat(sprint-36): ...". Se um teste bloqueado impedir a correção, PARE e peça autorização.
Implementação: (1) remover onResponderRelease duplicado (StackedWalletDeck.tsx:556) e eliminar closure obsoleta do PanResponder (usar ref atualizada a cada render ou useMemo por dependências); (2) nunca emitir '__add_wallet_card__' em cycleNext/cyclePrev; (3) walletStore como única fonte de verdade por id (reset() não limpa listeners); (4) DECISÃO Q1 (§0): Home deriva TODOS os dados da carteira ativa (consolidatePortfolios([ativa])); StatisticsScreen mostra o CONSOLIDADO de todas as carteiras e não muda ao trocar a carteira ativa; (5) pills com área de toque ≥ 44dp.
Restrições: respeitar DESIGN_SYSTEM.md (tokens, sem novas cores hardcoded), modo Privacidade (máscaras de privacyAndAuth.ts), sem nova dependência (use PanResponder/Animated existentes), `npx tsc --noEmit` e `npx expo lint` limpos. Não altere código fora do escopo. Ao final: resumo + hashes dos testes + resultado do verify.
```

### P37 — Sprint 37 (Item B)
```
Contexto/fonte de verdade: SPEC_V5.md (§2.1 B5-B11; §2.5-B; §3 Sprint 37). Leia README.md, SPEC.md, SPEC_V3.md, DESIGN_SYSTEM.md, TEST_REPORT.md.
Tarefa: fazer "Nova movimentação" preencher o preço da cota (fonte Yahoo Finance, via backend/bridge Go) e liberar o campo de ativo para digitação, com popup quando o ativo não está na carteira.
TDD Lock: Fase A com testes NOVOS (TS e Go, *_test.go novos) cobrindo os critérios de aceite da Sprint 37; lock; commit "test(sprint-37): ..."; Fase B só corrige código; verify; TEST_REPORT.md; commit "feat(sprint-37): ...". Não edite testes bloqueados; se bloquearem, PARE e peça autorização.
Implementação: app — ler currentPrice (TransactionScreen.tsx:162), data local em vez de UTC (:154), mensagens de erro distintas, config EXPO_PUBLIC_MARKET_API_URL (sem localhost fixo) e aviso quando a bridge nativa não existe (Expo Go), input de ticker com autocomplete (marketApiService.searchCatalog) + chips, popup "Adicionar {TICKER} à carteira?". Go — singleflight por ticker (golang.org/x/sync/singleflight: justificar no TEST_REPORT/SPEC), TTL + cache negativo/backoff em 429, validação/limite de tickers, assetClass propagado a ToYahooSymbol, campo `source`, HTTP 502 JSON em falha total, /v1/history com fallback Yahoo (COTAHIST mantém precedência). Apenas tickers trafegam (nenhum dado pessoal). Decisões (§0): Q2 — carga inicial/histórico via COTAHIST/SQLite, Yahoo SÓ para consulta específica (ticker pedido), BRAPI só com token, cache como último recurso; ajuste marketSyncService para não varrer todos os tickers no Yahoo na abertura. Q3 — resposta "Não" no popup BLOQUEIA a movimentação (Salvar desabilitado). Q7 — alvo APK com bridge nativa; HTTP/EXPO_PUBLIC_MARKET_API_URL só para dev; no Expo Go exibir aviso. Valide em APK ou registre "não validado" no TEST_REPORT.md.
Restrições: DESIGN_SYSTEM.md, modo Privacidade, local-first, tsc/lint e `go vet`/`go test ./...` verdes. Ao final: resumo, hashes, verify.
```

### P38 — Sprint 38 (Item C)
```
Contexto/fonte de verdade: SPEC_V5.md (§2.5-C; §3 Sprint 38; §2.2 duplicação). Leia DESIGN_SYSTEM.md, REFACTORING_SPEC.md, TEST_REPORT.md.
Tarefa: criar ScreenContainer e AppHeader compartilhados; igualar largura/margens e header de Home, Estatísticas e Carteira; botão "Excluir carteira" com largura útil total; reduzir duplicação em App.tsx (AppShell).
TDD Lock: Fase A com testes novos (largura útil idêntica, header idêntico fora do ScrollView, botão excluir 100% largura e ≥48dp, a11y); lock; commit "test(sprint-38): ..."; Fase B só código; verify; TEST_REPORT.md; commit "feat(sprint-38): ...". Nunca edite testes bloqueados (se um teste bloqueado de header/layout conflitar, PARE e peça autorização).
Implementação: ScreenContainer (safe area, fundo por tema, padding lateral único = spacing.md = 16dp (decisão Q4), scroll opcional, header/footer slots); AppHeader reutilizando XpMinimalHeader com variantes home/title/back; header sempre fora do ScrollView; AppShell para os 8 blocos SafeAreaView e 6 FloatingBottomDock; cores/tipografia via tokens (danger, labelMd), sem hardcode novo.
Restrições: DESIGN_SYSTEM.md, Privacidade, sem dependência nova, tsc/lint limpos, testes bloqueados existentes continuam passando.
```

### P39 — Sprint 39 (demais bugs)
```
Contexto/fonte de verdade: SPEC_V5.md (§2.1 B12-B20; §2.2; §3 Sprint 39). Leia README.md, SPEC.md, DESIGN_SYSTEM.md, TEST_REPORT.md.
Tarefa: corrigir B12-B20 e melhorias priorizadas (patrimônio com cotação de mercado, detalhe de movimentação completo e mascarado, remoção de extractSyncResolvedValue/new Function, erros não engolidos, limpeza de estado ao excluir a última carteira, tokens no lugar de cores hardcoded, Decimal nas contas, N+1, a11y).
TDD Lock: Fase A testes novos + lock + commit "test(sprint-39): ..."; Fase B código + verify + TEST_REPORT.md + commit "feat(sprint-39): ...". Se remover o hack síncrono quebrar testes BLOQUEADOS (Sprint25/27/32), PARE e peça autorização — não os edite.
Restrições: DESIGN_SYSTEM.md, modo Privacidade (nenhum valor monetário/quantidade visível), sem dependência nova, tsc/lint limpos.
```

### P40 — Fase 3 (somente após minha aprovação e respostas às perguntas §5)
```
Contexto/fonte de verdade: SPEC_V5.md (§4 Fase 3, §5 respostas do usuário: <cole aqui>). Implemente APENAS os itens aprovados: <ex.: F3-1 Busca de Ativos na 3ª aba>.
TDD Lock obrigatório em duas fases (testes novos travados antes do código; commits test/feat por sprint; verify; TEST_REPORT.md). Não edite testes bloqueados.
Requisitos F3-1 (Sprint 40): SUBSTITUIR a 3ª aba 'Extrato' (dock-tab-history → 'search'; ajustar DockTab, FloatingBottomDock, App.tsx; extrato segue em 'Ver tudo'); se testes BLOQUEADOS citarem a aba antiga, PARE e peça autorização; omitir P/VP, liquidez, cotistas e risco; autocomplete local (catálogo SQLite); detalhe com cotação, último fechamento, variação, 52 semanas, volume, gráfico por período, proventos, mostrando a FONTE e frescor (isStale) de cada dado; novo endpoint Go GET /v1/asset/{ticker} (+ método da bridge) com singleflight e cache TTL; apenas tickers saem do dispositivo; modo Privacidade; DESIGN_SYSTEM.md (use apenas estrutura das inspirações em imgsinsp/, não suas cores); ScreenContainer/AppHeader da Sprint 38; sem dependência nova sem justificativa.
```

---

## 7. Limitações desta auditoria
- Nada foi executado (testes, app, backend). Itens **[HIPÓTESE]** precisam de reprodução.
- Três subagentes de apoio (imagens, divergências, bugs gerais) foram **cancelados** por você antes de concluir; a cobertura de bugs gerais (§2.1 B12–B20) e divergências (§2.3) vem da minha leitura direta de `App.tsx`, `StackedWalletDeck.tsx`, `TransactionScreen.tsx`, `marketApi.ts`, `walletStore.ts`, parte de `PortfolioManagementScreen.tsx`, `XpMinimalHeader.tsx`, `StatisticsScreen.tsx` e do backend Go (`main.go`, `handlers.go`, `yahoo/client.go`, trechos de `bridge.go`).
- **Não auditados em profundidade:** `SettingsBackupScreen`, `SimulatorScreen`, `ClassDetailScreen`, `backupService`, `transactionService`, `rebalanceExecution`, repositórios/DB, domínio `finance/*`, `cotahist`, `macro`, `FloatingBottomDock`, `PatrimonyLineChartCard`; 21 das 32 imagens. Recomendo uma passada adicional antes/durante a Sprint 39.
