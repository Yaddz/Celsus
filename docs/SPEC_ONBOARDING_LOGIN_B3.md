# SPEC — Onboarding, tela de bloqueio (PIN + digital) e carga de dados pelo extrato da B3

> Sprints **42 a 48** (42–45 segurança/onboarding · 46–47 importação B3 · 48 histórico de proventos). Documento autossuficiente para outra IA implementar.
> Os prompts de execução estão em [`PROMPTS_SPRINTS_42_48.md`](./PROMPTS_SPRINTS_42_48.md).
> Contexto geral do projeto: [`ARQUITETURA.md`](./ARQUITETURA.md) e [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).
> Arquivo de exemplo real do extrato: [`exemplos/b3-movimentacao-exemplo.xlsx`](./exemplos/b3-movimentacao-exemplo.xlsx) (33 linhas, tabela no Apêndice A).

---

## 0. Diagnóstico do estado atual (confirmado no código)

O que o usuário chama de "tela de login" **não existe como tela**. O que existe:

| Fato | Onde | Consequência |
| :--- | :--- | :--- |
| Só há um *switch* "Bloqueio biométrico / PIN" e um botão "Testar autenticação" dentro do Perfil, que abre em **modal** | `src/screens/profile/ProfileTiles.tsx` (`SecurityTile`), `useProfileSettings.ts`, `SettingsBackupScreen.tsx` (aberto por `isSettingsBackupModalOpen` em `App.tsx`) | É isso que parece "modal indefinido". |
| O provedor de biometria padrão é um **stub que sempre retorna sucesso** | `src/services/privacyAndAuth.ts` (`defaultBiometricProvider`) | A digital "funciona" só no teste e nunca consulta o aparelho. |
| `expo-local-authentication`, `expo-secure-store`, `expo-crypto`, `expo-document-picker`, `expo-file-system` **não estão instalados** | `apps/mobile/package.json` | Não há como pedir digital/PIN do sistema nem guardar segredo com segurança. |
| **Não existe PIN** (nem tela de digitar, nem armazenamento, nem verificação) | — | O texto "PIN" na UI é só rótulo. |
| O estado `isLocked` vive só em memória e **nada bloqueia o app na abertura** | `PrivacyAndAuthService` | Reabrir o app nunca pede autenticação. |
| O nome do usuário é fixo: `userName="Pedro"`, `userInitials="PL"` em 4 lugares | `App.tsx`, `SearchAssetsScreen.tsx`, `PortfolioManagementScreen.tsx`, `StatisticsScreen.tsx` (via props) | Não há onboarding nem perfil real. |
| A única "carga de dados" existente é a planilha AUVP embutida (`planilhaSeed.json`) e o backup `.celsus.zip` | `spreadsheetImportService.ts`, `backupService.ts` | Não há importação de extrato da B3. |

Pontos reutilizáveis: `appMetaRepository` (chave/valor no SQLite), `transactionService.executeTransaction` (atualiza quantidade e preço médio; **lança erro "Saldo insuficiente para venda"**), `incomeRepository.addIncome`, `assetRepository`, `portfolioRepository`, o padrão de relatório com verificação do `spreadsheetImportService` (`ImportReport`), `TextField`, `DirectiveButton`, `BentoTile`, `XpMinimalHeader`, `Skeleton`, `backNavigation.ts`.

---

## 1. Objetivos e fora de escopo

**Objetivos**
1. Substituir o "modal de bloqueio" por uma **tela cheia de bloqueio** de verdade, com PIN numérico e digital **que funcionam** (consultando o aparelho).
2. Criar um **onboarding** de primeira abertura: nome → PIN de acesso (**opcional**) → digital (opcional, depende do PIN) → próximos passos.
3. Criar a **carga de dados pelo extrato da B3** (aba Movimentação da Área do Investidor): arquivo `.xlsx` (ou `.csv`) → pré-visualização → importação idempotente e auditável.

**Fora de escopo (v1)**: login em nuvem, recuperação de PIN por e-mail/SMS, múltiplos usuários, relatório de Negociação da B3 (layout diferente; deixar a camada de parser plugável), importação automática via Open Finance, IR.

**Princípios**: 100% local (nenhum dado do extrato sai do aparelho); nada de valor inventado (ausente = "—"); import **não destrutivo**, repetível e com relatório de conferência; telas em Bento seguindo `DESIGN_SYSTEM.md`.

---

## 2. Decisões de produto (assumidas — ajustáveis, ver §9)

| # | Decisão | Motivo |
| :-: | :--- | :--- |
| D1 | **Nome** obrigatório (2–40 caracteres); iniciais = primeira letra das duas primeiras palavras (ex.: "Pedro Lima" → "PL"; uma palavra → 1 letra). | Substitui "Pedro/PL" fixo. |
| D2 | **PIN opcional** (6 dígitos). O onboarding oferece criar o PIN com **"Agora não"**. **Sem PIN o app não bloqueia** (abre direto na Home) e a tela de bloqueio nem existe. O PIN pode ser criado, alterado ou **removido** depois em Perfil → Segurança. | Decisão do responsável: o PIN não é obrigatório. |
| D3 | **Digital/rosto opcional e dependente do PIN** (o PIN é o plano B quando a digital falha): só pode ser ativada se **houver PIN**, o aparelho tiver sensor **e** biometria cadastrada, e após uma autenticação de teste bem-sucedida. Remover o PIN desativa a digital. | Evita ativar algo que não funciona. |
| D4 | PIN **nunca** é guardado em claro: `SHA-256(salt + pin)` com `salt` aleatório por instalação, gravado no `expo-secure-store` (Keystore/Keychain). | Segredo protegido pelo sistema. |
| D5 | Limite de tentativas: 5 erros → espera de 30 s; depois 1 min, 5 min, 15 min (persistida no secure store; sobrevive a fechar o app). | O espaço de 6 dígitos é pequeno; a defesa é o atraso. |
| D6 | **Bloqueio ao abrir** o app e **ao voltar do segundo plano** após o tempo configurado (**padrão 1 min**; opções: imediato, 30 s, 1 min, 5 min). Só vale quando há PIN. | Comportamento esperado de app financeiro. |
| D7 | Tela de **troca de apps** protegida (capa/ blur quando o app fica inativo) quando o bloqueio está ativo. | Não vazar saldos. |
| D8 | "Esqueci o PIN" (só existe quando há PIN): se a digital estiver ativa, oferece digital; senão, a única saída é **apagar todos os dados** (com confirmação forte) e refazer o onboarding — o app é local-first e não há recuperação de conta. Avisar para exportar o backup `.celsus.zip`. | Honestidade sobre o modelo local. |
| D9 | Usuário **já existente** (banco com dados, sem perfil): onboarding abreviado "Complete seu perfil" (nome + PIN + digital), sem tocar nos dados. | Migração sem perda. |
| D10 | Extrato da B3: **um único arquivo → uma carteira de destino** (padrão: carteira ativa; opção de criar nova). Instituições diferentes ficam registradas na observação do lançamento. | Simples e previsível. |
| D11 | Importação em **duas etapas** (pré-visualizar → confirmar) e **desfazível** ("Desfazer última importação"). | Dados financeiros: nunca gravar às cegas. |

