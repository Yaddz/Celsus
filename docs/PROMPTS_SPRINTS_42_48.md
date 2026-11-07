# Prompts de execução — Sprints 42 a 48

Use **um prompt por vez**, na ordem (42 → 47). Cada sprint termina com testes verdes, `verify` do lock íntegro,
relatório e **um commit por fase**. A fonte de verdade é [`SPEC_ONBOARDING_LOGIN_B3.md`](./SPEC_ONBOARDING_LOGIN_B3.md) —
leia-a inteira antes de começar qualquer sprint. Se o código real contradisser o spec, **pare e pergunte**.

---

## Preâmbulo comum (cole no início de TODO prompt)

```
Você vai implementar parte do app Celsus (Expo SDK 58 / React Native 0.88 / TypeScript, pt-BR, local-first)
em /var/home/pedro/Área de trabalho/Projetos/Celsus (app em apps/mobile, motor Go em services/market-api).

LEIA ANTES DE CODAR (nesta ordem):
1. docs/SPEC_ONBOARDING_LOGIN_B3.md   (fonte de verdade desta entrega)
2. docs/ARQUITETURA.md e DESIGN_SYSTEM.md
3. .agents/rules/tdd-lock.md e apps/mobile/AGENTS.md
4. O código citado no spec (verifique que os nomes/arquivos existem; não confie na memória).

REGRAS INEGOCIÁVEIS
- TDD LOCK em duas fases. FASE A: escreva SÓ os testes da sprint (e stubs mínimos para compilar), rode-os e veja-os
  falhar pelo motivo certo, depois `node scripts/test-lock.js lock`, `node scripts/test-lock.js verify` e faça commit
  "test(sprint-NN): add and lock phase A specification tests". PARE e mostre ao usuário a lista de testes (IDs SNN-Txx)
  e espere o OK antes da Fase B. FASE B: implemente o código de produção SEM editar nenhum teste travado. Teste falhou ⇒
  corrija o código. Se um teste ANTIGO precisar mudar por causa da sprint, liste-o, peça autorização explícita, e só
  então `node scripts/test-lock.js unlock` → edite → `lock` → `verify`.
- Não altere telas/arquivos que a sprint não cita. Reaproveite componentes e tokens existentes (TextField,
  DirectiveButton, BentoTile, XpMinimalHeader, Skeleton, ConfirmDialog, AnimatedModalSheet, tokens.ts). Mantenha os testIDs
  existentes. Tudo em português (pt-BR).
- Nunca invente dado: valor ausente aparece como "—". Nunca guarde segredo em claro.
- Dependências nativas com `cd apps/mobile && npx expo install <pacote>` (nunca npm add). Elas exigem novo build nativo
  (`npx expo run:android`); no Jest, mocke-as em jest.setup.js. Ao final da sprint avise o usuário se precisa rebuildar.
- Validação obrigatória ao final: `cd apps/mobile && npx tsc --noEmit` (sem erros em arquivos de produção),
  `npx jest` (tudo verde), `node scripts/test-lock.js verify`, e `cd services/market-api && go test ./...` se tocar em Go.
  Rode a UI no navegador (`npm run start` na raiz, abra com `?memdb=1`) e confira o fluxo; diga o que NÃO conseguiu validar
  (ex.: biometria real exige aparelho).
- Atualize TEST_REPORT.md (contagens) e docs/ARQUITETURA.md (novos módulos). Commit da Fase B:
  "feat(sprint-NN): complete phase B implementation and test report". Não faça push sem o usuário pedir.
- Relatório final: o que mudou (arquivos), decisões tomadas, pendências, e como validar no aparelho.
```

---

## Prompt — Sprint 42: Fundações de segurança e perfil

