---
name: Celsus v2
colors:
  surface: '#121416'
  surface-dim: '#121416'
  surface-bright: '#37393b'
  surface-container-lowest: '#0c0e10'
  surface-container-low: '#1a1c1e'
  surface-container: '#1e2022'
  surface-container-high: '#282a2c'
  surface-container-highest: '#333537'
  on-surface: '#e2e2e5'
  on-surface-variant: '#dec0b4'
  inverse-surface: '#e2e2e5'
  inverse-on-surface: '#2f3133'
  outline: '#a68b80'
  outline-variant: '#574239'
  surface-tint: '#ffb694'
  primary: '#D96628'
  on-primary: '#111315'
  primary-container: '#e56f30'
  on-primary-container: '#4c1a00'
  inverse-primary: '#a14000'
  secondary: '#2E4A44'
  on-secondary: '#E6DECA'
  secondary-container: '#324e48'
  on-secondary-container: '#a0bfb7'
  tertiary: '#D5CAA8'
  on-tertiary: '#191B1D'
  tertiary-container: '#9a9072'
  on-tertiary-container: '#2f2912'
  neutral: '#191B1D'
  void-floor: '#111315'
  parchment-pale: '#E6DECA'
  oxidized-slag: '#1B3530'
  deficit: '#B84A1C'
  fixed-income: '#2E4A44'
  fii: '#D5CAA8'
  stock: '#D96628'
  crypto: '#C49A45'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  background: '#111315'
  on-background: '#e2e2e5'
  surface-variant: '#333537'
  light-background: '#F4F1EA'
  light-surface: '#FFFFFF'
  light-surface-container: '#EAE4D7'
  light-on-surface: '#191B1D'
  light-muted: '#6E6A63'
typography:
  headline-xl:
    fontFamily: Space Mono
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Space Mono
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Space Mono
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Mono
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Mono
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
  headline-sm:
    fontFamily: Space Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Space Mono
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Space Mono
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Space Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Space Mono
    fontSize: 15px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.06em
  label-md:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.25rem
  lg: 1.5rem
  xl: 1.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-mobile: 0.75rem
  margin: 1.25rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.875rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## 1. Visão Geral Visual — Celsus v2 (Clean Bento + Inspiração XP / BTG / Pierre + Paletas por Carteira)

O Design System **Celsus v2** refina a fundação *WalleZ Modern Bento* com um visual mais limpo, fluido e interativo, inspirado nas referências em `/imgsinsp` (Pierre, XP Investimentos, BTG Investimentos e as 3 cartelas cromáticas *Disco Elysium*).

### Princípios Visuais do v2
1. **Esfera Luminosa no Topo (`AmbientOrb`):** No topo da tela principal, uma esfera difusa multicamada cria uma atmosfera luminosa elegante (inspirada no app Pierre), reagindo suavemente à cor da carteira selecionada no momento.
2. **Header Minimalista Estilo XP na Home (e Zero Header nas demais telas):**
   - Na **Home**: Avatar circular com as iniciais do usuário + Nome à esquerda (tocar abre a **Página de Configurações**). À direita, dois botões circulares: um **ícone de Globo** (`language` / `public`, placeholder para futura alternância entre *Investimentos* e *Movimentações Bancárias*) e o **ícone de Olho** (`visibility` / `visibility-off`) para alternar o Modo Privacidade.
   - Nas **demais páginas** (`Estatísticas`, `Carteiras`, `Detalhe da Classe`, `Histórico da Movimentação`): **nenhuma página possui header fixo de título**; a navegação é mantida pelo **Footer Flutuante (`FloatingBottomDock`) presente em todas as telas** e por transições suaves.
3. **Coerência Cromática (Paletas por Carteira + Cores Fixas de Classes):**
   - Cada carteira possui sua própria paleta temática (que colore o Card da Carteira, a Esfera Luminosa do topo e os acentos ativos).
   - **As 4 classes de ativos mantêm sempre suas cores fixas** em todo o app, e o fundo respeita globalmente o **Tema Escuro (`#111315`)** ou **Tema Claro (`#F4F1EA`)** escolhido nas Configurações.

---

## 2. Sistema de Cores: Classes Fixas, Paletas por Carteira e Tema Escuro/Claro

