# CELSUS — Especificação Técnica de Refatoração UI/UX, Estado e Rotas (Sprints 16 a 19)

> **Documento:** `REFACTORING_SPEC.md` (Complemento Oficial à `SPEC.md` e `SPEC_V2.md`)  
> **Regime de Execução:** TDD Estrito em 2 Fases por Sprint (`tdd-lock.md` + `tests.lock.json` SHA-256)  
> **Referências Visuais Obrigatórias (`/imgsinsp`):**
> - `Screenshot_20261031_234620_Expo Go.png` (Análise do card da carteira, notch e dock)
> - `Screenshot_20261031_234532_XP Investimentos.jpg` (Arquitetura modular da tela de Perfil/Configurações da XP)
> - `Screenshot_20261031_183437_XP Investimentos.jpg` & `183447` (Header minimalista XP, anel de porcentagem e cards de ativos)
> - `Screenshot_20261031_183253_BTG Investimentos.jpg` & `183352` (Gráficos de alocação e detalhamento de ativos)
> - `Screenshot_20261026_200644_Pierre.jpg` ( Atmosfera luminosa difusa e superfícies orgânicas)

---

## 1. Mapa de Módulos e Divisão de Sprints

| Sprint | Módulos Contemplados | Foco Técnico Principal |
| :---: | :--- | :--- |
| **Sprint 16** | **Módulo 1** (Cards da Carteira / Stack) + **Módulo 2** (Gráficos de Alocação) | Correção das curvas do Notch (internas cor do card, externas laranjas), quinas retas (`borderRadius: 0`), remoção de borda, background orgânico com blur, `zIndex` elevado na animação, estados Empty (card fixo) / 1+ Carteiras (card móvel de adicionar no fim da pilha) e inversão dos gráficos de alocação para **Esquerda → Direita**. |
| **Sprint 17** | **Módulo 3** (Header Global) + **Módulo 6** (Tela Categoria de Ativo / Donut) + **Módulo 8** (Placeholders, Rotas e Speed-Dial `+` na Navbar) | Padronização do `XpMinimalHeader` em 100% das telas (removendo `• PETR4`), verdadeiro Gráfico de Rosca (Donut Chart) sem `onLongPress` (clique na fatia abre resumo; clique no nome faz scroll; clique no card abre detalhes do ativo), botão `+` da Navbar exibindo os demais botões empilhados diretamente **acima dele (Speed-Dial flutuante, sem Modal)**, interceptação com aviso `"Funcionalidade em desenvolvimento"` (Globo, Bento Mais e 3º ícone da Navbar) e correção de `"Ver tudo >"` para abrir o Extrato Completo de Transações. |
| **Sprint 18** | **Módulo 4** (Tela da Carteira e Metas/Pesos com Cadeado) + **Módulo 5** (Modal de Adicionar Ativo) | Redesign editorial da Tela de Carteiras, remoção de botões `-5%/+5%` e badges `"100% OK"`, cálculo reativo proporcional que fecha sempre em `100%` com botão de **Cadeado (lock/unlock)**, edição rápida inline na listagem de ativos, e Modal de Adicionar Ativo com Autocomplete, explicação de Peso e toggle **Peso ↔ Porcentagem (%)**. |
| **Sprint 19** | **Módulo 7** (Tela de Configurações padrão XP) + **Módulo 9** (Auditoria Completa de Light Mode) | Reestruturação completa de `SettingsBackupScreen` em blocos modulares idênticos ao Perfil da XP (`/imgsinsp`) e auditoria visual/contraste de ponta a ponta no Tema Claro (`#F4F1EA` / `#FFFFFF`) em todas as telas e modais. |

---

## 2. Especificação Detalhada por Módulo