---

## 3. Arquitetura da parte de segurança/onboarding

```
App.tsx
 └─ <AppGate>                      decide o que mostrar
      ├─ carregando (splash)       lê perfil + flags (app_meta + secure store)
      ├─ <OnboardingFlow>          sem perfil/PIN configurado
      ├─ <LockScreen>              perfil ok e sessão bloqueada
      └─ <AppContent />            (o app atual)
```

Novos módulos (nomes sugeridos):

| Arquivo | Papel |
| :--- | :--- |
| `src/services/secureStorage.ts` | Interface `SecureStorage { get/set/delete }`. Implementação `expo-secure-store`; no **web** usa `localStorage` (apenas desenvolvimento, com aviso) e em testes uma versão em memória injetável. |
| `src/services/authService.ts` | `setPin`, `verifyPin`, `hasPin`, `changePin(old,new)`, `removePin(current)` (apaga PIN, sal, tentativas e desativa a digital), `resetAll()`, limitação de tentativas (`getLockoutRemainingMs`), biometria (`canUseBiometrics`, `enableBiometrics`, `authenticateBiometric`, `isBiometricEnabled`), `autoLockSeconds`. Recebe `SecureStorage`, `BiometricProvider` e `Clock` por injeção (testável). |
| `src/services/biometricProvider.ts` | `ExpoBiometricProvider` sobre `expo-local-authentication` (`hasHardwareAsync`, `isEnrolledAsync`, `authenticateAsync`). **Remove o stub** de `privacyAndAuth.ts`. |
| `src/stores/sessionStore.ts` | `useSyncExternalStore` com `{ status: 'loading' \| 'onboarding' \| 'locked' \| 'unlocked' }`, `lock()`, `unlock()`, `markBackgrounded(at)`. |
| `src/stores/profileStore.ts` + `src/repositories/profileRepository.ts` | Nome e iniciais (`app_meta`: `profile:name`, `profile:onboarded:v1`); hook `useProfile()` substitui "Pedro/PL" em todas as telas. |
| `src/components/ui/PinDots.tsx`, `PinKeypad.tsx` | Indicadores e teclado numérico reutilizáveis (lock, onboarding, trocar PIN). |
| `src/screens/LockScreen.tsx` | Tela cheia de bloqueio. |
| `src/screens/onboarding/*` | `OnboardingFlow`, `WelcomeStep`, `NameStep`, `PinStep`, `BiometricStep`, `DoneStep`. |
| `src/components/AppGate.tsx` + `useAppLock` | Gate, `AppState` listener, capa de privacidade. |

`PrivacyAndAuthService` mantém **só** o Modo Privacidade (mascarar valores); toda a parte de biometria/lock migra para `authService`/`sessionStore`. Os testes antigos que dependem do stub devem ser reescritos (com autorização, pelo protocolo TDD Lock).

Dependências (instalar com `npx expo install`, versões da SDK 58): `expo-local-authentication`, `expo-secure-store`, `expo-crypto`, `expo-document-picker`, `expo-file-system`, e `fflate` (descompactar `.xlsx`). **São módulos nativos: exigem novo build** (`cd apps/mobile && npx expo run:android`); no Jest devem ser mockados em `jest.setup.js`.

---

## 4. Tela de bloqueio (`LockScreen`) — layout e comportamento

A tela só existe quando há PIN configurado (D2). **Tela cheia, sem aparência de modal** (não usa `Modal` nem `AnimatedModalSheet`; ocupa o `SafeAreaView` do `AppGate`). Sem header, sem botão fechar, sem dock.

```
┌───────────────────────────────┐
│                               │
│          ( PL )               │  avatar 72px: iniciais, borda na cor da paleta
│       Olá, Pedro              │  título 22px
│   Digite seu PIN para entrar  │  subtítulo cinza (muda p/ "PIN incorreto" em vermelho)
│                               │
│        ○ ○ ○ ○ ○ ○            │  6 pontos (PinDots); preenchem ao digitar; tremem no erro
│                               │
│     [1]    [2]    [3]         │  teclas redondas 72px, tile #1C1E20, toque com JellyPressable
│     [4]    [5]    [6]         │
│     [7]    [8]    [9]         │
│     [👆]   [0]    [⌫]         │  👆 = digital (só se ativa/possível); ⌫ apaga (toque longo limpa)
│                               │
│        Esqueci o PIN          │  link discreto
└───────────────────────────────┘
```

