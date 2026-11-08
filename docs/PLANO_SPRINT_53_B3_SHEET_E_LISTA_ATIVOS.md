# PLANO — Sprint 53: modal da importação B3 em duas alturas + lista de ativos rolável

> Para o Gemini executar. Autossuficiente. Leia antes: `.agents/rules/tdd-lock.md` (**obrigatório**), `apps/mobile/AGENTS.md`, `DESIGN_SYSTEM.md`, `docs/ARQUITETURA.md`.
> Duas entregas independentes (A e B). Faça **uma sprint com duas frentes**, mas commite por fase conforme o TDD Lock.

---

## 0. Estado atual (confirmado no código)

| Fato | Onde |
| :--- | :--- |
| O "modal" da B3 é um RN `<Modal presentationStyle="fullScreen">` com `SafeAreaView` e, dentro, a tela `B3ImportScreen` (1372 linhas). Não é bottom sheet. | `apps/mobile/App.tsx` → `renderB3ImportModal()` (~linha 1020); montado em 3 lugares (~1085, ~1112, ~1881) |
| `B3ImportScreen` tem 5 etapas: `pick → loading → preview → importing → report`, usa `XpMinimalHeader` (título + botão voltar) e um `ScrollView` com todo o conteúdo. | `apps/mobile/src/screens/B3ImportScreen.tsx` |
| Já existe um bottom sheet padrão do app (`AnimatedModalSheet`), com `maxHeight`, `fill`, alça, overlay, teclado. **Só tem uma altura fixa** (sem "snap"). | `apps/mobile/src/components/ui/AnimatedModalSheet.tsx` |
| A lista "MEUS ATIVOS" da carteira é um `View` com `currentClassAssets.map(...)` dentro do `ScrollView` da página inteira — cresce sem limite. | `apps/mobile/src/screens/PortfolioManagementScreen.tsx` ~linha 1543 (`styles.assetsList` ~2471) |
| Há um modal secundário `b3-ignored-modal` (RN `Modal` centralizado) dentro da B3ImportScreen. | mesmo arquivo, ~linha 757 |
| Testes que tocam a B3 (travados em `tests.lock.json`): `Sprint49ExtratoHomeProventosLightTheme`, `Sprint50PierreEditorialOnboarding`, `Sprint51OnboardingAnimationsAndIgnoredDetails`, `services/__tests__/b3ImportService.test.tsx`. Usam os testIDs `b3-import-screen`, `b3-pick-file`, `b3-preview-summary`, `b3-confirm-import`, `b3-progress`, `b3-report`, `b3-ignored-tile`, `b3-ignored-modal`, `b3-ignored-modal-close`, `b3-report-configure-metas`, `xp-header-back`. | `src/screens/__tests__/` |

**Regra de ouro:** nenhum testID acima pode mudar de nome nem sumir. Se um teste travado quebrar, **corrija o código, nunca o teste**. Se achar que o teste está errado, **pare e peça autorização ao usuário**.

---

## 1. Frente A — Sheet da importação B3 (meia tela → tela cheia)

### 1.1 Comportamento desejado

1. Ao abrir (Perfil/Backup, Home, ou ação `import_b3` do onboarding) a importação aparece como **bottom sheet com ~50% da altura da tela**, mostrando só a etapa `pick` (como exportar + privacidade + botão "Selecionar arquivo").
2. Assim que o usuário escolhe um arquivo e a leitura começa (`loading`), o sheet **sobe com animação até 100% da tela** (respeitando a status bar/safe area) e permanece assim em `preview`, `importing` e `report`.
3. Em tela cheia o sheet mostra as informações da importação com visual melhor (ver 1.3).
4. Se o usuário voltar para `pick` (erro de leitura, "Desfazer importação"), o sheet **desce de volta para ~50%**.
5. Fechar: toque no fundo escuro (só quando meia tela), botão "X" no cabeçalho do sheet, ou botão Voltar do Android. **Durante `importing` não fecha** (bloquear backdrop, X e Voltar).
6. Arrastar a alça para cima/baixo alterna entre as duas alturas (gesto opcional — ver 1.4; o essencial é a expansão automática).

### 1.2 Arquitetura (mudanças mínimas e retrocompatíveis)

**a) `AnimatedModalSheet` ganha um modo de duas alturas — sem quebrar quem já usa.**
Arquivo: `src/components/ui/AnimatedModalSheet.tsx`. Hoje há 10+ usos (Metas, Perfil, Renda, etc.); o comportamento atual deve ficar **idêntico** quando as props novas não forem passadas.

