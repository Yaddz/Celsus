# Celsus — Plano das sprints 71 a 83: Pluggy, cartão, NFC-e e unificação visual Finanças × Investimentos

Revisão de 16/11/2026 sobre a branch `feat/sprint-61-credit-card-transfers` (último commit: sprint 70). Este documento é a
**fonte de verdade das sprints 71 a 83**; os prompts de execução estão em
[`PROMPTS_SPRINTS_71_83.md`](./PROMPTS_SPRINTS_71_83.md) (fora do git). Caminhos relativos a `apps/mobile/`.

Os 15 ajustes pedidos são citados pelos números **A1…A15**:

| Grupo | Ajustes |
| :--- | :--- |
| Pluggy | A1 importação incorreta · A2 proventos não sincronizam · A3 carteira automática por corretora |
| Cartão | A4 lançamento sem vencimento próprio + extrato por fatura |
| NFC-e | A5 valor total não reconhecido · A6 aceitar código de barras / chave de 44 dígitos |
| Navegação | A7 header igual · A8 nav bar igual com "+" · A9 globo alterna em todas as telas · A10 Receitas/Despesas abrem páginas · A11 Perfil com base comum e seções por módulo · A12 saldo do mês em carrossel |
| Visual | A13 espaçamentos por token · A14 tema claro em todas as telas · A15 alinhar Finanças ao design de Investimentos |

---

## 1. Mapa do que existe hoje

| Área | Arquivos | Observação |
| :--- | :--- | :--- |
| Navegação raiz | `App.tsx` (2191 linhas), `src/navigation/backNavigation.ts` | Sem Expo Router. Abas de Investimentos (`activeTab`: home/stats/search/wallets) e camadas por estado. Finanças é uma camada (`isFinanceOpen`) que cobre tudo. |
| Módulo Finanças | `src/screens/finance/*` | `FinanceHomeScreen.tsx` é ao mesmo tempo o Resumo e o roteador interno (`FinanceRoute`, `PARENT_OF_ROUTE`, `TAB_OF_ROUTE`). 12 rotas. |
| Módulo Investimentos | `App.tsx` (Home), `StatisticsScreen`, `SearchAssetsScreen`, `PortfolioManagementScreen`, `IncomeHistoryScreen`, `ClassDetailScreen`, `AssetDetailScreen` | |
| Header | `src/components/ui/XpMinimalHeader.tsx` | Um componente, dois usos: Investimentos passa avatar + olho + globo; Finanças passa `onBack` + título e **não passa `onGlobePress`**. |
| Nav bar | `src/components/ui/FloatingBottomDock.tsx` (Investimentos) e `src/screens/finance/FinanceDock.tsx` (Finanças) | Dois componentes diferentes. O de Investimentos tem abas e menu "+" **fixos no código** (`TABS`, `MENU_ITEMS`). |
| Carrossel de carteiras | `src/components/ui/StackedWalletDeck.tsx` | `PanResponder` + `Animated`; indicador em pílulas em `App.tsx` (`home-wallet-pills`). |
| Tokens | `src/theme/tokens.ts` (`colors`, `typography`, `space`, `layout`, `bento`, `dock`, `borders`), `src/theme/palettes.ts` (`THEME_COLORS`, `LIGHT_THEME_TOKENS`, `themeModeService`), `src/theme/motion.ts` | Finanças tem uma camada própria: `src/screens/finance/finTheme.tsx` (`getFinUiColors`, `sharedStyles`). |
| Perfil | `src/screens/SettingsBackupScreen.tsx`, `src/screens/profile/ProfileTiles.tsx`, `src/screens/profile/useProfileSettings.ts` | Grupos CONTA / PROTEÇÃO / DADOS. Só abre a partir de Investimentos. |
| Pluggy | `src/services/pluggy/{pluggyClient,pluggySyncService,pluggyInvestmentsSyncService,types}.ts`, `src/domain/openFinance/{index,investments}.ts`, `src/repositories/openFinanceRepository.ts`, `src/screens/OpenFinanceScreen.tsx`, `src/components/OpenFinanceInvestmentReconciliationSheet.tsx` | Credenciais no `SecureStore`; itens do Meu Pluggy digitados à mão. |
| Cartão | `src/db/schema.ts` (`fin_accounts.closing_day/due_day/credit_limit_cents`, `fin_entries.bill_month`), `src/domain/financeFlow/cards.ts`, `src/screens/finance/CardBillScreen.tsx`, `EntryFormSheet.tsx`, `EntriesListScreen.tsx` | A fatura já é uma visão calculada. |
| Cupom | `src/domain/receipt/{parseNfceQr,parseReceiptText,suggestCategoryFromRules,types}.ts`, `src/services/receiptService.ts`, `src/screens/finance/ReceiptScannerSheet.tsx` | `expo-camera` (QR) e `expo-text-extractor` (OCR no aparelho). **Não existe consulta à SEFAZ.** |

