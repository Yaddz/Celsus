# Celsus — Plano de melhorias

Roadmap **dentro do escopo atual** do app: gestor local-first de carteiras, metas, aportes, proventos e importação
B3, com o motor de mercado em Go. Nada aqui muda o produto (sem contas na nuvem, corretagem, recomendação de
investimento ou rede social).

Cada item tem **prioridade** (P0 corrige erro ou risco, P1 traz ganho claro, P2 refinamento), **esforço** (P, M, G)
e **onde mexer**. Siga o protocolo TDD Lock: Fase A (testes) → Fase B (implementação).

---

## 0. Revisão de 08/11/2026 — o que já foi aplicado

Auditoria de código (bugs, lags, consistência visual). Todas as mudanças passam nos 628 testes, no `tsc` dos
arquivos de produção, nos testes Go e no `verify` do TDD Lock.

**Desempenho**

| Mudança | Onde | Efeito |
| :--- | :--- | :--- |
| Curva patrimonial incremental (posição avança dia a dia; cotações com busca binária) | `domain/finance/portfolioHistory.ts` | Mesmo resultado (validado contra a versão anterior em 40 cenários aleatórios), **~17× mais rápido** (1,2 s → 70 ms em 3 anos/30 ativos/600 movimentações no Node; no aparelho a diferença é maior). Era a principal causa de travamento na aba Análises. |
| Cotações em lote no `refreshAppData` (cache por ticker único + **uma** chamada de rede) | `App.tsx` | Antes: 1 requisição por ativo sem cache, repetida a cada fechamento de modal. |
| Análises: ativos lidos uma vez, cotações em lote, curva/resumos com `useMemo` | `StatisticsScreen.tsx` | Menos consultas e nenhum recálculo da curva ao rolar. |
| Índices SQLite (carteira, ativo, data, `external_id`) criados depois das migrações | `db/client.ts` | Consultas por carteira e deduplicação da importação B3 sem varrer a tabela. |
| Conexão SQLite única (Drizzle reaproveita a conexão crua) | `db/client.ts` | Evita duas conexões ao mesmo arquivo. |
| App continua montado durante o rebloqueio (tela de bloqueio em `Modal` por cima) | `components/AppGate.tsx` | Desbloquear não recarrega banco/cotações nem perde a tela atual. |
| Carteiras não recalcula saldos quando usa a lista compartilhada | `PortfolioManagementScreen.tsx` | N consultas a menos por abertura da aba. |
| Mola do deck de carteiras no driver nativo | `StackedWalletDeck.tsx` | Animação fluida mesmo com a thread JS ocupada. |
| Temporizador de bloqueio do PIN com um único intervalo | `LockScreen.tsx` | Antes era desfeito e recriado a cada segundo. |
| Timeouts no servidor HTTP do Go | `services/market-api/main.go` | Conexões lentas não seguram o servidor. |

**Bugs de lógica**

| Bug | Correção |
| :--- | :--- |
| Detalhe da classe dava prioridade à cotação sobre o **preço manual** (divergia da Home) | Mesma precedência do resto do app: manual → cotação → PM. |
| Análises mantinha a **curva e as movimentações da carteira anterior** ao trocar para uma sem movimentações; respostas atrasadas sobrescreviam a carteira atual | Estado sempre substituído + número de sequência nas cargas (curva e proventos). |
| Autocomplete de ativo (Carteiras e Nova movimentação): resposta atrasada de um termo antigo sobrescrevia as sugestões | Só a busca mais recente aplica o resultado; selecionar descarta buscas pendentes. |
| "PIN incorreto · **4** tentativas restantes" fixo | `verifyPin` devolve `attemptsRemaining`; a mensagem mostra o número real (singular/plural). |
| Importação B3 → "Ver carteira" não selecionava a carteira na Home | Seleciona no `walletStore` e recarrega. |

**Consistência visual (tema claro)**

| Problema | Correção |
| :--- | :--- |
| Indicadores de carteira da Home brancos (invisíveis) no tema claro | Cor própria no tema claro. |
| Banner "Modo Offline" com cores fixas do tema escuro | Variante clara (fundo, borda, ícone e texto). |

**Repositório**

- `.gitignore` reorganizado; `imgsinsp/` (prints e paletas de inspiração) e `docs/PROMPTS_*.md` (prompts do
  agente) saíram do versionamento — os arquivos continuam no disco.

---

## 1. Correções e riscos (P0)

