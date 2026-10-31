---
name: Celsus
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
    fontSize: 14px
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

## 1. Visão Geral Visual (WalleZ Modern Bento Layout + Paleta Celsus)

O Design System do **Celsus** combina a **paleta autoral (`#D96628`, `#2E4A44`, `#D5CAA8`, `#191B1D`, `#111315`, `#C49A45`) e a tipografia monoespaçada `Space Mono`** com um **layout mobile moderno, limpo e direto de Bento Cards arredondados, cartões empilhados, gráficos de cápsulas/matriz de pontos e barra de navegação flutuante em pílula** (estilo *WalleZ*), usando terminologia financeira clara e real.

### Princípios de Layout
- **Superfícies Arredondadas e Limpas (`Soft Bento Architecture`):** Todos os cartões principais utilizam cantos generosamente arredondados (`22px` a `28px`), preenchimentos escuros suaves (`#191B1D` sobre fundo `#111315`) e espaçamento respirável (`16px`–`20px`).
- **Contraste em Blocos de Cor (Bento Accents):** Ações primárias e cartões de destaque usam preenchimento sólido nas cores da paleta (`#D96628`, `#2E4A44` e `#D5CAA8`) com texto de alto contraste (`#111315` ou `#E6DECA`).
- **Visualização de Dados Tátil (Cápsulas e Matriz de Pontos):** Gráficos de colunas em **pílulas/cápsulas empilhadas** (*Stacked Pill Chart*) e **matrizes de pontos circulares** (*Dot-Matrix Category Grid*) com seletores circulares `W | M | Y`.

---

## 2. Paleta de Cores e Categorias de Ativos

### Cores Principais
- **Primary (`#D96628`):** Usada no CTA principal, no primeiro Bento Tile de ação rápida (`Aportar`), no botão circular flutuante da barra inferior, no recorte de destaque do Hero Card e na categoria **Ações (`STOCK`)**.
- **Secondary (`#2E4A44`):** Usada no segundo Bento Tile (`Simular`), nas cápsulas positivas dos gráficos mensais e na categoria **Renda Fixa (`FIXED_INCOME`)**. (Variante luminosa de apoio: `#AECDC5`).
- **Tertiary (`#D5CAA8`):** Usada em banners de insight, no círculo ativo da barra de navegação inferior e na categoria **FIIs (`FII`)**.
- **Neutral (`#191B1D`):** Superfície padrão de todos os Bento Cards, container de movimentações recentes, terceiro Bento Tile (`Mais`) e dock flutuante inferior.
- **Background (`#111315`):** Fundo raiz de todas as telas, com brilho difuso suave (*ambient glow* em `#D96628` com `opacity: 0.12`) no topo.

### Mapeamento Direto das 4 Categorias de Ativos (`ASSET_CLASS_ATTRIBUTE_MAP`)
Sem nomes fictícios ou placeholders — cada classe usa seu nome real de mercado:
- `FIXED_INCOME` → **Renda Fixa** (`#2E4A44`) — Tesouro Direto, CDB, LCI, LCA, Debêntures
- `FII` → **FIIs** (`#D5CAA8`) — Fundos de Investimento Imobiliário
- `STOCK` → **Ações** (`#D96628`) — Ações listadas na B3
- `CRYPTO` → **Criptomoedas** (`#C49A45`) — Bitcoin, Ethereum e criptoativos

---

## 3. Tipografia (`Space Mono`)

Toda a hierarquia tipográfica utiliza **`Space Mono`** com alinhamento numérico tabular (`tabular-nums`):
- **Saldo Principal no Hero Card (`headline-lg` / `headline-xl`):** `32px`–`36px`, `fontWeight: '600'`, alinhado à direita.
- **Títulos de Seção e Cards (`headline-sm` / `headline-md`):** `18px`–`22px`, `fontWeight: '500'`, cor `#E6DECA`.
- **Itens de Lista e Labels de Bento (`body-md` / `label-lg`):** `14px`–`15px`, `fontWeight: '700'` nos botões e `'400'` nos subtítulos.
- **Subtítulos, Datas e Eixos de Gráfico (`body-sm` / `label-md`):** `12px`–`13px`, cor `#8A8A8E`.

---

## 4. Arquitetura de Telas, Ícones (Material Symbols) e Componentes

> **Regra de Iconografia:** É proibido o uso de emojis (`👁️`, `🎯`, `↗`, etc.) ou caracteres Unicode improvisados na interface. Todos os ícones devem utilizar **Material Symbols / Material Icons** (`@expo/vector-icons/MaterialIcons`).

### Mapeamento Oficial de Ícones (Material Symbols / Icons)
- **Header:**
  - Logo Celsus: `account-balance-wallet`
  - Modo Privacidade: `visibility` (visível) / `visibility-off` (oculto)