---

## 2. Diagnóstico por ajuste

### A1 — Importação da Pluggy não traz os dados corretamente
**Sintoma relatado pelo usuário (16/11):** a importação vem, no geral, com **informações faltando**, **nomenclaturas erradas** e **sem proventos**. A sprint 71 trata os dois primeiros; a 72, os proventos.
**Situação:** dois botões separados em `OpenFinanceScreen.tsx` (`open-finance-sync-finance-btn`, `open-finance-sync-investments-btn`), cada um com seu fluxo de conciliação.
**Causas encontradas no código** (o sintoma exato precisa ser confirmado com dados reais, ver seção 6):
1. `pluggyInvestmentsSyncService.syncInvestments` grava **todas** as movimentações da Pluggy na tabela `transactions` com os tipos `INCOME`, `AMORTIZATION`, `TAX` e `TRANSFER`, mas a tabela e o `domain/finance/averagePrice.ts` só conhecem `BUY | SELL | SPLIT | INPLIT`. Resultado: linhas "fantasma" no histórico do ativo e posição que não fecha.
2. `calculateInvestmentCostBasis` (`domain/openFinance/investments.ts`) soma `TRANSFER` como compra.
3. `mapPluggyInvestmentTransaction` calcula taxas como `|netAmount| − |amount|` e ignora o objeto `expenses` que a API devolve para Open Finance/Meu Pluggy.
4. `mapPluggyInvestment` troca quantidade nula por `1` e grava `manual_position_value = balance` também para ações e FIIs, o que pode sobrepor a cotação de mercado.
5. `syncInvestments` não valida o consentimento (`assertItemConsentActive`), não registra a rodada com erro e busca as movimentações **um investimento por vez** com timeout de 10 s: uma falha derruba tudo sem deixar rastro em `of_sync_runs`.
6. `runInvestmentsSync` (tela) exige uma carteira já criada e abre a conciliação manual sempre que há investimento sem `external_id` casado.
7. `handleStartFinanceSync` concilia só o **primeiro** item sem sincronização e retorna; os demais exigem novos toques.
8. **Nomes:** `mapPluggyInvestment` usa como ticker o `code`, senão o ISIN, senão os 24 primeiros caracteres do nome em maiúsculas; renda fixa e fundos ficam com "tickers" ilegíveis e nome cru da instituição. Contas usam `marketingName` ou `name` sem banco nem final do número; lançamentos usam a `description` crua do banco.
9. **Campos descartados:** emissor, CNPJ, datas de emissão/compra, impostos, titular e número da conta, saldo investido automaticamente, pagamento mínimo e fechamento da fatura chegam da API e não são guardados nem exibidos.
10. `PluggyInvestment` em `types.ts` não tem os campos `institution`, `issuerCNPJ`, `metadata`; `PluggyInvestmentTransaction` não tem `expenses`.

Conferido na documentação em 16/11/2026: `GET /v2/transactions` usa `dateFrom`/`dateTo` e `next` como query string (o cliente já trata certo); `GET /investments` e `/investments/{id}/transactions` são paginados por página (`pageSize` até 500).

### A2 — Proventos não sincronizados
**Causa confirmada:** a Pluggy entrega dividendos, JCP, rendimentos de FII e cupons como movimentação de investimento do tipo `INTEREST`. O app mapeia para `INCOME` e grava em `transactions`; **nada é gravado em `income_events`**, que é a tabela lida por `incomeRepository`, `IncomeHistoryScreen`, `DividendsCard` e `HomeIncomeTile`.
**Arquivos:** `domain/openFinance/investments.ts`, `services/pluggy/pluggyInvestmentsSyncService.ts`, `repositories/incomeRepository.ts`, `domain/finance/incomeHistory.ts`.

### A3 — Carteira automática por corretora
**Situação:** `syncInvestments` recebe `defaultPortfolioId`/`portfolioByItemId`, mas a tela nunca os preenche; o usuário escolhe a carteira na folha de conciliação. `portfolios` não tem nenhum vínculo com a conexão.
**Observação:** o campo `institution` do investimento só vem no conector CEI/B3; a corretora de um item é `item.connector.name` (já salvo em `of_items.connector_name`).
**Arquivos:** `db/schema.ts`, `db/client.ts`, `repositories/portfolioRepository.ts`, `services/backupService.ts`, `OpenFinanceScreen.tsx`.