Comportamento:
- Ao montar, se a digital estiver ativa, **dispara o prompt biométrico automaticamente**; cancelar deixa o teclado ativo; a tecla de digital reabre o prompt.
- 6º dígito dispara a verificação (sem botão "OK"). Erro: vibração curta (`Vibration`), pontos tremem 300 ms, limpa o campo, mensagem "PIN incorreto · N tentativas restantes".
- Bloqueio por tentativas (D5): teclado desabilitado + contador regressivo "Tente novamente em 00:27".
- Sucesso: `sessionStore.unlock()` com transição curta (fade) para o app.
- "Esqueci o PIN": folha de confirmação (usa `ConfirmDialog`): explica que sem digital só é possível apagar os dados; botão destrutivo "Apagar tudo e recomeçar" exige digitar `APAGAR`.
- Tema escuro/claro; privacidade: nunca exibe saldos.
- Android "voltar" na tela de bloqueio **minimiza o app** (não fecha a tela); `backNavigation.ts` ganha o estado `isLocked` com prioridade máxima (`'minimize'`).
- Acessibilidade: cada tecla com `accessibilityLabel="Dígito N"`, pontos com `accessibilityValue` ("3 de 6 dígitos"), alvo ≥ 64 dp.
- testIDs: `lock-screen`, `lock-avatar`, `lock-title`, `lock-error`, `pin-dot-{0..5}`, `pin-key-{0..9}`, `pin-key-backspace`, `pin-key-biometric`, `lock-forgot-pin`, `lock-lockout-timer`.

---

## 5. Onboarding

Fluxo em tela cheia, com indicador de progresso (5 pontos) e botão voltar (exceto no primeiro passo):

| Passo | Conteúdo | Regras |
| :--- | :--- | :--- |
| 1. Boas-vindas | Marca "Celsus", 3 benefícios curtos (100% local, metas em dois níveis, aportes inteligentes), botão **Começar**. | Só na primeira vez. |
| 2. Nome | `TextField` "Como podemos te chamar?"; prévia ao vivo do avatar com iniciais. | 2–40 caracteres; `Continuar` desabilitado até ser válido; trim; aceita acentos. |
| 3. PIN (opcional) | Digitar 6 dígitos → confirmar (segunda digitação). Dica: "Você usará este PIN para abrir o app". Botão secundário **Agora não** (pula o PIN **e o passo da digital**; o app ficará sem bloqueio até o usuário criar um PIN em Perfil → Segurança). | PINs triviais (`000000`, `123456`, `111111`, sequências) mostram aviso **não bloqueante**; divergência na confirmação volta ao início do passo com mensagem. |
| 4. Digital | Só aparece se um PIN foi criado no passo 3. Se `canUseBiometrics()`: card "Entrar com digital/rosto" + botão **Ativar** (executa autenticação de teste real) e **Agora não**. Se não houver sensor/cadastro: passo pulado automaticamente (com nota em Perfil → Segurança). | Só grava "ativada" após sucesso do teste. |
| 5. Pronto | "Tudo certo, {nome}!" + 3 caminhos: **Importar extrato da B3** (abre o fluxo da §7), **Criar minha primeira carteira**, **Explorar o app**. | Grava `profile:onboarded:v1`; vai para `unlocked` (já autenticado). |

Regras gerais: o progresso **não é gravado** até o fim (fechar o app no meio recomeça no passo 1; nenhum PIN parcial persiste); gravação atômica no passo final (nome + PIN, se criado + flags). Usuário com dados existentes (D9) vê "Complete seu perfil" com passos 2–4 e vai direto ao app. O app deixa de usar `"Pedro"/"PL"` em qualquer tela: `useProfile()` fornece `{ name, initials }`; antes do onboarding concluído nenhuma tela do app é montada.

testIDs: `onboarding-screen`, `onboarding-progress`, `onboarding-next`, `onboarding-back`, `onboarding-name-input`, `onboarding-pin-hint`, `onboarding-biometric-enable`, `onboarding-biometric-skip`, `onboarding-done-import`, `onboarding-done-create-wallet`, `onboarding-done-explore`.

---

## 6. Perfil → Segurança (substitui o `SecurityTile` atual)

- Remover "Testar autenticação biométrica" e o switch que não faz nada.
- **Sem PIN**: card "Proteja o app com um PIN" + botão **Criar PIN** (PIN → confirmar). "Entrar com digital", "Bloquear após" e "Bloquear agora" ficam desabilitados com a explicação "Crie um PIN primeiro".
- **Com PIN**: "PIN configurado", **Alterar PIN** (atual → novo → confirmar, respeita o limite de tentativas) e **Remover PIN** (pede o PIN atual, confirma; desativa a digital e o bloqueio automático).
- **Entrar com digital**: switch (só com PIN); ligar executa autenticação de teste; desligar pede PIN/digital.
- **Bloquear após**: seletor (Imediato · 30 s · **1 min (padrão)** · 5 min).
- **Bloquear agora**: aciona `sessionStore.lock()`.
- **Nome**: campo editável (atualiza iniciais em todas as telas).
- **Apagar todos os dados**: ação destrutiva com confirmação por texto.

---

## 7. Carga de dados pelo extrato da B3

### 7.1 Fonte e formato

Área do Investidor B3 → *Extrato → Movimentação* → exportar. Arquivo `.xlsx`, planilha "Movimentação", cabeçalho na linha 1 e **mais recente primeiro**:

| Coluna | Exemplo | Observação |
| :--- | :--- | :--- |
| Entrada/Saída | `Credito` / `Debito` | sem acento no arquivo real; aceitar `Crédito`/`Débito`/caixa variada |
| Data | `28/10/2026` | `dd/mm/aaaa` como texto; aceitar também número serial do Excel |
| Movimentação | `Transferência - Liquidação`, `Rendimento`, … | define o tipo (ver §7.2) |
| Produto | `ALUP11 - ALUPAR INVESTIMENTOS S/A` | `TICKER - NOME`; ticker = texto antes do primeiro ` - ` |
| Instituição | `BANCO BTG PACTUAL S/A.`, `XP INVESTIMENTOS CCTVM S/A.` | nomes variam levemente entre linhas (com/sem ponto final) → normalizar |
| Quantidade | `3` | inteiro (fração possível no futuro) |
| Preço unitário | `31.11` | **ponto decimal** no arquivo real; em CSV pt-BR pode vir `31,11`; `-` quando não se aplica |
| Valor da Operação | `93.33` | idem; `-` quando não se aplica |