### Módulo 1 — Estilização e Comportamento dos Cards da Carteira (`StackedWalletDeck.tsx`)
1. **Geometria e Cores do Recorte (`Notch`):**
   - **Remoção de Borda Geral:** `heroCard` e `cornerNotch` devem ter `borderWidth: 0` e `borderColor: 'transparent'`.
   - **Quinas Retas:** O card colorido (`coloredBody` / `heroCard`) e o recorte (`cornerNotch`) devem deixar a **quina inferior esquerda** e a **quina superior direita** do recorte retas (`borderBottomLeftRadius: 0`, `borderTopRightRadius: 0`), mantendo a curva interna superior esquerda do notch (`borderTopLeftRadius: 20`) e o canto externo inferior direito (`borderBottomRightRadius: 24`, ou `borderRadius: 20` na base de estilo para compatibilidade de testes sobrescrito por `borderBottomLeftRadius: 0` e `borderTopRightRadius: 0`).
   - **Inversão das Curvas de Concordância (Fillets):**
     - Nos conectores côncavos (`filletTopContainer` e `filletLeftContainer`), a **cor externa (container do fillet)** deve ser a cor laranja/acento do próprio card (`backgroundColor: cardBgColor`) e a **curva interna (`filletInnerCurve`)** deve assumir a cor escura do notch (`backgroundColor: notchBgColor`), criando um recorte côncavo perfeito sem cantos vazados.
2. **Background Orgânico e Difuso (Blur):**
   - Cada card gera deterministicamente (a partir do `id` ou índice da carteira) um conjunto de **3 a 4 formas elípticas orgânicas** com posições, dimensões e ângulos variados, renderizadas com múltiplas camadas concêntricas de opacidade decrescente (`0.35`, `0.20`, `0.10`) para produzir efeito suave de desfoque (*gaussian blur*).
3. **Elevação e Camada de Sobreposição (`Z-Index`):**
   - `heroWrapper` deve aplicar `zIndex: 999` e `elevation: 24`, e o container pai no `ScrollView` deve garantir que durante o gesto de arrasto (`translateY`), o card ativo passe **por cima** da fileira de botões Bento e demais componentes abaixo dele.
4. **Estados da Pilha (Empty State & Card de Nova Carteira):**
   - **Zero Carteiras (`portfolios.length === 0`):** Renderiza um card base **fixo/imóvel** (`testID="stacked-wallet-empty-card"`, sem `panHandlers` de troca) exibindo mensagem de estado vazio (*"Nenhuma carteira cadastrada"*) e botão CTA (`testID="empty-wallet-create-cta"`, *"Criar primeira carteira"*) que aciona `onCreatePortfolioPress`.
   - **Uma ou mais Carteiras (`portfolios.length >= 1`):** Adiciona automaticamente ao final da pilha um card extra móvel (`id: '__add_wallet_card__'`, `testID="stacked-wallet-add-card"`) com o mesmo formato e notch, sugerindo a criação de uma nova carteira (ícone `+` e CTA `testID="add-wallet-card-cta"`). Este card participa normalmente da física de arrasto da pilha (puxar avança de volta ao 1º card) e tocar no CTA abre o modal de criação de carteira.

---

### Módulo 2 — Gráficos de Alocação (`DotMatrixAllocationCard.tsx` & `AttributeStatBar.tsx`)
1. **Sentido de Renderização Esquerda → Direita:**
   - Em `DotMatrixAllocationCard` e `AttributeStatBar` / `DotMatrixGrid`, o preenchimento das colunas de pontos e barras de alocação deve fluir **sempre da esquerda para a direita** (`fillDirection="left-to-right"`, iniciando na coluna `0` à esquerda até `cols - 1` à direita).

---

### Módulo 3 — Padronização Global de Header (`XpMinimalHeader.tsx`)
1. **Header Padrão Único em Todas as Telas:**
   - O componente `XpMinimalHeader` passa a suportar a prop opcional `onBack?: () => void` (exibindo botão circular `arrow-back` `testID="header-back-button"` à esquerda quando presente) e `subtitle?: string`.
   - **Remoção de Indicadores Avulsos:** Na `TransactionDetailHistoryScreen.tsx`, remover o badge superior `• PETR4` (`styles.tickerBadge`) e a barra customizada antiga, substituindo pelo `XpMinimalHeader`.
   - **Auditoria 100% das Telas:** Garantir que `Home`, `StatisticsScreen`, `PortfolioManagementScreen`, `ClassDetailScreen`, `TransactionDetailHistoryScreen`, `AllTransactionsScreen`, `SettingsBackupScreen`, `TransactionScreen` e `SimulatorScreen` utilizem o `XpMinimalHeader` padronizado.

---