```
[Cole o PREÂMBULO COMUM]

SPRINT 42 — Fundações de segurança e perfil (spec §0, §2, §3). SEM UI nova nesta sprint.

OBJETIVO: criar a camada de serviços que faz PIN e digital funcionarem de verdade e o perfil do usuário, removendo o stub
de biometria.

ENTREGAS
1. Instalar (expo install): expo-local-authentication, expo-secure-store, expo-crypto. Mocks em apps/mobile/jest.setup.js.
2. src/services/secureStorage.ts: interface SecureStorage {getItem,setItem,deleteItem} + ExpoSecureStorage
   (expo-secure-store), WebSecureStorage (localStorage, só dev, com console.warn) e InMemorySecureStorage (testes).
   Seleção automática por Platform.OS, sobrescrevível por injeção.
3. src/services/biometricProvider.ts: ExpoBiometricProvider sobre expo-local-authentication, mesma interface
   BiometricAuthProvider que já existe em privacyAndAuth.ts. REMOVER o defaultBiometricProvider que sempre retorna sucesso.
4. src/services/authService.ts (classe AuthService com SecureStorage, BiometricAuthProvider, Clock e Random injetáveis):
   - setPin(pin) / hasPin() / verifyPin(pin) / changePin(old,new) / resetAll(). PIN = 6 dígitos numéricos (valide).
   - Hash: SHA-256(salt + pin) com salt aleatório (16 bytes, hex) por instalação, ambos no SecureStorage. Nunca em app_meta.
   - Limite de tentativas persistente (spec D5): 5 erros ⇒ 30 s, depois 1 min, 5 min, 15 min; getLockoutRemainingMs();
     verifyPin respeita o lockout (retorna {ok:false, reason:'locked', remainingMs}); acerto zera o contador.
   - Biometria: canUseBiometrics() (hardware + cadastrada), enableBiometrics() (executa autenticação REAL de teste; só grava
     "ativada" no SecureStorage se der certo), disableBiometrics(), isBiometricEnabled(), authenticateBiometric(prompt).
     Se o sistema reportar que a biometria foi removida/alterada, desative a flag e retorne reason 'biometrics_not_enrolled'.
   - removePin(current) (verifica o PIN; apaga PIN, sal e contador e DESATIVA a digital). enableBiometrics exige hasPin().
   - autoLockSeconds (get/set; **padrão 60**; valores 0|30|60|300). O PIN é OPCIONAL (spec D2): sem PIN não há bloqueio.
5. src/stores/sessionStore.ts (useSyncExternalStore): status 'loading'|'onboarding'|'locked'|'unlocked', lock(), unlock(),
   setStatus(), markBackgrounded(at:number), shouldLockOnResume(now, autoLockSeconds). Hook useSession().
6. src/repositories/profileRepository.ts (app_meta: profile:name, profile:onboarded:v1) + src/stores/profileStore.ts +
   hook useProfile() ⇒ {name, initials, onboarded, loaded}. Iniciais: 1ª letra das 2 primeiras palavras, maiúsculas
   (uma palavra ⇒ 1 letra; vazio ⇒ ""). Função pura deriveInitials() em src/domain/profile.ts.
7. Migração do PrivacyAndAuthService: ele passa a cuidar SÓ do Modo Privacidade (mascarar valores). Remova dele
   biometria/lock/defaultBiometricProvider e atualize quem o usa (useProfileSettings.ts, ProfileTiles.tsx) apenas o mínimo
   para compilar — a UI nova vem na Sprint 45. Liste os testes antigos que quebram e peça autorização para reescrevê-los.

TESTES (Fase A) — IDs S42-Txx, em src/services/__tests__ e src/stores/__tests__, src/domain/__tests__:
- PIN: set/verify ok; PIN errado falha; hash difere entre instalações (sal); PIN não aparece em texto claro no storage;
  rejeita PIN inválido (≠6 dígitos, letras); changePin exige o atual.
- Lockout: 5 erros ⇒ locked 30 s (relógio injetado); persiste ao recriar o serviço; progressão 1 min/5/15; acerto zera.
- Biometria: sem hardware ⇒ canUse=false; sem cadastro ⇒ false; enable só persiste após sucesso; falha ⇒ não ativa;
  authenticateBiometric desativa a flag quando não há mais biometria cadastrada.
- sessionStore: transições; shouldLockOnResume com 0/30/60/300 s (padrão 60) e relógio injetado; sem PIN nunca bloqueia.
- authService: removePin exige o PIN atual, limpa tudo e desativa a digital; enableBiometrics sem PIN é recusado.
- deriveInitials: "Pedro Lima"→"PL", "pedro"→"P", "  ana   maria souza "→"AM", ""→"".
- profileRepository/Store: grava e lê nome; onboarded flag; hook reativo.
- Regressão: PrivacyAndAuthService continua mascarando R$/%/asteriscos (testes existentes de mascaramento seguem verdes).

CRITÉRIOS DE ACEITE: spec §8 itens 2 e 3 cobertos por testes de serviço; zero uso de defaultBiometricProvider; o app compila
e abre igual a antes (ainda sem tela de bloqueio).
```

---

## Prompt — Sprint 43: Tela de bloqueio