Cabeçalhos devem ser reconhecidos de forma tolerante (sem acento, minúsculas, espaços) e a ausência de qualquer coluna obrigatória gera erro claro ("Arquivo não parece ser o extrato de Movimentação da B3: faltou a coluna X"). Outros formatos (ex.: relatório de **Negociação**) devem ser **detectados e recusados** com mensagem amigável.

### 7.2 Regras de classificação (derivadas do arquivo real — Apêndice A)

| Movimentação (normalizada) | Entrada/Saída | Resultado | Cálculo |
| :--- | :--- | :--- | :--- |
| `Transferência - Liquidação` | Credito | **COMPRA** (`BUY`) | qtd × preço; total = Valor da Operação |
| `Transferência - Liquidação` | Debito | **VENDA** (`SELL`) | idem |
| `Rendimento`, `Dividendo`, `Juros Sobre Capital Próprio` (`JCP`) | Credito | **PROVENTO** (`income_events`) | valor = Valor da Operação; tipo gravado em `notes` |
| `Direitos de Subscrição - Exercido` | Debito (com preço e valor) | **COMPRA** do ativo-base ao preço de subscrição | ticker normalizado (§7.3); `notes: "Subscrição exercida"` |
| `Atualização`, `Recibo de Subscrição`, `Direito de Subscrição`, `Direito Sobras de Subscrição`, `… - Não Exercido`, `Solicitação de Subscrição` | qualquer | **IGNORAR** — sem efeito financeiro (preço/valor `-`) | contar no relatório como "ignorados" |
| `Transferência` (sem "Liquidação") | qualquer | **IGNORAR** (movimentação de custódia) | idem |
| `Desdobramento`, `Grupamento`, `Bonificação em Ativos`, `Amortização`, `Fração em Ativos`, `Leilão de Fração`, `Empréstimo…`, qualquer não mapeada | qualquer | **REVISAR** — não importar automaticamente | listar com o motivo; eventos de split/inplit ficam para a revisão manual (já existe `corporateEvents`) |

Linha com Quantidade ≤ 0 ou Preço/Valor `-` em movimentação que deveria ter preço → **REVISAR** (nunca inventar preço).

### 7.3 Normalização de tickers e classe do ativo

- **Direitos/recibos de FII**: `XXXX12` (direito) e `XXXX13` (recibo) → ativo-base `XXXX11` (no exemplo, `MXRF12`/`MXRF13` → `MXRF11`). Regra heurística, **mostrada na pré-visualização** e editável.
- **Classe do ativo** (nesta ordem): (1) o ativo já existe na carteira de destino → mantém a classe; (2) tickers do catálogo local (`catalog_assets` / `STATIC_CATALOG_ASSETS`) → classe do catálogo (necessário porque `ALUP11` e `BPAC11` são **units de ações**, não FIIs); (3) o nome do produto contém `FII`, `FUNDO DE INVESTIMENTO IMOBILIARIO`, `FDO INV IMOB` → `FII`; (4) final `3/4/5/6/11` → `STOCK`; (5) caso contrário → usuário escolhe na pré-visualização. Criptomoedas e renda fixa não vêm neste extrato.
- Ativos novos nascem com `target_percentage_in_class = 0` (fora do plano) e nome em *Title Case* a partir do produto; metas continuam sendo definidas em Carteiras.

### 7.4 Posição anterior ao extrato (saldo inicial inferido)

O extrato cobre só um período. No exemplo, o primeiro `Rendimento` (15/05/2026) mostra **606 cotas de MXRF11** que nenhuma compra do arquivo explica, e a venda de 24/08 (265 cotas) só é válida se essas cotas existirem — `transactionService.executeTransaction` **recusa** vender mais que a posição (`Saldo insuficiente para venda`).

Algoritmo de reconciliação (por ticker-base, em ordem cronológica):
1. Calcular a posição corrente somando compras/vendas do arquivo.
2. Em cada linha de **Rendimento**, a Quantidade informada é a posição na **data-com** (antes da data de pagamento). Compare com a **maior posição calculada na janela dos 20 dias anteriores ao pagamento** (evita falso déficit quando houve venda entre a data-com e o pagamento); se `posição calculada < quantidade informada`, a diferença é **saldo anterior ao extrato**.
3. Em qualquer **VENDA** cuja quantidade exceda a posição, a diferença também é saldo anterior.
4. O maior déficit encontrado define o **saldo inicial inferido** do ticker, que será gravado como uma `BUY` datada de **um dia antes da primeira linha** do ticker, com `notes: "Saldo inicial inferido do extrato"` e `external_id` próprio.
5. Preço do saldo inicial (escolha do usuário na pré-visualização, por ticker): **(a)** preço histórico do dia anterior via `marketApi.getHistoricalPrice` (padrão, se disponível); **(b)** informar o preço médio manualmente; **(c)** não criar saldo (então vendas/proventos afetados vão para REVISAR).

Verificação cruzada no exemplo: 606 (inicial) + 121 (03/06) = 727 ✔ (rendimento de 14/07); +7 (23/07) = 734 ✔ (14/08); +168 (subscrição 08/07 → entra a partir de 14/08) ; −265 (24/08) = 637 ✔ (rendimento de 15/09).

### 7.5 Idempotência, duplicatas e desfazer

- `external_id` de cada lançamento = `b3:` + hash estável (FNV-1a/`expo-crypto`) de `data|movimentação|ticker-base|qtd|preço|valor|instituição-normalizada|n` onde `n` é a ordem da ocorrência entre linhas idênticas do mesmo arquivo (linhas realmente iguais, como duas compras iguais no mesmo dia, **não** podem ser fundidas nem perdidas).
- Reimportar o mesmo arquivo (ou um com período sobreposto) **não duplica**: itens com `external_id` já existente são contados como "já existiam".
- Proventos: dedupe por `external_id` também (campo novo em `income_events`: `external_id`, `source`; migração por `ALTER TABLE ... ADD COLUMN`, espelhada no DB do Jest, como já feito com `patrimony_goal`).
- Todo lançamento do lote recebe `source = 'B3_IMPORT'` e `notes` com `lote:<id>`; **Desfazer última importação** apaga transações e proventos do último lote (e recalcula quantidade/PM dos ativos afetados; ativos criados pelo lote e sem outros lançamentos são removidos).