### Módulo 4 — Tela da Carteira e Configuração de Metas/Pesos (`PortfolioManagementScreen.tsx`)
1. **Redesign Visual Editorial:**
   - Alinhar tipografia, cards, abas e espaçamentos às referências do BTG e XP (`/imgsinsp`), eliminando aparência genérica de formulário.
2. **Remoção de Incrementos e Badges de Validação:**
   - Remover todos os botões `-5%` e `+5%`.
   - Remover todos os badges `"100% OK"` / `"AJUSTE P/ 100%"`, pois o motor reativo garante soma constante em `100%`.
3. **Motor de Rebalanceamento Reativo Proporcional + Cadeado (`Lock/Unlock`):**
   - Cada classe e cada ativo possui um botão de **Cadeado** (`testID="lock-class-${assetClass}"` / `testID="lock-asset-${assetId}"`) e um **Input Numérico Editável** (`testID="input-class-${assetClass}"` / `testID="input-asset-${assetId}"`).
   - Ao alterar o valor de um item destravado $i$ para $v_i$:
     - Seja $L = \sum_{k \in \text{locked}} p_k$ a soma dos itens travados.
     - $v_i$ é limitado ao teto disponível: $v_i = \max(0, \min(100 - L, v_i))$.
     - O restante $R = 100 - L - v_i$ é redistribuído **proporcionalmente** entre os demais itens destravados ($j \neq i, j \notin \text{locked}$). Se todos os demais destravados estiverem com `0`, $R$ é dividido igualmente entre eles.
     - Itens com cadeado fechado (`isLocked = true`) permanecem estritamente inalterados.
4. **Edição Rápida Inline e Alternância Peso vs. %:**
   - A edição de meta/peso com cadeado e recálculo automático funciona diretamente nos cards da listagem geral de ativos da carteira, com toggle entre **Porcentagem (`%`)** e **Peso (`Pts`)**.

---

### Módulo 5 — Modal de Adicionar Ativo (`PortfolioManagementScreen.tsx`)
1. **Campo de Busca com Autocomplete:**
   - Input `testID="asset-autocomplete-input"` que filtra em tempo real o catálogo de ativos (ex.: `PETR4`, `VALE3`, `WEGE3`, `ITUB4`, `BBAS3`, `ALUP11`, `BBDC4`, `HGLG11`, `MXRF11`, `BTLG11`, `KNRI11`, `CDB DI 110%`, `TESOURO IPCA+`, `BTC`, `ETH`, `SOL`) e exibe lista clicável de sugestões (`testID="autocomplete-option-${ticker}"`) preenchendo automaticamente Ticker, Nome e Classe/Preço sugerido.
2. **Explicação Clara sobre "Peso":**
   - Bloco informativo (`testID="weight-helper-card"`) explicando de forma amigável que o **Peso** define a importância relativa do ativo dentro da categoria (ex.: um ativo com peso `2` recebe o dobro da alocação de um ativo com peso `1`, convertendo-se automaticamente em `%`).
3. **Toggle Peso ↔ Porcentagem (`%`) com Cadeado:**
   - Seletor (`testID="add-asset-mode-percent"` / `testID="add-asset-mode-weight"`) que alterna o modo de inserção e exibe a distribuição resultante entre os ativos existentes daquela classe (com suporte ao cadeado para travar ativos específicos durante a entrada do novo ativo).

---

### Módulo 6 — Tela de Categoria de Ativo (`ClassDetailScreen.tsx`)
1. **Gráfico Donut (Rosca Vazada no Centro):**
   - Substituir a barra horizontal reta por um verdadeiro **Gráfico de Rosca (Donut Chart)** circular vazado no centro (`testID="class-donut-chart"`), exibindo os segmentos curvos proporcionais à alocação de cada ativo (`testID="donut-slice-${ticker}"`) e o total/quantidade de ativos no centro oco.
2. **Interações do Gráfico e da Lista:**
   - **Clique simples (`onPress`) na fatia do gráfico (`donut-slice-${ticker}`):** Exibe o card flutuante de resumo (`testID="donut-tooltip"`) com Ticker, Nome, `%` de alocação e Saldo Bruto do ativo.
   - **Clique no nome do ativo dentro do card flutuante (`testID="donut-tooltip-scroll-btn"`):** Executa o scroll suave (`scrollTo({ y, animated: true })`) até o card daquele ativo na listagem abaixo.
   - **Clique no card do ativo na listagem (`testID="asset-card-${ticker}"`):** Navega para a tela de detalhes/histórico daquele ativo (`TransactionDetailHistoryScreen`).
   - **Remoção total de Press & Hold (`onLongPress`):** Nenhum evento `onLongPress` deve existir nas fatias ou na legenda.

