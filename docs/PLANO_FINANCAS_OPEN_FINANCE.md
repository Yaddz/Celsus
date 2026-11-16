# Celsus — Plano do módulo Finanças, importações e Open Finance (Pluggy)

Revisão de 16/11/2026 sobre a branch `feat/sprint-58-finance-nav` (739 testes verdes, 110 suítes; `tsc` com 60 erros,
todos em arquivos de teste antigos). Este documento é a **fonte de verdade das sprints 59 a 68**; os prompts de execução
estão em [`PROMPTS_SPRINTS_59_68.md`](./PROMPTS_SPRINTS_59_68.md).

Design alvo das telas: canvas "Celsus Finanças — telas" (<https://claude.ai/artifact/Rb1d9nj8C9TheELP93QTbg>), 8 pranchas:
Resumo escuro/claro, Lançamentos, Novo lançamento, Recorrências, Assinaturas, Contas e Categorias.
O artefato também está disponivel na raiz do projeto em HTML

---

## 1. Decisões tomadas (16/11/2026)

| Tema | Decisão |
| :--- | :--- |
| Navegação | **Visual do artifact + navbar da sprint 58.** A `FinanceDock` e a tela "Mais" ficam; os 4 atalhos do Resumo (Assinaturas, Recorrências, Contas, Categorias) **não** entram, porque duplicariam a navbar. |
| Credencial Pluggy | **No aparelho.** Client ID e Client Secret digitados uma vez no Perfil e guardados no `SecureStore`; o app chama `api.pluggy.ai` direto. Sem servidor. |
| Investimentos | **Pluggy manda em tudo.** A posição informada pela Pluggy passa a ser a verdade de todas as classes. Ver riscos na seção 5.4. |
| Funções novas | Orçamento por categoria, cartão com fatura e transferências, patrimônio unificado, lembretes e previsão de saldo, **metas integráveis às carteiras de investimento**. |
| Leitura de compras | OCR no aparelho (sem enviar imagem para fora) como caminho principal; QR da NFC-e como complemento. Padrão assumido, não perguntado: ver seção 4.2. |

---

## 2. Bugs encontrados no módulo Finanças

Todos confirmados lendo o código. P0 = número errado ou dado perdido; P1 = comportamento enganoso; P2 = robustez.

| # | P | Bug | Onde | Efeito |
| :-- | :-: | :--- | :--- | :--- |
| F1 | P0 | Repetição **"Mensal" não cria recorrência**. A folha mostra "Todo dia 15 · sem data final", mas `handleSave` só olha o número de parcelas e grava um lançamento único. | `EntryFormSheet.tsx` (`handleSave`) | O usuário acredita ter criado uma conta fixa e ela não volta no mês seguinte. |
| F2 | P0 | **Ocorrência excluída ou com data editada volta.** `generateRecurrenceOccurrences` deduplica só por `due_date` existente; `generated_until` é gravado e nunca consultado. | `domain/financeFlow`, `finService.generateRecurrenceWindow` | Excluir "só este mês" recria o lançamento na próxima abertura; mudar o vencimento gera duplicata. |
| F3 | P0 | **Editar a recorrência não atualiza as ocorrências pendentes** e, se o dia mudar, cria duplicatas (a antiga fica, a nova é gerada). | `RecurrencesScreen.tsx` (`handleSave`) | Valores e datas antigos continuam no mês; soma de despesas dobra. |
| F4 | P0 | **Saldo inicial negativo perde o sinal ao editar a conta** (`Math.abs` ao abrir o formulário). | `AccountsScreen.tsx` (`openEditModal`) | Conta no cheque especial vira saldo positivo ao salvar qualquer edição. |
| F5 | P0 | **Lançamento órfão**: sem contas cadastradas, salva com `account_id = 'default-account'` (não existe). O mesmo vale para a categoria de reserva. | `EntryFormSheet.tsx`, `RecurrencesScreen.tsx` | O valor entra no resumo do mês mas não em nenhuma conta nem no saldo total. |
| F6 | P1 | **Atrasadas de meses anteriores somem.** O tile soma todos os atrasos, mas abre a lista filtrada só por "pendentes" do mês selecionado, que carrega apenas aquele mês. | `FinanceHomeScreen.tsx` (`openEntriesWith`), `EntriesListScreen.tsx` | O Resumo diz "2 contas atrasadas" e a lista não mostra nenhuma. |
| F7 | P1 | **Contagem e valor não batem** em "A vencer" e "Atrasadas": o valor soma só despesas, a contagem inclui receitas a receber. | `FinanceHomeScreen.tsx` | "R$ 0,00 · 1 conta". |
| F8 | P1 | **"Próxima cobrança" errada nas assinaturas**: parte de `generated_until` (fim da janela, ~3 meses à frente) e soma mais um período. | `SubscriptionsScreen.tsx` (`computeNextBillingIso`) | Mostra uma data meses adiante em vez do próximo vencimento. |
| F9 | P1 | **Pausar não remove as ocorrências futuras já geradas**; retomar preenche o mês anterior como atrasado. | `finService.pauseSubscription/resumeSubscription` | Assinatura "pausada, sem cobranças futuras" continua aparecendo como pendente por até 3 meses. |
| F10 | P1 | **Recorrências só são geradas até 2 meses à frente** e apenas ao abrir o Resumo. Navegar para meses adiante mostra o mês vazio. | `finService.initializeFinanceModule` | Projeções futuras parecem zeradas. |
| F11 | P1 | **Excluir lançamento não pede confirmação** (parcelas pedem escopo, o resto apaga direto). | `EntriesListScreen.tsx` (`handleDeletePress`) | Perda por toque acidental. |
| F12 | P2 | Formulário de recorrência sem `try/catch`, sem trava de duplo toque e com datas em texto livre sem validação (início, fim e data da baixa). | `RecurrencesScreen.tsx`, `EntriesListScreen.tsx` | Duplo toque cria duas recorrências; data inválida vira 01/01. |
| F13 | P2 | Escritas em laço sem transação (parcelas, cancelamento, geração de janela). | `finService.ts` | Falha no meio deixa metade das parcelas. |
| F14 | P2 | Todas as telas carregam **todos** os lançamentos e filtram em JS (o índice `idx_fin_entries_due_date` não é usado); a geração de recorrências faz uma consulta por recorrência. | `finRepository.ts` | Fica lento quando o Open Finance trouxer milhares de transações. |
| F15 | P2 | Variação mensal da conta usa `paid_date`, o resumo usa `due_date`. | `AccountsScreen.tsx` | "+R$ X no mês" diverge do Saldo do mês. |
| F16 | P2 | Resumo pisca o carregamento a cada retorno e mostra o estado vazio mesmo com contas cadastradas. | `FinanceHomeScreen.tsx` | Sensação de lentidão. |
| F17 | P2 | Não existe transferência entre contas nem fatura de cartão: pagar a fatura conta a despesa duas vezes. | modelo de dados | Resolvido na sprint 61. |
| F18 | P2 | IDs gerados com `Math.random` (há `expo-crypto` no projeto). | `finRepository.ts`, `finService.ts` | Risco baixo de colisão; relevante com importação em massa. |

Fora do módulo, continuam válidos os itens abertos de [`MELHORIAS.md`](./MELHORIAS.md) (1.1 preço manual, 1.2 atomicidade,
1.3 timeout de rede, 2.1 dock único, 5.1 tipos nos testes). Dois ganham peso com este plano: **1.2** (a sincronização grava
em lote) e **1.3** (chamadas à Pluggy precisam de timeout).

`app.json` ainda está com `name: "mobile"`, `package: com.anonymous.mobile` e `userInterfaceStyle: "light"`; vale acertar
antes do primeiro build nativo novo (sprint 63), já que trocar o `package` depois reinstala o app do zero.

---

## 3. Diferenças entre o app e o artifact (sprint 60)

| Tela | Hoje | Artifact |
| :--- | :--- | :--- |
| Resumo | Um tile "Atenção" com as duas colunas; top 3 categorias; 22 pontos soltos | Dois tiles lado a lado: **A vencer · 7 dias** em ouro `#D4A83B` e **Atrasadas** escuro com ícone de alerta; **5 linhas** (4 maiores + "Outros"); trilha de pontos contínua de 8 px |
| Lançamentos | Seções existem | Seções "Em atraso", "Próximos dias", "Liquidados" com "Ver tudo ›"; chips Pendentes · N, Pagos, Categoria ▾, Conta ▾; subtítulo com "Recorrente", "Parcela 3/12", "Assinatura" |
| Novo lançamento | Folha | Tiles separados: Valor (32 px), Descrição + Vencimento + Conta, Categoria em chips com "+ Nova", Repetição Única/Mensal/Parcelada, botão laranja de 56 px |
| Recorrências | Lista | Dois tiles no topo "Fixo · saídas" e "Fixo · entradas" por mês; "Ativas · N" e "Encerradas · N"; suporte a **valor variável** ("-~R$ 210,00") |
| Assinaturas | Lista | Herói verde-floresta com gasto por mês e por ano; abas Ativas · N / Pausadas · N / Canceladas; linha expandida com Pausar e Cancelar; "Cobra em 3 dias" |
| Contas | Lista | Herói laranja "Saldo total" com "cartões ficam fora do saldo"; seções Contas, Cartões ("Gasto no mês"), Arquivadas com "Restaurar" |
| Categorias | Lista | Abas Despesas/Receitas, contagem de lançamentos por categoria, edição em linha (nome + 7 cores) com Arquivar e Salvar |

Paleta de categorias do artifact: `#D96628`, `#D5CAA8`, `#C49A45`, `#AECDC5`, `#2E4A44`, `#B8B2A6`, `#E6DECA`. As categorias
padrão hoje usam cores fora dela (`#3386B0`, `#CD528F`, `#A958E4`, `#2A904C`, `#178D84`).

---

## 4. Funções novas

### 4.1 Cartão, fatura e transferências (sprint 61)
- `fin_accounts` ganha `closing_day`, `due_day`, `credit_limit_cents`.
- Compra no cartão pertence a uma **fatura** (`bill_month`, calculada pelo dia de fechamento). A fatura é uma visão, não um lançamento.
- **Pagar fatura** e **transferir entre contas** criam um par de movimentos ligados por `transfer_group_id`, que não contam como receita nem despesa.
- Saldo total continua excluindo cartões; o patrimônio unificado (sprint 68) desconta a fatura aberta.

### 4.2 Importação de fatura e extrato (sprint 62) e leitura de compras (sprint 63)
- **Arquivos**: OFX (todos os grandes bancos exportam) e CSV (Nubank, Inter, C6, Itaú). PDF de fatura fica fora: o layout muda por emissor e a Pluggy já entrega as faturas.
- Fluxo igual ao da importação B3: escolher arquivo → pré-visualização com contagem de novos/duplicados → confirmar. Deduplicação por `external_id` (FITID do OFX, ou hash de data + valor + descrição).
- Parcelas são reconhecidas pelo texto ("PARC 03/12", "3/12") e viram `installment_number/total`.
- **Regras de categorização** (`fin_category_rules`: contém/começa com → categoria), aprendidas quando o usuário corrige uma categoria. Servem ao arquivo, ao OCR e ao Open Finance.
- **OCR de cupom**: reconhecimento de texto no aparelho, extraindo total, data, CNPJ e nome do estabelecimento; o usuário revisa antes de salvar. Exige biblioteca nativa e novo build de desenvolvimento.
- **QR da NFC-e**: o código traz a chave de acesso (CNPJ e mês de emissão sempre; o valor total só em parte dos formatos). Itens da nota exigem consultar a página da SEFAZ, que muda por estado; fica como incremento opcional por UF.

### 4.3 Orçamento, lembretes e previsão (sprint 67)
- `fin_budgets` (categoria, mês ou "todo mês", limite). Barra de pontos por categoria e aviso em 80% e 100%.
- Notificações locais N dias antes do vencimento e no dia; reagendadas quando o lançamento muda.
- Previsão: saldo de hoje + a receber − a pagar até o fim do mês, dia a dia, apontando o dia de menor saldo.

### 4.4 Metas e patrimônio unificado (sprint 68)
- `fin_goals`: nome, valor alvo, data alvo, e uma **origem do progresso**: manual (aportes lançados), saldo de uma conta, ou **valor de uma ou mais carteiras de investimento** (ou uma classe dentro delas).
- Reaproveita `calculateGoalProgress` e `projectMonthsToGoal` de `domain/finance/goal.ts`.
- Patrimônio líquido = contas + investimentos − faturas abertas, com foto mensal (`net_worth_snapshots`) para o gráfico de evolução.

---

## 5. Open Finance com a Pluggy (uso pessoal)

### 5.1 O que a documentação diz (lida em 16/11/2026)

- **Meu Pluggy** é o caminho gratuito para pessoa física: sem due diligence, não expira com o trial, **até 5 conexões**, uso não comercial.
- Os bancos são conectados em `meu.pluggy.ai`, não dentro do app. No Dashboard, em Applications → Demo → Connect Account, escolhe-se o conector **MeuPluggy**; cada banco vira um *item* na aplicação.
- Esses itens **espelham** o Meu Pluggy: atualizam sozinhos a cada 24 h e **não podem ser atualizados manualmente**. `GET /items` (listagem) não funciona para contas Meu Pluggy, então os `itemId` são copiados do Dashboard.
- A autorização dura **1 ano**; depois as leituras voltam vazias e o item vira `LOGIN_ERROR` / `USER_AUTHORIZATION_EXPIRED`. `consentExpiresAt` vem em `GET /items/{id}`. Renovar é repetir o "Connect Account".
- `POST /auth` com Client ID e Secret devolve uma API Key válida por **2 horas**. O Client Secret aparece uma única vez no Dashboard.
- Transações: `GET /v2/transactions` com cursor, até 500 por página, histórico de **até 12 meses**. O `/transactions` antigo acaba em 31/12/2026.
- Faturas (`/bills`), contas (`/accounts`, com `creditData`), investimentos (`/investments`) e movimentações (`/investments/{id}/transactions`) estão disponíveis.
- **Categorização automática é recurso premium** fora do trial: `category` pode vir `null` em tudo. Por isso as regras locais da sprint 62 são o caminho principal.
- Limites mensais do Open Finance por CPF e instituição são folgados para um item por banco (ex.: 240 leituras de transações recentes, 4 de histórico antigo).
- O servidor MCP `https://mcp.pluggy.ai/mcp` serve **documentação e diagnóstico** (status de item, webhooks). Ele não lê saldos nem transações; é ferramenta de desenvolvimento, não parte do app. Para usar nas sprints:
  `claude mcp add --transport http pluggy-docs https://mcp.pluggy.ai/mcp`

Não confirmado na documentação: lista de bancos aceitos no Meu Pluggy e parâmetros de filtro de `/bills`.
Sobre **ações e FIIs custodiados na B3 via Open Finance**: a tabela oficial de cobertura (`docs.pluggy.ai/en/docs/open-finance/investments`, atualizada em 30/10/2026) confirma que conectores como **Itaú (601)**, **XP Banking (602)**, **Rico (605)** e **BTG Pactual Investimentos** já entregam `EQUITY/STOCK`, `EQUITY/REAL_ESTATE_FUND`, `EQUITY/BDR` e `ETF`, enquanto bancos de varejo como **Bradesco (603)** e **Mercado Pago (606)** ainda marcam esses subtipos como 🔴. Na Sprint 64, o botão **"Testar conexão"** da tela Open Finance gera o relatório de cobertura por item para confirmar exatamente o que chega nos seus itens do Meu Pluggy (e manter a importação B3 como fallback quando algum conector não trouxer renda variável).

### 5.2 Arquitetura

```
meu.pluggy.ai (você conecta os bancos)
        │  espelha a cada 24 h
Dashboard Pluggy → aplicação pessoal → itemIds
        │
App Celsus ── SecureStore: clientId, clientSecret, apiKey (2 h)
   services/pluggy/pluggyClient.ts   auth, paginação por cursor, timeout, erros tipados
   services/pluggy/pluggySyncService.ts   orquestra item → contas → transações → faturas → investimentos
   domain/openFinance/   mapeamentos puros e reconciliação (100% testáveis)
   SQLite: of_items, of_accounts, of_sync_runs + external_id nas tabelas existentes
```

- **Sem webview, sem deep link, sem dependência nativa**: como a conexão acontece no Meu Pluggy, o app só faz `fetch`.
- Sincroniza ao abrir o app se a última rodada tiver mais de 12 h, e por "puxar para atualizar". Sem webhook (não há servidor).
- Tudo que vem da Pluggy entra com `source = 'OPEN_FINANCE'` e `external_id` (campos que `assets` e `transactions` já têm).
- O backup `.celsus.zip` inclui os dados sincronizados, mas **nunca** as credenciais.

### 5.3 Finanças pessoais (sprint 65)

| Pluggy | Celsus |
| :--- | :--- |
| Account `BANK` | `fin_accounts` `checking` (saldo exibido = saldo informado pela Pluggy) |
| Account `CREDIT` | `fin_accounts` `card`, com limite e vencimento de `creditData` |
| Transaction `POSTED` | `fin_entries` pago, `external_id = transaction.id` |
| Transaction `PENDING` | `fin_entries` pendente, promovido quando virar `POSTED` |
| `creditCardMetadata.installmentNumber/totalInstallments`, `billId` | parcela e fatura |
| Bill | fatura do cartão (total, vencimento, mínimo) |

Reconciliação: uma transação importada que casa com um lançamento **pendente** manual ou de recorrência (mesma conta, valor
igual ou dentro de tolerância para "valor variável", data a até 5 dias) **dá baixa nesse lançamento** em vez de criar outro.
Transferências entre contas próprias (mesmo valor, sinais opostos, até 2 dias) viram par de transferência.

### 5.4 Investimentos (sprint 66) — "Pluggy manda em tudo"

- Cada `Investment` vira ou atualiza um `asset` (`external_id = investment.id`, `source = 'OPEN_FINANCE'`): quantidade, valor, taxa, vencimento, emissor.
- Mapeamento de classe: `EQUITY/STOCK|BDR` → Ação, `EQUITY/REAL_ESTATE_FUND` → FII, `ETF` → Ação/ETF, `FIXED_INCOME/*` e `COE` → Renda fixa, `MUTUAL_FUND/*` e `SECURITY/*` → Fundos/Previdência.
- `GET /investments/{id}/transactions` alimenta o livro-razão (BUY, SELL, INTEREST → provento, AMORTIZATION, TAX).

Riscos que a escolha traz, e como o plano os trata:

1. **Histórico de 12 meses.** O preço médio de posições antigas não pode ser recalculado só com a Pluggy. O app usa `amountOriginal ÷ quantity` como custo quando o histórico é incompleto e marca o ativo como "custo informado pela instituição".
2. **Ações e FIIs podem não vir.** Se o seu banco/corretora não expuser renda variável, essas posições **continuam vindo da B3** e a tela de sincronização diz isso com todas as letras. Nada é apagado por ausência.
3. **Duplicidade com o que já existe.** Na primeira sincronização, uma tela de conciliação casa cada investimento da Pluggy com um ativo existente (por ticker/ISIN) e você confirma. Ativos casados passam a ser governados pela Pluggy; movimentações manuais e da B3 anteriores ficam arquivadas, não excluídas.
4. **Campos nulos no Open Finance** (`amountProfit`, rentabilidades): aparecem como "—", nunca como zero.
5. **Semântica do preço manual** (item 1.1 de `MELHORIAS.md`) precisa estar resolvida antes, senão o valor da Pluggy cai num campo ambíguo.

---

## 6. Sprints

| Sprint | Entrega | Depende de | Build nativo |
| :-: | :--- | :-: | :-: |
| 59 | Correções F1–F16 e F18 | — | não |
| 60 | Telas iguais ao artifact, com navbar | 59 | não |
| 61 | Cartão, fatura e transferências | 59 | não |
| 62 | Importação OFX/CSV e regras de categoria | 61 | não |
| 63 | Leitura de cupom por OCR e QR | 62 | **sim** |
| 64 | Pluggy: credenciais, cliente e tela de conexão | 59 | não |
| 65 | Pluggy: contas, transações e faturas | 61, 62, 64 | não |
| 66 | Pluggy: investimentos | 64 | não |
| 67 | Orçamento, lembretes e previsão | 61 | **sim** (notificações) |
| 68 | Metas integradas às carteiras e patrimônio unificado | 61, 66 | não |

Ordem sugerida: 59 → 60 → 61 → 64 → 62 → 65 → 66 → 68 → 67 → 63. Ela deixa o Open Finance funcionando antes das duas
sprints que exigem novo build nativo.