Props novas (todas opcionais):
- `expanded?: boolean` — quando `true`, o sheet anima da altura inicial para a altura expandida.
- `collapsedHeight?: number` — fração da tela (padrão `0.5`).
- `expandedHeight?: number` — fração da tela (padrão `1`, ou seja, tela cheia).
- `onRequestExpand?: () => void` / `onRequestCollapse?: () => void` — chamados pelo gesto da alça (se implementado).
- `dismissible?: boolean` (padrão `true`) — `false` ignora backdrop e `onRequestClose` (usado em `importing`).

Implementação sugerida:
- Um `Animated.Value` `heightAnim` (fração → pixels). **Altura não suporta `useNativeDriver`**: use `useNativeDriver: false` só nessa animação (a de `translateY`/opacidade continuam nativas). Duração ~320 ms, `Easing.out(Easing.cubic)`; ou `Animated.spring` com `damping: 22, stiffness: 180`.
- No modo `expanded`, o sheet vira `fill` (o filho cuida do próprio `ScrollView`; veja o comentário existente sobre `TouchableWithoutFeedback` roubando gesto no Android — **não** envolver o filho nele).
- Quando expandido a ~100%, zerar o raio superior de forma suave (28 → 0) **ou** manter 28 e respeitar o `statusBarTranslucent`; adicionar `paddingTop` com `useSafeAreaInsets().top` para o conteúdo não ficar sob a status bar.
- `keyboardHeight` continua tendo prioridade: a altura efetiva é `min(alvo, windowHeight - keyboardHeight - 40)`, como hoje.

**b) Novo componente de sheet da B3 (fino), em vez de enfiar a lógica no `App.tsx`.**
Crie `src/components/B3ImportSheet.tsx`:
- Props: `visible`, `onClose`, `isLight`, `initialPortfolioId?`, `onNavigateToPortfolio?`.
- Renderiza `<AnimatedModalSheet visible expanded={step !== 'pick'} dismissible={step !== 'importing'} ...>` com `<B3ImportScreen embedded ... />` dentro.
- O `step` precisa ser conhecido pelo sheet: adicione em `B3ImportScreen` a prop `onStepChange?: (step: ImportStep) => void` (chamada num `useEffect` quando `step` muda) e exporte o tipo `ImportStep`.
- No `App.tsx`, `renderB3ImportModal()` passa a devolver `<B3ImportSheet ... />` (sem RN `Modal` próprio, sem `SafeAreaView`). Mantenha `key={`b3-${b3ImportKey}`}` para resetar o estado a cada abertura, e a lógica `animationType={initialAction === 'import_b3' ? 'none' : 'slide'}` deixa de existir (o sheet tem a própria animação).

**c) `B3ImportScreen` ganha o modo `embedded`** (prop booleana, padrão `false` para os testes antigos continuarem iguais):
- `embedded`: não renderiza `XpMinimalHeader`; renderiza um cabeçalho próprio de sheet (título "Importar extrato da B3", subtítulo "Processamento 100% local e seguro", botão X com `testID="xp-header-back"` para os testes que já usam esse id continuarem achando o botão de voltar).
- Em `embedded`, o `ScrollView` interno ocupa `flex: 1` e o botão principal de cada etapa fica **fixo no rodapé** (barra inferior com fundo do sheet), fora da rolagem — hoje o botão "Importar N lançamentos" fica no fim de uma lista que pode ter centenas de itens.
- Sem `embedded`, nada muda (compatibilidade com testes e com qualquer uso direto).

### 1.3 Visual ("mais bonito") — informações da importação em tela cheia

Siga `DESIGN_SYSTEM.md` (Bento, cantos 20–28, tokens de `theme/tokens`; **remova cores hardcoded novas** e prefira tokens). Itens:

- **Etapa `pick` (meia tela):** cabeçalho compacto; os 3 passos "Como exportar" viram uma lista com conector vertical entre as bolinhas numeradas; card de privacidade com ícone de cadeado; botão primário "Selecionar arquivo (XLSX ou CSV)" fixo embaixo; link secundário "Já tenho o arquivo" não é necessário.
- **Etapa `loading`:** skeleton/shimmer (`Skeleton` já existe em `components/ui`) no lugar do spinner solto, com texto "Lendo e validando extrato...".
- **Etapa `preview` (tela cheia):**
  1. Faixa com o(s) arquivo(s) (chips com ícone, truncados).
  2. Grid 2×2 de resumo (Compras, Vendas, Proventos, Ignorados) com número grande, total em R$ e ícone; o tile "Ignorados" continua abrindo `b3-ignored-modal`.
  3. Seção "Destino" (corretoras / carteira) em card Bento; chips com estado ativo claro.
  4. "Saldo anterior ao extrato" em card de alerta (cor de aviso, ícone), com os 3 chips por ticker.
  5. Lista "Ativos a criar ou atualizar (N)" **dentro de um card com altura máxima e rolagem própria** (mesma ideia da Frente B), com busca/filtro opcional por classe se for simples; badge de classe colorido (usar o mapa `ASSET_CLASS_ATTRIBUTE_MAP` / `getClassColor` já existentes).
  6. Rodapé fixo: botão "Importar N lançamentos" (desabilitado se 0) + texto pequeno "Você poderá desfazer".