### 7.6 Fluxo de telas (`B3ImportScreen`)

Pontos de entrada: Perfil → Backup ("Importar extrato da B3"), passo final do onboarding, e *empty states* da Home/Carteiras ("Importe seu extrato da B3").

1. **Selecionar arquivo** — `expo-document-picker` (xlsx/csv). Instruções curtas de como exportar da B3. Processamento 100% local ("O arquivo não sai do seu aparelho").
2. **Leitura e validação** — progresso; erros claros (arquivo vazio, formato não reconhecido, colunas ausentes, número de linhas).
3. **Pré-visualização** (tela cheia, rolável, em tiles):
   - Resumo: período (data mínima–máxima), `N compras · N vendas · N proventos · N ignorados · N a revisar`, totais em R$ (compras, vendas, proventos).
   - **Destino**: seletor de carteira (padrão = ativa) + "Criar nova carteira".
   - **Por ativo**: ticker, nome, **classe** (editável quando incerta), nº de lançamentos, posição final calculada, badge "novo ativo" / "já na carteira", e, quando houver, bloco **"Saldo anterior ao extrato: +N cotas"** com as 3 opções de preço (§7.4).
   - Lista **A revisar** (com motivo) e **Ignorados** (colapsável, com contagem por movimentação).
   - Duplicatas já presentes no app aparecem como "já existem" (não serão gravados).
   - Botão fixo **Importar N lançamentos** (desabilitado se não houver nada a importar).
4. **Importando** — barra de progresso por etapa (ativos → lançamentos em ordem cronológica → proventos → conferência). Não pode ser fechado no meio sem confirmação.
5. **Resultado** — relatório no padrão do `ImportReport` do `spreadsheetImportService`: esperado × inserido × já existia, falhas com motivo, **verificação** (Σ compras, Σ vendas, Σ proventos: arquivo × banco; `matches`), botões **Ver carteira**, **Desfazer importação**, **Concluir**.

Regras de execução: ordem cronológica crescente (o arquivo vem do mais novo para o mais antigo → inverter, estável); uma falha em uma linha **não aborta** o lote (vai para o relatório); atualizar `walletsStore.requestRefresh()` e dados da Home ao concluir; testIDs `b3-import-screen`, `b3-pick-file`, `b3-preview-summary`, `b3-destination-select`, `b3-asset-row-{ticker}`, `b3-class-select-{ticker}`, `b3-opening-balance-{ticker}`, `b3-review-list`, `b3-ignored-list`, `b3-confirm-import`, `b3-progress`, `b3-report`, `b3-undo-import`.

### 7.7 Leitura do arquivo (módulo isolado)

`src/services/b3/readStatementFile.ts`: recebe `Uint8Array` + nome; `.xlsx` → descompactar com `fflate`, ler `xl/sharedStrings.xml` e `xl/worksheets/sheet1.xml` (ou a planilha "Movimentação"), com um parser XML mínimo (sem DOM; regex/tokenizador) tratando células `t="s"` (texto compartilhado), `t="inlineStr"`, `t="str"` e numéricas; `.csv` → separador `;` ou `,` autodetectado, UTF-8 com/sem BOM. Saída: `Array<Record<string,string>>` com as chaves do cabeçalho. **Sem dependência de DOM nem de Node** (roda em Hermes/Jest).

`src/domain/b3/*` (puro, sem I/O): `parseStatementRows`, `classifyMovement`, `normalizeTicker`, `inferAssetClass`, `reconcileOpeningBalances`, `buildImportPlan` — testáveis só com dados.

---

## 8. Plano de sprints

Cada sprint segue o **TDD Lock**: Fase A (escrever e travar os testes, commit) → Fase B (implementar sem editar testes, `verify`, commit). Sempre rodar `npx tsc --noEmit`, `npx jest`, `go test ./...` (se tocar Go) e `node scripts/test-lock.js verify`. Atualizar `TEST_REPORT.md` e `docs/ARQUITETURA.md` no fim.

| Sprint | Tema | Entrega |
| :-: | :--- | :--- |
| **42** | Fundações de segurança e perfil | Dependências; `secureStorage`; `authService` (PIN com hash+sal, tentativas/lockout, biometria real); `sessionStore`; `profileRepository/Store` + `useProfile`; remoção do stub e migração de `PrivacyAndAuthService`. |
| **43** | Tela de bloqueio | `PinDots`, `PinKeypad`, `LockScreen`, `AppGate`, bloqueio ao abrir e ao voltar do segundo plano, capa de privacidade, ajuste do `backNavigation`. |
| **44** | Onboarding | `OnboardingFlow` (5 passos), substituição de "Pedro/PL" por `useProfile()` em todas as telas, migração de usuário existente. |
| **45** | Perfil → Segurança | Novo `SecurityTile`: alterar PIN, digital, bloquear após, bloquear agora, nome, apagar dados; "Esqueci o PIN". |
| **46** | Núcleo da importação B3 (domínio + leitura) | `src/domain/b3/*`, `readStatementFile` (xlsx/csv), fixtures do arquivo real, planejador (`buildImportPlan`), reconciliação de saldo inicial. Sem UI. |
| **47** | Importação B3 (serviço + UI) | `b3ImportService` (aplicar lote, idempotência, desfazer, relatório com verificação), migração `income_events.external_id/source`, `B3ImportScreen` e pontos de entrada. |
| **48** | Histórico de proventos | Tela de histórico (filtros, gráfico mensal/anual, lista por mês, ranking por ativo), edição/exclusão/adição de proventos, campos novos em `income_events`, entrada pelas Estatísticas. Ver §10. |