---

### Módulo 7 — Tela de Configurações no Padrão XP (`SettingsBackupScreen.tsx`)
1. **Arquitetura Visual Inspirada no Perfil da XP (`Screenshot_20261031_234532_XP Investimentos.jpg`):**
   - **Header Padrão:** `XpMinimalHeader` no topo com botão voltar.
   - **Bloco de Perfil Superior (`testID="investor-profile-card"`):** Avatar circular `PL` com ícone de edição, selo `Celsus | Dossiê Local`, nome `Pedro`, barra horizontal de nível (`Local-First ─── Sovereign`) e pílula de status.
   - **Módulo `Dados das carteiras`:** Cards horizontais lado a lado resumindo Carteira Principal e Reserva/Consolidado.
   - **Módulo Personalização:** Card agrupado com Seletor de *Aparência (Tema Escuro / Claro)*. O Modo Privacidade é controlado exclusivamente pelo ícone de olho no Header XP superior (zero switch redundante).
   - **Módulo `Segurança`:** Card agrupado com *Bloqueio Biométrico / PIN* e *Validar Biometria*.
   - **Módulo `Gestão de dados (.celsus.zip)`:** Card agrupado com *Exportar Dossiê (.celsus.zip)*, *Modo de Importação (Mesclar / Restaurar)* e *Importar Backup*.

---

### Módulo 8 — Navegação, Speed-Dial do Botão `+` da Navbar, Placeholders e Correção de Rotas (`App.tsx`, `FloatingBottomDock.tsx`, `QuickActionBentoRow.tsx`)
1. **Botão `+` da Navbar com Botões Empilhados Acima Dele (Speed-Dial Inline, SEM Modal):**
   - Ao tocar no botão circular `+` (`floating-dock-action-button` / `dock-item-add-fab`) na barra de navegação inferior (`FloatingBottomDock`), **não deve ser aberto um `<Modal>`**.
   - Em vez disso, o ícone `+` rotaciona `45deg` (`×`) e renderiza **diretamente acima do botão `+`** (em um container `position: 'absolute'`, `bottom: 76`, `right: 0`, `testID="fab-speed-dial-stack"`) os **demais botões de ação empilhados verticalmente** com animação fluida de subida (`Animated.spring` de `translateY` e `opacity`):
     1. **Nova Carteira** (`testID="fab-action-nova-carteira"`)
     2. **Adicionar Ativo** (`testID="fab-action-adicionar-ativo"`)
     3. **Nova Movimentação** (`testID="fab-action-novo-aporte"`)
2. **Interceptação de Botões em Desenvolvimento:**
   - Nos botões **Globo** (`header-globe-button`), **Card Bento "Mais"** (`bento-action-mais`) e **3º ícone da barra de navegação inferior** (`dock-tab-history`), interceptar o clique para exibir alerta/toast `"Funcionalidade em desenvolvimento"` (`testID="dev-placeholder-banner"` + `Alert.alert`), bloqueando qualquer navegação ou abertura de menu secundário.
3. **Correção da Rota "Ver todas as transações":**
   - Clicar em `"Ver tudo >"` (`testID="recent-tx-view-all-btn"`) no card `Movimentações Recentes` da Home **não** deve abrir a tela de criar transação (`TransactionScreen`), mas sim navegar para a tela de **Extrato Completo de Movimentações (`AllTransactionsScreen` / visualização de todas as transações registradas)** (`testID="all-transactions-screen"`).

---

### Módulo 9 — Auditoria Completa de Tema Claro (`Light Mode`)
1. **Padronização Cromática e Contraste em 100% das Telas:**
   - Fundo primário `#F4F1EA`, superfície de cards `#FFFFFF`, superfícies secundárias/inputs `#F8F5EE`, bordas `#EAE4D7`, texto primário `#111315`, texto secundário `#6E6A63`.
   - Correção integral de todos os textos, ícones, modais, inputs e blocos da nova `SettingsBackupScreen`, `PortfolioManagementScreen`, `ClassDetailScreen`, `TransactionDetailHistoryScreen`, `AllTransactionsScreen`, `SimulatorScreen`, `TransactionScreen` e `StatisticsScreen` no modo `light`.