- **Etapa `importing`:** barra de progresso real (`progress.current / progress.total`) em vez de só texto; mensagem de `progress.message`; sem botão de fechar.
- **Etapa `report`:** selo de sucesso, totais da verificação em linhas alinhadas, destaque do card de "Definir metas e percentuais"; rodapé com "Ver carteira" e "Concluir"; "Desfazer importação" como ação secundária discreta.
- Respeitar tema claro/escuro (`isLight`) como o restante do arquivo. Animação de entrada dos blocos opcional e leve (fade/translate 150–200 ms, nativo).
- O modal `b3-ignored-modal` pode continuar sendo RN `Modal` centralizado (os testes dependem do `visible`/`close`). Apenas melhorar o visual; não mudar testIDs.

### 1.4 Gesto (opcional, só depois do essencial funcionar)

`PanResponder` na alça do sheet: arrastar para cima ≥ 60 px chama `onRequestExpand`; para baixo ≥ 60 px em tela cheia chama `onRequestCollapse` (somente se `step` permitir; em `preview/report` não colapsar). Se der qualquer conflito de rolagem no Android, **não entregue o gesto** — a expansão automática já cumpre o pedido.

### 1.5 Navegação (Android Voltar)

A decisão do botão Voltar fica em `src/navigation/backNavigation.ts` (função pura, testada). `App.tsx` já passa `isB3ImportOpen` ali (~linha 732). Não crie uma camada nova: o `onRequestClose` do `AnimatedModalSheet` deve chamar `onClose` quando `dismissible`, e ser ignorado em `importing`. Confirme com os testes de `backNavigation` que nada regride.

### 1.6 Fluxo `import_b3` vindo do onboarding

`App.tsx` abre a B3 já visível quando `initialAction === 'import_b3'` (estado inicial de `isB3ImportOpen`). O sheet deve abrir normalmente nesse caso (animando de baixo), e **o botão "X" volta para a Home** (não para o onboarding, que já foi concluído).

---

## 2. Frente B — Lista de ativos da carteira rolável

Arquivo: `src/screens/PortfolioManagementScreen.tsx`, seção `MEUS ATIVOS` (`BentoSection testID="portfolio-assets-section"`).

> Suposição: "dentro da carteira, na lista de ativos" = esta seção ("MEUS ATIVOS", por classe). Se o usuário quis outra lista (por exemplo a Home), pare e pergunte.

### 2.1 O que fazer

- Trocar o `<View style={styles.assetsList}>{currentClassAssets.map(...)}</View>` por uma lista com **altura máxima e rolagem interna**, mantendo a rolagem da página.
- Altura máxima: `Math.round(windowHeight * 0.55)` (via `useWindowDimensions`), com mínimo de `ASSET_ROW_HEIGHT * 3`. Quando houver poucos ativos, a lista só ocupa o necessário (use `maxHeight`, não `height`).
- Como já está dentro de um `ScrollView` vertical, o ScrollView interno precisa de `nestedScrollEnabled` (Android) e de `showsVerticalScrollIndicator` visível. Prefira `ScrollView` + `.map` a `FlatList` aninhada (o React Native avisa sobre `VirtualizedLists nested inside plain ScrollViews`). Se as carteiras tiverem centenas de ativos, usar `FlatList` com `scrollEnabled` e `nestedScrollEnabled` e `getItemLayout` (`ASSET_ROW_HEIGHT` = 68 + gap 10).
- Dica visual de rolagem: um gradiente/sombra de 16 px no rodapé da lista quando houver mais itens abaixo (opcional; pode ser uma `View` com `pointerEvents="none"` e cor do card com opacidade).
- Dar um `testID="portfolio-assets-list"` ao contêiner rolável (novo; não colide com nada existente).
- Não alterar `AssetRow`, edição rápida, cadeado, exclusão, modo percent/peso, nem o skeleton.