### A4 — Cartão: vencimento por lançamento
**Situação:** o modelo já tem `bill_month` e a fatura calculada (`cards.ts`, `CardBillScreen.tsx`). O problema é de regra e de tela: `EntryFormSheet.tsx` mostra o campo **"Vencimento"** para qualquer conta e grava a compra como `status: 'pending'` com `due_date` = data digitada; `EntriesListScreen.tsx` não distingue cartão, então a compra aparece em "Em atraso"/"Próximos dias" como se vencesse sozinha. `calculateMonthlySummary` soma a compra no mês de `due_date`.
**Arquivos:** os citados, mais `domain/financeFlow/index.ts`, `finService.ts`, `AccountsScreen.tsx`.

### A5 — Leitor não reconhece o valor total
**Causa provável (QR):** `parseNfceQr.ts` só extrai valor do parâmetro `vNF` ou do formato de contingência (8 campos). O QR mais comum, o da emissão online (`p=chave|2|tpAmb|idCSC|hash`), **não traz o valor**; nesse caso `amountCents` fica nulo e o formulário abre sem total.
**Causa provável (foto):** `extractTotal` em `parseReceiptText.ts` depende de rótulo e valor na mesma linha ou na seguinte. O OCR costuma devolver o cupom em colunas (todos os rótulos, depois todos os valores) e o `ignoreRe` descarta linhas com "VALOR PAGO", que em muitos cupons é a única com o total legível.
**Arquivos:** os dois parsers, `receiptService.ts`, `ReceiptScannerSheet.tsx`, `domain/receipt/__tests__/fixtures.ts`.

### A6 — Cupom só com código de barras / chave de 44 dígitos
**Situação:** a câmera só lê `barcodeTypes: ['qr']`; `parseNfceQr` rejeita qualquer modelo diferente de 65. O código de barras (Code 128) aparece no DANFE de NF-e (modelo 55) e no CF-e SAT (modelo 59, em dois blocos de 22 dígitos). Não há entrada manual da chave.

### A7 — Header
**Situação:** `XpMinimalHeader` desenha avatar + nome à esquerda e olho + globo à direita nas telas de Investimentos; em Finanças todas as telas passam `onBack` + `title`, então o avatar some. Não existe ícone de módulo.

### A8 — Nav bar
**Situação:** `FinanceDock.tsx` é uma pílula de 4 abas com rótulos fixos e sem "+"; o "+" de Finanças é um botão flutuante separado (`FinFloatingAddButton`, `finance-add-entry-btn`) com menu próprio (`finance-add-menu`). `FloatingBottomDock.tsx` tem pílula elástica, rótulo só na aba ativa e "+" ao lado, mas com abas e ações fixas.

### A9 — Globo
**Causa:** só a Home de Investimentos passa `onGlobePress` (`homeGlobePress` em `App.tsx`). Em Análises, Busca, Carteiras e em **todas** as telas de Finanças o botão cai no `Alert.alert('Funcionalidade em desenvolvimento')` do próprio header. Para sair de Finanças só existe a seta de voltar.

### A10 — Receitas e Despesas
**Causa:** os tiles `RECEITAS` e `DESPESAS` do Resumo (`finance-month-income`, `finance-month-expense`) são `BentoTile` sem `onPress`. `openEntriesWith({ kind })` já existe e é usado por "Gasto por categoria".

### A11 — Perfil
**Situação:** `SettingsBackupScreen` é único, abre só de Investimentos e mistura itens dos dois módulos (Carteiras, Importar B3, Lembretes de vencimento, Open Finance). Os itens de configuração de Finanças (Categorias, Regras, Importar extrato) vivem na tela "Mais".

### A12 — Saldo do mês
**Situação:** o mês troca por um trilho com setas (`finance-home-month-rail`); o card laranja não responde a gesto.

### A13 — Espaçamentos
**Situação medida** (declarações `padding/margin/gap` com número solto × com token): `FinanceHomeScreen` 30×0, `GoalsScreen` 38×0, `EntryFormSheet` 32×5, `BudgetScreen` 16×0, `CategoriesScreen` 16×1, `OpenFinanceScreen` 24×2, `StatementImportSheet` 19×14. `sharedStyles.scrollContent` usa `paddingBottom: 170` fixo.

### A14 — Tema claro
**Causa:** `OpenFinanceInvestmentReconciliationSheet.tsx` não recebe `themeMode` (zero referências a tema, 20 cores fixas escuras): é a "tela de importação da Pluggy" fora do tema. `OpenFinanceScreen.tsx` tem 14 hex soltos; `ReceiptScannerSheet`, `GoalsScreen` (15 hex) e `CategoriesScreen` (7) têm cores fixas pontuais.

