import { mapPluggyTransaction, reconcilePluggyTransactions } from '..';
import { findOwnTransferPairs, type OwnTransferCandidate } from '../classification';
import { redactDiagnosticDescription } from '../diagnostics';
import { detectBankIncomeCandidate } from '../income';
import type { PluggyTransaction } from '../../../services/pluggy/types';

const assets = ['MXRF11', 'XPLG11', 'CSAN3', 'RECR11', 'CPLE3'].map((ticker) => ({
  ticker,
  name: null,
  status: 'ACTIVE',
}));

function credit(description: string, categoryId = '03060000') {
  return {
    id: `tx-${description}`,
    type: 'CREDIT' as const,
    amount: 10,
    date: '2026-11-10T12:00:00Z',
    description,
    category: 'Proceeds interests and dividends',
    categoryId,
  };
}

function candidate(overrides: Partial<OwnTransferCandidate> & Pick<OwnTransferCandidate, 'id' | 'account_id' | 'kind'>): OwnTransferCandidate {
  return {
    external_id: null,
    account_type: 'checking',
    amount_cents: 5000,
    due_date: '2026-11-10',
    status: 'paid',
    category_id: 'cat-outros-despesa',
    description: '',
    transfer_group_id: null,
    of_category_id: null,
    of_class_reason: 'SIGN',
    user_edited_fields: null,
    source: 'OPEN_FINANCE',
    of_removed_at: null,
    ...overrides,
  };
}

function pgTx(overrides: Partial<PluggyTransaction> & { id: string }): PluggyTransaction {
  return {
    description: 'X',
    currencyCode: 'BRL',
    amount: -1,
    type: 'DEBIT',
    status: 'POSTED',
    category: null,
    categoryId: null,
    date: '2026-11-10T12:00:00Z',
    createdAt: '2026-11-10T12:00:00Z',
    updatedAt: '2026-11-10T12:00:00Z',
    accountId: 'x',
    ...overrides,
  } as PluggyTransaction;
}