```
[Cole o PREÂMBULO COMUM]

SPRINT 43 — Tela de bloqueio (spec §3 e §4). Pré-requisito: Sprint 42 concluída (authService, sessionStore, useProfile).

OBJETIVO: tela cheia de bloqueio (NÃO é modal) com PIN e digital reais, bloqueio ao abrir e ao voltar do segundo plano.

ENTREGAS
1. src/components/ui/PinDots.tsx (props: length=6, filled, error, testID) — animação de tremor no erro (Animated, driver
   nativo; respeitar useReducedMotion). testIDs pin-dot-0..5.
2. src/components/ui/PinKeypad.tsx — grade 3x4: 1–9, [digital] 0 [apagar]; teclas redondas 72 dp (tile #1C1E20),
   JellyPressable; props onDigit, onBackspace, onBackspaceLongPress (limpa), onBiometric?, biometricAvailable, disabled.
   testIDs pin-key-0..9, pin-key-backspace, pin-key-biometric. Acessibilidade: "Dígito N".
3. src/screens/LockScreen.tsx — exatamente o layout/comportamento do spec §4: avatar com iniciais (useProfile), "Olá, {nome}",
   subtítulo/erro, PinDots, PinKeypad, link "Esqueci o PIN". Auto-prompt biométrico ao montar se ativa e possível; erro ⇒
   Vibration + tremor + limpa + "PIN incorreto · N tentativas restantes"; lockout ⇒ teclado desabilitado e contador mm:ss;
   sucesso ⇒ sessionStore.unlock(). "Esqueci o PIN" ⇒ ConfirmDialog (com digital ativa: oferece digital; sem digital: "Apagar
   tudo e recomeçar" exigindo digitar APAGAR; chama authService.resetAll() + apaga o banco local via resetDatabase/equivalente
   e volta ao onboarding). Tema claro/escuro. NUNCA mostrar saldos.
4. src/components/AppGate.tsx + hook useAppLock: carrega perfil+flags e define o status (loading ⇒ splash simples;
   sem perfil/PIN ⇒ 'onboarding' [placeholder: renderize um componente <OnboardingPlaceholder/> vazio até a Sprint 44];
   com PIN ⇒ 'locked'; perfil existente e SEM PIN ⇒ 'unlocked' direto). Envolve o conteúdo atual do App.tsx (o app só monta quando 'unlocked'). AppState: ao ir para
   background/inactive ⇒ markBackgrounded; ao voltar ⇒ se shouldLockOnResume ⇒ lock(). Capa de privacidade (cobrir tudo com
   a cor de fundo + logo) enquanto o app está 'inactive'/'background' com bloqueio ativo.
5. src/navigation/backNavigation.ts: novo estado isLocked (prioridade máxima) ⇒ ação 'minimize'; em App.tsx execute
   BackHandler.exitApp() para essa ação (comportamento: sair para a tela inicial do Android, sem desbloquear). Atualize o
   teste de backNavigation (peça autorização — é teste travado).
6. Nenhuma outra tela muda. Não use Modal/AnimatedModalSheet na LockScreen.

TESTES (Fase A) — S43-Txx:
- PinDots: preenche N de 6; estado de erro; acessibilidade.
- PinKeypad: dígitos disparam onDigit; backspace/long press; tecla de digital só aparece se disponível; disabled bloqueia.
- LockScreen (authService fake): 6 dígitos corretos ⇒ unlock; incorreto ⇒ mensagem de erro com tentativas restantes e campo limpo;
  5 erros ⇒ teclado desabilitado + timer; digital ativa ⇒ prompt automático e sucesso desbloqueia; digital cancelada ⇒ teclado
  segue ativo; "Esqueci o PIN" ⇒ ConfirmDialog; confirmar exige texto APAGAR; nunca renderiza valores monetários.
- AppGate: perfil existente e SEM PIN ⇒ abre o app direto (sem lock-screen); sem perfil ⇒ onboarding; com PIN ⇒ lock-screen e o app NÃO monta (queryByTestId('xp-minimal-header') nulo);
  após unlock ⇒ app montado; AppState background→active respeita autoLockSeconds (relógio injetado); capa de privacidade.
- backNavigation: isLocked ⇒ 'minimize' com prioridade sobre qualquer camada.

CRITÉRIOS: reabrir o app pede PIN; PIN errado nunca entra; botão voltar na tela de bloqueio minimiza; sem aparência de modal.
Validação visual obrigatória no navegador (tamanhos das teclas, tremor, tema claro/escuro).
```

---

## Prompt — Sprint 44: Onboarding