| # | Item | Esforço | Onde |
| :--- | :--- | :---: | :--- |
| 1.1 | **Semântica do preço manual.** Em Home/Carteiras/detalhe ele é *preço por unidade* (`Q × preço`); na curva histórica, no `marketSyncService` e no domínio de renda fixa ele é *valor da posição*. Para RF com Q = 1 dá no mesmo; para Ações/FIIs com preço manual os números divergem. Definir um único significado (sugestão: separar `manual_unit_price` e `manual_position_value`, ou restringir o manual por posição à RF) e migrar. | M | `db/schema.ts`, `marketSyncService.ts`, `portfolioHistory.ts`, `consolidatedView.ts` |
| 1.2 | **Transação + atualização do ativo não são atômicas.** `executeTransaction` grava a movimentação e depois o ativo; se a 2ª escrita falhar o livro-razão e a posição divergem. Envolver em `withTransactionAsync` (também no lote do aporte e na importação B3). | M | `transactionService.ts`, `rebalanceExecution.ts`, `b3ImportService.ts` |
| 1.3 | **Timeout nas chamadas HTTP do app.** `fetch` para o serviço local/Yahoo não tem limite; no web/dev uma rede ruim deixa a tela esperando. Criar `fetchWithTimeout` (AbortController, ~8 s). Os testes de integração verificam a URL exata, então a mudança precisa ajustar esses testes na Fase A. | P | `services/marketApi.ts` |
| 1.4 | **Semente AUVP automática em toda instalação.** `runStartupSeedOnce` cria a carteira pessoal da planilha em qualquer aparelho novo. Tornar opcional (botão "Importar planilha" no onboarding/Perfil) ou restrito a builds de desenvolvimento. | P | `index.ts`, `spreadsheetImportService.ts`, `OnboardingFlow.tsx` |
| 1.5 | **`fetchQuotes` refaz todos os tickers quando um só está vencido.** Buscar na rede só os vencidos/ausentes e mesclar com os frescos. | P | `marketApi.ts` |
| 1.6 | **Nome do ativo fixo** "Petróleo Brasileiro S.A." quando o ticker é PETR4 no detalhe da movimentação; usar o nome do ativo/catálogo. | P | `App.tsx` |

## 2. Desempenho e fluidez (P1)

| # | Item | Esforço | Onde |
| :--- | :--- | :---: | :--- |
| 2.1 | **Dock único.** Cada aba/camada monta o próprio `FloatingBottomDock`; trocar de aba desmonta e remonta (animações reiniciam). Montar um dock só, fora dos `if`s. | M | `App.tsx` |
| 2.2 | **Extrair estado de navegação do `App.tsx`** (≈1.950 linhas, ~25 `useState`): um `navigationStore`/reducer com a pilha de camadas tornaria o voltar, o deep link e os testes triviais e reduziria renders do App inteiro. | G | `App.tsx`, `navigation/` |
| 2.3 | **Dividir `PortfolioManagementScreen`** (≈3.100 linhas) em seções memoizadas (metas por classe, lista de ativos, modais). | G | `screens/` |
| 2.4 | **Listas longas virtualizadas**: Extrato, Proventos e Busca usam `ScrollView` + `map`; com centenas de itens trocar por `FlatList`/`SectionList`. | M | `AllTransactionsScreen`, `IncomeHistoryScreen`, `SearchAssetsScreen` |
| 2.5 | **Curva histórica fora da thread de UI**: para históricos muito longos, amostrar (semanal acima de 2 anos) ou calcular em lotes com `InteractionManager`. | M | `portfolioHistory.ts`, `StatisticsScreen.tsx` |
| 2.6 | **Cache de cotações em memória** (Map com TTL) na frente do SQLite para `getCachedQuote`, que hoje é chamado ticker a ticker por várias telas. | P | `marketApi.ts` |
| 2.7 | **Carga única de carteiras**: `refreshAppData` e o efeito da carteira ativa consultam as mesmas tabelas na abertura; unificar num carregador que publique em `walletsStore` e nos dados da Home. | M | `App.tsx` |
| 2.8 | **SQLite no Go**: `SetMaxOpenConns(1)` + `PRAGMA journal_mode=WAL; busy_timeout` para evitar `SQLITE_BUSY` em escritas concorrentes de cache. | P | `services/market-api/main.go`, `pkg/mobilebridge` |

## 3. Funcionalidades no escopo (P1)