---

## 3. Prompts de Execução por Sprint (Fluxo TDD Lock: Fase A & Fase B)

### SPRINT 16 — Cards da Carteira (Notch, Blur, Z-Index, Empty/Add States) & Gráfico Esquerda → Direita

#### Prompt da Sprint 16 — Fase A (Autoria e Bloqueio de Testes)
```markdown
Vamos executar a **Sprint 16 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `REFACTORING_SPEC.md` (Módulos 1 e 2).

1. Desbloqueie os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action unlock`).
2. Atualize as assinaturas de `StackedWalletDeck.tsx` (adicionando suporte a `onCreatePortfolioPress?: () => void`, estado vazio `portfolios=[]` e card extra móvel no final da pilha) e `DotMatrixAllocationCard.tsx` / `AttributeStatBar.tsx` (`fillDirection="left-to-right"` como padrão).
3. Atualize os testes existentes que mudaram de regra e crie a nova suíte `apps/mobile/src/components/ui/__tests__/Sprint16WalletStackAndAllocation.test.tsx`:
   - Verifique que o `heroCard` e `cornerNotch` possuem `borderWidth: 0` e quinas inferior-esquerda e superior-direita retas (`borderBottomLeftRadius: 0`, `borderTopRightRadius: 0`).
   - Verifique que as curvas do notch (`filletTopContainer` e `filletLeftContainer`) possuem a cor externa do card (`cardBgColor`) e a curva interna (`filletInnerCurve`) na cor escura do notch (`#191B1D`).
   - Verifique que `heroWrapper` aplica `zIndex` elevado (`>= 100`) para sobrepor elementos da tela durante a animação.
   - Verifique o **Empty State** (`portfolios={[]}`): renderiza `stacked-wallet-empty-card` fixo com CTA `empty-wallet-create-cta` que chama `onCreatePortfolioPress`.
   - Verifique o **Estado 1+ Carteiras**: adiciona um card móvel ao final da pilha (`stacked-wallet-add-card`) que cicla na pilha e cujo CTA (`add-wallet-card-cta`) chama `onCreatePortfolioPress`.
   - Verifique que `DotMatrixAllocationCard` (incluindo `variant="v2"`) preenche as colunas da esquerda para a direita (`left-to-right`, coluna `0` preenchida antes da coluna `9`), ajustando `DotMatrixV2.test.tsx` de acordo.
4. Bloqueie todos os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock`) e atualize `TEST_REPORT.md`.
5. Faça o commit e push da Fase A: `git add . ; git commit -m "test(sprint-16): add and lock phase A wallet stack and left-to-right allocation tests" ; git push origin main`.
```

#### Prompt da Sprint 16 — Fase B (Implementação sob Bloqueio)
```markdown
Vamos executar a **Sprint 16 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `REFACTORING_SPEC.md` (Módulos 1 e 2).

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado em `tests.lock.json`.

Passos:
1. Em `StackedWalletDeck.tsx`:
   - Remova a borda geral do card (`borderWidth: 0`).
   - Deixe a quina inferior esquerda e a quina superior direita do notch retas (`borderBottomLeftRadius: 0`, `borderTopRightRadius: 0`) e inverta as cores dos fillets (`filletTopContainer` e `filletLeftContainer` com `backgroundColor: cardBgColor`, e `filletInnerCurve` com `backgroundColor: notchBgColor`).
   - Gere formas orgânicas elípticas difusas (blur em camadas) variadas por carteira no background do card.
   - Aplique `zIndex: 999` e `elevation: 24` no container do deck para que os cards passem por cima de todos os elementos durante o arrasto.
   - Implemente o card fixo de Empty State quando `portfolios.length === 0` e o card móvel de "Nova Carteira" ao final da pilha quando `portfolios.length >= 1`.
2. Em `DotMatrixAllocationCard.tsx` e `AttributeStatBar.tsx`:
   - Padronize o preenchimento para fluir da esquerda para a direita (`fillDirection="left-to-right"`).
3. Rode `npm --prefix apps/mobile test -- --runInBand`, verifique o lock com `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
4. Faça o commit e push da Fase B: `git add . ; git commit -m "feat(sprint-16): complete phase B wallet stack notch, organic blur, empty/add states and left-to-right charts" ; git push origin main`.
```

---

### SPRINT 17 — Header Padrão Global, Tela de Categoria (Donut Chart Real & Interações) e Rotas/Placeholders

#### Prompt da Sprint 17 — Fase A (Autoria e Bloqueio de Testes)
```markdown
Vamos executar a **Sprint 17 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `REFACTORING_SPEC.md` (Módulos 3, 6 e 8).

