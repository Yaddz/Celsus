# Celsus — Relatório de testes

Estado atual da suíte. O histórico sprint a sprint (relatórios antigos, com hashes e tempos) está no git:
`git log -p -- TEST_REPORT.md`.

## Resumo

| Suíte | Comando | Resultado |
| :--- | :--- | :--- |
| App mobile (Jest + Testing Library) | `npm run test:mobile` | **108 suítes**, **722 testes** passando (Sprints 54, 55 e 56) |
| Motor de mercado (Go) | `npm run test:market` | Todos os 7 pacotes testáveis `ok` (0 falhas, 2 testes "live" pulados por padrão) |
| Tipos (TypeScript) | `cd apps/mobile && ./node_modules/.bin/tsc --noEmit` | **0 erros** nos stubs/testes da Sprint 55 e código de produção (restam erros preexistentes em 19 arquivos de teste antigos) |
| Integridade dos testes (TDD Lock) | `node scripts/test-lock.js verify` | **123 arquivos protegidos**, SHA-256 íntegros |

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