```
[Cole o PREÂMBULO COMUM]

SPRINT 44 — Onboarding (spec §5). Pré-requisito: Sprints 42–43.

OBJETIVO: fluxo de primeira abertura: Boas-vindas → Nome → PIN → Digital (opcional) → Pronto. Remover "Pedro/PL" fixos.

ENTREGAS
1. src/screens/onboarding/: OnboardingFlow.tsx (máquina de passos, progresso de 5 pontos, voltar), WelcomeStep, NameStep,
   PinStep (criar + confirmar, reaproveitando PinDots/PinKeypad), BiometricStep, DoneStep. Tela cheia, bento, mesmo tema do app.
2. Regras (spec §5): nome 2–40 chars com trim; o PIN é OPCIONAL: botão "Agora não" pula o PIN e o passo da digital (app sem bloqueio); se criado: 6 dígitos + confirmação (divergiu ⇒ volta ao início do passo com mensagem);
   PINs triviais (000000, 111111, 123456, sequências crescentes/decrescentes) ⇒ aviso NÃO bloqueante; BiometricStep só aparece se um PIN foi criado e
   canUseBiometrics(); "Ativar" executa autenticação de teste real (enableBiometrics) e só avança como "ativada" se der certo;
   "Agora não" avança. NADA é persistido até o passo final; gravação atômica no fim (nome + PIN + flag biométrica +
   profile:onboarded:v1) e então sessionStore.unlock().
3. DoneStep: 3 ações — "Importar extrato da B3" (por ora navega para um placeholder claramente marcado; a Sprint 47 liga ao fluxo
   real), "Criar minha primeira carteira" (abre o modal de nova carteira existente) e "Explorar o app".
4. Migração (D9): se o banco já tem carteiras mas não há perfil/PIN, o AppGate mostra o fluxo abreviado "Complete seu perfil"
   (passos Nome, PIN, Digital, sem Boas-vindas/Pronto), sem tocar nos dados.
5. Substituir userName="Pedro"/userInitials="PL" por useProfile() em: App.tsx (Home), SearchAssetsScreen, PortfolioManagementScreen,
   StatisticsScreen (e SettingsBackupScreen/IdentityTile). Procure com grep por "Pedro" e "\"PL\"" para não deixar nenhum.
6. Trocar o <OnboardingPlaceholder/> do AppGate pelo OnboardingFlow.

TESTES (Fase A) — S44-Txx:
- Cada passo: botão Continuar desabilitado até válido; voltar preserva o que foi digitado; progresso correto.
- Nome: "A" inválido; "Ana" válido; acentos; prévia de iniciais ao vivo.
- "Agora não" no PIN ⇒ pula também a digital, conclui sem PIN e o AppGate abre direto o app (sem LockScreen).
- PIN: confirmação igual ⇒ avança; diferente ⇒ mensagem e reinicia; trivial ⇒ aviso sem bloquear.
- Digital: sem hardware ⇒ passo pulado automaticamente; com hardware e teste OK ⇒ ativada; teste falha ⇒ não ativa e segue.
- Persistência atômica: fechar/desmontar no meio NÃO grava nada; concluir grava tudo; após concluir, AppGate vai para 'unlocked'.
- Migração: banco com carteira + sem perfil ⇒ "Complete seu perfil" e dados intactos.
- Regressão: nenhuma tela renderiza "Pedro" fixo (teste que monta Home/Carteiras/Busca/Estatísticas com nome "Ana Souza" e checa
  "AS" no avatar; e um teste estático (grep em src/ e App.tsx) que falha se encontrar userName="Pedro").

CRITÉRIOS: spec §8 itens 1 e 4. Validar no navegador com banco vazio (?memdb=1) o fluxo completo e o caso de usuário existente.
```

---

## Prompt — Sprint 45: Perfil → Segurança

```
[Cole o PREÂMBULO COMUM]

SPRINT 45 — Perfil → Segurança (spec §6). Pré-requisito: Sprints 42–44.

OBJETIVO: substituir o SecurityTile atual (switch falso + botão "Testar autenticação") por controles reais.

ENTREGAS (src/screens/profile/ProfileTiles.tsx e useProfileSettings.ts; manter o resto do Perfil intacto)
- Novo SecurityTile. SEM PIN: card "Proteja o app com um PIN" + Criar PIN (PIN → confirmar), e digital/"Bloquear após"/"Bloquear agora" desabilitados ("Crie um PIN primeiro"). COM PIN: "PIN configurado", Remover PIN (pede o atual + confirma; desativa digital e bloqueio) e Alterar PIN (fluxo PIN atual → novo → confirmar, usando PinDots/PinKeypad
  em uma folha; respeita o lockout); switch "Entrar com digital" (ligar ⇒ enableBiometrics com teste real; desligar ⇒ pede PIN ou
  digital; se !canUseBiometrics ⇒ switch desabilitado com explicação); seletor "Bloquear após" (Imediato · 30 s · 1 min [padrão] · 5 min);
  botão "Bloquear agora" (sessionStore.lock()); campo Nome editável (atualiza iniciais em todo o app via profileStore);
  ação destrutiva "Apagar todos os dados" com confirmação por texto APAGAR (reaproveite o fluxo do "Esqueci o PIN").
- Remover isAppLocked/testBiometricLock/toggleBiometrics antigos e os testIDs obsoletos (biometric-switch → security-biometric-switch;
  test-biometric-btn removido). Liste os testes antigos afetados e peça autorização para reescrevê-los.
- testIDs: security-create-pin, security-remove-pin, security-pin-status, security-change-pin, security-biometric-switch, security-autolock-{0|30|60|300}, security-lock-now,
  security-name-input, security-wipe.

TESTES (Fase A) — S45-Txx: alterar PIN (atual errado recusa; confirmação divergente recusa; sucesso troca e o antigo para de
valer); switch de digital (liga só com teste OK; desliga com confirmação; desabilitado sem sensor); autolock persiste e é lido pelo
AppGate; "Bloquear agora" leva à LockScreen; mudar nome atualiza iniciais na Home; "Apagar todos os dados" exige APAGAR e volta ao onboarding.

CRITÉRIOS: nenhum controle de segurança é decorativo; tudo persiste após reiniciar o app (testar recriando serviços/stores nos testes).
```