### Critérios de aceite globais
1. Primeira abertura (banco vazio) → onboarding; concluir leva ao app já autenticado; **com PIN**, reabrir (ou voltar após 1 min em segundo plano) pede o PIN; **sem PIN**, o app abre direto.
2. PIN errado nunca desbloqueia; 5 erros ativam espera persistente; PIN e sal **não** aparecem em `app_meta` nem em backups `.celsus.zip`.
3. Digital só é oferecida/ativada se houver PIN, o aparelho tiver sensor e biometria cadastrada; falha/cancelamento cai para o PIN sem travar; remover o PIN desativa a digital.
4. Nenhuma tela mostra "Pedro"/"PL" fixos; o nome vem do perfil.
5. O histórico de proventos reflete exatamente o **Apêndice C** depois de importar o arquivo de exemplo.
6. Importar o arquivo de exemplo produz exatamente o resultado do **Apêndice B**; reimportar não duplica; desfazer restaura o estado anterior.
7. Todos os testes passam; `verify` do lock íntegro; `tsc` sem erros em arquivos de produção.

---

## 9. Pontos em aberto (confirmar com o responsável antes/durante a execução)

1. ~~PIN obrigatório?~~ **Decidido: PIN opcional** (D2).
2. **Tamanho do PIN**: 6 dígitos (assumido) vs 4.
3. ~~Tempo de bloqueio~~ **Decidido: 1 minuto** em segundo plano (D6).
4. **Esqueci o PIN sem digital**: apagar tudo (assumido) — há alternativa de aceitar restore de backup `.celsus.zip` na mesma tela.
5. **Carteira por instituição** (BTG, XP) em vez de uma única carteira de destino (D10)?
6. Tratamento automático de **desdobramento/grupamento/bonificação** no extrato (v1 manda para "a revisar").

---

---

## 10. Histórico de proventos (Sprint 48)

### 10.1 Estado atual e lacuna
Hoje existe apenas `income_events` (`id, portfolio_id, ticker, pay_date, amount, notes, created_at`), o `summarizeIncome` (total do ano, média mensal, total por ano — `domain/finance/income.ts`) e, na tela Estatísticas, um card com esse resumo e um formulário simples de lançamento manual. **Não há lista/histórico** (por mês, por ativo), nem tipo do provento, nem quantidade × valor por cota, nem edição/exclusão pela UI, nem rendimento sobre o custo.

### 10.2 Dados
Migração (`ALTER TABLE ... ADD COLUMN`, espelhada no banco em memória do Jest, retrocompatível com backups antigos):

| Campo novo em `income_events` | Tipo | Uso |
| :--- | :--- | :--- |
| `kind` | text, nullable | `DIVIDENDO` \| `JCP` \| `RENDIMENTO` \| `OUTRO` (deduzido de `notes`/movimentação do B3 ou escolhido no cadastro manual; ausente ⇒ "Provento") |
| `quantity` | text, nullable | cotas/ações na data-com (ex.: 637) |
| `unit_amount` | text, nullable | valor por cota (ex.: 0,10) |

(`external_id` e `source` já vêm da Sprint 47 — se a 48 rodar antes, incluí-los aqui.) O importador B3 (Sprint 47) passa a preencher `kind`, `quantity` e `unit_amount` (a linha "Rendimento" do extrato já traz Quantidade e Preço unitário). Valores são **líquidos recebidos** (JCP já vem sem IR); a tela rotula "valor líquido".

### 10.3 Domínio (`src/domain/finance/incomeHistory.ts`, puro, `decimal.js`)
- `filterIncomes(events, {portfolioIds?, from?, to?, assetClass?, kind?, ticker?})` (classe via mapa ticker→classe injetado).
- `monthlySeries(events, {from, to})` → todos os meses do intervalo (meses sem provento = 0,00), `{month:'YYYY-MM', total}`.
- `yearlySeries(events)` → `{year, total, monthlyAverage}`.
- `groupByMonth(events)` → `[{month, total, items[]}]` mais recente primeiro; itens por data desc.
- `rankByTicker(events, limit)` → `{ticker, total, sharePercent, count}` (soma das fatias = 100% com o método do maior resto).
- `trailing12m(events, ref)` e `yieldOnCost(events, costBasis, ref)` = proventos dos últimos 12 meses ÷ **custo** (Σ quantidade × preço médio dos ativos atuais da carteira/escopo), `null` se custo = 0 (nunca 0%).
- `averagePerMonth(events, {from,to})` — média sobre os **meses do intervalo** (inclui meses vazios), diferente do `summarizeIncome` (que parte do 1º mês com provento); manter `summarizeIncome` intacto.
- `bestMonth(series)`.

### 10.4 Tela (`src/screens/IncomeHistoryScreen.tsx`, tela cheia em bento)
Header padrão `XpMinimalHeader` com voltar, título "Proventos" e subtítulo "Valor líquido recebido". Conteúdo:

