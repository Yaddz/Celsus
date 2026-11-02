# Plano de Estabilização Ponta a Ponta (Sprints 25 e 26)

> [!IMPORTANT]
> Este plano cobre a estabilização completa do Celsus para deixá-lo **100% funcional ponta a ponta sem dados fictícios em produção**, seguindo estritamente o protocolo **TDD Lock** ([`tdd-lock.md`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/.agents/rules/tdd-lock.md)): cada bug será reproduzido primeiro com um teste que falha na **Fase A** (`lock`), e só então corrigido na **Fase B** (`verify`).

---

## 1. Diagnóstico Causa-Raiz dos 8 Bugs

### Bug 1 — Ícones quadrados / destaque quadrado na NavBar (`FloatingBottomDock`)
- **Hipótese validada (Dupla Causa-Raiz):**
  1. **Destaque ativo quadrado no Android (visível no print [`media_1793581341298_f81beb4c.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341298_f81beb4c.jpg)):** Em [`FloatingBottomDock.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/FloatingBottomDock.tsx#L286-L308), o estilo `activeTabIconCircle` aplica `backgroundColor: colors.tertiary` e `elevation: 2` sobre `tabIconCircle` sem `overflow: 'hidden'` e sem repetir `borderRadius: 22`. No renderizador Android (e em conjunto com o wrapper animado do botão), a superfície elevada perde o recorte circular e desenha um **quadrado bege** atrás do ícone ativo da aba Estatísticas.
  2. **Carregamento assíncrono da fonte de ícones (`MaterialIcons`):** Em [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx), `MaterialIcons.font` (`@expo/vector-icons`) não é pré-carregada com `Font.loadAsync` / `useFonts` antes de liberar a árvore principal, o que pode exibir glifos quadrados (`□` / `.notdef`) no primeiro carregamento em conexões/dispositivos mais lentos tanto no Expo Go quanto em builds nativas caso o asset ainda não tenha sido registrado em memória.
- **Como confirmar e corrigir:**
  - Garantir `borderRadius: 22`, `overflow: 'hidden'` explícito em `tabIconCircle` e `activeTabIconCircle` em [`FloatingBottomDock.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/FloatingBottomDock.tsx#L286-L308).
  - Pré-carregar `MaterialIcons.font` na inicialização do [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx) antes de ocultar a splash/renderizar o dock.

---

### Bug 2 — Nova carteira não é salva na tela de Carteiras (`PortfolioManagementScreen`)
- **Hipótese validada (3 pontos de quebra no fluxo UI → Repositório → SQLite → Recarga):**
  1. **Tela isolada do SQLite:** [`PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx#L92-L143) **não importa nem chama `portfolioRepository` ou `assetRepository`**. As listas `portfolios`, `classTargets` e `assets` vivem apenas em `useState` local inicializado com mocks (`port-1`, `port-2`, `WEGE3`, `VALE3`). A função [`handleCreatePortfolio`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx#L279-L296) apenas faz `setPortfolios(prev => [...prev, newPort])` em memória; ao fechar ou reabrir a tela, tudo desaparece.
  2. **Filtro em `App.tsx` descarta carteiras recém-criadas (`saldo == 0`):** Em [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx#L178-L194), `refreshAppData()` contém a guarda `if (mvNum > 0)` antes de atualizar `setWalletsList(...)`. Como toda carteira recém-criada nasce com `totalMarketValue = "0.00"`, o `App.tsx` ignora o retorno do banco de dados.
  3. **Fallback do cliente SQLite em ambiente de teste/Web:** Em [`client.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/db/client.ts#L90-L102), quando o módulo nativo `expo-sqlite` não está presente ou falha no Jest sem mock manual, `_dbInstance` retorna `{}` (`as any`), quebrando chamadas reais de `db.insert`/`db.select`.
- **Como confirmar e corrigir:**
  - Conectar [`PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx) e [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx) diretamente ao `portfolioRepository`, `assetRepository` e `transactionRepository`.
  - Persistir os pesos-alvo de classe (`classTargets`) no SQLite/storage da carteira e recarregar sempre do banco ao montar ou alterar a carteira ativa.
  - Remover a trava `if (mvNum > 0)` em [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx#L183) para que carteiras com `R$ 0,00` sejam carregadas e exibidas normalmente.
  - Dotar [`client.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/db/client.ts) de um motor SQLite/in-memory funcional para quando o binding nativo não estiver disponível (permitindo testes reais de persistência: criar → desmontar/reiniciar estado → consultar novamente).

---

### Bug 3 — Card "Adicionar nova carteira" (`stacked-wallet-add-card`) não aparece no `StackedWalletDeck`
- **Hipótese validada:**
  - Em [`StackedWalletDeck.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/StackedWalletDeck.tsx#L135), a condição de inclusão do card é:
    ```ts
    const shouldIncludeAddCard = portfolios.length >= 1 && Boolean(onCreatePortfolioPress);
    ```
  - Porém, **nem [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx#L624-L633) nem [`PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx#L388-L397) passam a prop `onCreatePortfolioPress` para `<StackedWalletDeck />`!**
  - Como `Boolean(onCreatePortfolioPress)` avalia para `false` em ambas as telas, o item `ADD_WALLET_CARD_ITEM` (`testID="stacked-wallet-add-card"`) nunca é inserido no fim da pilha.
- **Como confirmar e corrigir:**
  - Em [`StackedWalletDeck.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/StackedWalletDeck.tsx#L135), mudar a regra para `const shouldIncludeAddCard = portfolios.length >= 1;` (fiel à especificação: `portfolios.length >= 1` ⇒ `stacked-wallet-add-card` no fim da pilha; `0` ⇒ `stacked-wallet-empty-card`), e proteger o `onPress` do card móvel para que não dispare `onPortfolioChange('__add_wallet_card__')` ao chegar no topo.
  - Em [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx#L624-L633) e [`PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx#L388-L397), passar `onCreatePortfolioPress` abrindo o modal de criação de carteira.

---

### Bug 4 — Olho (ocultar valores) não oculta na tela de Carteiras (e demais telas secundárias)
- **Hipótese validada:**
  1. **Handler `onTogglePrivacy` omitido nos headers:** Em [`PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx#L380), [`StatisticsScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/StatisticsScreen.tsx#L196), [`ClassDetailScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/ClassDetailScreen.tsx#L263), [`AllTransactionsScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/AllTransactionsScreen.tsx#L89) e [`TransactionDetailHistoryScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/TransactionDetailHistoryScreen.tsx#L127), o componente `<XpMinimalHeader />` é renderizado **sem a prop `onTogglePrivacy`**. Clicar no olho nessas telas não faz absolutamente nada.
  2. **Estado não é global/reativo nem cobre valores da tela de Carteiras:** O estado `isPrivacyMode` vive apenas em um `useState(false)` local em [`App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx#L114), desconectado de um store global reativo com persistência em [`privacyAndAuth.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/services/privacyAndAuth.ts). Além disso, os saldos e valores monetários na tela de Carteiras não passam pela função de formatação com máscara de privacidade.
- **Como confirmar e corrigir:**
  - Transformar [`privacyAndAuth.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/services/privacyAndAuth.ts) + hook `usePrivacyMode()` em **store global único e persistido** (em SQLite/storage local, mantendo a escolha ao fechar e reabrir o app).
  - Conectar `XpMinimalHeader` diretamente ao store global caso `onTogglePrivacy` não seja passado explicitamente, garantindo que o olho funcione em **qualquer** tela.
  - Aplicar a função única de formatação monetária em todos os cards, listas de ativos, extratos, gráficos e cabeçalhos.

---

### Bug 5 — Máscara de valores padronizada em `R$ ••••••`
- **Hipótese validada:**
  - Hoje existem **6 máscaras diferentes** espalhadas pelo código:
    - `'*******'` e `'██████,██'` / `'R$ ██████,██'` em [`privacyAndAuth.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/services/privacyAndAuth.ts#L5-L7)
    - `'••••••'` em [`StackedWalletDeck.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/StackedWalletDeck.tsx#L115) e [`PatrimonySummaryCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonySummaryCard.tsx#L39)
    - `'R$ ••••••••'` em [`PatrimonyLineChartCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonyLineChartCard.tsx#L156)
    - `'R$ ██████,██'` hardcoded em [`ClassDetailScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/ClassDetailScreen.tsx#L285) e [`TransactionDetailHistoryScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/TransactionDetailHistoryScreen.tsx#L136)
- **Como confirmar e corrigir:**
  - Centralizar toda formatação monetária em [`privacyAndAuth.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/services/privacyAndAuth.ts) (`formatCurrencyBRL(value, isPrivacyMode)` / `privacyAndAuthService.formatCurrency(value, isPrivacyMode)`), exportando a constante única `PRIVACY_MASK = 'R$ ••••••'` (6 bullets `•`, sem `*` e sem `█`).
  - Substituir todas as máscaras locais nas telas e componentes pela chamada centralizada.

---

### Bug 6 — Remover opção de mascaramento de Perfil/Configurações (`SettingsBackupScreen`)
- **Hipótese validada:**
  - [`SettingsBackupScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/SettingsBackupScreen.tsx#L340-L355) renderiza a linha `"Modo Privacidade (Ocultar Saldos)"` com `<Switch testID="privacy-mode-switch" />`.
- **Como confirmar e corrigir:**
  - Remover a linha e o `Switch` de [`SettingsBackupScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/SettingsBackupScreen.tsx#L340-L355), deixando o controle **exclusivamente** no ícone de olho do cabeçalho (`header-privacy-toggle`).
  - Atualizar o [`REFACTORING_SPEC.md`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/REFACTORING_SPEC.md) (Módulo 7) e os testes bloqueados afetados (listados na Seção 3 abaixo) mediante `unlock` / `lock` explícito.

---

### Bug 7 — Contraste no modo escuro (`StatisticsScreen` / `PatrimonyLineChartCard` / `AttributeStatBar`)
- **Hipótese validada a partir do print [`media_1793581341298_f81beb4c.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341298_f81beb4c.jpg):**
  1. **Tokens de cor inexistentes (`undefined`):** [`PatrimonyLineChartCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonyLineChartCard.tsx#L250-L395) referencia `colors.surfaceCard` e `colors.parchmentMuted`, que **não existem** em [`ColorTokens` (`tokens.ts`)](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/theme/tokens.ts#L11-L32)! Como `colors.parchmentMuted` é `undefined`, o React Native usa a cor padrão do Android (`#1C1B1F`, quase preta) sobre o fundo escuro (`#111315` / `#1E2022`), resultando em razão de contraste **1.02:1 a 1.08:1** (praticamente invisível para `PATRIMÔNIO HISTÓRICO`, `5 dias`, `Mês`, `Ano`, `5 anos`, `RESUMO DO PERÍODO`, `Patrimônio Inicial`, `Aportes`, `Rendimentos`, `Patrimônio Final`).
  2. **Cor de categoria `RENDA FIXA` escura em fundo escuro:** Em [`AttributeStatBar.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/AttributeStatBar.tsx#L140), a cor da categoria `FIXED_INCOME` é `colors.secondary` (`#2E4A44`), que sobre o card escuro `#191B1D` tem razão de contraste **1.79:1** (abaixo do mínimo WCAG AA de 4.5:1).

#### Tabela de Pares Cor/Fundo Corrigidos (Medidos pela Fórmula de Luminância Relativa WCAG 2.1)

| Elemento na Tela de Relatórios (Modo Escuro) | Par Antes (Texto / Fundo) | Razão Antes | Par Depois (Texto / Fundo) | Razão Depois | Meta WCAG AA |
| :--- | :--- | :---: | :--- | :---: | :---: |
| Labels `PATRIMÔNIO HISTÓRICO` e `RESUMO DO PERÍODO` ([`PatrimonyLineChartCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonyLineChartCard.tsx#L262)) | `#1C1B1F` (`undefined`) sobre `#111315` | **1.04 : 1** ❌ | `#B8B2A6` (`parchmentMuted`) sobre `#191B1D` (`surfaceCard`) | **7.85 : 1** ✅ | $\ge 4.5 : 1$ |
| Pílulas de período inativas `5 dias`, `Mês`, `Ano`, `5 anos` ([`PatrimonyLineChartCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonyLineChartCard.tsx#L319)) | `#1C1B1F` (`undefined`) sobre `#1F2225` | **1.08 : 1** ❌ | `#D5CAA8` (`tertiary`) sobre `#222528` | **9.42 : 1** ✅ | $\ge 4.5 : 1$ |
| Labels `Patrimônio Inicial`, `Aportes`, `Rendimentos`, `Patrimônio Final` ([`PatrimonyLineChartCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonyLineChartCard.tsx#L374)) | `#1C1B1F` (`undefined`) sobre `#1E2022` | **1.06 : 1** ❌ | `#B8B2A6` (`parchmentMuted`) sobre `#141618` (`surfaceContainerLow`) | **8.36 : 1** ✅ | $\ge 4.5 : 1$ |
| Título de classe `RENDA FIXA` e pontos ativos da matriz ([`AttributeStatBar.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/AttributeStatBar.tsx#L140)) | `#2E4A44` (`secondary`) sobre `#191B1D` | **1.79 : 1** ❌ | `#68B3A0` (verde-sálvia claro no Dark Mode) sobre `#191B1D` | **6.82 : 1** ✅ | $\ge 4.5 : 1$ |
| Subtítulos secundários (`Matriz de Pontos • 4 Classes Reais`, `. Tesouro, CDB e Isentos`) ([`tokens.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/theme/tokens.ts#L59)) | `#8A8A8E` sobre `#1E2022` | **4.43 : 1** ⚠️ | `#A8A49C` (`textSecondary` Dark) sobre `#1E2022` | **6.27 : 1** ✅ | $\ge 4.5 : 1$ |
| Superfície e borda do card de gráfico (`surfaceCard` / `border` em [`PatrimonyLineChartCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/PatrimonyLineChartCard.tsx#L250)) | `undefined` (transparente `#111315`) sobre `#111315` | **1.00 : 1** ❌ | Superfície `#191B1D` + borda `#3A3D42` sobre `#111315` | **Borda 1.68 : 1 + Card separado** ✅ | Superfície distinta |

---

### Bug 8 — Carteiras: percentuais e ações em formato de lista vertical (`PortfolioManagementScreen`)
- **Hipótese validada:**
  - Atualmente, [`PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx#L412-L545) renderiza:
    - **Metas por Classe (`macroGrid`):** uma grade 2x2 (`flexDirection: 'row', flexWrap: 'wrap'`, cards com `width: '48%'`).
    - **Ativos por Classe (`assetCard`):** cartões de 2 andares com input embaixo.
  - Conforme os prints de referência enviados ([`media_1793581341295_b2c96fc5.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341295_b2c96fc5.jpg) e [`media_1793581341300_0e63e792.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341300_0e63e792.jpg)), o layout passará para **lista vertical (uma linha horizontal por classe e uma linha horizontal por ativo)**:
    - **Linha de Classe:** `[Indicador de cor + Nome da Classe]` à esquerda e `[Botão Cadeado (lock-class-*) + Input % alinhado à direita (input-class-*)]` à direita.
    - **Linha de Ativo (agrupada sob o cabeçalho da sua classe):** `[Ticker + Nome do Ativo + % Global/Valor atual]` à esquerda e `[Botão Cadeado (lock-asset-*) + Input % alinhado à direita (input-asset-*)]` à direita.
  - Todo o comportamento reativo de cadeado/redistribuição proporcional da Sprint 18 (`rebalanceSiblings`, `validateWeightSum`, `lock-class-*`, `input-class-*`, `lock-asset-*`, `input-asset-*`) é integralmente preservado.

---

## 2. Inventário de Dados Fictícios a Remover em Produção

> [!WARNING]
> Nenhum dado fictício permanecerá no código de produção. Fixtures dentro de `__tests__/` e os banners intencionais `"Funcionalidade em desenvolvimento"` (`dev-placeholder-banner` do Módulo 8 do `REFACTORING_SPEC.md`) serão mantidos intactos.

| Arquivo de Produção | Dados Fictícios / Hardcoded que Serão Removidos | Comportamento Real Após Remoção |
| :--- | :--- | :--- |
| [`apps/mobile/App.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/App.tsx) | `DEFAULT_TRANSACTIONS` (`tx-1`..`tx-4`, linhas 68–101); `totalPatrimony = 'R$ 32.468,00'` (linha 134); `profitSummary = '+12,4% no ano'` (linha 135); `walletsList` hardcoded (`DOSSIÊ CONSOLIDADO`, linhas 136–145); `sampleAssets` em `handleSimulate` (`PETR4`, `VALE3`, `TESOURO SELIC`, linhas 231–236); props hardcoded de `TransactionDetailHistoryScreen` (`PETR4`, `R$ 15.200,00`, linhas 453–458). | Inicia com `walletsList = []`, `transactions = []`, `totalPatrimony = 'R$ 0,00'`, `profitSummary = '0,0% no ano'`. Carrega carteiras, ativos e transações exclusivamente do SQLite (`portfolioRepository`, `assetRepository`, `transactionRepository`). |
| [`apps/mobile/src/screens/PortfolioManagementScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/PortfolioManagementScreen.tsx) | `portfolios` hardcoded (`port-1` Principal, `port-2` Reserva de Valor, linhas 92–95); `assets` hardcoded (`a1`..`a9`: `WEGE3`, `VALE3`, `HGLG11`, `XPML11`, `TESOURO IPCA+`, `CDB BANCO XP`, `IVVB11`, `BITCOIN`, linhas 128–143). | Carrega `portfolios`, `classTargets` e `assets` do SQLite da carteira selecionada. Em primeira abertura sem carteira, exibe `stacked-wallet-empty-card` e lista vazia real. |
| [`apps/mobile/src/screens/StatisticsScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/StatisticsScreen.tsx) | `DEFAULT_SAMPLE_CURVE` (`20.000` → `35.468`, linhas 43–50); fallback `'R$ 32.468,00'` (linha 163); percentuais fallback hardcoded (`32%`, `28%`, `20%`, linhas 169–188). | Sem ativos/histórico, renderiza curva zerada (`R$ 0,00`) e alocações `0%` reais calculadas da carteira ativa; quando houver ativos, busca histórico real (`/v1/history`). |
| [`apps/mobile/src/screens/SettingsBackupScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/SettingsBackupScreen.tsx) | Valores hardcoded `'R$ 32.468,00'` e `'R$ 8.120,00'` nos cards de resumo de carteiras (linhas 305–328). | Exibe o `totalMarketValue` real de cada carteira vinda de `portfolios` (formatado com `formatCurrencyBRL`). |
| [`apps/mobile/src/screens/SimulatorScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/SimulatorScreen.tsx) | Ativos fallback hardcoded (`PETR4`, `VALE3`, `TESOURO SELIC`, linhas 113–118) e carteira fallback (`Principal`, linhas 75–83). | Usa a carteira ativa e os ativos reais cadastrados no SQLite. |
| [`apps/mobile/src/screens/TransactionScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/TransactionScreen.tsx) | Carteiras fallback hardcoded (`Principal`, `Reserva de Valor`, linhas 75–85). | Lista apenas as carteiras reais persistidas no SQLite e os ativos reais / catálogo do backend. |
| [`apps/mobile/src/screens/ClassDetailScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/ClassDetailScreen.tsx) | `DEFAULT_ASSETS_MAP` com 9 ativos fictícios (`TESOURO SELIC 2029`, `WEGE3`, `HGLG11`, etc., linhas 53–188). | Recebe e filtra os ativos reais da carteira ativa no SQLite para a classe selecionada (ou exibe estado vazio se a classe tiver 0 ativos). |
| [`apps/mobile/src/screens/AllTransactionsScreen.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/AllTransactionsScreen.tsx) | `DEFAULT_TRANSACTIONS` (`tx-1`..`tx-4`, linhas 33–66). | Lista apenas transações reais persistidas no SQLite (ou estado vazio `"Nenhuma transação registrada"`). |
| [`apps/mobile/src/components/ui/DotMatrixAllocationCard.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/components/ui/DotMatrixAllocationCard.tsx) | `DEFAULT_ALLOCATIONS` com saldos fictícios e `totalBalance = 'R$ 32.468,00'` (linhas 25–34). | Default `totalBalance = 'R$ 0,00'` e `allocations` com `0%` quando a carteira está vazia. |

---

## 3. Lista de Testes Bloqueados Afetados (Justificativa para `unlock` / `lock`)

Para atender às regras **#5 (`R$ ••••••`)**, **#6 (remover switch de privacidade em Configurações)** e **Remoção de Dados Fictícios em Produção**, os seguintes arquivos de teste hoje bloqueados em `tests.lock.json` precisam ser atualizados na **Fase A** (com `test-lock.ps1 -Action unlock` seguido de `test-lock.ps1 -Action lock`):

1. [`apps/mobile/src/screens/__tests__/Sprint19XpSettingsAndLightModeAudit.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/Sprint19XpSettingsAndLightModeAudit.test.tsx)
   - **Motivo:** O teste `S19-T04` (linha 153) exige `expect(getByTestId('privacy-mode-switch')).toBeDefined()`. Com o Bug #6, deve validar `expect(queryByTestId('privacy-mode-switch')).toBeNull()` (controle apenas no ícone de olho).
2. [`apps/mobile/src/services/__tests__/privacyAndAuth.test.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/services/__tests__/privacyAndAuth.test.ts)
   - **Motivo:** Espera as máscaras antigas `'██████,██'` e `'R$ ██████,██'`. Com o Bug #5, deve esperar `'R$ ••••••'`.
3. [`apps/mobile/src/services/__tests__/Sprint12PrivacyAndLightTheme.test.ts`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/services/__tests__/Sprint12PrivacyAndLightTheme.test.ts)
   - **Motivo:** Espera `'*******'`, `'██████,██'` e `'R$ ██████,██'`. Com o Bug #5, deve esperar `'R$ ••••••'`.
4. [`apps/mobile/src/screens/__tests__/ClassAssetCards.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/ClassAssetCards.test.tsx)
   - **Motivo:** Renderiza `<ClassDetailScreen />` sem props esperando ativos hardcoded (`TESOURO SELIC 2029`) e máscara `'R$ ██████,██'`. Deve passar fixture explícita de teste via props e esperar `'R$ ••••••'`.
5. [`apps/mobile/src/screens/__tests__/TransactionDetailHistoryScreen.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/TransactionDetailHistoryScreen.test.tsx)
   - **Motivo:** Espera a máscara antiga `'R$ ██████,██'` (linha 145). Deve esperar `'R$ ••••••'`.
6. [`apps/mobile/src/screens/__tests__/StatisticsScreenV2.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/StatisticsScreenV2.test.tsx)
   - **Motivo:** Espera `'R$ ••••••••'` (8 bullets, linha 176) e depende de `DEFAULT_SAMPLE_CURVE` quando renderizado sem props. Deve passar fixture de teste na prop `patrimonyCurve` e esperar `'R$ ••••••'` (6 bullets).
7. [`apps/mobile/src/screens/__tests__/Sprint18ReactiveLockWeightsAndAutocomplete.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/Sprint18ReactiveLockWeightsAndAutocomplete.test.tsx)
   - **Motivo:** Renderiza `<PortfolioManagementScreen />` sem props esperando que `input-asset-a1` (`WEGE3`) e `input-asset-a2` (`VALE3`) venham hardcoded do componente de produção. Deve passar fixtures de teste via prop `initialAssets` / repositório populado no `beforeEach` do teste, mantendo o componente de produção sem mocks.
8. [`apps/mobile/src/screens/__tests__/AllTransactionsScreen.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/AllTransactionsScreen.test.tsx), [`apps/mobile/src/screens/__tests__/Sprint16HomeAndGlobalChrome.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/Sprint16HomeAndGlobalChrome.test.tsx) e [`apps/mobile/src/screens/__tests__/Sprint17StatisticsAndTransactionsRefactor.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/Sprint17StatisticsAndTransactionsRefactor.test.tsx)
   - **Motivo:** Passar fixtures explícitas nos testes onde antes dependiam de `DEFAULT_TRANSACTIONS` ou `DEFAULT_ALLOCATIONS` hardcoded nos componentes de produção.

---

## 4. Ordem de Execução e Divisão em Sprints (Fase A e Fase B)

Priorizamos primeiro os **bloqueadores do fluxo de dados e persistência** (Sprint 25) e em seguida **privacidade global, contraste WCAG AA e layout de lista** (Sprint 26).

---

### Pré-requisito de Backend (Fechamento da Sprint 22 Fase B já aberta)
Durante a auditoria das sprints anteriores, verificamos que `services/market-api/pkg/mobilebridge/bridge_test.go` já foi criado e bloqueado na Fase A da Sprint 22, mas `services/market-api/pkg/mobilebridge/bridge.go` ainda está como stub (`"not implemented"`).
- **Ação imediata sob bloqueio existente:** Implementar `services/market-api/pkg/mobilebridge/bridge.go` para que `go test ./...` em `services/market-api` passe 100% (todos os pacotes verdes).

---

### Sprint 25 — Persistência SQLite Real, Card Adicionar Carteira, Remoção de Dados Fictícios e Fluxo Ponta a Ponta (Bugs #2, #3, #8 e Zero Mocks)

#### Objetivo
Fazer o fluxo completo (**Estado vazio real → Criar carteira → Persistir no SQLite → Exibir card "Adicionar nova carteira" na pilha → Cadastrar ativo via autocomplete com classe e peso → Registrar Compra e Venda com PM/Quantidade/Saldo/Extrato persistidos → Cotação e Histórico reais com tratamento de erro/offline**) funcionar ponta a ponta sem dados fictícios.

#### Módulos Afetados
- `apps/mobile/src/db/client.ts`, `schema.ts`
- `apps/mobile/src/repositories/portfolioRepository.ts`, `assetRepository.ts`, `transactionRepository.ts`
- `apps/mobile/src/components/ui/StackedWalletDeck.tsx`
- `apps/mobile/src/screens/PortfolioManagementScreen.tsx`
- `apps/mobile/src/screens/TransactionScreen.tsx`, `AllTransactionsScreen.tsx`, `ClassDetailScreen.tsx`, `SimulatorScreen.tsx`, `StatisticsScreen.tsx`, `SettingsBackupScreen.tsx`
- `apps/mobile/App.tsx`

#### Fase A — Autoria e Atualização de Testes + Lock
1. Criar [`apps/mobile/src/screens/__tests__/Sprint25EndToEndPersistenceAndZeroMocks.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/Sprint25EndToEndPersistenceAndZeroMocks.test.tsx) cobrindo:
   - **`S25-T01 (Estado Vazio Inicial Real)`:** Primeira abertura do app sem dados no SQLite exibe `stacked-wallet-empty-card`, patrimônio `R$ 0,00`, `0` ativos e `0` transações (nenhum `R$ 32.468,00`, `WEGE3` ou `PETR4` fictício).
   - **`S25-T02 (Bug #2 — Persistência de Carteira após Reload)`:** Criar carteira na `PortfolioManagementScreen` → desmontar componente / reiniciar estado → remontar tela e `App` → carteira criada permanece salva no SQLite e aparece no `StackedWalletDeck` mesmo com saldo `R$ 0,00`.
   - **`S25-T03 (Bug #3 — Card Adicionar Nova Carteira na Pilha)`:** Com `portfolios.length >= 1`, `StackedWalletDeck` renderiza obrigatoriamente `stacked-wallet-add-card` no fim da pilha tanto na Home quanto na tela de Carteiras; clicar nele abre o modal de criação de carteira.
   - **`S25-T04 (Cadastro de Ativo + Persistência + Alocação)`:** Buscar ativo no autocomplete (`/v1/catalog/search`), selecionar classe e peso, salvar → ativo é persistido no SQLite e reflete na lista da carteira e no gráfico de alocação.
   - **`S25-T05 (Transação de Compra e Venda + PM, Quantidade, Saldo e Extrato)`:** Registrar `BUY` (10 `PETR4` a `R$ 35,00`) e `SELL` (4 `PETR4` a `R$ 40,00`) → PM mantém `R$ 35,00000000`, quantidade atualiza para `6`, saldo e extrato (`AllTransactionsScreen` e `TransactionDetailHistoryScreen`) refletem as transações persistidas.
   - **`S25-T06 (Bug #8 — Layout de Lista Vertical em Carteiras + Cadeado Inline)`:** `PortfolioManagementScreen` renderiza linhas verticais para classes (`class-list-row-*`) e ativos (`asset-list-row-*`) com `%` alinhado à direita e cadeado funcional (`lock-class-*`, `lock-asset-*`).
   - **`S25-T07 (Cotação e Histórico Reais + Banner Offline/Erro Visível)`:** Quando `/v1/quotes` ou `/v1/history` falha/está offline, a UI exibe aviso visível de modo offline/erro sem quebrar a tela.
2. Atualizar os testes bloqueados que dependiam de mocks hardcoded em produção (Itens 4, 6, 7 e 8 da Seção 3) para injetarem suas próprias fixtures de teste.
3. Executar `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock` e commitar a Fase A.

#### Fase B — Implementação sob Bloqueio
1. Implementar fallback SQLite em memória no `db/client.ts` para ambientes sem binário nativo e adicionar colunas/tabela de metas de classe (`classTargets`) e peso-alvo (`targetWeightPct`) no `portfolioRepository` / `assetRepository`.
2. Conectar `PortfolioManagementScreen.tsx`, `TransactionScreen.tsx`, `AllTransactionsScreen.tsx`, `ClassDetailScreen.tsx`, `StatisticsScreen.tsx`, `SimulatorScreen.tsx` e `App.tsx` aos repositórios SQLite reais, removendo todos os arrays fictícios listados na Seção 2.
3. Corrigir `StackedWalletDeck.tsx` para sempre exibir `stacked-wallet-add-card` quando `portfolios.length >= 1` e ligar `onCreatePortfolioPress` em `App.tsx` e `PortfolioManagementScreen.tsx`.
4. Converter o layout de classes e ativos de `PortfolioManagementScreen.tsx` para **lista vertical** (uma linha por classe e uma linha por ativo com `%` alinhado à direita e cadeado inline).
5. Executar `npm --prefix apps/mobile test -- --runInBand`, `go test ./...`, `test-lock.ps1 -Action verify`, atualizar `TEST_REPORT.md` e commitar a Fase B.

---

### Sprint 26 — Privacidade Global (`R$ ••••••`), Remoção do Switch em Configurações, Contraste WCAG AA no Modo Escuro e Ícones da NavBar (Bugs #1, #4, #5, #6 e #7)

#### Objetivo
Unificar o estado de privacidade em um store global persistido controlado exclusivamente pelo ícone de olho, padronizar a máscara em `R$ ••••••` em 100% do app, corrigir todos os pares de contraste do modo escuro para WCAG AA ($\ge 4.5:1$) e eliminar o destaque/ícone quadrado na NavBar.

#### Módulos Afetados
- `apps/mobile/src/services/privacyAndAuth.ts`
- `apps/mobile/src/theme/tokens.ts`
- `apps/mobile/src/components/ui/FloatingBottomDock.tsx`, `XpMinimalHeader.tsx`, `PatrimonyLineChartCard.tsx`, `AttributeStatBar.tsx`, `StackedWalletDeck.tsx`, `PatrimonySummaryCard.tsx`, `DotMatrixAllocationCard.tsx`
- `apps/mobile/src/screens/SettingsBackupScreen.tsx`, `PortfolioManagementScreen.tsx`, `StatisticsScreen.tsx`, `ClassDetailScreen.tsx`, `AllTransactionsScreen.tsx`, `TransactionDetailHistoryScreen.tsx`
- `REFACTORING_SPEC.md`

#### Fase A — Autoria e Atualização de Testes + Lock
1. Criar [`apps/mobile/src/screens/__tests__/Sprint26PrivacyContrastAndNavbarStabilization.test.tsx`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/apps/mobile/src/screens/__tests__/Sprint26PrivacyContrastAndNavbarStabilization.test.tsx) cobrindo:
   - **`S26-T01 (Bug #1 — NavBar Circular e Preload de Fontes)`:** Verifica que `FloatingBottomDock` mantém `borderRadius: 22` e `overflow: 'hidden'` no container do ícone ativo e que a fonte `MaterialIcons` é carregada na inicialização.
   - **`S26-T02 (Bug #4 e #5 — Olho Global Persistido + Máscara Única `R$ ••••••`)`:** Clicar em `header-privacy-toggle` em qualquer tela (Home, Carteiras, Estatísticas, Detalhe de Classe, Extrato) alterna o store global, persiste a escolha para a próxima abertura do app e formata todos os valores monetários exatamente como `R$ ••••••` (6 caracteres `•`, zero ocorrências de `*` ou `█`).
   - **`S26-T03 (Bug #6 — Ausência de Switch de Privacidade em Configurações)`:** Verifica que `SettingsBackupScreen` não renderiza `privacy-mode-switch` nem o texto `"Modo Privacidade"`.
   - **`S26-T04 (Bug #7 — Auditoria Matemática WCAG AA no Modo Escuro)`:** Calcula a razão de contraste real (luminância relativa WCAG 2.1) de todos os pares texto/fundo em `PatrimonyLineChartCard`, `AttributeStatBar` (`RENDA FIXA`, `AÇÕES`, `FIIs`, ` INTERNACIONAL / CRIPTO`) e `StatisticsScreen` no `darkTheme`, exigindo $\ge 4.5:1$ para todos os textos normais e $\ge 3.0:1$ para textos grandes/ícones.
2. Atualizar os testes bloqueados de privacidade e configurações (Itens 1, 2, 3 e 5 da Seção 3: `Sprint19XpSettingsAndLightModeAudit.test.tsx`, `privacyAndAuth.test.ts`, `Sprint12PrivacyAndLightTheme.test.ts`, `TransactionDetailHistoryScreen.test.tsx`) via `unlock` → edição → `lock`.
3. Executar `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock` e commitar a Fase A.

#### Fase B — Implementação sob Bloqueio
1. Implementar o store global reativo e persistido em `privacyAndAuth.ts` (`usePrivacyMode`, `PRIVACY_MASK = 'R$ ••••••'`, `formatCurrencyBRL`) e integrá-lo diretamente ao `XpMinimalHeader` e a todas as telas/cards.
2. Remover o switch `privacy-mode-switch` de `SettingsBackupScreen.tsx` e atualizar o Módulo 7 de `REFACTORING_SPEC.md`.
3. Adicionar `surfaceCard` e `parchmentMuted` em `ColorTokens` (`tokens.ts`), ajustar a paleta de categorias e textos secundários no `darkTheme` conforme a Tabela WCAG AA da Seção 1, e atualizar `PatrimonyLineChartCard.tsx` e `AttributeStatBar.tsx`.
4. Corrigir o recorte circular (`borderRadius: 22`, `overflow: 'hidden'`) em `FloatingBottomDock.tsx` e o pré-carregamento de `MaterialIcons.font` em `App.tsx`.
5. Executar `npm --prefix apps/mobile test -- --runInBand`, `go test ./...`, `test-lock.ps1 -Action verify`, validar o roteiro ponta a ponta, atualizar `TEST_REPORT.md` e commitar a Fase B.

---

## 5. Perguntas em Aberto (Antes de Implementar)

Antes de iniciar a **Fase A da Sprint 25**, preciso apenas confirmar 2 detalhes de UX a partir dos prints de referência que você anexou:

1. **Lista vertical na tela de Carteiras (Bug #8 — prints [`media_1793581341295_b2c96fc5.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341295_b2c96fc5.jpg) e [`media_1793581341300_0e63e792.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341300_0e63e792.jpg)):**
   - Na lista vertical da tela de Carteiras, cada linha de classe e de ativo terá o nome à esquerda e `[Cadeado + Input %]` alinhados à direita. Você deseja também incluir um **ícone de lixeira para remover um ativo da carteira** na linha do ativo (como aparece nas linhas do print `media_1793581341295_b2c96fc5.jpg`), ou manter apenas `[Cadeado + Input %]`?
2. **Cadastro de Ativo vs. Registro de Compra (print [`media_1793581341302_25dc0ddc.jpg`](file:///C:/Users/Pedro/.gemini/antigravity/brain/26875e34-6b4c-4760-8f3d-938e13909659/.user_uploaded/media_1793581341302_25dc0ddc.jpg)):**
   - No roteiro de aceite (*"3. Adicionar ativo com classe e peso → 4. Registrar transação de compra e de venda"*), você prefere manter os dois passos separados como hoje (na tela de Carteiras cadastra o ativo na meta com classe + peso, e no botão `+` registra a transação de Compra/Venda), **ou** quer que a tela de Transação (`+`) também crie automaticamente o ativo na carteira caso o usuário compre um ticker que ainda não estava cadastrado? (Recomendação: **permitir ambos** — cadastrar na tela de Carteiras com classe/peso e, se o usuário registrar uma Compra no `+` de um ativo novo, cadastrá-lo automaticamente na carteira para o fluxo nunca travar).