---

## Prompt — Sprint 46: Núcleo da importação B3 (domínio + leitura de arquivo)

```
[Cole o PREÂMBULO COMUM]

SPRINT 46 — Núcleo da importação do extrato da B3 (spec §7.1–§7.5 e §7.7). SEM UI e SEM gravação no banco.

ARQUIVOS DE REFERÊNCIA: docs/exemplos/b3-movimentacao-exemplo.xlsx (33 linhas reais) e o Apêndice A/B do spec.

ENTREGAS
1. Instalar fflate (expo install não se aplica; use `npm install fflate` em apps/mobile e justifique). Sem dependência de DOM/Node.
2. src/services/b3/readStatementFile.ts: (bytes, nomeDoArquivo) ⇒ linhas {[cabeçalhoNormalizado]: string}. .xlsx: fflate para
   descompactar, ler xl/workbook.xml (achar a planilha "Movimentação" ou usar a primeira), xl/sharedStrings.xml e a worksheet, com
   tokenizador XML mínimo; tratar t="s", t="inlineStr", t="str" e numéricas; datas como texto dd/mm/aaaa OU serial do Excel.
   .csv: separador ; ou , autodetectado, BOM, aspas. Erros tipados (ArquivoVazio, FormatoNaoReconhecido, ColunaAusente).
3. src/domain/b3/:
   - parseStatementRows(rows): valida cabeçalhos (tolerante a acento/caixa/espaço), converte Data (→ YYYY-MM-DD), números
     (ponto OU vírgula decimal; "-" ⇒ null), ticker (texto antes do 1º " - "), nome, instituição normalizada
     (sem ponto final, caixa, "BANCO BTG PACTUAL S/A." ≡ "…S/A"); mantém a ordem original e um índice de linha (rowNo).
     Detecta e recusa o relatório de Negociação (colunas "Data do Negócio"/"Código de Negociação") com erro amigável.
   - classifyMovement(row) ⇒ {kind:'BUY'|'SELL'|'INCOME'|'IGNORE'|'REVIEW', reason}: exatamente a tabela do spec §7.2
     (incluindo subscrição exercida ⇒ BUY e todos os "sem efeito financeiro" ⇒ IGNORE; não mapeadas ⇒ REVIEW).
   - normalizeTicker(t) (MXRF12/MXRF13 ⇒ MXRF11 para FIIs; regra heurística isolada e documentada).
   - inferAssetClass({ticker,productName,catalog,existingClass}) seguindo a ordem do spec §7.3; usa STATIC_CATALOG_ASSETS/catálogo
     injetado; retorna {class, confidence:'sure'|'guess'|'unknown'}.
   - reconcileOpeningBalances(events) conforme spec §7.4 (janela de 20 dias para Rendimento; vendas acima da posição) ⇒
     [{ticker, missingQty, asOfDate, firstRowDate, evidence:[...]}].
   - buildImportPlan({rows, existingExternalIds, existingAssets, catalog}) ⇒ plano com: buys/sells/incomes (cada um com
     externalId estável `b3:<hash>` — FNV-1a 64 bits ou equivalente puro; ordem de ocorrência n entre linhas idênticas),
     ignored (por tipo, com contagem), review (com motivo), assets a criar/existentes (classe sugerida), openingBalances,
     duplicates (externalId já existente), período (min/max), totais em Decimal (compras, vendas, proventos) e ordem
     cronológica CRESCENTE estável (inverter a ordem do arquivo).
   Tudo puro, com decimal.js para dinheiro (nada de float).
4. Fixture: converta o arquivo de exemplo em src/domain/b3/__tests__/fixtures/b3-exemplo.rows.json (rows já lidas) E mantenha
   um teste que lê o .xlsx real de docs/exemplos (via fs no Jest) para provar o leitor ponta a ponta.

TESTES (Fase A) — S46-Txx:
- Leitor: xlsx real ⇒ 33 linhas com as colunas certas; CSV ; e , com BOM; datas serial e texto; arquivo vazio/formato errado/
  coluna ausente ⇒ erros tipados com mensagem em pt-BR; Negociação recusado.
- Parser/classificação: cada linha do Apêndice A cai na regra esperada (tabela de 33 casos); "-" vira null; quantidade 0 ou preço
  ausente em linha que exige preço ⇒ REVIEW; movimentação desconhecida ⇒ REVIEW.
- Ticker/classe: MXRF12/13 ⇒ MXRF11; ALUP11 e BPAC11 ⇒ STOCK (catálogo) e HGLG11/BTLG11/TRXF11/VISC11/XPLG11/MXRF11 ⇒ FII;
  ticker desconhecido com "FII" no nome ⇒ FII 'guess'; sem pista ⇒ 'unknown'.
- Reconciliação no exemplo: MXRF11 ⇒ missingQty 606 (asOf 14/05/2026); nenhum outro ticker com déficit; cenário sintético com venda
  maior que a posição ⇒ déficit detectado; cenário com venda entre data-com e pagamento ⇒ NÃO gera déficit falso.
- Plano: contagens do Apêndice B (18 compras, 1 venda, 7 proventos, 7 ignorados, 0 revisar, 16 ativos); totais Σ compras 5704,89,
  Σ vendas 2445,95, Σ proventos 404,78; ordem cronológica crescente; externalIds únicos e estáveis (rodar 2x ⇒ idênticos);
  linhas idênticas no mesmo dia NÃO se fundem (teste sintético com duas compras iguais); com existingExternalIds do próprio plano ⇒
  tudo vira "já existia" (0 novos).

CRITÉRIOS: spec §8 item 5 (parte do plano); nenhuma chamada a repositórios/UI; cobertura dos edge cases listados.
```