1. Desbloqueie os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action unlock`).
2. Atualize os contratos/stubs em `XpMinimalHeader.tsx` (`onBack?: () => void`), `ClassDetailScreen.tsx`, `TransactionDetailHistoryScreen.tsx`, `QuickActionBentoRow.tsx`, `FloatingBottomDock.tsx` e `App.tsx`.
3. Atualize `ClassDetailScreen.test.tsx` e `QuickActionsMoreMenu.test.tsx` para refletir as novas regras e crie `apps/mobile/src/screens/__tests__/Sprint17HeaderDonutAndRoutes.test.tsx`:
   - **Módulo 3 (Header Global):** Verifica que `TransactionDetailHistoryScreen` não exibe mais o indicador `• PETR4` no topo e renderiza `XpMinimalHeader` (`xp-minimal-header`), assim como `ClassDetailScreen`, `StatisticsScreen` e `PortfolioManagementScreen`.
   - **Módulo 6 (Donut Chart & Interações em `ClassDetailScreen`):**
     - Verifica que o gráfico é um Donut Chart circular oco (`class-donut-chart`) e que `onLongPress` foi removido das fatias.
     - Verifica que o clique simples (`fireEvent.press`) na fatia `donut-slice-PETR4` exibe o card flutuante de resumo (`donut-tooltip`).
     - Verifica que clicar no nome do ativo no card flutuante (`donut-tooltip-scroll-btn`) dispara o `scrollTo` suave até o ativo na lista.
     - Verifica que clicar no card do ativo na listagem (`asset-card-PETR4`) navega para a tela de detalhes do ativo (`onAssetPress`).
   - **Módulo 8 (Speed-Dial `+` da Navbar, Placeholders & Rota de Transações):**
     - Verifica que clicar no botão `+` da Navbar (`floating-dock-action-button`) **não** abre um `<Modal>`, mas exibe diretamente acima dele (`fab-speed-dial-stack`) os botões de ação empilhados (`fab-action-nova-carteira`, `fab-action-adicionar-ativo`, `fab-action-novo-aporte`).
     - Verifica que clicar no botão Globo (`header-globe-button`), no botão Bento "Mais" (`bento-action-mais`) ou no 3º ícone da Navbar (`dock-tab-history`) exibe o aviso `"Funcionalidade em desenvolvimento"` e bloqueia navegação secundária.
     - Verifica que clicar em `"Ver tudo"` (`recent-tx-view-all-btn`) em Movimentações Recentes na Home abre a visualização de Extrato Completo de Transações (`all-transactions-screen`) e não o formulário de criar transação.
4. Bloqueie todos os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock`) e atualize `TEST_REPORT.md`.
5. Faça o commit e push da Fase A: `git add . ; git commit -m "test(sprint-17): add and lock phase A global header, donut chart interactions and route fixes" ; git push origin main`.
```

#### Prompt da Sprint 17 — Fase B (Implementação sob Bloqueio)
```markdown
Vamos executar a **Sprint 17 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `REFACTORING_SPEC.md` (Módulos 3, 6 e 8).

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado em `tests.lock.json`.

Passos:
1. Evolua `XpMinimalHeader.tsx` com suporte a `onBack` e integre-o como Header padrão em todas as telas do app, removendo o badge `• PETR4` do topo de `TransactionDetailHistoryScreen.tsx`.
2. Em `ClassDetailScreen.tsx`:
   - Substitua a barra reta por um Gráfico de Rosca (Donut Chart) circular vazado no centro.
   - Remova completamente `onLongPress`.
   - Faça o clique na fatia abrir o card flutuante (`donut-tooltip`), o clique no nome dentro do card flutuante rolar suavemente até o ativo (`scrollTo`), e o clique no card do ativo na listagem abrir os detalhes daquele ativo.