### A15 — Alinhamento visual
**Situação:** Finanças usa `finTheme.tsx` em paralelo a `tokens.ts`/`palettes.ts`; tipografia, raios e heróis foram definidos tela a tela nas sprints 56–60 a partir do canvas "Celsus Finanças — telas".

---

## 3. Plano de implementação

Ordem = numeração. Dados primeiro (71–75), depois a casca compartilhada (76), as telas que dependem dela (77–78), o visual de Finanças (79–81), a reorganização (82) e a revisão geral dos dois módulos (83).

| Sprint | Objetivo | Ajustes | Depende de | Tam. | Riscos |
| :-: | :--- | :-: | :-: | :-: | :--- |
| 71 | Pluggy: diagnosticar e corrigir a importação (investimentos e finanças) | A1 | — | G | Corrigir dados já gravados errado exige migração de limpeza; sem acesso a dados reais nos testes |
| 72 | Pluggy: proventos em `income_events` | A2 | 71 | M | Duplicar proventos já importados da B3 |
| 73 | Pluggy: botão único "Sincronizar" e carteira automática por corretora | A3 | 71, 72 | M | Mudança de schema (`portfolios`); nome do conector pode ser genérico |
| 74 | Cartão: compra sem vencimento próprio e extrato por fatura | A4 | — | G | Mudança de regra em lançamentos existentes; mexe em resumo mensal e alertas |
| 75 | Leitor de cupom: valor total e chave de 44 dígitos por código de barras ou digitação | A5, A6 | — | M | Consulta à SEFAZ varia por UF; precisa de cupons reais |
| 76 | Casca compartilhada: header com ícone de módulo, nav bar única com "+", globo em todas as telas | A7, A8, A9 | — | G | Testes travados de header/dock das sprints 58 e 60 |
| 77 | Resumo: saldo do mês em carrossel e tiles Receitas/Despesas navegáveis | A10, A12 | 76 | M | Gesto horizontal dentro de `ScrollView` vertical |
| 78 | Perfil: base comum e seções por módulo | A11 | 76 | M | Testes travados do Perfil |
| 79 | Tema claro em todas as telas | A14 | 76 | M | Regressão visual no tema escuro |
| 80 | Espaçamentos de Finanças pelos tokens | A13 | 79 | M | Muitos arquivos; mudança mecânica |
| 81 | Alinhamento visual final de Finanças ao design de Investimentos | A15 | 80 | G | Subjetivo: precisa de checklist fechado (está no prompt) |
| 82 | Reorganização de Finanças no formato "Espelho de Investimentos" (Início · Análises · Extrato · Contas) | decisão da seção 4 | 76, 77, 78, 81 | G | Muda rotas e a regra do voltar; testes travados das sprints 58–60 e 76 |
| 83 | Revisão geral dos DOIS módulos: textos vazando, elementos colados, escala de fontes | pedido de 16/11 | 80, 81, 82 | G | Toca Investimentos (até aqui só referência); muitas telas |

**Build nativo:** nenhuma sprint adiciona biblioteca nativa (o Code 128 já é suportado pelo `expo-camera` instalado).
**Paralelismo possível:** 74 e 75 não dependem de nada e não tocam nos mesmos arquivos de 71–73.

---

## 4. Organização do módulo Finanças

**Decisão (16/11/2026): Opção 1, "Espelho de Investimentos".** Entra como sprint 82. As opções descartadas ficam
registradas no fim da seção.

| Aba | Equivalente em Investimentos | Conteúdo |
| :--- | :--- | :--- |
| **Início** | Início | Carrossel de mês, Receitas/Despesas, A vencer/Atrasadas, gasto por categoria, previsão de saldo |
| **Análises** | Análises | Patrimônio, Orçamento, Metas, **tile de Assinaturas** (gasto por mês e por ano, abre a tela de Assinaturas), fluxo de caixa de 12 meses, fixo × variável |
| **Extrato** | Busca | Lançamentos com busca e filtros; segmentos "Tudo · A pagar · Fixos" ("Fixos" lista as recorrências) |
| **Contas** | Carteiras | Contas e cartões **em lista** (não em baralho); tocar no cartão abre o extrato por fatura |
| **"+"** | "+" | Novo lançamento · Ler cupom · Transferir (três ações) |

Ajustes pedidos sobre o rascunho:
- **Assinaturas** não vira filtro do Extrato: mantém a tela própria e ganha um tile em Análises.
- **Importar extrato** fica só no Perfil (seção Finanças), fora do "+".
- **Contas e cartões** ficam em lista.

