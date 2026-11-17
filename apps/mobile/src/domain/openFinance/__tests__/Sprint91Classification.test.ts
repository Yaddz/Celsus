import type { FinAccount, FinEntry } from '../../../db/schema';
import {
  calculateAccountBalance,
  calculateMonthlySummary,
} from '../../financeFlow';
import { projectCashflow } from '../../financeFlow/budgetsAndCashflow';
import {
  classifyOpenFinanceBankEntry,
  findOwnTransferPairs,
  isStaleOpenFinancePending,
  resolveCategoryByPluggyId,
  type OwnTransferCandidate,
} from '../classification';
import { mapPluggyTransaction } from '../index';
import type { PluggyTransaction } from '../../../services/pluggy/types';

const TODAY = '2026-11-17';

function tx(overrides: Partial<PluggyTransaction>): PluggyTransaction {
  return {
    id: 'tx-x',
    description: 'X',
    currencyCode: 'BRL',
    amount: -10,
    date: '2026-11-10T12:00:00Z',
    type: 'DEBIT',
    status: 'POSTED',
    category: null,
    categoryId: null,
    accountId: 'acc-1',
    createdAt: '2026-11-10T12:00:00Z',
    updatedAt: '2026-11-10T12:00:00Z',
    ...overrides,
  } as PluggyTransaction;
}

function entry(overrides: Partial<FinEntry>): FinEntry {
  return {
    id: 'e-x',
    kind: 'expense',
    amount_cents: 1000,
    due_date: '2026-11-10',
    paid_date: '2026-11-10',
    paid_amount_cents: 1000,
    status: 'paid',
    account_id: 'acc-1',
    category_id: 'cat-outros-despesa',
    description: 'X',
    recurrence_id: null,
    recurrence_period: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
    bill_month: null,
    transfer_group_id: null,
    source: 'OPEN_FINANCE',
    external_id: null,
    import_batch_id: null,
    description_raw: null,
    user_edited_fields: null,
    linked_income_id: null,
    of_removed_at: null,
    created_at: '2026-11-10T12:00:00.000Z',
    ...overrides,
  } as FinEntry;
}

function candidate(overrides: Partial<OwnTransferCandidate>): OwnTransferCandidate {
  return {
    id: 'c-x',
    external_id: 'ext-x',
    account_id: 'acc-a',
    account_type: 'checking',
    kind: 'expense',
    amount_cents: 43279,
    due_date: '2026-11-10',
    status: 'paid',
    category_id: 'cat-outros-despesa',
    description: 'Pix',
    transfer_group_id: null,
    of_category_id: null,
    of_class_reason: null,
    user_edited_fields: null,
    source: 'OPEN_FINANCE',
    of_removed_at: null,
    ...overrides,
  };
}

