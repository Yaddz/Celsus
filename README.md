# CELSUS — Gestor Local-First de Carteiras de Investimentos

> **DOCKET REF:** `REV-CELSUS-MVP`  
> **Arquitetura:** Mobile 100% Local-First (`React Native / Expo` + `SQLite`) + Market Data Engine Stateless (`Go`)  
> **Estética:** *Bureaucratic Brutalism & Painterly Skeuomorphism* ([`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md))  
> **Metodologia:** Strict TDD com Bloqueio Criptográfico de Testes ([`TEST_REPORT.md`](./TEST_REPORT.md))

O **Celsus** é um aplicativo mobile de gestão de carteiras de investimentos com foco em **privacidade absoluta**: **100% dos dados pessoais, carteiras, ativos e aportes ficam armazenados exclusivamente no dispositivo do usuário (SQLite local)**. Nenhum dado pessoal ou financeiro é salvo na nuvem.

---

## Principais Funcionalidades (MVP)

- **Múltiplas Carteiras Independentes + Dossiê Consolidado:** Crie quantas carteiras desejar (ex.: *Aposentadoria*, *Reserva*, *FIIs de Renda*), cada uma com seus próprios ativos, metas e histórico, além de uma visão consolidada do patrimônio total em `BRL (R$)`.
- **Suporte às 4 Classes de Ativos (Mapeadas nas 4 Barras de Atributos):**
  - **Renda Fixa (`FIXED_INCOME` / *Intellect* `#2E4A44`):** Cálculo automático por indexador (`% do CDI`, `IPCA+`, `Pré-fixado` em base 252) + opção de override manual de saldo.
  - **Fundos Imobiliários (`FII` / *Psyche* `#D5CAA8`):** Cotações e histórico via B3 COTAHIST + BRAPI.
  - **Ações (`STOCK` / *Physique* `#D96628`):** Cotações e histórico via B3 COTAHIST + BRAPI.
  - **Criptomoedas (`CRYPTO` / *Motorics* `#C49A45`):** Cotações em `BRL` via BRAPI com precisão de até **8 casas decimais**.
- **Alocação por Pesos em 2 Níveis + Simulador Inteligente de Novo Aporte:**
  - Defina o peso **Macro** de cada classe na carteira (`0–100%`) e o peso **Micro** de cada ativo dentro de sua classe (`0–100%`).
  - Ao informar o valor de um novo aporte em `R$`, o app calcula automaticamente quanto comprar de cada ativo que está abaixo da meta ideal (**rebalanceamento sem vendas**).
- **Motor de Mercado Stateless em Go (`COTAHIST B3` + `BRAPI` + `BCB`):**
  - Processa os arquivos históricos oficiais **COTAHIST** da B3 (layout posicional de 245 bytes), faz proxy/cache de cotações atuais na **BRAPI** e fornece as curvas diárias de **CDI/IPCA**.
- **Backup e Recuperação Offline (`.celsus.zip`):**
  - Exportação e importação em pacote `.zip` contendo CSVs legíveis (`portfolios.csv`, `class_targets.csv`, `assets.csv`, `transactions.csv`) + `manifest.json` assinado com hashes `SHA-256` para validação de integridade, suportando **Restore Completo** ou **Merge por UUID**.
- **Preparado para Open Finance:** Modelagem local já estruturada (`source`, `external_id`, `institution_id`, `last_synced_at`) para futura integração de leitura via Open Finance.

---

## Estrutura do Repositório

```text
Celsus/
├── .agents/rules/
│   └── tdd-lock.md          # Regra de governança: TDD estrito com testes imutáveis
├── scripts/
│   └── test-lock.ps1        # Script de bloqueio ReadOnly + verificação SHA-256 dos testes
├── services/
│   └── market-api/          # Backend Stateless em Go (Parser COTAHIST B3, Proxy BRAPI, Taxas Macro)
├── apps/
│   └── mobile/              # App Mobile React Native (Expo, SQLite/Drizzle, NativeWind, Space Mono)
├── DESIGN_SYSTEM.md         # Tokens de cores, tipografia Space Mono e componentes Bureaucratic Brutalism
├── SPEC.md                  # Especificação técnica completa, fórmulas, banco de dados e Sprints
└── TEST_REPORT.md           # Catálogo de casos de teste, hashes SHA-256 e resultados de execução
```

---

## Protocolo de Desenvolvimento: TDD com Testes Imutáveis (`TDD Lock`)

Este projeto opera sob regime estrito de **TDD em 2 Fases** por Sprint:

1. **Fase A — Autoria e Bloqueio dos Testes (`Red & Lock`):**
   - Todos os testes da Sprint são escritos primeiro seguindo fielmente a [`SPEC.md`](./SPEC.md).
   - Em seguida, os arquivos de teste são bloqueados com permissão `ReadOnly` e seus hashes `SHA-256` são salvos em `tests.lock.json`:
     ```powershell
     powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock
     ```
2. **Fase B — Implementação sob Bloqueio (`Green & Verify`):**
   - Os arquivos de teste **não podem ser alterados**. Se um teste falhar, o código de produção é ajustado até que 100% dos testes passem.
   - Ao final da Sprint, a integridade dos testes é verificada antes de atualizar o [`TEST_REPORT.md`](./TEST_REPORT.md):
     ```powershell
     powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify
     ```

---

## Documentação do Projeto

- [**Especificação Técnica e Plano de Sprints (`SPEC.md`)**](./SPEC.md)
- [**Design System & Identidade Visual (`DESIGN_SYSTEM.md`)**](./DESIGN_SYSTEM.md)
- [**Dossiê e Relatório de Testes (`TEST_REPORT.md`)**](./TEST_REPORT.md)
