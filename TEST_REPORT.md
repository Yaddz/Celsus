# Celsus — Relatório de testes

Estado atual da suíte. O histórico sprint a sprint (relatórios antigos, com hashes e tempos) está no git:
`git log -p -- TEST_REPORT.md`.

## Resumo

| Suíte | Comando | Resultado |
| :--- | :--- | :--- |
| App mobile (Jest + Testing Library) | `npm run test:mobile` | 88 suítes, **576 testes**, 23 falhas esperadas na Fase A (Red Phase) da Sprint 44 |
| Motor de mercado (Go) | `npm run test:market` | **44 testes**, 0 falhas, 2 "live" pulados por padrão |
| Tipos (TypeScript) | `cd apps/mobile && npx tsc --noEmit` | sem erros nos arquivos de produção |
| Integridade dos testes (TDD Lock) | `npm run test:verify` | 104 arquivos protegidos, SHA-256 íntegros |

## Cobertura por área

- **Domínio financeiro** (`src/domain/finance/__tests__`): pesos em dois níveis e redistribuição com cadeado (valores quebrados, nunca negativos), preço médio, renda fixa (base 252), aporte em duas fases, meta de patrimônio, proventos, donut, perfil/ranking de ativos, redução de séries para o gráfico.
- **Repositórios, banco e serviços** (`src/**/__tests__`): CRUD das carteiras/ativos/transações, migrações, backup `.celsus.zip` (CSVs + manifest SHA-256), privacidade (`privacyAndAuthService`), segurança e autenticação com PIN/biometria (`authService`, `secureStorage`, `biometricProvider`), sessão de bloqueio (`sessionStore`), perfil do usuário (`profileRepository`, `profileStore`), `marketApi` (ponte nativa, HTTP, cache, fallback quando a ponte devolve "OFFLINE" ou ranking vazio), importação da planilha.
- **Componentes e telas**: header/dock/bento, cartão empilhado, ficha do ativo, busca e ranking, simulador, fluxo da Home (renderização, navegação, modo privacidade, tema claro).
- **Segurança e Tela de Bloqueio (Sprint 43)**: `PinDots` (6 pontos, preenchimento, animação de tremor no erro via driver nativo, `useReducedMotion`), `PinKeypad` (grade 3x4, teclas redondas 72 dp, JellyPressable, botão de digital condicional, suporte a acessibilidade), `LockScreen` (saudação com perfil, bloqueio após 5 erros com timer mm:ss, auto-prompt de biometria ao montar, esqueci PIN com recuperação biométrica ou wipe destrutivo exigindo digitação "APAGAR"), `AppGate` / `useAppLock` (decisão de status loading/onboarding/locked/unlocked, detecção de ciclo de vida com `AppState`, bloqueio automático ao retornar do segundo plano conforme tolerância, capa de privacidade ao suspender app com PIN configurado), `backNavigation` (ação `'minimize'` para `BackHandler.exitApp()` com prioridade máxima quando em estado bloqueado).
- **Onboarding e Perfil Dinâmico (Sprint 44 — Fase A)**: `OnboardingFlow` (máquina de passos Boas-vindas → Nome → PIN opcional → Digital → Pronto; validação 2–40 caracteres com trim e acentos; avatar dinâmico com iniciais; confirmação e aviso não bloqueante para PINs triviais; "Agora não" pulando PIN e digital; integração biométrica real; persistência estritamente atômica no fim; fluxo abreviado de migração D9 para bancos com carteiras existentes; substituição de "Pedro"/"PL" fixos em todas as telas por `useProfile()`).
- **Go** (`services/market-api`): parser COTAHIST, cliente Yahoo (failover, eventos), BCB, API REST, ponte `mobilebridge`, perfil/ranking de fundamentos com **páginas reais do Fundamentus** como fixtures (`internal/fundamentals/testdata`).

## Testes "live" (manuais)

Consultam as fontes reais e ficam desligados por padrão:

```bash
cd services/market-api
CELSUS_LIVE=1 go test ./internal/fundamentals ./pkg/mobilebridge -run Live -v
```

O de `pkg/mobilebridge` exercita o mesmo caminho do Android (banco novo, ranking de FIIs, perfil da PETR4), sem JNI.

## O que a suíte não cobre

- Execução no aparelho/emulador Android (ponte nativa carregada de verdade, ordem de desenho de camadas, desempenho real).
- Disponibilidade das fontes externas (Fundamentus, Yahoo): se mudarem de formato, o app mostra cotação/catálogo com "—".

## Protocolo

Os testes são bloqueados (somente leitura + SHA-256 em `tests.lock.json`). Para alterar um teste: `node scripts/test-lock.js unlock`,
editar, `npm run test:lock` e `npm run test:verify`. Detalhes em `.agents/rules/tdd-lock.md` e `docs/ARQUITETURA.md`.
