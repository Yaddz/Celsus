# Celsus — Dossiê Patrimonial

**Gestor local-first de carteiras de investimentos** (pt-BR). Suas carteiras, metas e aportes ficam só no aparelho;
um motor de mercado em Go — embutido no app Android — traz cotações, histórico, proventos e fundamentos.

[![Expo](https://img.shields.io/badge/Expo_SDK_58-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native_0.88-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev/)
[![SQLite](https://img.shields.io/badge/SQLite_Local-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![TDD Lock](https://img.shields.io/badge/TDD-SHA--256_Locked_Tests-B84A1C?style=flat-square)](#testes-e-protocolo-tdd-lock)

## O que o app faz

| Área | Descrição |
| :--- | :--- |
| **Carteiras** | Várias carteiras independentes, cada uma com paleta própria; carteira ativa na Home e consolidado em Estatísticas. |
| **Metas em dois níveis** | Meta por classe (Renda fixa, FIIs, Ações, Cripto) e por ativo dentro da classe, com cadeado e redistribuição que sempre fecha em 100% (aceita valores quebrados como 12,5%). |
| **Meta de patrimônio** | Valor-alvo por carteira (ex.: R$ 100 mil) com progresso e previsão. |
| **Aporte e rebalanceamento** | Simulador em duas fases (cotas inteiras + distribuição do troco por maior déficit); só categorias ativas recebem aporte. |
| **Busca e ficha do ativo** | Pesquisa por nome ou ticker, ranking por classe e ficha com cotação, gráfico (7D a Máx), indicadores, proventos e botão **Adicionar à carteira**. |
| **Livro-razão** | Compras e vendas com preço médio, quantidade, proventos e extrato. |
| **Renda fixa** | Cálculo em base 252 (% CDI, IPCA+, pré) com taxas do Banco Central. |
| **Importação da planilha** | Carga da planilha de controle (carteira AUVP) com relatório de verificação, sem apagar dados. |
| **Backup e privacidade** | Exportação/importação `.celsus.zip` (CSVs + manifest SHA-256), modo privacidade e bloqueio biométrico. |
| **Tema** | Escuro e claro, interface em Bento Grid. |

## Estrutura

```text
Celsus/
├── apps/mobile/            App Expo / React Native (TypeScript) + módulo nativo `celsus-market`
├── services/market-api/    Motor de mercado em Go (API REST e ponte gomobile para Android)
├── docs/ARQUITETURA.md     Arquitetura, rotas, decisões e como rodar
├── DESIGN_SYSTEM.md        Tokens e componentes do design Bento
├── TEST_REPORT.md          Estado atual dos testes
├── scripts/                start-all.js · build-native-bridge.js · test-lock.js
├── imgsinsp/               Imagens de inspiração visual
├── .agents/rules/          Regras de trabalho do agente (TDD Lock, polyfills de runtime)
└── tests.lock.json         Manifesto SHA-256 dos testes bloqueados
```

## Como rodar

Requisitos: Node 22+, Go, Android Studio (SDK + NDK) para o build nativo.

```bash
cd apps/mobile && npm install

# Desenvolvimento integrado (backend Go na porta 8080 + Expo)
npm run start                      # na raiz

# App Android com a ponte Go embutida (build de desenvolvimento)
cd apps/mobile && npx expo run:android

# Só o backend de mercado
npm run backend
```

Depois de alterar código Go que o Android usa (`services/market-api/pkg/mobilebridge` ou pacotes `internal/*`):

```bash
npm run build:native               # gomobile bind + atualiza jar e .so do módulo
cd apps/mobile && npx expo run:android
```

No navegador (`expo start --web`) use `?memdb=1` na URL para o banco em memória, ou sirva com COOP/COEP para o SQLite real.

## Testes e protocolo TDD Lock

```bash
npm run test:mobile                # Jest (app)
npm run test:market                # Go
cd apps/mobile && npx tsc --noEmit # tipos
npm run test:verify                # confere a integridade (SHA-256) dos testes bloqueados
```

Os arquivos de teste são somente leitura e protegidos por `tests.lock.json`: não se edita teste para fazê-lo passar.
Alterar um teste exige autorização explícita (`node scripts/test-lock.js unlock` → editar → `npm run test:lock` → `npm run test:verify`).
Estado atual em [`TEST_REPORT.md`](./TEST_REPORT.md).

## Fontes de dados

Yahoo Finance (cotações, histórico, proventos), Fundamentus (indicadores de ações e FIIs), COTAHIST B3 (carga histórica) e
Banco Central/SGS (CDI e IPCA). Nenhum dado pessoal é enviado: o app só consulta tickers públicos.

## Mais documentação

- [`docs/ARQUITETURA.md`](./docs/ARQUITETURA.md) — camadas, rotas da API, ponte nativa, regras de dados.
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — tokens, bento, componentes, movimento.
- [`docs/SPEC_ONBOARDING_LOGIN_B3.md`](./docs/SPEC_ONBOARDING_LOGIN_B3.md) e [`docs/PROMPTS_SPRINTS_42_48.md`](./docs/PROMPTS_SPRINTS_42_48.md) — próximas sprints: onboarding, tela de bloqueio (PIN + digital), importação do extrato da B3 e histórico de proventos.
- Licença do template Expo: [`apps/mobile/LICENSE`](./apps/mobile/LICENSE).