### 2.1. Cores Imutáveis das 4 Categorias de Ativos (`ASSET_CLASS_ATTRIBUTE_MAP`)
Independentemente da carteira selecionada ou do tema (Escuro/Claro), as 4 categorias mantêm sempre a mesma identidade cromática:
- `FIXED_INCOME` → **Renda Fixa** (`#2E4A44`) — Tesouro Direto, CDB, LCI, LCA, Debêntures
- `FII` → **FIIs** (`#D5CAA8`) — Fundos de Investimento Imobiliário
- `STOCK` → **Ações** (`#D96628`) — Ações listadas na B3
- `CRYPTO` → **Criptomoedas** (`#C49A45`) — Bitcoin, Ethereum e criptoativos

### 2.2. Paletas Temáticas por Carteira (Inspiradas em `/imgsinsp`)
Cada carteira (incluindo a visão Consolidada) recebe uma paleta temática que estiliza o **Card em Pilha (`StackedWalletDeck`)**, a **Esfera Luminosa (`AmbientOrb`)** e os destaques ativos:

| ID da Paleta | Nome | Inspiração (`/imgsinsp`) | Cor Principal do Card (`cardBg`) | Cor Secundária / Orb (`orbSecondary`) | Destaque / Badge (`accent`) | Texto sobre Card (`onCard`) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `classic` | **Celsus Terracotta** | Paleta Original Celsus | `#D96628` | `#2E4A44` | `#D5CAA8` | `#111315` |
| `harbor` | **Porto & Containers** | `disco-elysium...a7v6mgkbkec81` | `#DB5A42` | `#4A4656` | `#F1CA78` | `#1D1B2A` |
| `docks` | **Luzes das Docas** | `disco-elysium...lhhbfdkbkec81` | `#EF9F43` | `#5B525C` | `#EDE145` | `#1D1B27` |
| `tribunal` | **Pátio & Ouro** | `disco-elysium...z1bl1dkbkec81` | `#F1B819` | `#535A49` | `#AC4B25` | `#222526` |

> **Paleta de Fatias Internas do Gráfico de Rosca (Detalhe da Classe):** Ao abrir os ativos dentro de uma classe, as fatias do gráfico de pizza oco utilizam tons derivados das cartelas cromáticas (`#DB5A42`, `#F1CA78`, `#EDE8B8`, `#72743D`, `#D1DDF7`, `#EF9F43`, `#4A525D`, `#AC4B25`) para distinguir claramente cada ativo individual.

### 2.3. Superfícies do Tema Escuro (`dark`) e Tema Claro (`light`)
- **Tema Escuro (Padrão):**
  - Fundo Raiz (`background`): `#111315`
  - Superfície de Card (`surface`): `#191B1D`
  - Superfície Secundária / Recorte (`surfaceContainer`): `#202224`
  - Texto Primário (`onSurface`): `#E6DECA`
  - Texto Secundário (`muted`): `#8A8A8E`
- **Tema Claro:**
  - Fundo Raiz (`background`): `#F4F1EA`
  - Superfície de Card (`surface`): `#FFFFFF`
  - Superfície Secundária / Recorte (`surfaceContainer`): `#EAE4D7`
  - Texto Primário (`onSurface`): `#191B1D`
  - Texto Secundário (`muted`): `#6E6A63`

---

## 3. Componentes e Padrões de Interação (v2)

### 3.1. Card da Carteira em Pilha Interativa (`StackedWalletDeck` / `DossierCard` v2)
- **Mecânica de Pilha Vertical (Pull-to-Cycle):**
  - As carteiras ficam empilhadas fisicamente.
  - **Puxar o card atual para baixo (Swipe Down):** uma animação suave traz a próxima carteira da pilha para o topo.
  - **Puxar o card para cima (Swipe Up):** volta para a carteira anterior da pilha.
- **Geometria e Cor Estendida com Recorte Curvo (`Corner Cutout`):**
  - A cor temática da carteira (`cardBg`) preenche **todo o cartão**, estendendo-se até a base esquerda onde antes ficava `"DOSSIÊ CONSOLIDADO"`.
  - No canto inferior esquerdo (dentro da área colorida), exibe o **Nome da Carteira** e a **Rentabilidade** (`+12,4% no ano` / `R$ +3.580,00`).
  - No **canto inferior direito**, o código curto (`•••• 001`) permanece sobre um **quadrado da cor escura do card (`#191B1D` / `#111315`) com borda curva integrada ao formato do cartão** (*integrated corner notch*).

### 3.2. Botões de Acesso Rápido Ampliados & Menu "Mais" (`QuickActionBentoRow` v2)
- 3 Bento Tiles lado a lado com **ícones maiores (`28px`–`30px`)** e **texto maior (`15px`–`16px`, `fontWeight: '700'`)**:
  1. **Aportar** (`north-east`)
  2. **Simular** (`calculate`)
  3. **Mais** (`add` / `grid-view`) → Ao clicar em **Mais**, abre um modal/sheet com **duas opções**:
     - **Novo Aporte** (abre a tela de lançamento de aporte)
     - **Nova Carteira** (abre o modal de criação de carteira com escolha de nome e paleta)

