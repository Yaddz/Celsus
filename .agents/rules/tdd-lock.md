---
trigger: always_on
description: Protocolo estrito de TDD com Testes Imutáveis (Locked Tests) e geração obrigatória de Relatório de Testes (TEST_REPORT.md).
---

# Protocolo de TDD Estrito e Imutabilidade de Testes (Celsus)

Este workspace opera sob regime estrito de **Test-Driven Development (TDD) com Bloqueio de Testes**:

## 1. Fluxo Obrigatório em 2 Fases por Sprint
Toda Sprint ou funcionalidade deve ser executada estritamente em duas fases separadas:

### Fase A — Autoria dos Testes (Red Phase & Lock)
1. Os arquivos de teste (`*_test.go`, `*.test.ts`, `*.test.tsx`, `*.spec.ts`) são escritos **antes** do código de produção (apenas interfaces/assinaturas vazias ou stubs são permitidos para compilação).
2. Cada teste deve refletir fielmente as fórmulas e regras de negócio de `SPEC.md`.
3. Ao concluir a escrita dos testes da Sprint, execute obrigatoriamente:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action lock
   ```
   Isso grava os hashes `SHA-256` em `tests.lock.json` e aplica atributo `ReadOnly` do sistema operacional nos arquivos de teste.

### Fase B — Implementação sob Bloqueio (Green Phase & Report)
1. **PROIBIÇÃO ABSOLUTA DE ALTERAR TESTES:** Durante a implementação, o agente **NÃO PODE** editar, remover, comentar, usar `.skip` / `t.Skip()` ou alterar asserções em nenhum arquivo de teste bloqueado.
2. **FALHOU NO TESTE? CORRIJA O CÓDIGO:** Se um teste falhar, o agente deve analisar o erro, retornar ao **código de produção** e corrigir a implementação até o teste passar.
3. Antes de concluir qualquer tarefa na Fase B, o agente deve validar que nenhum teste foi adulterado rodando:
   ```powershell
   powershell -ExecutionPolicy Bypass -File ./scripts/test-lock.ps1 -Action verify
   ```
4. Caso seja detectada uma ambiguidade real ou erro de sintaxe no próprio arquivo de teste, o agente **DEVE PARAR** e pedir autorização explícita ao usuário antes de desbloquear qualquer teste.

## 2. Registro Obrigatório no Relatório de Testes (`TEST_REPORT.md`)
- Todos os casos de teste criados na Fase A e os resultados de execução da Fase B (status `PASS`/`FAIL`, tempo de execução, hash `SHA-256` do arquivo de teste e saída do runner) devem ser registrados e atualizados em `TEST_REPORT.md` e em `reports/`.