---

## Prompt — Sprint 47: Importação B3 (serviço + UI)

```
[Cole o PREÂMBULO COMUM]

SPRINT 47 — Importação do extrato da B3: serviço e telas (spec §7.5–§7.6). Pré-requisitos: Sprint 46 (domínio) e, de
preferência, 42–45.

OBJETIVO: carga de dados ponta a ponta: escolher arquivo → pré-visualizar → importar com segurança → relatório → desfazer.

ENTREGAS
1. Instalar (expo install): expo-document-picker e expo-file-system (ler o arquivo como bytes). Mocks no jest.setup.js.
2. Banco: migração em db/client.ts + schema.ts + INITIAL_SCHEMA_SQL (e espelho no banco em memória do Jest), por ALTER TABLE
   protegido como já feito em patrimony_goal: income_events.external_id (text, nullable), income_events.source (text, padrão
   'MANUAL') e, JÁ PENSANDO NA SPRINT 48, income_events.kind (text), income_events.quantity (text) e income_events.unit_amount
   (text), todos nullable. Ao importar proventos preencha kind (RENDIMENTO/DIVIDENDO/JCP a partir da Movimentação), quantity
   (coluna Quantidade) e unit_amount (coluna Preço unitário). Atualize incomeRepository.addIncome para aceitar externalId/source e listar por externalId. O backup .celsus.zip deve
   continuar funcionando (inclua os campos novos de forma retrocompatível — importar backup antigo sem eles não pode quebrar).
3. src/services/b3ImportService.ts:
   - preview(bytes, nome, {portfolioId?|newPortfolioName?}) ⇒ plano da Sprint 46 já cruzado com o banco (existingExternalIds via
     transactions.external_id e income_events.external_id; ativos existentes; classe do ativo já na carteira prevalece).
   - apply(plan, escolhas) onde escolhas = {portfolioId|newPortfolioName, classOverrides{ticker→class}, openingBalance{ticker→
     {mode:'historical'|'manual'|'skip', price?}}}. Em ordem cronológica: cria ativos faltantes (target 0, nome Title Case) →
     saldo inicial inferido (BUY datado 1 dia antes da 1ª linha do ticker, notes "Saldo inicial inferido do extrato", preço via
     marketApi.getHistoricalPrice ou manual) → compras/vendas via transactionService.executeTransaction com
     source 'B3_IMPORT', externalId `b3:<hash>` e notes "lote:<id> · <instituição>" → proventos via incomeRepository.
     Uma falha NÃO aborta o lote: vai para failures com motivo (inclui "Saldo insuficiente para venda"). "Skip" no saldo inicial ⇒
     vendas/proventos dependentes viram REVISAR no relatório. Progresso reportado por callback (etapas e contagem).
   - Relatório (mesmo espírito do ImportReport do spreadsheetImportService): esperado × inserido × já existia por categoria,
     failures, ignored/review, e verification {Σ compras, Σ vendas, Σ proventos: arquivo × banco; matches}.
   - undoLastImport(): apaga transações/proventos do último lote (source 'B3_IMPORT' + lote), recalcula quantidade e preço
     médio dos ativos afetados e remove ativos criados pelo lote que ficarem sem lançamentos. Guarde o último lote em app_meta
     (b3:last_batch).
   - Idempotência: reimportar ⇒ 0 inseridos, tudo "já existia"; arquivo com período sobreposto ⇒ só o que falta.
   - walletsStore.requestRefresh() e atualização da Home ao concluir.
4. UI src/screens/B3ImportScreen.tsx (tela cheia, XpMinimalHeader com voltar, bento) com as 5 etapas do spec §7.6: selecionar
   arquivo (instrução de como exportar da B3 + "o arquivo não sai do seu aparelho") → leitura/validação → pré-visualização (resumo,
   destino com "Criar nova carteira", linhas por ativo com seletor de classe, bloco "Saldo anterior ao extrato: +N cotas" com as 3
   opções de preço, listas "A revisar" e "Ignorados" colapsáveis, botão fixo "Importar N lançamentos") → importando (progresso;
   confirmar antes de sair) → resultado (relatório + Ver carteira / Desfazer importação / Concluir).
   Respeitar o botão fixo acima do dock quando houver dock (veja StickyAddBar: bottomOffset).
5. Pontos de entrada: Perfil → BackupTile ("Importar extrato da B3", ao lado do botão de planilha atual, que permanece); DoneStep do
   onboarding (trocar o placeholder da Sprint 44); empty states da Home e de Carteiras ("Importe seu extrato da B3") — mudanças
   mínimas e só nesses pontos. Navegação por estado em App.tsx (padrão das outras camadas) + ação de "voltar" em backNavigation.ts.
6. Documentação: docs/ARQUITETURA.md (módulos b3/*, b3ImportService, migração) e README (seção de importação).

TESTES (Fase A) — S47-Txx:
- Migração: income_events com external_id/source em banco novo e legado; backup export/import antigo e novo.
- Serviço (com o .xlsx de exemplo e banco em memória): resultado exatamente igual ao Apêndice B (18 BUY incl. subscrição, 1 SELL,
  7 proventos, 16 ativos, classes corretas, MXRF11 com posição final 637, saldo inicial 606 com preço manual e com histórico
  mockado), verification.matches=true, Σ compras 5704,89 / vendas 2445,95 / proventos 404,78.
- Idempotência: segunda importação ⇒ 0 inseridos; sobreposição parcial ⇒ só o delta.
- Falhas: venda sem saldo (skip do saldo inicial) ⇒ falha reportada e lote continua; ticker sem classe ⇒ exige escolha antes de
  importar; linhas REVISAR nunca gravadas.
- Desfazer: restaura contagens, quantidade e preço médio dos ativos pré-existentes; remove ativos criados pelo lote.
- UI: fluxo completo com picker mockado (selecionar → preview com contadores → trocar classe de um ativo → escolher preço do saldo
  inicial → importar → relatório → desfazer); arquivo inválido mostra erro claro; botão "Importar" desabilitado sem itens;
  entradas no Perfil/onboarding/empty states abrem a tela; "voltar" fecha a camada.

CRITÉRIOS: spec §8 itens 5 e 6. Validar no navegador (?memdb=1) com o arquivo docs/exemplos/b3-movimentacao-exemplo.xlsx real
(use o seletor de arquivo do navegador) e conferir os números do Apêndice B na tela de resultado.
```

