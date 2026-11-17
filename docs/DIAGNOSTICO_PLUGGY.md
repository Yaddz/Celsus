# Diagnóstico Pluggy e Auditoria de Outliers (Sprint 88)

Este documento descreve como exportar o relatório anonimizado do Open Finance no aparelho e o significado de cada alerta exibido na seção **Qualidade dos dados** em **Perfil → Open Finance**.

---

## 1. Como gerar o relatório no aparelho

1. Abra o app Celsus e acesse **Perfil → Open Finance**.
2. Role até a seção **Qualidade dos dados**.
3. Toque em **Exportar diagnóstico**.
4. O app consulta os endpoints da Pluggy em modo **somente leitura** (nada é gravado em `assets` ou `fin_entries`), remove todos os dados pessoais (`owner`, `taxNumber`, `number`, `itemId` substituído por hash curto, descrições livres truncadas em 40 caracteres) e abre o compartilhamento do sistema para você salvar ou enviar o JSON.

---

## 2. Significado dos alertas locais

| Alerta | Severidade | O que significa |
| :--- | :--- | :--- |
| `EXTREME_PROFITABILITY` | Alta | Posição com rentabilidade acima de `+300%` ou abaixo de `-90%`. Em geral indica custo médio truncado, `OPENING_BALANCE` faltante ou taxa de renda fixa incorreta. |
| `MARKET_VALUE_DIVERGENCE` | Alta | Diferença maior que `15%` entre o valor de mercado calculado localmente e o `of_reported_value` informado pela instituição. |
| `MISSING_COST_BASIS` | Média | Ativo com `quantity > 0` mas sem `average_price` conhecido (`cost_basis_source = UNKNOWN`). Fica fora do cálculo de rentabilidade (`"—"`). |
| `RF_RATE_OUT_OF_RANGE` | Alta | Taxa de renda fixa fora da faixa plausível (`CDI`: 50–200%; `PRE` / spread `IPCA`: 0–30%). |
| `INVALID_QUOTE_TICKER` | Média | Ativo marcado com `value_source = QUOTE` cujo ticker não segue o padrão B3 (`^[A-Z]{4}\d{1,2}$`). |
| `DUPLICATE_FIN_ENTRY` | Média | Dois lançamentos `OPEN_FINANCE` ativos na mesma conta, com mesmo valor e tipo, em datas com diferença de até 1 dia e `external_id` diferentes (comum na troca `PENDING` → `POSTED`). |
| `ACCOUNT_BALANCE_DIVERGENCE` | Média | Diferença acima de R$ 1,00 entre o saldo informado pela instituição e o saldo calculado pelos lançamentos locais. |