- **3 Bento Tiles de Ação Rápida (`QuickActionBentoRow`):**
  - **Aportar:** `north-east`
  - **Simular:** `calculate` (ou `tune`)
  - **Mais / Carteiras:** `grid-view`
- **Categorias de Ativos (`RecentTransactionsCard` & `AttributeStatBar`):**
  - **Renda Fixa (`FIXED_INCOME`):** `account-balance`
  - **FIIs (`FII`):** `domain` (ou `apartment`)
  - **Ações (`STOCK`):** `trending-up`
  - **Criptomoedas (`CRYPTO`):** `currency-bitcoin`
- **Barra de Navegação Flutuante (`FloatingBottomDock`):**
  - **Início (`home`):** `home`
  - **Análises (`stats`):** `bar-chart`
  - **Extrato (`history`):** `receipt-long`
  - **Carteiras (`wallets`):** `pie-chart`
  - **Botão Circular de Ação (`+`):** `add`

### 4.1. Header Minimalista
- À esquerda: Ícone `account-balance-wallet` do **Celsus** + título `"Celsus"` e subtítulo `"GESTÃO DE CARTEIRAS"`.
- À direita: Botão circular (`40x40px`, fundo `#191B1D`) com ícone `visibility` / `visibility-off` para alternar o **Modo Privacidade**.

### 4.2. Hero Wallet Card Empilhado (`DossierCard`)
- **Estrutura de Profundidade:** Container principal (`borderRadius: 28px`, fundo `#191B1D`) com **2 camadas inferiores empilhadas** (`scale: 0.94` e `0.88` em `#1A1C1E` e `#151719`).
- **Recorte Superior Bicolor:**
  - Canto superior esquerdo com dois círculos translúcidos sobrepostos (`#D5CAA8` / `#2E4A44`).
  - Área superior direita destacando o **Saldo Total (`R$ 32.468,00`)** em `#111315` e subtítulo `"Patrimônio Total"`.
  - Rodapé escuro do cartão exibindo o nome da carteira à esquerda (ex.: `"CARTEIRA PRINCIPAL"`), a rentabilidade (`"+12,4% no ano"`) e o indicador curto (`"•••• 001"`) à direita.

### 4.3. Linha de 3 Bento Tiles de Ação Rápida (`QuickActionBentoRow` / `DirectiveButton`)
Três cartões quadrados arredondados (`borderRadius: 22px`, `height: 104px`, `flex: 1`, `gap: 10px`) lado a lado:
1. **Aportar (Primary Tile):** Fundo `#D96628`, ícone Material `north-east` no topo esquerdo e texto `"Aportar"` na base esquerda em `#111315`.
2. **Simular (Secondary Tile):** Fundo `#2E4A44`, ícone Material `calculate` no topo esquerdo e texto `"Simular"` na base esquerda em `#E6DECA`.
3. **Mais / Carteiras (Neutral Tile):** Fundo `#191B1D`, ícone Material `grid-view` no topo esquerdo e texto `"Mais"` na base esquerda em `#E6DECA`.

### 4.4. Card "Alocação por Categoria" (`AttributeStatBar`)
- Container `#191B1D` (`borderRadius: 22px`, `padding: 16px`).
- Topo de cada item: Quadradinho colorido da categoria + Nome real da categoria em destaque (**`RENDA FIXA`**, **`FIIS`**, **`AÇÕES`**, **`CRIPTOMOEDAS`**) à esquerda e **`Atual% / META Meta%`** à direita.
- **Matriz de Pontos (`Dot-Matrix Grid`):** Grade de pontos circulares preenchidos de baixo para cima na cor da categoria (`#2E4A44`, `#D5CAA8`, `#D96628`, `#C49A45`) proporcionalmente ao percentual atual da carteira.

### 4.5. Lista de Movimentações Recentes (`RecentTransactionsCard`)
- Container escuro arredondado (`#191B1D`, `borderRadius: 22px`) listando cada operação com:
  - **Avatar Circular (`44x44px`):** Fundo na cor da categoria do ativo com ícone Material da categoria (`account-balance`, `domain`, `trending-up`, `currency-bitcoin`).
  - **Centro:** Ticker do ativo + data e tipo (`"Hoje, 14:32 • Compra"`).
  - **Direita:** Valor formatado (`+R$ 480,00` em `#AECDC5` para compras ou `-R$ 312,00` em `#D96628` para vendas).

### 4.6. Barra de Navegação Flutuante em Pílula (`FloatingBottomDock`)
- Pílula inferior (`#191B1D`, `borderRadius: 9999px`) com 4 abas (`Início` → `home`, `Análises` → `bar-chart`, `Extrato` → `receipt-long`, `Carteiras` → `pie-chart`), destacando a aba ativa com um círculo sólido `#D5CAA8` + botão circular flutuante separado à direita (`58x58px` em `#D96628` com ícone `add`) para Novo Aporte rápido.