---

## Prompt — Sprint 48: Histórico de proventos

```
[Cole o PREÂMBULO COMUM]

SPRINT 48 — Histórico de proventos (spec §10 e Apêndice C). Pré-requisito: Sprint 47 (campos external_id/source/kind/quantity/
unit_amount em income_events e proventos importados do extrato). Se a 47 ainda não existir, crie você mesmo a migração dos
cinco campos (ALTER TABLE protegido + espelho no Jest) e avise.

OBJETIVO: tela de histórico de proventos (lista por mês, gráfico mensal/anual, filtros, ranking por ativo, rendimento sobre o
custo) com edição/exclusão/adição de proventos, acessível pelas Estatísticas.

ENTREGAS
1. Domínio puro src/domain/finance/incomeHistory.ts (decimal.js; sem float): filterIncomes, monthlySeries (inclui meses vazios com
   0,00), yearlySeries, groupByMonth, rankByTicker (fatias somam 100% — maior resto), trailing12m, yieldOnCost (null se custo=0),
   averagePerMonth (média sobre os meses do INTERVALO), bestMonth. NÃO altere summarizeIncome (income.ts) — outros testes dependem.
2. incomeRepository: addIncome aceita kind/quantity/unitAmount; novos listFiltered(portfolioIds?), getById, updateIncome, e
   deleteIncome (já existe). Backup .celsus.zip retrocompatível com os campos novos.
3. src/screens/IncomeHistoryScreen.tsx (tela cheia em bento, XpMinimalHeader com voltar, título "Proventos", subtítulo "Valor
   líquido recebido") exatamente como o spec §10.4: filtros em chips (escopo, período, classe, tipo), 4 tiles (total, média
   mensal, rendimento sobre o custo, melhor mês), gráfico de barras em Views (mensal/anual, melhor mês destacado, toque filtra a
   lista, até ~24 barras), "Quem mais pagou" (top 5 com "Ver todos"), lista agrupada por mês com subtotal e linhas ricas
   (ticker, tipo, data, qtd × valor por cota), folha de detalhe com Editar/Excluir (ConfirmDialog), botão fixo "Adicionar
   provento" acima do dock (bottomOffset), estado vazio com "Importar extrato da B3" e "Adicionar provento", skeleton no
   carregamento, Modo Privacidade mascarando tudo, tema claro/escuro.
   O custo para o rendimento sobre o custo = Σ quantidade × preço médio dos ativos atuais do escopo (use assetRepository).
4. StatisticsScreen: manter o card-resumo atual, ADICIONAR o botão "Ver histórico" (abre a nova camada) e REMOVER o formulário
   de lançamento manual de lá (ele migra para a nova tela). Não mexer no resto de Estatísticas.
5. Navegação por estado em App.tsx (padrão das camadas) + backNavigation.ts: nova ação 'close-income-history'. O botão
   "Importar extrato da B3" do estado vazio abre a tela da Sprint 47 (se ainda não existir, deixe o botão apontando para o
   ponto de entrada do Perfil e registre a pendência).
6. Desempenho: memoizar cálculos por filtro; trocar filtro com 500+ proventos sem long task > 50 ms (meça com PerformanceObserver
   no navegador e registre o número).
7. Documentação: docs/ARQUITETURA.md (módulo incomeHistory e a tela), README (recursos).

TESTES (Fase A) — S48-Txx:
- Domínio (fixture do Apêndice C + sintéticas): totais por mês (60,60/60,60/72,70/83,48/63,70/63,70 = 404,78); média 67,46;
  melhor mês agosto; meses vazios = 0,00 na série; rankByTicker soma 100%; yearlySeries; filtros combinados (escopo, período,
  classe, tipo, ticker); trailing12m na virada de ano; yieldOnCost com e sem custo (null); sem float (somas de 0,1+0,2 exatas).
- Repositório: add/list/update/delete com os campos novos; backup antigo (sem campos) importa sem quebrar.
- Tela: renderiza tiles/gráfico/lista com o fixture; trocar filtros atualiza tudo; modo Mensal/Anual; tocar na barra filtra a
  lista e tocar de novo limpa; adicionar provento (valor total OU qtd × por cota) valida e aparece na lista/total; editar e
  excluir (com confirmação) persistem; estado vazio com os dois botões; privacidade mascara; Estatísticas mostra o botão
  "Ver histórico", não tem mais o formulário e continua com o mesmo total; "voltar" fecha a camada.
- Desempenho: fixture com 600 proventos em 40 meses — filtrar/agrupar abaixo de um limite de tempo (ex.: 50 ms no Jest).

CRITÉRIOS: spec §10.5 e §8 item 5. Validar no navegador (?memdb=1) após importar docs/exemplos/b3-movimentacao-exemplo.xlsx
(Sprint 47) e conferir os números do Apêndice C na tela.
```

---

## Observações para quem coordena

- Sprints 42→45 são sequenciais (cada uma depende da anterior). **46 pode rodar em paralelo a 42–45** (domínio puro, sem UI);
  a 47 depende da 46 e usa telas das 43–45 apenas nos pontos de entrada. A **48** depende da 47 (campos novos de proventos e
  dados reais para validar), mas o domínio `incomeHistory` pode começar antes.
- Peça à IA para **parar ao fim da Fase A** de cada sprint (mostrar os IDs de teste) — é o ponto de controle do TDD Lock.
- Módulos nativos novos (`expo-local-authentication`, `expo-secure-store`, `expo-crypto`, `expo-document-picker`,
  `expo-file-system`) exigem `cd apps/mobile && npx expo run:android` antes de testar no aparelho. A biometria **só** pode ser
  validada num aparelho/emulador com digital cadastrada.
- Decisões fechadas: **PIN opcional** e **bloqueio após 1 minuto**. Em aberto (spec §9): tamanho do PIN (6 dígitos assumido), saída do "Esqueci o PIN" e carteira por corretora.