describe('Sprint 91 — Classificação de lançamentos Open Finance (domínio, Fase A)', () => {
  it('S91-T01: APLICAÇÃO AUTOMÁTICA −227,17 (03000000) => transfer_out INVESTMENT_MOVE, fora das despesas, saldo −227,17 (D21, R17)', () => {
    const raw = tx({
      id: 'tx-t01',
      description: 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA',
      amount: -227.17,
      type: 'DEBIT',
      category: 'Investments',
      categoryId: '03000000',
    });
    const res = classifyOpenFinanceBankEntry(raw, { rules: [] });
    expect(res.kind).toBe('transfer_out');
    expect(res.reason).toBe('INVESTMENT_MOVE');

    const mapped = mapPluggyTransaction(raw, { accountId: 'acc-1', accountType: 'checking', rules: [] });
    expect(mapped.kind).toBe('transfer_out');
    expect(mapped.amountCents).toBe(22717);

    const e = entry({ kind: 'transfer_out', amount_cents: 22717, paid_amount_cents: 22717 });
    const summary = calculateMonthlySummary([e], '2026-11');
    expect(summary.paidExpenseCents).toBe(0);
    expect(summary.paidIncomeCents).toBe(0);
    expect(calculateAccountBalance(0, [e], 'acc-1')).toBe(-22717);
  });

  it('S91-T02: RESGATE REMUNERAÇÃO +0,41 (03060000) continua income (R17: 0306 é rendimento)', () => {
    const res = classifyOpenFinanceBankEntry(
      tx({
        description: 'CONTA REMUNERADA - RESGATE REMUNERAÇÃO',
        amount: 0.41,
        type: 'CREDIT',
        category: 'Proceeds interests and dividends',
        categoryId: '03060000',
      }),
      { rules: [] }
    );
    expect(res.kind).toBe('income');
    expect(res.reason).not.toBe('INVESTMENT_MOVE');
  });

  it('S91-T02b: RESGATE APLICAÇÃO +2.127 sem categoria vira transfer_in INVESTMENT_MOVE pela descrição (R17)', () => {
    const res = classifyOpenFinanceBankEntry(
      tx({ description: 'CONTA REMUNERADA - RESGATE APLICAÇÃO', amount: 2127, type: 'CREDIT' }),
      { rules: [] }
    );
    expect(res.kind).toBe('transfer_in');
    expect(res.reason).toBe('INVESTMENT_MOVE');
  });

  it('S91-T03: LIQ BOLSA −623,09 e TX EMOL B3 −0,03 são transferência e não alteram as despesas do mês (D21)', () => {
    const a = classifyOpenFinanceBankEntry(
      tx({ description: 'LIQ BOLSA - VISTA BRUTO', amount: -623.09, categoryId: '03000000', category: 'Investments' }),
      { rules: [] }
    );
    const b = classifyOpenFinanceBankEntry(
      tx({ description: 'LIQ BOLSA - VISTA TX EMOL B3', amount: -0.03 }),
      { rules: [] }
    );
    expect(a.kind).toBe('transfer_out');
    expect(b.kind).toBe('transfer_out');
    expect(a.reason).toBe('INVESTMENT_MOVE');
    expect(b.reason).toBe('INVESTMENT_MOVE');

    const base = entry({ id: 'base', amount_cents: 5000, paid_amount_cents: 5000 });
    const before = calculateMonthlySummary([base], '2026-11').paidExpenseCents;
    const after = calculateMonthlySummary(
      [
        base,
        entry({ id: 't1', kind: 'transfer_out', amount_cents: 62309, paid_amount_cents: 62309 }),
        entry({ id: 't2', kind: 'transfer_out', amount_cents: 3, paid_amount_cents: 3 }),
      ],
      '2026-11'
    ).paidExpenseCents;
    expect(after).toBe(before);
  });

  it('S91-T04: OPERAÇÕES EM BOLSA PENDING de 22/12/2025 (hoje 17/11/2026) fica fora de "a pagar" e da previsão (R17)', () => {
    const raw = tx({
      description: 'OPERAÇÕES EM BOLSA - NOTA 123',
      amount: -1097.42,
      status: 'PENDING',
      date: '2025-12-22T12:00:00Z',
      categoryId: '03000000',
    });
    expect(classifyOpenFinanceBankEntry(raw, { rules: [] }).reason).toBe('INVESTMENT_MOVE');

    const stale = entry({
      id: 'stale',
      kind: 'expense',
      status: 'pending',
      paid_date: null,
      paid_amount_cents: null,
      amount_cents: 109742,
      due_date: '2025-12-22',
    });
    expect(isStaleOpenFinancePending(stale, TODAY)).toBe(true);
    expect(isStaleOpenFinancePending({ ...stale, due_date: '2026-11-01' }, TODAY)).toBe(false);
    expect(isStaleOpenFinancePending({ ...stale, source: 'MANUAL' }, TODAY)).toBe(false);

    expect(calculateMonthlySummary([stale], '2025-12', TODAY).pendingExpenseCents).toBe(0);

    const account = {
      id: 'acc-1',
      name: 'Conta',
      type: 'checking',
      initial_balance_cents: 100000,
      source: 'MANUAL',
      reported_balance_cents: null,
      archived: 0,
    } as unknown as FinAccount;
    const proj = projectCashflow([account], [stale], TODAY, '2026-12-31');
    expect(proj.endBalanceCents).toBe(100000);
    expect(proj.minBalanceCents).toBe(100000);
  });

  it('S91-T06: dois candidatos de mesmo valor, o que tem 04000000 vence (R18)', () => {
    const out = candidate({ id: 'out', external_id: 'x-out', account_id: 'acc-a', kind: 'expense', of_category_id: '05070000' });
    const inPlain = candidate({
      id: 'in-plain',
      external_id: 'x-plain',
      account_id: 'acc-b',
      kind: 'income',
      due_date: '2026-11-10',
    });
    const in04 = candidate({
      id: 'in-04',
      external_id: 'x-04',
      account_id: 'acc-c',
      kind: 'income',
      due_date: '2026-11-12',
      of_category_id: '04000000',
    });
    const pairs = findOwnTransferPairs([out, inPlain, in04], TODAY);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].outId).toBe('out');
    expect(pairs[0].inId).toBe('in-04');
    expect(pairs[0].transferGroupId).toBe('of-tr-x-out-x-04');
  });

  it('S91-T06b: sem 04, vence a menor diferença de datas; mesma conta, mais de 2 dias, valor diferente, editado ou fora de 40 dias não pareiam', () => {
    const out = candidate({ id: 'out', external_id: 'o', account_id: 'acc-a', kind: 'expense', due_date: '2026-11-10' });
    const far = candidate({ id: 'far', external_id: 'f', account_id: 'acc-b', kind: 'income', due_date: '2026-11-12' });
    const near = candidate({ id: 'near', external_id: 'n', account_id: 'acc-c', kind: 'income', due_date: '2026-11-11' });
    expect(findOwnTransferPairs([out, far, near], TODAY)[0].inId).toBe('near');

    const sameAcc = candidate({ id: 's', external_id: 's', account_id: 'acc-a', kind: 'income' });
    const tooFar = candidate({ id: 't', external_id: 't', account_id: 'acc-b', kind: 'income', due_date: '2026-11-13' });
    const otherValue = candidate({ id: 'v', external_id: 'v', account_id: 'acc-b', kind: 'income', amount_cents: 43280 });
    const edited = candidate({
      id: 'ed',
      external_id: 'ed',
      account_id: 'acc-b',
      kind: 'income',
      user_edited_fields: '["category_id"]',
    });
    expect(findOwnTransferPairs([out, sameAcc, tooFar, otherValue, edited], TODAY)).toHaveLength(0);

    const oldOut = candidate({ id: 'o2', external_id: 'o2', due_date: '2026-08-01' });
    const oldIn = candidate({ id: 'i2', external_id: 'i2', account_id: 'acc-b', kind: 'income', due_date: '2026-08-01' });
    expect(findOwnTransferPairs([oldOut, oldIn], TODAY)).toHaveLength(0);
  });

  it('S91-T06c: movimentação de investimento e lançamento já pareado não entram no pareamento', () => {
    const inv = candidate({ id: 'inv', external_id: 'inv', kind: 'transfer_out', of_class_reason: 'INVESTMENT_MOVE' });
    const back = candidate({ id: 'back', external_id: 'back', account_id: 'acc-b', kind: 'income' });
    expect(findOwnTransferPairs([inv, back], TODAY)).toHaveLength(0);

    const paired = candidate({ id: 'p', external_id: 'p', transfer_group_id: 'of-tr-old' });
    expect(findOwnTransferPairs([paired, back], TODAY)).toHaveLength(0);
  });

  it('S91-T07: "Pix enviado para <titular>" −2.000 com 04000000 e sem par => transfer_out OWN_ACCOUNT_UNPAIRED (R18)', () => {
    const res = classifyOpenFinanceBankEntry(
      tx({
        description: 'Pix enviado para MARIA TITULAR',
        amount: -2000,
        category: 'Same person transfer - PIX',
        categoryId: '04010000',
      }),
      { rules: [] }
    );
    expect(res.kind).toBe('transfer_out');
    expect(res.reason).toBe('OWN_ACCOUNT_UNPAIRED');
  });

  it('S91-T08: RENDIMENTOS DE CLIENTES MXRF11 S/ 606 com 04000000 continua income de provento (a ordem importa, R18)', () => {
    const res = classifyOpenFinanceBankEntry(
      tx({
        description: 'RENDIMENTOS DE CLIENTES MXRF11 S/ 606',
        amount: 60.6,
        type: 'CREDIT',
        category: 'Same person transfer',
        categoryId: '04000000',
      }),
      { rules: [], isIncomeLinked: true }
    );
    expect(res.kind).toBe('income');
    expect(res.reason).toBe('INCOME_LINKED');
  });

  it('S91-T10: categorias pelo prefixo do categoryId, regra do usuário prevalece, crédito com categoria de despesa vira Outros recebimentos (R20)', () => {
    const exp = (categoryId: string, category = 'X') =>
      resolveCategoryByPluggyId({ category, categoryId, kind: 'expense', rules: [], description: 'desc' }).categoryId;

    expect(exp('11010000', 'Eating out')).toBe('cat-alimentacao');
    expect(exp('11020000', 'Food delivery')).toBe('cat-alimentacao');
    expect(exp('19050001', 'Taxi and ride-hailing')).toBe('cat-transporte');
    expect(exp('07020001', 'Online Courses')).toBe('cat-educacao');
    expect(exp('07030001', 'Gyms and fitness centers')).toBe('cat-saude');
    expect(exp('07010001', 'Internet')).toBe('cat-assinaturas');
    expect(exp('08010000', 'Online shopping')).toBe('cat-compras');
    expect(exp('07000000', 'Services')).toBe('cat-servicos');
    expect(exp('10000000', 'Groceries')).toBe('cat-mercado');
    expect(exp('09010000', 'Gaming')).toBe('cat-assinaturas');
    expect(exp('18010000', 'Dentist')).toBe('cat-saude');
    expect(exp('17010000', 'Rent')).toBe('cat-moradia');
    expect(exp('12010000', 'Airport')).toBe('cat-lazer');
    expect(exp('14010000', 'Lottery')).toBe('cat-lazer');
    expect(exp('21000000', 'Leisure')).toBe('cat-lazer');
    expect(exp('99000000', 'Desconhecida')).toBe('cat-outros-despesa');
    expect(exp('', 'Eating out')).toBe('cat-outros-despesa');

    const income = resolveCategoryByPluggyId({
      category: 'Groceries',
      categoryId: '10000000',
      kind: 'income',
      rules: [],
      description: 'Transferência Recebida',
    });
    expect(income.categoryId).toBe('cat-outros-receita');

    const salary = resolveCategoryByPluggyId({
      category: 'Salary',
      categoryId: '01010000',
      kind: 'income',
      rules: [],
      description: 'Salário',
    });
    expect(salary.categoryId).toBe('cat-salario');

    const withRule = resolveCategoryByPluggyId({
      category: 'Eating out',
      categoryId: '11010000',
      kind: 'expense',
      rules: [
        {
          id: 'rule-1',
          match_type: 'contains',
          pattern: 'padaria do ze',
          kind: 'expense',
          category_id: 'cat-lazer',
        } as any,
      ],
      description: 'PADARIA DO ZE',
    });
    expect(withRule.categoryId).toBe('cat-lazer');
    expect(withRule.matchedRuleId).toBe('rule-1');
  });

  it('S91-T10b: o cartão continua como está, mas ganha a categoria por categoryId (despesa 11010000 => cat-alimentacao)', () => {
    const mapped = mapPluggyTransaction(
      tx({ id: 'card-1', description: 'RESTAURANTE', amount: 42, type: 'DEBIT', category: 'Eating out', categoryId: '11010000' }),
      { accountId: 'card-acc', accountType: 'card', rules: [] }
    );
    expect(mapped.kind).toBe('expense');
    expect(mapped.categoryId).toBe('cat-alimentacao');
  });
});