| # | Item | Esforço | Detalhe |
| :--- | :--- | :---: | :--- |
| 3.1 | **Editar e excluir movimentações** com recálculo da posição | M | Hoje só se cria; o recálculo já existe (`calculatePositionFromTransactions`). |
| 3.2 | **Sincronização periódica de cotações** em primeiro plano (ex.: a cada 15 min, só com o app ativo) e "puxar para atualizar" na Home | P | Hoje sincroniza só na abertura. |
| 3.3 | **Eventos corporativos automáticos** | P | `syncCorporateEvents` existe mas não é chamado pela UI; rodar após a sincronização e mostrar o que foi ajustado. |
| 3.4 | **Proventos a receber** (data com/pagamento) a partir de `getDividends` para os ativos da carteira | M | Usa a fonte que a Ficha já consulta. |
| 3.5 | **Relatório anual para o IR** (posição em 31/12 por ativo com custo, proventos por tipo, vendas e resultado) exportado em CSV/PDF | M | Todos os dados já existem no livro-razão. |
| 3.6 | **Rentabilidade vs. CDI/IPCA** no gráfico de evolução | M | Séries macro já são baixadas. |
| 3.7 | **Linhas "Revisar" da importação B3** com ação manual (aplicar desdobramento, grupamento, bonificação) | M | Hoje só são listadas. |
| 3.8 | **Backup automático local** (último N `.celsus.zip` em pasta escolhida) e lembrete de backup | P | `backupService` já gera o pacote. |
| 3.9 | **Vencimento de renda fixa** (alerta e baixa automática no vencimento) | P | `rf_maturity_date` já é gravado. |
| 3.10 | **Metas por ativo também em valor** (R$) além de %, e "congelar" ativos que não recebem aporte | M | Extensão do modelo de metas. |

## 4. UX e consistência visual (P2)

| # | Item | Onde |
| :--- | :--- | :--- |
| 4.1 | Trocar cores fixas (`#2A1F1D`, `#111315`, `#F4F1EA`…) espalhadas nas telas por tokens de `theme/palettes.ts`, com um teste que proíbe hex fora do tema. | `App.tsx`, `AppGate.tsx`, `LockScreen.tsx`, telas |
| 4.2 | Estados vazios e de erro padronizados (ilustração + ação) em Análises, Busca e Ficha do ativo quando o motor está offline. | `components/ui` |
| 4.3 | Botão do globo na Home mostra "Funcionalidade em desenvolvimento": definir o destino (ex.: indicadores de mercado/macro) ou remover. | `App.tsx` |
| 4.4 | Acessibilidade: rótulos em todos os botões de ícone, alvos ≥ 44 pt, leitura de valores mascarados como "valor oculto". | componentes |
| 4.5 | Animação de entrada/saída consistente para as camadas que hoje trocam de árvore sem transição (Extrato, Perfil, Proventos). | `App.tsx` |
| 4.6 | Feedback háptico leve em ações confirmadas (aporte, importação concluída) respeitando `useReducedMotion`. | componentes |

## 5. Qualidade e engenharia (P2)

| # | Item |
| :--- | :--- |
| 5.1 | Corrigir os ~50 erros de **tipo** nos arquivos de teste antigos (props renomeadas, mocks parciais) para que `tsc --noEmit` fique limpo no projeto todo — exige desbloquear os testes com autorização. |
| 5.2 | ESLint (`npx expo lint`) com `react-hooks/exhaustive-deps` e regra de no máximo um `export default` por arquivo (requisito de runtime documentado em `.agents/rules`). |
| 5.3 | Remover o atalho `extractSyncResolvedValue`/`resolveSyncIfPossible` (lê promessas via `util.inspect` só no Jest) substituindo por estado inicial assíncrono nos testes. |
| 5.4 | `gofmt` nos arquivos Go fora do padrão (`internal/cotahist/*`, `internal/yahoo/client.go`). |
| 5.5 | CI (GitHub Actions): Jest, `go test`, `tsc`, `test:verify` e build do APK de desenvolvimento a cada push. |
| 5.6 | Teste E2E no emulador (Maestro) para os fluxos críticos: onboarding, aporte, importação B3, bloqueio. |
| 5.7 | Medir: `react-native-performance`/Flipper para tempo de abertura e de troca de carteira, com orçamento (ex.: troca < 150 ms). |

---

## Ordem sugerida

1. **Sprint 49** — 1.1, 1.2, 1.3, 1.5 (integridade dos números e da rede).
2. **Sprint 50** — 2.1, 2.4, 2.6, 2.7 (fluidez percebida).
3. **Sprint 51** — 3.1, 3.2, 3.3 (livro-razão completo e cotações vivas).
4. **Sprint 52** — 3.4, 3.5, 3.6 (proventos futuros, IR, benchmark).
5. Contínuo — 2.2/2.3 (refatoração em fatias), seção 4 e 5.