### 3.3. Card de Alocação por Categoria (`DotMatrixAllocationCard` & `AttributeStatBar` v2)
- **Cabeçalho do Card:**
  - Título `"ALOCAÇÃO POR CATEGORIA"` à esquerda (**sem** o subtítulo `"Matriz de Pontos • 4 Classes Reais"`).
  - No canto superior direito (onde antes ficava o valor total em `R$`), entra o **Botão "Rebalancear"** na cor `#D5CAA8` (`tertiary`), substituindo o antigo card avulso de rebalanceamento.
- **Linha de Cada Categoria (`AttributeStatBar`):**
  - À esquerda: Quadrado colorido + Nome da Categoria (`RENDA FIXA`, `FIIS`, `AÇÕES`, `CRIPTOMOEDAS`).
  - À direita: **Valor aportado/investido na classe + Porcentagem atual** (ex.: `R$ 10.389,76 • 32,0%`), **sem** exibir `/ META X%`.
  - **Matriz de Pontos em Colunas da Direita para a Esquerda (`DotMatrixGrid`):** Os pontos são preenchidos **coluna por coluna, partindo da direita para a esquerda**.
  - **Interação de Clique:** Clicar em qualquer uma das 4 classes navega com animação suave para a **Tela de Detalhe da Classe (`ClassDetailScreen`)**.

### 3.4. Tela de Detalhe da Classe (`ClassDetailScreen`)
- **Gráfico de Pizza Oco (Donut Chart):**
  - Exibe a participação percentual de cada ativo dentro da classe selecionada.
  - **Segurar em cima de uma cor (`onLongPress`):** Mostra uma caixa de texto flutuante (*tooltip*) com o **nome do ativo, ticker e % de alocação**.
  - **Clicar na cor (`onPress`):** Faz **scroll automático suave** até o card do respectivo ativo na lista abaixo.
- **Lista de Cards de Ativos (Estilo BTG / XP):**
  - Cada card exibe: Ticker, Nome da empresa/fundo/título, **Saldo Bruto (`R$`)**, **Quantidade**, **Preço Médio (`R$`)**, **Cotação Atual (`R$`)** e **Rentabilidade (`%` e `R$`)**.

### 3.5. Movimentações Recentes e Página de Histórico/Detalhe da Movimentação (`TransactionDetailHistoryScreen`)
- O card de **Movimentações Recentes** fica posicionado **mais acima na Home** (logo após os botões de ação rápida).
- O antigo **Card de Simulação** é removido da Home.
- **Clicar em qualquer registro de movimentação** direciona para a **Página de Histórico dessa Movimentação**, exibindo em destaque o **Valor Investido, Cotação executada, Quantidade, Taxas, Data e Carteira**, além da linha do tempo de operações relacionadas (estilo BTG).

### 3.6. Página de Estatísticas (`StatisticsScreen` v2)
- **Sem header superior.**
- **Seletor de Carteira no Topo:** Exibe o **nome da carteira atual** com seletor permitindo alternar entre qualquer carteira individual ou a opção **"Carteiras Consolidadas"**.
- **Gráfico de Linha com Área Sombreada (Estilo BTG / Pierre):**
  - Seletores de período padronizados: **`5D` (5 dias), `Mês` (`1M`), `Ano` (`1A`), `5A` (5 anos) e `Total`**.
  - Linha contínua suave com preenchimento translúcido abaixo da curva e tooltip ao tocar.
- **Card de Resumo do Período:** Exibe **Patrimônio Inicial**, **Aportes/Movimentações**, **Rendimentos (`R$` e `%`)** e **Patrimônio Final**.

### 3.7. Página de Carteiras na Navbar (`PortfolioManagementScreen` v2)
- **Sem header superior.**
- **Seletor de Carteira em Pilha:** Reaproveita o mesmo mecanismo de puxar o card da carteira para baixo/cima da Home (`StackedWalletDeck`).
- **Visual Limpo (Zero Textos com cara de IA):** Remove textos como `"SISTEMA DE PESOS EM 2 NÍVEIS"`, `"NÍVEL 1: METAS MACRO (Wc)"`, `"NÍVEL 2: METAS MICRO (wi,c)"` e `"META GLOBAL Ti"`, apresentando controles diretos para metas das classes, pesos dos ativos e paleta da carteira.