1. **Filtros** (chips roláveis): *Escopo* (carteira ativa · consolidado · cada carteira), *Período* (Ano atual · 12 meses · Tudo · anos específicos), *Classe* (Todas · FIIs · Ações · …), *Tipo* (Todos · Rendimento · Dividendo · JCP). Mudar filtro recalcula tudo sem recarregar a tela (memoizado; sem long tasks > 50 ms).
2. **Tiles de resumo** (`BentoRow`): **Total no período** (tile laranja, número grande), **Média mensal**, **Rendimento sobre o custo (12 meses)** (ou "—" se não houver custo) e **Melhor mês** (mês + valor).
3. **Gráfico de barras** (Views, sem svg, no padrão do `PriceAreaChart`: máx. ~24 barras): alternância **Mensal / Anual**; barra do **melhor mês destacada**; tocar numa barra mostra o valor no rótulo e filtra a lista para aquele mês (toque de novo limpa). Eixo com rótulos curtos (`mai`, `jun`…; anos com 4 dígitos).
4. **Quem mais pagou** (card): até 5 ativos com barra horizontal proporcional, valor e `%` do total; "Ver todos" expande.
5. **Lista por mês**: cabeçalho do mês (`agosto de 2026 · R$ 83,48`) e linhas `TransactionRow`-like: avatar com cor da classe, ticker, tipo (`Rendimento`), data de pagamento `dd/mm`, `637 × R$ 0,10` quando houver quantidade e valor por cota, valor à direita. Toque abre folha de detalhe com **Editar** e **Excluir** (confirmação).
6. **Adicionar provento** (botão fixo no rodapé acima do dock quando houver; reaproveita/migra o formulário de Estatísticas): ticker (autocomplete de ativos da carteira), tipo, data, quantidade (opcional), valor por cota (opcional) **ou** valor total, carteira. Valida valor > 0 e data válida. Estatísticas mantém seu card-resumo e ganha o botão **Ver histórico** (e o formulário antigo é removido de lá).
7. **Estado vazio**: "Nenhum provento registrado" + botões **Importar extrato da B3** (abre a Sprint 47) e **Adicionar provento**.
8. **Privacidade**: com o Modo Privacidade, todos os valores/percentuais ficam mascarados (`R$ ••••••`).
9. Carregamento com `Skeleton`/`SkeletonSwap` nas mesmas dimensões; Android "voltar" fecha a camada (nova ação `close-income-history` em `backNavigation.ts`).

testIDs: `income-history-screen`, `income-filter-scope`, `income-filter-period`, `income-filter-class`, `income-filter-kind`, `income-total-tile`, `income-average-tile`, `income-yoc-tile`, `income-best-month-tile`, `income-chart`, `income-chart-mode-monthly`, `income-chart-mode-yearly`, `income-bar-{YYYY-MM|YYYY}`, `income-top-list`, `income-month-header-{YYYY-MM}`, `income-row-{id}`, `income-detail-edit`, `income-detail-delete`, `income-add-button`, `income-empty`.

### 10.5 Critérios de aceite da Sprint 48
1. Com o arquivo de exemplo importado, o histórico mostra exatamente o **Apêndice C**.
2. Filtros e alternância mensal/anual funcionam e se combinam; toque na barra filtra a lista.
3. Adicionar, editar e excluir provento persistem e atualizam resumo, gráfico e lista na hora; Estatísticas reflete o mesmo total.
4. Meses sem provento aparecem com R$ 0,00 no gráfico (nunca omitidos); rendimento sobre o custo é "—" sem custo.
5. Modo Privacidade mascara tudo; tema claro/escuro corretos; sem long tasks > 50 ms ao trocar filtros com ≥ 500 proventos (teste de desempenho com fixture sintética).

---

## Apêndice A — Arquivo de exemplo (`exemplos/b3-movimentacao-exemplo.xlsx`) e a regra aplicada

| # | Entrada/Saída | Data | Movimentação | Produto (ticker) | Instituição | Qtd | Preço | Valor | Regra |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Credito | 28/10/2026 | Transferência - Liquidação | ALUP11 | BTG | 3 | 31.11 | 93.33 | COMPRA |
| 2 | Credito | 28/10/2026 | Transferência - Liquidação | BBDC4 | BTG | 7 | 15.63 | 109.41 | COMPRA |
| 3 | Credito | 28/10/2026 | Transferência - Liquidação | BBSE3 | BTG | 3 | 41.28 | 123.84 | COMPRA |
| 4 | Credito | 28/10/2026 | Transferência - Liquidação | BPAC11 | BTG | 3 | 53.29 | 159.87 | COMPRA |
| 5 | Credito | 28/10/2026 | Transferência - Liquidação | BTLG11 | BTG | 3 | 99.78 | 299.34 | COMPRA |
| 6 | Credito | 28/10/2026 | Transferência - Liquidação | CPLE3 | BTG | 7 | 14.88 | 104.16 | COMPRA |
| 7 | Credito | 28/10/2026 | Transferência - Liquidação | HGLG11 | BTG | 2 | 150.65 | 301.3 | COMPRA |
| 8 | Credito | 28/10/2026 | Transferência - Liquidação | ITUB4 | BTG | 7 | 40.75 | 285.25 | COMPRA |
| 9 | Credito | 28/10/2026 | Transferência - Liquidação | PETR4 | BTG | 1 | 52.52 | 52.52 | COMPRA |
| 10 | Credito | 28/10/2026 | Transferência - Liquidação | PSSA3 | BTG | 2 | 47.03 | 94.06 | COMPRA |
| 11 | Credito | 28/10/2026 | Transferência - Liquidação | SAPR4 | BTG | 19 | 6.827 | 129.71 | COMPRA |
| 12 | Credito | 28/10/2026 | Transferência - Liquidação | TRXF11 | BTG | 5 | 69.4 | 347 | COMPRA |
| 13 | Credito | 28/10/2026 | Transferência - Liquidação | VISC11 | BTG | 3 | 104.3 | 312.9 | COMPRA |
| 14 | Credito | 28/10/2026 | Transferência - Liquidação | WEGE3 | BTG | 3 | 45.18 | 135.54 | COMPRA |
| 15 | Credito | 28/10/2026 | Transferência - Liquidação | XPLG11 | BTG | 3 | 92.94 | 278.82 | COMPRA |
| 16 | Credito | 15/10/2026 | Rendimento | MXRF11 | XP | 637 | 0.1 | 63.7 | PROVENTO |
| 17 | Credito | 15/09/2026 | Rendimento | MXRF11 | XP | 637 | 0.1 | 63.7 | PROVENTO |
| 18 | Debito | 24/08/2026 | Transferência - Liquidação | MXRF11 | XP | 265 | 9.23 | 2445.95 | VENDA |
| 19 | Credito | 14/08/2026 | Atualização | MXRF11 | XP | 168 | - | - | IGNORAR (sem efeito financeiro) |
| 20 | Credito | 14/08/2026 | Rendimento | MXRF11 | XP | 734 | 0.1 | 73.4 | PROVENTO |
| 21 | Credito | 14/08/2026 | Rendimento | MXRF13 | XP | 168 | 0.06 | 10.08 | PROVENTO |
| 22 | Credito | 23/07/2026 | Transferência - Liquidação | MXRF11 | XP | 7 | 9.669 | 67.68 | COMPRA |
| 23 | Debito | 17/07/2026 | Direito Sobras de Subscrição - Não Exercido | MXRF12 | XP | 2284 | - | - | IGNORAR (sem efeito financeiro) |
| 24 | Credito | 14/07/2026 | Rendimento | MXRF11 | XP | 727 | 0.1 | 72.7 | PROVENTO |
| 25 | Credito | 14/07/2026 | Direito Sobras de Subscrição | MXRF12 | XP | 2284 | - | - | IGNORAR (sem efeito financeiro) |
| 26 | Debito | 09/07/2026 | Direitos de Subscrição - Não Exercido | MXRF12 | XP | 0 | - | - | IGNORAR (sem efeito financeiro) |
| 27 | Credito | 09/07/2026 | Recibo de Subscrição | MXRF13 | XP | 168 | - | - | IGNORAR (sem efeito financeiro) |
| 28 | Debito | 08/07/2026 | Solicitação de Subscrição | MXRF12 | XP | 168 | - | - | IGNORAR (sem efeito financeiro) |
| 29 | Debito | 08/07/2026 | Direitos de Subscrição - Exercido | MXRF12 | XP | 168 | 9.64 | 1619.52 | COMPRA (subscrição) |
| 30 | Credito | 26/06/2026 | Direito de Subscrição | MXRF12 | XP | 168 | - | - | IGNORAR (sem efeito financeiro) |
| 31 | Credito | 15/06/2026 | Rendimento | MXRF11 | XP | 606 | 0.1 | 60.6 | PROVENTO |
| 32 | Credito | 03/06/2026 | Transferência - Liquidação | MXRF11 | XP | 121 | 9.84 | 1190.64 | COMPRA |
| 33 | Credito | 15/05/2026 | Rendimento | MXRF11 | XP | 606 | 0.1 | 60.6 | PROVENTO |