3. Em `App.tsx`, `QuickActionBentoRow.tsx` e `FloatingBottomDock.tsx`:
   - Em `FloatingBottomDock.tsx`, remova o `<Modal>` do botão `+` e exiba os botões de ação secundários empilhados **diretamente acima do botão `+`** (`fab-speed-dial-stack` com posicionamento absoluto e animação spring).
   - Intercepte os cliques no Globo, no Bento "Mais" e no 3º ícone da Navbar para exibir o toast/alerta `"Funcionalidade em desenvolvimento"`, bloqueando ações secundárias.
   - Corrija o botão `"Ver tudo >"` de Movimentações Recentes para abrir a tela de Extrato Completo de Transações (`AllTransactionsScreen`), permitindo visualizar todas as movimentações e clicar em qualquer item para ver seus detalhes.
4. Rode `npm --prefix apps/mobile test -- --runInBand`, verifique o lock com `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
5. Faça o commit e push da Fase B: `git add . ; git commit -m "feat(sprint-17): complete phase B global header, donut chart interactions and navigation fixes" ; git push origin main`.
```

---

### SPRINT 18 — Tela da Carteira (Rebalanceamento Reativo 100% + Cadeado + Edição Inline) e Modal de Adicionar Ativo (Autocomplete + Peso vs %)

#### Prompt da Sprint 18 — Fase A (Autoria e Bloqueio de Testes)
```markdown
Vamos executar a **Sprint 18 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `REFACTORING_SPEC.md` (Módulos 4 e 5).

1. Desbloqueie os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action unlock`).
2. Crie `apps/mobile/src/domain/finance/reactiveWeights.ts` (assinaturas/stubs de `recalculateUnlockedTargets` e `convertWeightsToPercentagesWithLocks`) e atualize as props de `PortfolioManagementScreen.tsx`.
3. Crie a suíte de testes `apps/mobile/src/screens/__tests__/Sprint18ReactiveLockWeightsAndAutocomplete.test.tsx`:
   - **Testes de Domínio (Rebalanceamento Reativo e Cadeado):**
     - Ao editar um item destravado (ex.: mudando Ações de `40%` para `55%`), os demais itens destravados são recalculados proporcionalmente para fechar exatamente em `100%`.
     - Ao travar um item com o Cadeado (`isLocked: true`, ex.: Renda Fixa travada em `30%`), alterar outro item recalcula apenas os itens destravados, mantendo Renda Fixa intacta em `30%`.
     - Impede que um item destravado ultrapasse `100% - SomaTravados`.
     - No modo **Peso**, converte pesos livres (ex.: `2`, `1`, `1`) em porcentagens proporcionais respeitando a porcentagem congelada dos itens com cadeado fechado.
   - **Testes de UI (`PortfolioManagementScreen` — Módulo 4):**
     - Verifica que os botões `-5%` e `+5%` e os badges `"100% OK"` / `"AJUSTE"` foram completamente removidos.
     - Verifica a presença de input numérico editável e botão de Cadeado (`lock-class-*` e `lock-asset-*`) tanto nas classes quanto diretamente na listagem geral de ativos (Edição Rápida inline).
   - **Testes de UI (Modal de Adicionar Ativo — Módulo 5):**
     - Verifica o campo de busca com Autocomplete (`asset-autocomplete-input`), que exibe sugestões ao digitar (ex.: `"PETR"` sugere `"PETR4 - Petróleo Brasileiro S.A."`) e preenche o ativo ao clicar.
     - Verifica a presença da explicação sobre funcionamento do Peso (`weight-helper-card`) e do toggle entre **Peso** e **Porcentagem (%)** com recálculo automático e cadeado.
4. Bloqueie todos os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock`) e atualize `TEST_REPORT.md`.
5. Faça o commit e push da Fase A: `git add . ; git commit -m "test(sprint-18): add and lock phase A reactive lock weights and asset autocomplete tests" ; git push origin main`.
```