A aba "Mais" deixa de existir: Patrimônio, Orçamento, Metas e Assinaturas são alcançados por Análises; Recorrências
pelo segmento "Fixos" do Extrato; Categorias, Regras de categorização e Importar extrato pela seção Finanças do Perfil.

### Telas novas sugeridas
1. **Extrato do cartão** por fatura (sprint 74).
2. **Fluxo de caixa anual**, 12 meses de receita × despesa (sprint 82, dentro de Análises).
3. **Detalhe do lançamento** em tela própria: origem (manual, cupom, Pluggy), fatura, parcela.
4. **Detalhe da categoria**: gasto em 12 meses, orçamento e lançamentos, como o `ClassDetailScreen`.
5. **Detalhe da conta**: saldo informado pela Pluggy × calculado e extrato da conta, como o `AssetDetailScreen`.
6. **Central de sincronização**: última rodada por conexão, erros e consentimento a vencer.

Os itens 3 a 6 **não estão** nas sprints 71–83; ficam como candidatos para depois.

### Opções descartadas
- **Por horizonte de tempo** (Hoje · Mês · Planos · Contas): perde a paridade com Investimentos.
- **Manter e enxugar** ("Mais" vira "Planejar"): não resolve a diferença de estrutura entre os módulos.

---

## 5. Decisões e premissas

### Decididas pelo usuário em 16/11/2026
1. **Organização de Finanças:** Espelho de Investimentos, com os três ajustes da seção 4.
2. **Importação Pluggy:** o problema é geral (dados faltando, nomes errados, proventos ausentes); a sprint 71 ataca completude e nomenclatura com um relatório de cobertura campo a campo.
3. **Proventos:** B3 e Pluggy funcionam **em conjunto**. O app valida e não gera conflito nem duplicata, em qualquer ordem de importação (B3 antes ou depois da Pluggy).
4. **SEFAZ:** a consulta à página pública da nota está **autorizada**. Fica ligada por padrão, com interruptor para desligar. Só a chave/URL da nota sai do aparelho; a foto nunca.
5. **TDD Lock sem parada:** o agente escreve e trava os testes da Fase A, faz o commit e **segue direto para a Fase B**, sem esperar confirmação. A autorização explícita continua obrigatória apenas para destravar e alterar um teste ANTIGO.
6. **Revisão geral:** além do alinhamento de Finanças, os dois módulos passam por uma revisão de espaçamento e fontes (sprint 83), motivada por textos vazando do campo e elementos colados.
7. **UFs da consulta à SEFAZ:** DF, SP, RJ, MG, PR e RS.
8. **Globo:** vira o ícone do módulo atual, em um botão só.

### Premissas ainda assumidas
1. **A7 + A9 (confirmado pelo usuário):** o botão que hoje é o globo passa a mostrar o **ícone do módulo atual** (`account-balance` em Finanças, `show-chart` em Investimentos) e continua alternando de módulo. O `testID` `header-globe-button` é mantido.
2. **A7:** telas raiz de cada aba de Finanças mostram avatar + nome; telas internas mantêm a seta de voltar com título.
3. **A9:** alternar de módulo preserva onde o usuário estava em cada um.
4. **A10:** "respectivas páginas" = lista de lançamentos filtrada por receita ou por despesa no mês exibido.
5. **A3:** "corretora" = conexão da Pluggy (`of_items`); uma carteira por conexão com ao menos um investimento. Carteiras criadas à mão não são alteradas.
6. **A4:** a compra no cartão guarda só a data da compra (em `due_date`, sem coluna nova) e nasce liquidada na fatura; compras já lançadas como pendentes são convertidas na migração.
7. **A14:** em Investimentos a sprint 79 só corrige cor fixa que quebra o tema claro; o redesenho fica em Finanças e nas telas da Pluggy.
8. O canvas `Celsus Finanças — telas.html` deixa de ser a referência de layout; a referência é o módulo Investimentos.

## 6. Perguntas ainda em aberto

Nenhuma bloqueia a execução; cada prompt segue a premissa indicada se não houver resposta.

| # | Sprint | Pergunta | Se não houver resposta |
| :-: | :-: | :--- | :--- |
| 1 | 73 | Os itens são do Meu Pluggy? Qual nome de conector aparece para cada um (nome do banco ou "MeuPluggy")? | Nome genérico vira "Corretora <final do id>", renomeável |
| 2 | 75 | Os cupons sem QR são NF-e (modelo 55), CF-e SAT ou NFC-e? Há 3 a 5 fotos reais para virarem casos de teste? | Os três modelos são aceitos; fixtures sintéticas |