Contagem: **17** compras por liquidação (15 em 28/10 no BTG + 03/06 e 23/07 na XP), **1** venda (24/08), **7** proventos, **1** compra por subscrição exercida (08/07) e **7** linhas ignoradas (`Atualização`, `Recibo de Subscrição`, `Direito de Subscrição`, `Direito Sobras de Subscrição`, `Direito Sobras de Subscrição - Não Exercido`, `Direitos de Subscrição - Não Exercido`, `Solicitação de Subscrição`).

## Apêndice B — Resultado esperado da importação do arquivo de exemplo

Parâmetros: carteira de destino nova/vazia, saldo inicial de MXRF11 criado com o **preço histórico** (ou manual).

| Item | Esperado |
| :--- | :--- |
| Linhas lidas | 33 |
| Compras (`BUY`) | 18 = 17 liquidações de crédito + 1 subscrição exercida (MXRF11 · 168 × 9,64) |
| Vendas (`SELL`) | 1 (MXRF11 · 265 × 9,23 em 24/08/2026) |
| Proventos | 7 (6 de MXRF11 + 1 de MXRF13→MXRF11 de R$ 10,08 em 14/08) |
| Ignorados | 7 |
| A revisar | 0 |
| Ativos criados | 16 (ALUP11, BBDC4, BBSE3, BPAC11, BTLG11, CPLE3, HGLG11, ITUB4, PETR4, PSSA3, SAPR4, TRXF11, VISC11, WEGE3, XPLG11, MXRF11) |
| Classes | ALUP11, BBDC4, BBSE3, BPAC11, CPLE3, ITUB4, PETR4, PSSA3, SAPR4, WEGE3 = `STOCK`; BTLG11, HGLG11, MXRF11, TRXF11, VISC11, XPLG11 = `FII` |
| Saldo anterior inferido | MXRF11: **606 cotas** em 14/05/2026 (aviso + escolha de preço) |
| Posição final MXRF11 | 606 + 121 + 7 + 168 − 265 = **637** |
| Σ compras (arquivo) | **R$ 5.704,89** = 4.085,37 (17 liquidações) + 1.619,52 (subscrição); deve bater com o banco (`verification.matches = true`); o saldo inicial inferido é reportado à parte |
| Σ vendas | **R$ 2.445,95** |
| Σ proventos | 63,70 + 63,70 + 73,40 + 10,08 + 72,70 + 60,60 + 60,60 = **404,78** |
| Reimportação | 0 inseridos, tudo "já existia" |
| Desfazer | remove os 18 lançamentos, o saldo inicial e os 7 proventos; ativos criados pelo lote somem |

## Apêndice C — Histórico de proventos esperado após importar o arquivo de exemplo

Escopo: a carteira de destino; período "Tudo"; valores líquidos.

| Mês | Linhas (data · ticker · qtd × por cota) | Total |
| :--- | :--- | ---: |
| maio/2026 | 15/05 MXRF11 606 × 0,10 | R$ 60,60 |
| junho/2026 | 15/06 MXRF11 606 × 0,10 | R$ 60,60 |
| julho/2026 | 14/07 MXRF11 727 × 0,10 | R$ 72,70 |
| agosto/2026 | 14/08 MXRF11 734 × 0,10 (R$ 73,40) + 14/08 MXRF13→MXRF11 168 × 0,06 (R$ 10,08) | R$ 83,48 |
| setembro/2026 | 15/09 MXRF11 637 × 0,10 | R$ 63,70 |
| outubro/2026 | 15/10 MXRF11 637 × 0,10 | R$ 63,70 |
| **Total** | 7 lançamentos, 1 ativo | **R$ 404,78** |

- Média mensal (6 meses do intervalo mai–out): **R$ 67,46**. Melhor mês: **agosto/2026 (R$ 83,48)**. Tipo de todas as linhas: `RENDIMENTO`.
- "Quem mais pagou": MXRF11 = 100%.
- Rendimento sobre o custo (12 meses): depende do custo informado/importado; sem custo (ex.: sem preço do saldo inicial) mostra "—".