#### Prompt da Sprint 18 — Fase B (Implementação sob Bloqueio)
```markdown
Vamos executar a **Sprint 18 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `REFACTORING_SPEC.md` (Módulos 4 e 5).

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado em `tests.lock.json`.

Passos:
1. Implemente `src/domain/finance/reactiveWeights.ts` com o motor de cálculo reativo proporcional (`100%` garantido), suporte a itens travados por cadeado (`isLocked`) e conversão bidirecional entre Modo Peso e Modo Porcentagem (`%`).
2. Refatore `PortfolioManagementScreen.tsx`:
   - Aplique o novo design editorial alinhado às referências da pasta `/imgsinsp`.
   - Remova todos os botões `-5%` / `+5%` e os indicadores `"100% OK"`.
   - Implemente inputs numéricos digitáveis + botão de Cadeado (`lock` / `lock-open`) nas classes e diretamente nos cards da listagem de ativos da carteira (Edição Rápida).
   - No Modal de Adicionar Ativo, implemente o Autocomplete de ativos, o card explicativo de Peso e o toggle **Peso ↔ Porcentagem (%)** integrado ao sistema de recálculo automático e cadeado.
3. Rode `npm --prefix apps/mobile test -- --runInBand`, verifique o lock com `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
4. Faça o commit e push da Fase B: `git add . ; git commit -m "feat(sprint-18): complete phase B portfolio redesign, reactive lock weights and autocomplete modal" ; git push origin main`.
```

---

### SPRINT 19 — Tela de Configurações Padrão XP e Auditoria Completa de Tema Claro (Light Mode)

#### Prompt da Sprint 19 — Fase A (Autoria e Bloqueio de Testes)
```markdown
Vamos executar a **Sprint 19 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `REFACTORING_SPEC.md` (Módulos 7 e 9).

1. Desbloqueie os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action unlock`).
2. Crie a suíte `apps/mobile/src/screens/__tests__/Sprint19XpSettingsAndLightModeAudit.test.tsx`:
   - **Módulo 7 (Tela de Configurações padrão XP):**
     - Verifica que `SettingsBackupScreen` utiliza o `XpMinimalHeader` no topo, seguido pelo bloco de Perfil estilo XP (`investor-profile-card` com iniciais, nome, nível `Local-First` / `Sovereign`), cards horizontais de resumo das carteiras (`Dados das carteiras`), e blocos modulares agrupados com linhas de lista para `Personalização`, `Segurança` e `Gestão de dados (.celsus.zip)`.
   - **Módulo 9 (Auditoria de Tema Claro):**
     - Renderiza `SettingsBackupScreen`, `PortfolioManagementScreen`, `ClassDetailScreen`, `TransactionDetailHistoryScreen`, `StatisticsScreen`, `TransactionScreen` e `SimulatorScreen` com `themeMode="light"` e verifica que os containers principais utilizam o fundo claro editorial (`#F4F1EA`), os cards utilizam superfície clara (`#FFFFFF`) e os textos principais utilizam alto contraste escuro (`#111315`), sem textos brancos invisíveis sobre fundo claro.
3. Bloqueie todos os testes (`powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock`) e atualize `TEST_REPORT.md`.
4. Faça o commit e push da Fase A: `git add . ; git commit -m "test(sprint-19): add and lock phase A XP settings layout and light mode audit tests" ; git push origin main`.
```

#### Prompt da Sprint 19 — Fase B (Implementação sob Bloqueio)
```markdown
Vamos executar a **Sprint 19 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `REFACTORING_SPEC.md` (Módulos 7 e 9).

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado em `tests.lock.json`.

Passos:
1. Reestruture `SettingsBackupScreen.tsx` seguindo fielmente o layout modular da tela de Perfil da XP (`Screenshot_20261031_234532_XP Investimentos.jpg`), organizando as opções em blocos bem definidos (`Dados das carteiras`, `Personalização`, `Segurança`, `Gestão de dados`) com switches, ícones à esquerda, divisórias finas e suporte completo aos temas Escuro e Claro.
2. Realize a revisão final de Tema Claro (`themeMode="light"`) em todas as telas e componentes do aplicativo, corrigindo quaisquer variáveis de cor, contrastes de texto, fundos de inputs/modais e bordas.
3. Rode toda a suíte de testes (`npm --prefix apps/mobile test -- --runInBand` e `go test ./...`), verifique o lock com `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
4. Faça o commit e push da Fase B: `git add . ; git commit -m "feat(sprint-19): complete phase B XP settings redesign and full light mode audit" ; git push origin main`.
```