### 2.2 Riscos a verificar no aparelho

- Gesto de arrastar slider/campo de % dentro de `AssetRow` roubando o scroll interno.
- Em Android, rolar a lista interna sem mover a página (e vice-versa): é exatamente o que `nestedScrollEnabled` resolve; testar no emulador (`npx expo run:android`).
- Teclado aberto durante edição rápida: a linha editada precisa continuar visível (`keyboardShouldPersistTaps="handled"`).

---

## 3. Protocolo TDD Lock (obrigatório, 2 fases)

### Fase A — Testes (Red) e lock
Crie arquivos **novos** (não edite os travados):
- `src/components/__tests__/AnimatedModalSheetSnap.test.tsx`
  - sem props novas: comportamento idêntico (renderiza, backdrop fecha);
  - com `expanded={false}`: altura ≈ `0.5 * windowHeight`; com `expanded={true}`: ≈ `windowHeight`;
  - `dismissible={false}`: toque no backdrop e `onRequestClose` **não** chamam `onClose`.
- `src/screens/__tests__/Sprint53B3ImportSheet.test.tsx`
  - abre em `pick` com o sheet na altura inicial; após escolher o arquivo de exemplo (`docs/exemplos/b3-movimentacao-exemplo.xlsx`, como nos testes das Sprints 49–51) o sheet fica expandido e mostra `b3-preview-summary`;
  - no `preview` aparecem Compras/Vendas/Proventos/Ignorados e `b3-confirm-import`; `b3-ignored-tile` continua abrindo `b3-ignored-modal`;
  - em `importing` o X e o backdrop não fecham; em `report` aparecem `b3-report` e `b3-report-configure-metas`;
  - `onStepChange` é chamado com a sequência esperada.
- `src/screens/__tests__/Sprint53PortfolioAssetsScroll.test.tsx`
  - `portfolio-assets-list` existe quando há ativos; é rolável (propriedade de estilo `maxHeight` definida e `nestedScrollEnabled`);
  - com carteira de 30 ativos, todos os 30 `AssetRow` estão montados/acessíveis; com 0 ativos continua aparecendo `portfolio-assets-empty`.

Depois:
```bash
node scripts/test-lock.js lock
```
Atualize `TEST_REPORT.md` e faça:
```bash
git add .
git commit -m "test(sprint-53): add and lock phase A b3 import sheet and assets list scroll tests"
git push origin main
```

### Fase B — Implementação (Green)
Implemente 1.2 → 1.3 → (1.4 opcional) → 2. **Não toque em nenhum arquivo de teste travado.** Antes de concluir:
```bash
cd apps/mobile && npx tsc --noEmit && npx expo lint
cd apps/mobile && npx jest
node scripts/test-lock.js verify
```
Registre os resultados em `TEST_REPORT.md` e faça:
```bash
git add .
git commit -m "feat(sprint-53): b3 import sheet in two heights and scrollable assets list"
git push origin main
```

---

## 4. Verificação manual (emulador Android)

1. Perfil → Backup → Importar B3: abre **meia tela**; a página de trás aparece escurecida.
2. Escolher `b3-movimentacao-exemplo.xlsx`: sheet **sobe até a tela cheia**, com resumo, destino e lista de ativos rolável; botão "Importar" fixo embaixo.
3. Importar: barra de progresso; X desabilitado; concluir mostra relatório; "Desfazer importação" volta para meia tela.
4. Tema claro e escuro.
5. Carteira → Meus Ativos: lista com altura limitada e rolagem própria; editar % de um ativo com o teclado aberto; página continua rolando fora da lista.

## 5. Fora de escopo

Mudar o parser/importação (`domain/b3`, `b3ImportService`), regras de negócio, onboarding, ou as outras telas que usam `AnimatedModalSheet`.

## 6. Pegadinhas conhecidas

- `AnimatedModalSheet` usa `Animated` nativo; animar **altura** exige `useNativeDriver: false`. Não misture as duas no mesmo `Animated.parallel` com a mesma `Animated.Value`.
- O comentário em `AnimatedModalSheet` sobre `TouchableWithoutFeedback` que bloqueia rolagem no Android vale aqui: no modo expandido, não envolver o conteúdo nele.
- A `B3ImportScreen` é montada em até 3 pontos do `App.tsx` por `renderB3ImportModal()`; garanta que apenas **um** `visible` fique `true` por vez.
- Testes antigos renderizam `B3ImportScreen` direto, sem sheet: por isso `embedded` deve ter padrão `false`.
