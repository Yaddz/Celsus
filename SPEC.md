# CELSUS — Especificação Técnica, Arquitetura e Plano de Sprints (MVP)

> **Arquitetura:** Mobile Local-First (`React Native / Expo` + `SQLite`) + Market Data Engine Stateless (`Go`)  
> **Privacidade:** 100% dos dados pessoais, carteiras e aportes armazenados exclusivamente no dispositivo do usuário.  
> **Estética:** *WalleZ Modern Bento Layout + Paleta Celsus* ([DESIGN_SYSTEM.md](file:///c:/Users/Pedro/Documents/Projetos/Celsus/DESIGN_SYSTEM.md))

---

## 1. Visão Geral do Produto

O **Celsus** é um gestor de carteiras de investimentos mobile focado em privacidade absoluta (**100% Local-First**), alocação inteligente por metas em dois níveis e interface moderna em Bento Cards com tipografia `Space Mono` e paleta autoral (`#D96628`, `#2E4A44`, `#D5CAA8`, `#191B1D`, `#111315`, `#C49A45`).

### Escopo do MVP
1. **Múltiplas Carteiras Independentes + Visão Consolidada:** Cada carteira possui seus próprios ativos, metas de peso e histórico de transações, além de uma Visão Consolidada na tela inicial que soma todo o patrimônio em BRL (`R$`).
2. **4 Categorias de Ativos Suportadas:**
   - **Renda Fixa** (`FIXED_INCOME`) — Cor da categoria: `#2E4A44`
   - **FIIs (Fundos Imobiliários)** (`FII`) — Cor da categoria: `#D5CAA8`
   - **Ações** (`STOCK`) — Cor da categoria: `#D96628`
   - **Criptomoedas** (`CRYPTO`) — Cor da categoria: `#C49A45`
3. **Pesos em 2 Níveis + Calculadora de Novo Aporte:**
   - **Nível Macro:** Meta percentual (0–100%) para cada classe de ativo dentro da carteira.
   - **Nível Micro:** Meta percentual (0–100%) para cada ativo dentro de sua classe.
   - **Simulador de Aporte:** Ao informar um valor em `R$`, o app distribui o aporte proporcionalmente entre os ativos mais descontados em relação à meta global (sem sugerir vendas).
4. **Motor de Cotações Híbrido (COTAHIST B3 + BRAPI + Indexadores):**
   - Carga histórica inicial de Ações e FIIs processada pelo backend em **Go** a partir dos arquivos oficiais **COTAHIST** da B3.
   - Cotações recentes/atuais de Ações, FIIs e Criptomoedas (em BRL) via **BRAPI**.
   - Cálculo automático de saldo bruto em **Renda Fixa** (CDI, IPCA+, Pré-fixado) via séries históricas de taxas + opção de ajuste manual de saldo.
5. **Movimentações (Compras/Aportes e Vendas/Resgates):**
   - Cálculo automático de **Preço Médio** e **Quantidade Atual**, com preenchimento automático do preço histórico na data da operação via COTAHIST/BRAPI.
   - Estrutura de banco já preparada para vínculo futuro com **Open Finance** (`source`, `external_id`, `institution_id`, `last_synced_at`).
6. **Backup e Recuperação Offline (`.celsus.zip`):**
   - Exportação e importação em arquivo `.zip` contendo CSVs legíveis (`portfolios.csv`, `class_targets.csv`, `assets.csv`, `transactions.csv`) + `manifest.json` com hashes `SHA-256` para validação de integridade, suportando **Restore Completo** ou **Mesclagem por UUID**.
7. **Segurança Local:**
   - Modo Privacidade (ocultar valores em `R$`) e bloqueio por Biometria/PIN nativo (`expo-local-authentication`).

---

## 2. Arquitetura do Sistema

```mermaid
flowchart TB
    subgraph Mobile["App Mobile (React Native / Expo - TypeScript)"]
        UI["UI Bureaucratic Brutalism\n(Space Mono, Dossiers, Stat Bars)"]
        Calc["Domain Engine\n(Preço Médio, Rebalanceamento, Renda Fixa)"]
        DB[("SQLite Local (Drizzle ORM)\n100% Dados do Usuário")]
        Backup["Backup Engine (.celsus.zip)\nCSVs + manifest.json (SHA-256)"]
        Bio["Segurança Local\n(expo-local-authentication)"]

        UI --> Calc
        Calc --> DB
        Backup <--> DB
        Bio --> UI
    end

    subgraph GoBackend["Backend Stateless de Mercado (Go / Chi)"]
        API["REST API (/v1/quotes, /v1/history, /v1/rates)"]
        Parser["Parser Posicional COTAHIST B3\n(245 bytes/linha, ZIP/TXT)"]
        MarketDB[("SQLite / DuckDB Embarcado\nApenas Série Histórica Pública")]
        Cache["Cache em Memória / TTL\n(Proteção de API Key BRAPI)"]

        API --> MarketDB
        API --> Cache
        Parser --> MarketDB
    end

    subgraph External["Fontes Públicas de Mercado"]
        B3["Arquivos Oficiais B3\n(COTAHIST_AXXXX.ZIP)"]
        BRAPI["BRAPI API\n(Ações, FIIs, Cripto BRL, Selic/IPCA)"]
        BCB[" API SGS Banco Central\n(Séries Diárias CDI #12 / IPCA #433)"]
    end

    Mobile -- "GET /v1/quotes?tickers=PETR4,BTC...\n(Apenas tickers, zero dados pessoais)" --> API
    Parser -- "Download / Ingestão" --> B3
    Cache -- "Proxy autenticado c/ Token" --> BRAPI
    Cache -- "Curva diária CDI/IPCA" --> BCB
```

> [!IMPORTANT]
> **Garantia de Privacidade 100% Local:** O servidor Go **nunca** recebe IDs de carteiras, quantidades de ativos, valores aportados ou identificadores pessoais. O celular envia apenas uma lista de tickers públicos (ex.: `GET /v1/quotes?tickers=PETR4,HGLG11,BTC`) para atualizar seu cache local de preços.

---

## 3. Stack Tecnológica Definida

### 3.1. App Mobile (`apps/mobile`)
- **Framework:** React Native com **Expo SDK 52+** (Expo Router v4 para navegação file-based).
- **Linguagem:** TypeScript (strict mode).
- **Banco de Dados Local:** `expo-sqlite` (API síncrona moderna `openDatabaseSync`) + **Drizzle ORM** (`drizzle-orm/expo-sqlite`) e migrations embarcadas.
- **Gerenciamento de Estado & Cache:** `Zustand` (estado global de UI, carteira ativa, modo privacidade) + `@tanstack/react-query` (sincronização de cotações com o backend Go).
- **Estilização & Fontes:** `NativeWind v4` (Tailwind CSS configurado com os tokens exatos do [DESIGN_SYSTEM.md](file:///c:/Users/Pedro/Documents/Projetos/Celsus/DESIGN_SYSTEM.md)) + `@expo-google-fonts/space-mono`.
- **Gráficos:** `react-native-wagmi-charts` ou `victory-native` (Skia) estilizados com linhas retas, cores `#D96628`, `#2E4A44`, `#D5CAA8` e fundo `#191B1D`.
- **Manipulação de Arquivos e ZIP:** `expo-file-system`, `expo-sharing`, `expo-document-picker`, `fflate` (compactação/descompactação ZIP pura em JS ultra-rápida), `expo-crypto` (hash SHA-256 do `manifest.json`).
- **Precisão Decimal:** `decimal.js` para evitar erros de ponto flutuante em cálculos financeiros e quantidades de criptomoedas (8 casas decimais).

### 3.2. Backend de Dados de Mercado (`services/market-api`)
- **Linguagem:** **Go 1.23+**
- **Router HTTP:** `go-chi/chi/v5` (leve, idiomático, zero dependências pesadas).
- **Banco de Série Histórica Pública:** `SQLite` embarcado (`modernc.org/sqlite` CGO-free) com índices compostos `(ticker, trade_date)` em modo `WAL`.
- **Módulos Internos:**
  - `internal/cotahist`: Leitor streaming de arquivos `.ZIP`/`.TXT` posicionais de 245 bytes da B3 (ISO-8859-1 -> UTF-8) com inserção em batch transacional.
  - `internal/brapi`: Cliente HTTP para BRAPI (`/api/quote`, `/api/v2/crypto`) com cache TTL (ex.: 5–15 min no pregão) e *singleflight* (evita chamadas duplicadas simultâneas).
  - `internal/macro`: Sincronizador das séries históricas do CDI diário e IPCA mensal/diário (via BRAPI / BCB SGS) para alimentar o motor de Renda Fixa.

---

## 4. Modelagem do Banco de Dados Local (Mobile SQLite)

Todas as chaves primárias utilizam **UUID v4** para permitir exportação/importação e mesclagem sem colisão de IDs. Valores monetários e quantidades são salvos como texto decimal ou inteiros em escala fixa, operados via `decimal.js`.

### 4.1. Diagrama Entidade-Relacionamento (Local SQLite)

```mermaid
erDiagram
    PORTFOLIOS ||--o{ PORTFOLIO_CLASS_TARGETS : "possui 4 metas macro"
    PORTFOLIOS ||--o{ ASSETS : "contém ativos"
    ASSETS ||--o{ TRANSACTIONS : "registra compras/vendas"
    
    PORTFOLIOS {
        text id PK "UUID v4"
        text name "Ex: Dossiê Aposentadoria"
        text description "Notas do dossiê"
        text docket_code "Ex: REV-CART-001"
        integer is_archived "0 ou 1"
        text created_at "ISO-8601"
        text updated_at "ISO-8601"
    }

    PORTFOLIO_CLASS_TARGETS {
        text id PK "UUID v4"
        text portfolio_id FK "UUID da carteira"
        text asset_class "FIXED_INCOME | FII | STOCK | CRYPTO"
        real target_percentage "0.0 a 100.0 (soma 100% na carteira)"
        text updated_at "ISO-8601"
    }

    ASSETS {
        text id PK "UUID v4"
        text portfolio_id FK "UUID da carteira"
        text asset_class "FIXED_INCOME | FII | STOCK | CRYPTO"
        text ticker "Ex: PETR4, HGLG11, BTC, RF-CDB-01"
        text name "Nome do ativo ou título"
        real target_percentage_in_class "0.0 a 100.0 (soma 100% na classe)"
        text quantity "Decimal string (até 8 casas p/ Cripto)"
        text average_price "Preço médio em BRL"
        text manual_price_override "Saldo/Preço manual opcional (Renda Fixa)"
        text rf_indexer "CDI | IPCA | PRE | NULL"
        real rf_rate "Ex: 110.0 (% CDI) ou 6.5 (IPCA+ 6.5%)"
        text rf_maturity_date "YYYY-MM-DD ou NULL"
        integer rf_is_tax_exempt "0 (CDB/Tesouro) ou 1 (LCI/LCA/CRI/CRA)"
        text source "MANUAL | OPEN_FINANCE"
        text external_id "ID externo p/ futuro Open Finance"
        text institution_id "CNPJ/ID corretora p/ futuro Open Finance"
        text last_synced_at "ISO-8601 ou NULL"
        text created_at "ISO-8601"
        text updated_at "ISO-8601"
    }

    TRANSACTIONS {
        text id PK "UUID v4"
        text portfolio_id FK "UUID da carteira"
        text asset_id FK "UUID do ativo"
        text type "BUY | SELL"
        text trade_date "YYYY-MM-DD"
        text quantity "Decimal string (> 0)"
        text unit_price "Preço unitário em BRL"
        text fees "Taxas/corretagem em BRL (default 0)"
        text total_amount "Valor total da operação em BRL"
        text notes "Observação / diálogo do lançamento"
        text source "MANUAL | OPEN_FINANCE"
        text external_id "Hash/ID único p/ deduplicação Open Finance"
        text created_at "ISO-8601"
    }

    MARKET_PRICE_CACHE {
        text ticker PK "Ex: PETR4, BTC"
        text asset_class "STOCK | FII | CRYPTO"
        text current_price "Última cotação em BRL"
        real change_percent_24h "Variação diária %"
        text updated_at "ISO-8601"
    }

    HISTORICAL_PRICES_LOCAL {
        text ticker PK "Parte da PK composta"
        text price_date PK "YYYY-MM-DD"
        text close_price "Preço de fechamento em BRL"
    }
```

---

## 5. Regras de Negócio e Fórmulas Financeiras

### 5.1. Sistema de Pesos em 2 Níveis (Alocação Ideal)
1. **Peso Macro da Classe ($W_{\text{classe}}$):**
   Em cada carteira, a soma das 4 classes (`FIXED_INCOME`, `FII`, `STOCK`, `CRYPTO`) deve totalizar $100\%$:
   $$\sum_{c \in \text{Classes}} W_c = 100\%$$
2. **Peso Micro do Ativo na Classe ($w_{i,c}$):**
   Dentro de uma classe $c$ que possui $W_c > 0$, a soma dos pesos dos ativos cadastrados naquela classe deve totalizar $100\%$:
   $$\sum_{i \in c} w_{i,c} = 100\%$$
3. **Peso Global Ideal do Ativo na Carteira ($T_i$):**
   $$T_i = \frac{W_c \times w_{i,c}}{100}$$
   *(Exemplo: Se Ações tem meta de $40\%$ na carteira e `WEGE3` tem meta de $25\%$ dentro de Ações, a meta global de `WEGE3` na carteira é $10\%$).*

---

### 5.2. Algoritmo da Calculadora Inteligente de Novo Aporte
Quando o usuário deseja fazer um novo aporte de valor $A > 0$ (em `R$`) em uma carteira cujo patrimônio atual é $V_{\text{atual}}$:

1. **Patrimônio Projetado Pós-Aporte ($V_{\text{final}}$):**
   $$V_{\text{final}} = V_{\text{atual}} + A$$
2. **Valor Ideal Pós-Aporte de cada Ativo ($V^{\text{meta}}_i$):**
   $$V^{\text{meta}}_i = V_{\text{final}} \times \left(\frac{T_i}{100}\right)$$
3. **Déficit Financeiro Positivo de cada Ativo ($D_i$):**
   Como o rebalanceamento por aporte **não realiza vendas**, ativos que já estão acima da meta recebem déficit zero:
   $$D_i = \max\left(0,\; V^{\text{meta}}_i - V_{\text{atual}, i}\right)$$
4. **Aporte Sugerido para o Ativo ($\Delta A_i$):**
   $$S_D = \sum_{j} D_j$$
   $$\Delta A_i = A \times \left(\frac{D_i}{S_D}\right)$$
5. **Conversão em Quantidade Sugerida ($Q^{\text{sug}}_i$):**
   - Para **Ações e FIIs**: arredonda para número inteiro de cotas ($\lfloor \Delta A_i / P_i \rfloor$) e redistribui o troco residual para o ativo elegível de menor preço unitário, ou exibe o valor exato de sobra em caixa.
   - Para **Criptomoedas**: calcula com até 8 casas decimais ($\Delta A_i / P_i$).
   - Para **Renda Fixa**: sugere o valor financeiro exato em `R$` ($\Delta A_i$).

---

### 5.3. Cálculo de Preço Médio (PM) e Posição
- **Na Compra (`BUY`):**
  $$\text{Custo Total Novo} = (Q_{\text{anterior}} \times PM_{\text{anterior}}) + (Q_{\text{compra}} \times P_{\text{compra}}) + \text{Taxas}$$
  $$Q_{\text{nova}} = Q_{\text{anterior}} + Q_{\text{compra}}$$
  $$PM_{\text{novo}} = \frac{\text{Custo Total Novo}}{Q_{\text{nova}}}$$
- **Na Venda (`SELL`):**
  A venda **não altera** o Preço Médio ($PM_{\text{novo}} = PM_{\text{anterior}}$); ela apenas reduz a quantidade em carteira ($Q_{\text{nova}} = Q_{\text{anterior}} - Q_{\text{venda}}$) e apura o lucro/prejuízo realizado da operação:
  $$\text{Resultado Realizado} = (Q_{\text{venda}} \times P_{\text{venda}} - \text{Taxas}) - (Q_{\text{venda}} \times PM_{\text{anterior}})$$
  Se $Q_{\text{nova}} = 0$, o Preço Médio é zerado ($0.00$), mas o ativo permanece na carteira caso seu peso meta seja $> 0\%$.

---

### 5.4. Precificação de Renda Fixa (Motor Local + Curvas Macro)
Cada título de Renda Fixa pode ter seu saldo atual obtido de duas maneiras:
1. **Cálculo Automático por Indexador (Padrão):**
   Para cada aporte $k$ de valor $C_k$ realizado na data $d_k$ até hoje ($d_{\text{hoje}}$):
   - **Pós-fixado `% do CDI` (ex.: `110% do CDI`):**
     $$\text{Fator}_{k} = \prod_{t = d_k}^{d_{\text{hoje}}} \left(1 + \text{CDI}_{\text{diário}}(t) \times \frac{\text{Taxa}}{100}\right)$$
   - **Pré-fixado (ex.: `12.5% a.a.`):**
     $$\text{Fator}_{k} = \left(1 + \frac{\text{Taxa}}{100}\right)^{\frac{\text{Dias Úteis}(d_k, d_{\text{hoje}})}{252}}$$
   - **Híbrido `IPCA + Taxa% a.a.`:**
     Combina a variação acumulada do IPCA no período com o cupom pré-fixado pro-rata em dias úteis (base 252).
2. **Override Manual (`manual_price_override`):**
   Caso o usuário queira cravar o valor exato exibido no app da corretora, pode informar o "Saldo Atual Manual", que tem precedência sobre a curva teórica até ser limpo ou atualizado.

---

## 6. Especificação do Backend Go (`services/market-api`)

### 6.1. Layout do Parser Posicional COTAHIST (B3)
O arquivo `COTAHIST_AXXXX.TXT` possui registros de **245 bytes** por linha. O parser Go deve filtrar apenas linhas com `TIPREG == "01"` (Cotações) e:
- `TPMERC` (posições 025–027): `"010"` (Vista) e `"020"` (Fracionário, opcional).
- `CODBDI` (posições 011–012): `"02"` (Lote Padrão / Ações) e `"12"` (Fundos Imobiliários / FIIs).

| Campo | Posição (1-based) | Slice Go (0-based) | Tipo | Descrição |
| :--- | :---: | :---: | :---: | :--- |
| `TIPREG` | 001–002 | `line[0:2]` | `string` | Fixo `"01"` para cotações |
| `DATPRE` | 003–010 | `line[2:10]` | `YYYYMMDD` | Data do pregão |
| `CODBDI` | 011–012 | `line[10:12]` | `string` | `"02"` = Ações, `"12"` = FIIs |
| `CODNEG` | 013–024 | `line[12:24]` | `string` | Ticker (`strings.TrimSpace`) |
| `TPMERC` | 025–027 | `line[24:27]` | `string` | `"010"` = Mercado à Vista |
| `NOMRES` | 028–039 | `line[27:39]` | `string` | Nome resumido da empresa/fundo |
| `PREABE` | 057–069 | `line[56:69]` | `int64 / 100` | Preço de abertura (2 casas implícitas) |
| `PREMAX` | 070–082 | `line[69:82]` | `int64 / 100` | Preço máximo |
| `PREMIN` | 083–095 | `line[82:95]` | `int64 / 100` | Preço mínimo |
| `PREULT` | 109–121 | `line[108:121]` | `int64 / 100` | **Preço de fechamento** |
| `VOLTOT` | 171–188 | `line[170:188]` | `int64 / 100` | Volume financeiro total |

### 6.2. Endpoints REST do Backend Go
1. `GET /v1/health`
   - Retorna status do servidor, última data do COTAHIST carregada no banco e status da conexão BRAPI.
2. `GET /v1/catalog/search?q=PETR&class=STOCK`
   - Busca rápida por ticker ou nome da empresa/FII/Cripto para autocomplete no celular.
3. `GET /v1/quotes?tickers=PETR4,HGLG11,BTC`
   - Retorna cotação atual em BRL, variação 24h e timestamp. Consulta o cache local; se expirado, busca em lote na BRAPI (`/api/quote/` para B3 e `/api/v2/crypto?coin=BTC&currency=BRL` para cripto).
4. `GET /v1/history?tickers=PETR4,HGLG11&from=2023-01-01&to=2026-10-30`
   - Retorna série histórica de fechamento diário combinando a base do **COTAHIST** (passado) + **BRAPI** (dias recentes ainda não consolidados no arquivo anual).
5. `GET /v1/rates/macro?from=2021-01-01`
   - Retorna série compacta de taxas diárias do **CDI**, **Selic** e **IPCA** para o motor de Renda Fixa do app mobile calcular a evolução dos títulos offline.
6. `POST /v1/admin/cotahist/sync` (ou comando CLI `market-api sync-cotahist --years 5`)
   - Baixa e ingere os arquivos `COTAHIST_A{ANO}.ZIP` diretamente da B3 de forma idempotente (`INSERT OR REPLACE`).

---

## 7. Especificação do Arquivo de Backup (`.celsus.zip`)

O arquivo exportado pelo app recebe o nome padrão `celsus-dossier-YYYYMMDD-HHMM.celsus.zip` e contém exatamente 5 arquivos na raiz:

```text
celsus-dossier-20261030-2330.celsus.zip
├── manifest.json
├── portfolios.csv
├── class_targets.csv
├── assets.csv
└── transactions.csv
```

### 7.1. Estrutura do `manifest.json`
```json
{
  "format": "CELSUS_ARCHIVE",
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-10-30T23:30:00-03:00",
  "currency": "BRL",
  "files": {
    "portfolios.csv": {
      "rows": 2,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    "class_targets.csv": {
      "rows": 8,
      "sha256": "..."
    },
    "assets.csv": {
      "rows": 14,
      "sha256": "..."
    },
    "transactions.csv": {
      "rows": 65,
      "sha256": "..."
    }
  }
}
```

### 7.2. Regras de Validação na Importação
1. Descompacta o `.zip` em memória/diretório temporário.
2. Valida existência e sintaxe do `manifest.json` e compatibilidade de `schemaVersion`.
3. Calcula o `SHA-256` de cada `.csv` extraído e compara com o hash declarado em `manifest.json`. Se qualquer hash divergir, aborta a importação antes de tocar no SQLite local e exibe um alerta de integridade (`[SECURITY PROTOCOL: CORRUPTED DOSSIER]`).
4. Executa a importação dentro de uma **única transação SQLite (`BEGIN TRANSACTION ... COMMIT`)**:
   - **Modo Substituir Tudo (Restore):** Limpa as tabelas locais e insere todos os registros do backup.
   - **Modo Mesclar (Merge):** Faz `UPSERT` por `id` (UUID v4) nas carteiras, ativos e transações, recalculando ao final o Preço Médio e Quantidade de cada ativo a partir de suas transações.

---

## 8. Mapa de Telas e UX (WalleZ Modern Bento Layout + Paleta Celsus)

Seguindo rigorosamente o [DESIGN_SYSTEM.md](file:///c:/Users/Pedro/Documents/Projetos/Celsus/DESIGN_SYSTEM.md), o layout adota a arquitetura moderna de **Bento Cards arredondados (`24px`–`28px`), Cartão de Saldo Empilhado, Gráficos de Cápsulas e Matriz de Pontos (`Dot-Matrix`) e Dock Flutuante em Pílula**, mantendo a paleta Celsus (`#D96628`, `#2E4A44`, `#D5CAA8`, `#191B1D`, `#111315`, `#C49A45`) e a tipografia `Space Mono`:

1. **Home (Visão Principal / Carteira Ativa ou Consolidada):**
   - **Header Minimalista:** Ícone Material (`account-balance-wallet`) + nome/seletor da carteira à esquerda e botão circular (`#191B1D`) com ícone Material (`visibility` / `visibility-off`) de Modo Privacidade à direita (zero emojis).
   - **Hero Wallet Card Empilhado (`DossierCard`):** Cartão arredondado (`28px`) com 2 camadas inferiores empilhadas dando profundidade física. Possui recorte superior em destaque (`#D96628` → `#D5CAA8` ou `#2E4A44` → `#AECDC5`) exibindo o **Saldo Total (`R$ 32.468,00`)** alinhado à direita, nome da carteira à esquerda e rodapé escuro com rentabilidade (`+12,4%`) e código (`•••• 001`).
   - **Linha de 3 Bento Tiles de Ação Rápida:** Três botões quadrados arredondados (`22px`) lado a lado logo abaixo do Hero Card usando **Material Symbols / MaterialIcons**:
     1. **Aportar:** Fundo sólido **Primary `#D96628`**, ícone Material `north-east` no topo e label na base em `#111315`.
     2. **Simular:** Fundo sólido **Secondary `#2E4A44`**, ícone Material `calculate` no topo e label na base.
     3. **Carteiras / Mais:** Fundo **Neutral `#191B1D`**, ícone Material `grid-view` no topo e label em `#E6DECA`.
   - **Banner Horizontal de Insight (`SpecimenHexCard`):** Card compacto horizontal (`#D5CAA8` ou `#282A2C`, `borderRadius: 20px`) com call-to-action rápido de rebalanceamento à esquerda e mini badge de carteira à direita.
   - **Card de Movimentações Recentes (`Recent Transactions`):** Container escuro arredondado (`#191B1D`, `24px`) com avatar circular colorido à esquerda (`44x44px`, com ícone Material da categoria: `account-balance`, `domain`, `trending-up`, `currency-bitcoin`), nome do ativo + horário ao centro e valor colorido à direita (`+R$ 467,00` em teal ou `-R$ 312,00` em âmbar/coral).
2. **Tela de Estatísticas & Alocação (`Statistics`):**
   - **Card 1 — Evolução Mensal em Cápsulas (`MonthlyPillChartCard`):** Seletor circular `W | M | Y` no topo direito; colunas mensais (`Jan`–`Jun`) formadas por **pílulas horizontais empilhadas** (superiores em `#2E4A44`/`#AECDC5` para patrimônio/aportes e inferiores em `#D96628`/`#FFB694` para custo/saídas) + **Tooltip escuro flutuante** ao tocar no mês.
   - **Card 2 — Alocação por Categoria em Matriz de Pontos (`AttributeStatBar` / `DotMatrixAllocationCard`):** Exibe o saldo total no topo e grades de **pontos circulares (`Dot-Matrix Grid`)** preenchidas de baixo para cima nas cores das 4 categorias reais:
     - **Renda Fixa** (`#2E4A44`) — `32.0% / META 30.0%`
     - **FIIs** (`#D5CAA8`) — `24.5% / META 25.0%`
     - **Ações** (`#D96628`) — `33.5% / META 35.0%`
     - **Criptomoedas** (`#C49A45`) — `10.0% / META 10.0%`
3. **Simulador de Aporte & Rebalanceamento:**
   - Input financeiro limpo em destaque (`R$ 1.000,00`) dentro de um Bento Card escuro `#191B1D` e lista de ativos recomendados com avatares circulares, quantidade sugerida de cotas/frações e botão primário arredondado em `#D96628` para confirmar os aportes em lote.
4. **Barra de Navegação Flutuante em Pílula + Botão Circular (`FloatingBottomDock`):**
   - Pílula inferior escura (`#191B1D`, `borderRadius: 9999px`) com 4 ícones (aba ativa destacada em círculo claro `#E6DECA`/`#D5CAA8`) + botão circular flutuante separado à direita (`56x56px` em `#D96628`) para Novo Aporte rápido.

---

## 9. Protocolo de TDD Estrito com Testes Imutáveis (`TDD Lock`)

Para garantir fidelidade matemática e impedir que o agente codificador altere testes para forçar aprovações ("test gaming"), todo o desenvolvimento segue o protocolo **TDD Lock** imposto pela regra [`.agents/rules/tdd-lock.md`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/.agents/rules/tdd-lock.md) e pelo script [`scripts/test-lock.ps1`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/scripts/test-lock.ps1):

```mermaid
flowchart LR
    A["Fase A: Escrita dos Testes\n(Baseado na SPEC.md + Stubs)"] --> B["Bloqueio Criptográfico\npowershell ./scripts/test-lock.ps1 -Action lock\n(SHA-256 em tests.lock.json + ReadOnly)"]
    B --> C["Fase B: Implementação do Código\n(Arquivos de teste IMUTÁVEIS)"]
    C --> D{"Todos os testes\npassaram?"}
    D -- "NÃO (Falha)" --> E["PROIBIDO editar o teste!\nO agente corrige o CÓDIGO"]
    E --> C
    D -- "SIM (100% Green)" --> F["Verificação de Integridade\n./scripts/test-lock.ps1 -Action verify\n+ Registro em TEST_REPORT.md"]
```

### Regras de Governança TDD e Git
1. **Fase A (Red & Lock):** Os testes automatizados da Sprint são criados primeiro, junto apenas com as assinaturas/interfaces vazias necessárias para compilação. Em seguida, roda-se `./scripts/test-lock.ps1 -Action lock`, que grava o hash `SHA-256` de cada arquivo de teste em `tests.lock.json` e aplica permissão `ReadOnly` no sistema operacional.
2. **Fase B (Green & Verify):** O agente implementa o código de produção até todos os testes passarem. Se um teste falhar, **o agente retorna ao código de produção e o corrige — nunca altera o teste**.
3. **Auditoria e Relatório ([`TEST_REPORT.md`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/TEST_REPORT.md)):** Ao final de cada Sprint, o comando `./scripts/test-lock.ps1 -Action verify` comprova que nenhum hash `SHA-256` de teste foi modificado, e os resultados detalhados são gravados em [`TEST_REPORT.md`](file:///c:/Users/Pedro/Documents/Projetos/Celsus/TEST_REPORT.md).
4. **Commit Obrigatório por Fase e Sprint:** Toda Sprint e toda Fase (`Fase A` e `Fase B`) deve obrigatoriamente ser concluída com um commit Git padronizado (`test(sprint-X): lock phase A specification tests` na Fase A e `feat(sprint-X): complete phase B implementation and test report` na Fase B) e push para `origin/main`.

---

## 10. Divisão de Sprints e Prompts de Execução (Fase A + Fase B)

O projeto está dividido em **6 Sprints incrementais**, cada uma com um prompt para a **Fase A (Criar e Bloquear Testes + Commit)** e um prompt para a **Fase B (Implementar Código, Gerar Relatório + Commit)**.

---

### SPRINT 1: Backend Go — Motor COTAHIST B3, Proxy BRAPI e Curvas Macro
**Objetivo:** Construir o servidor stateless em Go (`services/market-api`) capaz de baixar/processar arquivos COTAHIST da B3, buscar cotações atuais de Ações/FIIs/Cripto na BRAPI com cache e servir a curva diária de CDI/IPCA.

#### Prompt da Sprint 1 — Fase A (Criar Testes + Bloquear)
```markdown
Vamos executar a **Sprint 1 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `SPEC.md` e `TEST_REPORT.md`.

1. Inicialize o módulo Go em `services/market-api` (`github.com/pedro/celsus/services/market-api`) e crie apenas as structs, interfaces e assinaturas de funções vazias (stubs) para os pacotes `internal/cotahist`, `internal/brapi`, `internal/macro` e `internal/http`.
2. Escreva toda a suíte de testes unitários e de contrato (`S1-T01` a `S1-T09` listados em `TEST_REPORT.md`):
   - `internal/cotahist/parser_test.go`: parsing de linhas de 245 bytes (`TIPREG=01`, `CODBDI=02/12`, `TPMERC=010`), conversão de centavos (`int64/100`), descarte de header/trailer/opções e leitura de `.ZIP`.
   - `internal/cotahist/repository_test.go`: upsert idempotente em SQLite sem duplicar cotações.
   - `internal/brapi/client_test.go`: busca em lote de Ações/FIIs, Cripto em BRL e funcionamento do cache TTL.
   - `internal/macro/rates_test.go`: persistência e consulta das curvas diárias de CDI e IPCA.
   - `internal/http/handlers_test.go`: testes dos 5 endpoints REST (`/v1/health`, `/v1/catalog/search`, `/v1/quotes`, `/v1/history`, `/v1/rates/macro`).
3. Execute `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock` para bloquear todos os testes com `ReadOnly` e registrar os hashes `SHA-256` em `tests.lock.json`.
4. Atualize a tabela da Sprint 1 em `TEST_REPORT.md` com os hashes `SHA-256` gerados. Não implemente a lógica de produção ainda.
5. Realize o commit obrigatório da Fase A: `git add . && git commit -m "test(sprint-1): add and lock phase A specification tests" && git push origin main`.
```

#### Prompt da Sprint 1 — Fase B (Implementar Código sob Bloqueio + Relatório)
```markdown
Vamos executar a **Sprint 1 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `SPEC.md`.

REGRAS OBRIGATÓRIAS:
- Você está PROIBIDO de alterar qualquer arquivo `*_test.go` ou `tests.lock.json`.
- Se algum teste falhar, corrija exclusivamente o código de produção em `services/market-api`.

Passos:
1. Implemente o schema SQLite (`modernc.org/sqlite`) em modo WAL e a lógica completa dos pacotes `internal/cotahist`, `internal/brapi`, `internal/macro` e `internal/http`.
2. Rode `go test ./... -v` repetidamente, ajustando a implementação até que 100% dos testes (`S1-T01` a `S1-T09`) passem.
3. Rode `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` para comprovar que nenhum arquivo de teste foi modificado.
4. Atualize `TEST_REPORT.md` com o status `PASS`, tempo de execução e log de saída dos testes da Sprint 1.
5. Realize o commit obrigatório da Fase B: `git add . && git commit -m "feat(sprint-1): complete phase B implementation and test report" && git push origin main`.
```

---

### SPRINT 2: Fundação Mobile Expo, Design System "Celsus" e Banco Local (SQLite + Drizzle)
**Objetivo:** Criar o app React Native (Expo) em `apps/mobile`, configurar os tokens visuais e componentes do `DESIGN_SYSTEM.md` (*WalleZ Modern Bento*, fonte `Space Mono`) e estruturar o banco local SQLite com Drizzle ORM.

#### Prompt da Sprint 2 — Fase A (Criar Testes + Bloquear)
```markdown
Vamos executar a **Sprint 2 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `SPEC.md`, `DESIGN_SYSTEM.md` e `TEST_REPORT.md`.

1. Inicialize o projeto Expo com TypeScript e Jest (`jest-expo`) em `apps/mobile` e crie apenas os arquivos de tipos e stubs vazios de tema, componentes e schema do banco.
2. Desbloqueie o lock anterior com `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action unlock`, escreva todos os testes da Sprint 2 (`S2-T01` a `S2-T03` de `TEST_REPORT.md`):
   - `src/theme/__tests__/tokens.test.ts`: validação de todos os tokens hexadecimais (`#111315`, `#191B1D`, `#D96628`, `#2E4A44`, `#D5CAA8`, `#C49A45`) e tipografia `Space Mono`.
   - `src/components/ui/__tests__/AttributeStatBar.test.tsx`: mapeamento das 4 categorias reais (`FIXED_INCOME` -> `Renda Fixa`, `FII` -> `FIIs`, `STOCK` -> `Ações`, `CRYPTO` -> `Criptomoedas`) e renderização de `% Atual vs % Meta`.
   - `src/db/__tests__/schema.test.ts`: validação das 6 tabelas SQLite/Drizzle (`portfolios`, `portfolio_class_targets`, `assets`, `transactions`, `market_price_cache`, `historical_prices_local`) incluindo as colunas de Open Finance (`source`, `external_id`, `institution_id`, `last_synced_at`).
3. Bloqueie novamente todos os testes rodando `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock` e registre os hashes `SHA-256` em `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase A: `git add . && git commit -m "test(sprint-2): add and lock phase A specification tests" && git push origin main`.
```

#### Prompt da Sprint 2 — Fase B (Implementar Código sob Bloqueio + Relatório)
```markdown
Vamos executar a **Sprint 2 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `SPEC.md` e `DESIGN_SYSTEM.md`.

REGRAS OBRIGATÓRIAS:
- Você está PROIBIDO de alterar qualquer arquivo de teste bloqueado (`*.test.ts`, `*.test.tsx`). Se um teste falhar, ajuste exclusivamente o código de produção.
- Mantenha 100% a paleta de cores do Celsus (`#D96628` Primary, `#2E4A44` Secondary, `#D5CAA8` Tertiary, `#191B1D` Neutral, `#111315` Background, `#C49A45` Crypto) e a fonte `Space Mono`, implementando os componentes e telas seguindo o **WalleZ Modern Bento Layout** descrito em `DESIGN_SYSTEM.md`:

Passos:
1. Implemente os tokens completos em `src/theme/tokens.ts` satisfazendo `tokens.test.ts`.
2. Implemente os componentes de UI em `src/components/ui/` com visual **WalleZ Modern Bento**:
   - `DossierCard`: Cartão de carteira empilhado (*Stacked Hero Wallet Card*) com cantos super arredondados (`borderRadius: 28`), 2 camadas inferiores empilhadas (`scale: 0.95` e `0.90` em `#1A1C1E`/`#151719`), recorte superior em destaque (`#D96628` / `#2E4A44`) exibindo o Saldo Total alinhado à direita (`R$ 32.468,00`), círculos duplos translúcidos à esquerda e rodapé escuro com titular/carteira e código (`•••• 001`).
   - `DirectiveButton`: Suporte tanto a botões pill/arredondados quanto aos **3 Bento Tiles de Ação Rápida** lado a lado (`borderRadius: 22`, `height: 104`, ícone no topo esquerdo e label na base esquerda nas variantes Primary `#D96628`, Secondary `#2E4A44` e Neutral `#191B1D`).
   - `AttributeStatBar`: Componente de Alocação por Categoria estilo *"Spending by Category"* do WalleZ — renderizando a **Matriz de Pontos Circulares (`Dot-Matrix Grid`)** preenchida de baixo para cima nas cores das 4 categorias (`FIXED_INCOME` -> `Renda Fixa` `#2E4A44`, `FII` -> `FIIs` `#D5CAA8`, `STOCK` -> `Ações` `#D96628`, `CRYPTO` -> `Criptomoedas` `#C49A45`) + linha de legenda com quadradinho colorido, nome real da categoria e percentuais `% Atual` e `% Meta` (satisfazendo 100% o teste bloqueado `AttributeStatBar.test.tsx`).
   - `SpecimenHexCard`: Banner horizontal arredondado de insight/carteira (`borderRadius: 20`, fundo `#D5CAA8` ou `#282A2C`) com chamada rápida à esquerda e mini badge à direita.
   - `LedgerInput`: Input financeiro moderno dentro de superfície arredondada `#191B1D` com tipografia `Space Mono` em destaque.
   - `FloatingBottomDock`: Barra de navegação inferior flutuante em formato de pílula (`#191B1D`, `borderRadius: 9999`) com círculo claro (`#D5CAA8`) na aba ativa + botão de ação circular separado à direita (`56x56` em `#D96628`).
3. Monte a tela inicial de demonstração (`App.tsx` / Home & Statistics preview) exibindo o layout completo estilo WalleZ com a paleta Celsus (Hero Card Empilhado, 3 Bento Tiles `Aportar`/`Simular`/`Mais`, Banner de Insight, Card de Movimentações Recentes com avatares circulares, Card de Alocação `Dot-Matrix` e `FloatingBottomDock`).
4. Implemente o schema/migrations completo do `expo-sqlite` + `drizzle-orm` em `src/db/schema.ts` satisfazendo `schema.test.ts`.
5. Execute `npm test` em `apps/mobile` e corrija o código de produção até 100% dos testes passarem.
6. Execute `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` e registre os resultados em `TEST_REPORT.md`.
7. Realize o commit obrigatório da Fase B: `git add . && git commit -m "feat(sprint-2): complete phase B implementation and test report" && git push origin main`.
```

---

### SPRINT 3: Gestão de Carteiras, Pesos em 2 Níveis e Motor Financeiro
**Objetivo:** Implementar o CRUD completo de múltiplas carteiras, a configuração das metas Macro (por classe) e Micro (por ativo) e o motor de cálculo de posição, preço médio, curva de Renda Fixa e rebalanceamento.

#### Prompt da Sprint 3 — Fase A (Criar Testes + Bloquear)
```markdown
Vamos executar a **Sprint 3 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `SPEC.md` e `TEST_REPORT.md`.

1. Desbloqueie o lock (`./scripts/test-lock.ps1 -Action unlock`) e crie apenas as assinaturas/interfaces vazias em `apps/mobile/src/domain/finance/`.
2. Escreva todos os testes matemáticos da Sprint 3 (`S3-T01` a `S3-T08` de `TEST_REPORT.md`) seguindo exatamente as fórmulas da Seção 5 da `SPEC.md`:
   - `weights.test.ts`: cálculo do peso global $T_i = (W_c \times w_{i,c}) / 100$ e validações de soma 100%.
   - `averagePrice.test.ts`: compras sucessivas com taxas, manutenção do PM em vendas parciais, zeramento de posição e precisão de 8 casas decimais para Cripto.
   - `fixedIncome.test.ts`: capitalização diária pós-fixada (% CDI), Pré-fixada (base 252), IPCA+ e precedência de `manual_price_override`.
   - `rebalance.test.ts`: Calculadora Inteligente de Novo Aporte ($D_i = \max(0, V^{\text{meta}}_i - V_{\text{atual},i})$) garantindo zero sugestão de venda, cotas inteiras para Ações/FIIs e frações de 8 casas para Cripto.
3. Bloqueie os testes (`./scripts/test-lock.ps1 -Action lock`) e atualize os hashes `SHA-256` em `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase A: `git add . && git commit -m "test(sprint-3): add and lock phase A specification tests" && git push origin main`.
```

#### Prompt da Sprint 3 — Fase B (Implementar Código sob Bloqueio + Relatório)
```markdown
Vamos executar a **Sprint 3 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `SPEC.md`.

REGRAS OBRIGATÓRIAS:
- Não altere nenhum arquivo de teste. Se um teste falhar, ajuste a implementação em `src/domain/finance/` ou nos repositórios.

Passos:
1. Implemente todas as funções do motor financeiro com `decimal.js`, os repositórios SQLite e as telas de Gestão de Carteiras e Ativos (com pesos em 2 níveis).
2. Rode a suíte de testes até atingir 100% de aprovação.
3. Valide a integridade com `./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase B: `git add . && git commit -m "feat(sprint-3): complete phase B implementation and test report" && git push origin main`.
```

---

### SPRINT 4: Aportes Manuais, Vendas, Integração COTAHIST/BRAPI e Simulador de Aporte
**Objetivo:** Implementar o lançamento de movimentações (`BUY`/`SELL`) com preenchimento automático de preço histórico via COTAHIST, sincronização de cotações atuais via BRAPI e a tela interativa da Calculadora de Novo Aporte.

#### Prompt da Sprint 4 — Fase A (Criar Testes + Bloquear)
```markdown
Vamos executar a **Sprint 4 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `SPEC.md` e `TEST_REPORT.md`.

1. Desbloqueie o lock (`./scripts/test-lock.ps1 -Action unlock`) e crie as assinaturas dos serviços `marketApi.ts`, `transactionService.ts` e `rebalanceExecution.ts`.
2. Escreva os testes `S4-T01` a `S4-T03`:
   - Pré-preenchimento automático do preço unitário na data da operação a partir do histórico COTAHIST.
   - Persistência transacional de compra/venda atualizando atomicamente quantidade e preço médio do ativo.
   - Conversão em lote das sugestões do Simulador de Aporte em lançamentos `BUY` no Livro-Razão.
3. Bloqueie os testes (`./scripts/test-lock.ps1 -Action lock`) e registre os hashes `SHA-256` em `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase A: `git add . && git commit -m "test(sprint-4): add and lock phase A specification tests" && git push origin main`.
```

#### Prompt da Sprint 4 — Fase B (Implementar Código sob Bloqueio + Relatório)
```markdown
Vamos executar a **Sprint 4 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `SPEC.md` e `DESIGN_SYSTEM.md`.

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado.
- Substitua TODOS os emojis e caracteres Unicode improvisados (`👁️`, `🎯`, `↗`, `⊞`, `◉`, `▲`, `▤`, `◈`) por ícones vetoriais do **Material Symbols / Material Icons** (`@expo/vector-icons/MaterialIcons`) em todos os componentes (`App.tsx`, `DirectiveButton.tsx`, `FloatingBottomDock.tsx`, `RecentTransactionsCard.tsx` e novas telas).

Passos:
1. Instale/configure `@expo/vector-icons` (`MaterialIcons`) em `apps/mobile` e substitua todos os emojis por ícones Material (`visibility`/`visibility-off`, `account-balance-wallet`, `north-east`, `calculate`, `grid-view`, `home`, `bar-chart`, `receipt-long`, `pie-chart`, `add`, `account-balance`, `domain`, `trending-up`, `currency-bitcoin`).
2. Implemente os serviços `marketApi.ts`, `transactionService.ts`, `rebalanceExecution.ts`, a tela de Nova Movimentação, o card arredondado de **Movimentações Recentes** (estilo WalleZ com avatares circulares de `44x44` na cor e ícone Material da categoria, nome + horário e valor colorido `+R$`/`-R$` à direita) e a tela do Simulador de Novo Aporte.
3. Rode os testes até 100% passarem, valide com `./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase B: `git add . && git commit -m "feat(sprint-4): complete phase B implementation and test report" && git push origin main`.
```

---

### SPRINT 5: Dashboards (Consolidado e por Carteira), Gráficos de Evolução Patrimonial e Ajuste de SafeAreaView
**Objetivo:** Construir os gráficos de Alocação (Atual vs Meta) e de Evolução Patrimonial histórica (usando a série COTAHIST + CDI cruzada com o histórico de aportes) e corrigir o comportamento de `SafeAreaView` e insets em Android/iOS.

#### Prompt da Sprint 5 — Fase A (Criar Testes + Bloquear)
```markdown
Vamos executar a **Sprint 5 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `SPEC.md` e `TEST_REPORT.md`.

1. Desbloqueie o lock (`./scripts/test-lock.ps1 -Action unlock`) e crie as assinaturas de `portfolioHistory.ts` e `consolidatedView.ts`.
2. Escreva os testes `S5-T01` e `S5-T02`:
   - Reconstrução exata da curva histórica `investedCapital` vs `marketValue` cruzando aportes/vendas com preços do COTAHIST e curva de Renda Fixa.
   - Consolidação precisa de múltiplas carteiras independentes no Dossiê Geral (Home).
3. Bloqueie os testes (`./scripts/test-lock.ps1 -Action lock`) e documente os hashes `SHA-256` em `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase A: `git add . && git commit -m "test(sprint-5): add and lock phase A specification tests" && git push origin main`.
```

#### Prompt da Sprint 5 — Fase B (Implementar Código sob Bloqueio + Relatório)
```markdown
Vamos executar a **Sprint 5 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `SPEC.md` e `DESIGN_SYSTEM.md`.

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado.

Passos:
1. **Ajuste de `SafeAreaView` e Insets:**
   - Substitua o `SafeAreaView` legado do `react-native` pelo `SafeAreaProvider`, `SafeAreaView` (`edges={['top', 'left', 'right']}`) e `useSafeAreaInsets` do pacote `react-native-safe-area-context`.
   - Garanta que o cabeçalho superior nunca colida com a StatusBar/Notch/Dynamic Island no Android e iOS, e que a `FloatingBottomDock` respeite dinamicamente o `insets.bottom` da barra de gestos/navegação do sistema.
2. Implemente `portfolioHistory.ts`, `consolidatedView.ts` e as telas de **Home (Hero Wallet Card Empilhado + 3 Bento Tiles + Movimentações Recentes)** e **Statistics (Gráfico de Cápsulas Empilhadas Mensais com seletor `W | M | Y` e Tooltip flutuante + Card de Alocação por Categoria com Matriz de Pontos `Dot-Matrix`)**.
3. Rode todos os testes até 100% passarem, valide com `./scripts/test-lock.ps1 -Action verify` e atualize `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase B: `git add . && git commit -m "feat(sprint-5): complete phase B implementation, SafeAreaView fix and test report" && git push origin main`.
```

---

### SPRINT 6: Exportação/Importação (`.celsus.zip` com CSVs + SHA-256) e Segurança Local
**Objetivo:** Implementar o sistema completo de Backup e Restauração via arquivo `.celsus.zip` (CSVs + `manifest.json` com verificação de integridade SHA-256), Modo Privacidade e Bloqueio Biométrico.

#### Prompt da Sprint 6 — Fase A (Criar Testes + Bloquear)
```markdown
Vamos executar a **Sprint 6 — Fase A (TDD: Especificação e Bloqueio de Testes)** conforme definido em `SPEC.md` e `TEST_REPORT.md`.

1. Desbloqueie o lock (`./scripts/test-lock.ps1 -Action unlock`) e crie as assinaturas de `backupService.ts` e `privacyAndAuth.ts`.
2. Escreva os testes `S6-T01` a `S6-T04`:
   - Geração do pacote `.celsus.zip` contendo `manifest.json` + 4 arquivos CSV com hashes `SHA-256` e contagem de linhas exatos.
   - Rejeição imediata de arquivo `.celsus.zip` quando qualquer byte de um CSV for adulterado (divergência de `SHA-256`), mantendo o banco local intacto.
   - Restauração completa (*Restore*) e mesclagem sem duplicação (*Merge por UUID v4*).
   - Redação de valores em Modo Privacidade (`██████,██`) e acionamento do bloqueio biométrico.
3. Bloqueie todos os testes (`./scripts/test-lock.ps1 -Action lock`) e atualize os hashes `SHA-256` em `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase A: `git add . && git commit -m "test(sprint-6): add and lock phase A specification tests" && git push origin main`.
```

#### Prompt da Sprint 6 — Fase B (Implementar Código sob Bloqueio + Relatório)
```markdown
Vamos executar a **Sprint 6 — Fase B (Implementação TDD sob Bloqueio)** conforme definido em `SPEC.md` e `DESIGN_SYSTEM.md`.

REGRAS OBRIGATÓRIAS:
- Não edite nenhum arquivo de teste bloqueado.

Passos:
1. Implemente `backupService.ts`, `privacyAndAuth.ts` e a tela de Configurações / Backup.
2. Rode toda a suíte de testes do projeto (Go + Mobile) até atingir 100% de aprovação.
3. Execute `powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify` e consolide o relatório final em `TEST_REPORT.md`.
4. Realize o commit obrigatório da Fase B: `git add . && git commit -m "feat(sprint-6): complete phase B implementation and final test report" && git push origin main`.
```