describe('Sprint 92 — Correções da revisão das sprints 90 e 91 (domínio, Fase A)', () => {
  it('S92-T01: a busca pela raiz do ticker não usa a descrição inteira — rendimento da conta remunerada não vira provento de CSAN3 nem de RECR11', () => {
    expect(detectBankIncomeCandidate(credit('CONTA REMUNERADA - RESGATE REMUNERAÇÃO'), assets)).toBeNull();
    expect(detectBankIncomeCandidate(credit('REMUNERACAO CDB RESGATE'), assets)).toBeNull();
    expect(detectBankIncomeCandidate(credit('CRÉDITO REMUNERAÇÃO'), assets)).toBeNull();
  });

  it('S92-T02: a raiz do ticker continua valendo no trecho depois de "s/ FII" e o ticker explícito continua vencendo', () => {
    expect(detectBankIncomeCandidate(credit('RENDIMENTOS - À VISTA s/ FII XP LOG C'), assets)?.ticker).toBe('XPLG11');
    expect(detectBankIncomeCandidate(credit('RENDIMENTOS DE CLIENTES MXRF11 S/ 637', '04000000'), assets)?.ticker).toBe(
      'MXRF11'
    );
  });

  it('S92-T03: pareamento entre contas recusa valor igual quando um lado tem categoria de compra ou de salário', () => {
    const pairs = findOwnTransferPairs(
      [
        candidate({ id: 'food', account_id: 'acc-1', kind: 'expense', of_category_id: '11010000' }),
        candidate({ id: 'salary', account_id: 'acc-2', kind: 'income', due_date: '2026-11-11', of_category_id: '01010000' }),
        candidate({ id: 'grocery-out', account_id: 'acc-1', kind: 'expense', amount_cents: 7000, of_category_id: '05070000' }),
        candidate({ id: 'grocery-in', account_id: 'acc-2', kind: 'income', amount_cents: 7000, of_category_id: '10000000' }),
      ],
      '2026-11-17'
    );
    expect(pairs).toEqual([]);
  });

  it('S92-T04: pareamento entre contas aceita 04, 05 ou sem categoria nos dois lados', () => {
    const pairs = findOwnTransferPairs(
      [
        candidate({ id: 'pix-out', account_id: 'acc-1', kind: 'expense', of_category_id: '05070000' }),
        candidate({ id: 'pix-in', account_id: 'acc-2', kind: 'income', due_date: '2026-11-11', of_category_id: '05000000' }),
        candidate({ id: 'own-out', account_id: 'acc-1', kind: 'transfer_out', amount_cents: 9000, of_category_id: '04000000' }),
        candidate({ id: 'own-in', account_id: 'acc-3', kind: 'income', amount_cents: 9000, of_category_id: null }),
      ],
      '2026-11-17'
    );
    const ids = pairs.map((p) => `${p.outId}>${p.inId}`).sort();
    expect(ids).toEqual(['own-out>own-in', 'pix-out>pix-in']);
  });

  it('S92-T05: pareamento dentro da conexão também recusa compra × salário, mas mantém pagamento de fatura', () => {
    const accountTypesById = { 'chk-1': 'checking', 'chk-2': 'checking', 'card-1': 'card' } as const;
    const mapped = [
      mapPluggyTransaction(
        pgTx({ id: 'food', accountId: 'chk-1', amount: -50, type: 'DEBIT', category: 'Eating out', categoryId: '11010000' }),
        { accountId: 'chk-1', accountType: 'checking' }
      ),
      mapPluggyTransaction(
        pgTx({ id: 'salary', accountId: 'chk-2', amount: 50, type: 'CREDIT', category: 'Salary', categoryId: '01010000' }),
        { accountId: 'chk-2', accountType: 'checking' }
      ),
      mapPluggyTransaction(
        pgTx({
          id: 'bill-out',
          accountId: 'chk-1',
          amount: -2900.13,
          type: 'DEBIT',
          description: 'PAGAMENTO DE FATURA',
          category: 'Transfers',
          categoryId: '05000000',
        }),
        { accountId: 'chk-1', accountType: 'checking' }
      ),
      mapPluggyTransaction(
        pgTx({
          id: 'bill-in',
          accountId: 'card-1',
          amount: -2900.13,
          type: 'CREDIT',
          description: 'Pgto fatura',
          category: 'Transfers',
          categoryId: '05000000',
        }),
        { accountId: 'card-1', accountType: 'card', closingDay: 1, dueDay: 10 }
      ),
    ];
    const result = reconcilePluggyTransactions(mapped, [], { accountTypesById: accountTypesById as any });
    expect(result.transferPairs.map((p) => `${p.outExternalId}>${p.inExternalId}`)).toEqual(['bill-out>bill-in']);
  });

  it('S92-T06: diagnóstico mascara a contraparte de Pix/TED/transferência em qualquer categoria e remove CNPJ parcial', () => {
    const owner = { ownerNames: ['PEDRO GABRIEL DE SOUSA'] };
    const pixFood = redactDiagnosticDescription('Pix enviado para 62.985.265 Isabella Souza', {
      ...owner,
      categoryId: '11010000',
    });
    expect(pixFood).not.toMatch(/isabella/i);
    expect(pixFood).not.toContain('62.985.265');
    expect(pixFood).toContain('<contraparte>');

    const pixGrocery = redactDiagnosticDescription('Transferência enviada pelo Pix|JAQUELINE SILVA', {
      ...owner,
      categoryId: '10000000',
    });
    expect(pixGrocery).not.toMatch(/jaqueline/i);
    expect(pixGrocery).toContain('<contraparte>');

    expect(
      redactDiagnosticDescription('Compra no débito via NuPay|iFood', { ...owner, categoryId: '11020000' })
    ).toBe('Compra no débito via NuPay|iFood');
    expect(
      redactDiagnosticDescription('RENDIMENTOS DE CLIENTES MXRF11 S/ 637', { ...owner, categoryId: '04000000' })
    ).toBe('RENDIMENTOS DE CLIENTES MXRF11 S/ 637');
  });
});
