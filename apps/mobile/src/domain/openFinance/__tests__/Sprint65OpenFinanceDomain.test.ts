import {
  applyUserEditedPreservation,
  computeBalanceDivergence,
  computeSyncWindowStart,
  formatReportedBalanceDate,
  formatUpdatedAgo,
  mapPluggyAccount,
  mapPluggyCategory,
  mapPluggyTransaction,
  mergeUserEditedFields,
  parseUserEditedFields,
  reconcilePluggyTransactions,
  shouldAutoSync,
  toCentsDecimal,
} from '../index';
import type { PluggyAccount, PluggyBill, PluggyTransaction } from '../../../services/pluggy/types';
import type { CategoryRuleLike } from '../../statementImport';

describe('Sprint 65 — Domínio Open Finance (Fase A)', () => {
  test('S65-D01: toCentsDecimal usa arredondamento decimal seguro sem erros de ponto flutuante', () => {
    expect(toCentsDecimal(19.99)).toBe(1999);
    expect(toCentsDecimal(4520.5)).toBe(452050);
    expect(toCentsDecimal(1.005)).toBe(101);
    expect(toCentsDecimal(-123.45)).toBe(-12345);
    expect(toCentsDecimal('0.14')).toBe(14);
  });

  test('S65-D02: mapPluggyAccount mapeia BANK -> checking e CREDIT -> card com creditData e sem inventar closing_day nulo', () => {
    const bankAcc: PluggyAccount = {
      id: 'pg-bank-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      number: '12345-6',
      name: 'Conta Corrente',
      marketingName: 'Itaú Uniclass',
      balance: 4520.5,
      itemId: 'item-1',
      currencyCode: 'BRL',
      createdAt: '2026-01-10T12:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
    };

    const mappedBank = mapPluggyAccount(bankAcc);
    expect(mappedBank).toMatchObject({
      ofAccountId: 'pg-bank-1',
      name: 'Conta corrente ·· 3456',
      type: 'checking',
      source: 'OPEN_FINANCE',
      reportedBalanceCents: 452050,
      reportedBalanceAt: '2026-11-16T10:00:00.000Z',
      creditLimitCents: null,
      dueDay: null,
      closingDay: null,
      needsClosingDay: false,
    });

    const cardWithNullClose: PluggyAccount = {
      id: 'pg-card-1',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      number: '**** 4321',
      name: 'Cartão Black',
      balance: 1890.25,
      itemId: 'item-1',
      currencyCode: 'BRL',
      creditData: {
        balanceCloseDate: null,
        balanceDueDate: '2026-11-20T00:00:00.000Z',
        creditLimit: 10000.0,
        availableCreditLimit: 8109.75,
      },
      createdAt: '2026-01-10T12:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
    };

    const mappedCardNullClose = mapPluggyAccount(cardWithNullClose);
    expect(mappedCardNullClose).toMatchObject({
      ofAccountId: 'pg-card-1',
      type: 'card',
      source: 'OPEN_FINANCE',
      reportedBalanceCents: 189025, // limite usado
      creditLimitCents: 1000000,
      dueDay: 20,
      closingDay: null, // nunca inventar!
      needsClosingDay: true,
    });

    const cardWithClose: PluggyAccount = {
      ...cardWithNullClose,
      id: 'pg-card-2',
      creditData: {
        ...cardWithNullClose.creditData!,
        balanceCloseDate: '2026-11-10T00:00:00.000Z',
      },
    };
    const mappedCardWithClose = mapPluggyAccount(cardWithClose);
    expect(mappedCardWithClose.closingDay).toBe(10);
    expect(mappedCardWithClose.needsClosingDay).toBe(false);
  });

  test('S65-D03: mapPluggyTransaction trata POSTED/PENDING, sinais em cartão (positivo=despesa, negativo=estorno/pagamento), parcelas e descriptionRaw', () => {
    const bills: PluggyBill[] = [
      {
        id: 'bill-2026-12',
        dueDate: '2026-12-20T00:00:00.000Z',
        billClosingDate: '2026-12-10T00:00:00.000Z',
        totalAmount: 1500,
        totalAmountCurrencyCode: 'BRL',
      },
    ];

    const cardExpenseTx: PluggyTransaction = {
      id: 'tx-card-1',
      description: 'AMAZON BR',
      descriptionRaw: 'AMAZON.COM.BR*12345 SAO PAULO',
      currencyCode: 'BRL',
      amount: 199.9,
      date: '2026-11-15T14:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      category: 'Shopping',
      creditCardMetadata: {
        installmentNumber: 2,
        totalInstallments: 6,
        billId: 'bill-2026-12',
      },
      accountId: 'pg-card-1',
      createdAt: '2026-11-15T14:00:00.000Z',
      updatedAt: '2026-11-15T14:00:00.000Z',
    };

    const mappedExpense = mapPluggyTransaction(cardExpenseTx, {
      accountId: 'local-card-1',
      accountType: 'card',
      closingDay: 10,
      bills,
      rules: [],
    });

    expect(mappedExpense).toMatchObject({
      externalId: 'tx-card-1',
      source: 'OPEN_FINANCE',
      accountId: 'local-card-1',
      kind: 'expense',
      status: 'paid',
      amountCents: 19990,
      dueDate: '2026-11-15',
      paidDate: '2026-11-15',
      paidAmountCents: 19990,
      description: 'Amazon BR',
      descriptionRaw: 'AMAZON.COM.BR*12345 SAO PAULO',
      installmentNumber: 2,
      installmentTotal: 6,
      billId: 'bill-2026-12',
      billMonth: '2026-12',
    });

    const cardRefundPendingTx: PluggyTransaction = {
      id: 'tx-card-2',
      description: 'ESTORNO AMAZON',
      descriptionRaw: 'ESTORNO AMAZON.COM.BR',
      currencyCode: 'BRL',
      amount: -50.25,
      date: '2026-11-16T09:00:00.000Z',
      type: 'CREDIT',
      status: 'PENDING',
      category: null,
      accountId: 'pg-card-1',
      createdAt: '2026-11-16T09:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    };

    const mappedRefund = mapPluggyTransaction(cardRefundPendingTx, {
      accountId: 'local-card-1',
      accountType: 'card',
      closingDay: 10,
      bills,
      rules: [],
    });

    expect(mappedRefund).toMatchObject({
      externalId: 'tx-card-2',
      kind: 'income',
      status: 'paid',
      amountCents: 5025,
      paidDate: '2026-11-16',
      paidAmountCents: 5025,
      description: 'Estorno Amazon',
      descriptionRaw: 'ESTORNO AMAZON.COM.BR',
    });
  });

  test('S65-D04: mapPluggyCategory prioriza 1º regras locais, 2º de-para Pluggy nível 1, 3º Outros (inclusive quando category é null)', () => {
    const rules: CategoryRuleLike[] = [
      {
        id: 'rule-1',
        match_type: 'contains',
        pattern: 'uber',
        kind: 'expense',
        category_id: 'cat-transporte',
        hits: 3,
      },
    ];

    // 1º: Regra local ganha mesmo se Pluggy vier com outra categoria
    const byRule = mapPluggyCategory('Entertainment', 'expense', rules, 'UBER *TRIP');
    expect(byRule.categoryId).toBe('cat-transporte');
    expect(byRule.matchedRuleId).toBe('rule-1');

    // 2º: De-para Pluggy nível 1 quando sem regra local
    expect(mapPluggyCategory('Groceries', 'expense', rules, 'MERCADINHO XYZ').categoryId).toBe(
      'cat-mercado'
    );
    expect(mapPluggyCategory('Health', 'expense', rules, 'CONSULTA MEDICA').categoryId).toBe(
      'cat-saude'
    );
    expect(mapPluggyCategory('Salary', 'income', rules, 'PAGAMENTO EMPRESA').categoryId).toBe(
      'cat-salario'
    );

    // 3º: Null (caso normal fora do trial) ou desconhecida -> Outros
    expect(mapPluggyCategory(null, 'expense', rules, 'COMPRA QUALQUER').categoryId).toBe(
      'cat-outros-despesa'
    );
    expect(mapPluggyCategory(null, 'income', rules, 'PIX RECEBIDO').categoryId).toBe(
      'cat-outros-receita'
    );
  });

  test('S65-D05: reconcilePluggyTransactions — external_id (positivo e negativo)', () => {
    const existing = [
      {
        id: 'entry-1',
        account_id: 'acc-1',
        external_id: 'pg-tx-1',
        amount_cents: 10000,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-10',
        category_id: 'cat-outros-despesa',
        description: 'Compra X',
      },
    ];

    const mapped = [
      mapPluggyTransaction(
        {
          id: 'pg-tx-1',
          description: 'Compra X',
          currencyCode: 'BRL',
          amount: -100,
          date: '2026-11-10T10:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          accountId: 'pg-1',
          createdAt: '2026-11-10T10:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z',
        },
        { accountId: 'acc-1', accountType: 'checking' }
      ),
      mapPluggyTransaction(
        {
          id: 'pg-tx-2',
          description: 'Compra Y',
          currencyCode: 'BRL',
          amount: -50,
          date: '2026-11-11T10:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          accountId: 'pg-1',
          createdAt: '2026-11-11T10:00:00.000Z',
          updatedAt: '2026-11-11T10:00:00.000Z',
        },
        { accountId: 'acc-1', accountType: 'checking' }
      ),
    ];

    const res = reconcilePluggyTransactions(mapped, existing);
    expect(res.transactions[0].action).toBe('update'); // positivo
    expect(res.transactions[0].matchedEntryId).toBe('entry-1');
    expect(res.transactions[1].action).toBe('create'); // negativo (external_id diferente)
  });

  test('S65-D06: reconcilePluggyTransactions — pendente manual/recorrência exato e ±15% variable_amount (positivo e negativo)', () => {
    const existing = [
      {
        id: 'pend-exact',
        account_id: 'acc-1',
        external_id: null,
        amount_cents: 10000,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-10',
        category_id: 'cat-moradia',
        description: 'Internet',
        variable_amount: 0,
      },
      {
        id: 'pend-var',
        account_id: 'acc-1',
        external_id: null,
        amount_cents: 20000, // ±15% = 17000..23000
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-12',
        category_id: 'cat-moradia',
        description: 'Luz',
        recurrence_id: 'rec-luz',
        variable_amount: 1,
      },
      {
        id: 'pend-far-date',
        account_id: 'acc-1',
        external_id: null,
        amount_cents: 5000,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-01', // > 5 dias de 2026-11-10
        category_id: 'cat-assinaturas',
        description: 'Streaming',
        variable_amount: 0,
      },
    ];

    const makeTx = (id: string, amount: number, date: string, desc: string): PluggyTransaction => ({
      id,
      description: desc,
      currencyCode: 'BRL',
      amount,
      date: `${date}T12:00:00.000Z`,
      type: 'DEBIT',
      status: 'POSTED',
      accountId: 'pg-1',
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
    });

    const mapped = [
      // Positivo exato dentro de 5 dias (diff 3 dias)
      mapPluggyTransaction(makeTx('tx-1', -100, '2026-11-13', 'INTERNET FIBRA'), {
        accountId: 'acc-1',
        accountType: 'checking',
      }),
      // Positivo variable_amount=1 dentro de ±15% (+12% -> 22400)
      mapPluggyTransaction(makeTx('tx-2', -224, '2026-11-14', 'ENEL ENERGIA'), {
        accountId: 'acc-1',
        accountType: 'checking',
      }),
      // Negativo: > 5 dias de distância (pend-far-date é 2026-11-01, tx é 2026-11-10 -> 9 dias)
      mapPluggyTransaction(makeTx('tx-3', -50, '2026-11-10', 'STREAMING'), {
        accountId: 'acc-1',
        accountType: 'checking',
      }),
      // Negativo: fora da tolerância de ±15% (se pend-var já foi usado, e mesmo se não fosse, 250 > 230)
      mapPluggyTransaction(makeTx('tx-4', -250, '2026-11-12', 'OUTRA CONTA'), {
        accountId: 'acc-1',
        accountType: 'checking',
      }),
    ];

    const res = reconcilePluggyTransactions(mapped, existing);
    expect(res.transactions[0]).toMatchObject({ action: 'settle_pending', matchedEntryId: 'pend-exact' });
    expect(res.transactions[1]).toMatchObject({ action: 'settle_pending', matchedEntryId: 'pend-var' });
    expect(res.transactions[2].action).toBe('create');
    expect(res.transactions[3].action).toBe('create');
  });

  test('S65-D07: reconcilePluggyTransactions — par de transferência entre contas próprias (≤ 2 dias) e pagamento de fatura conta/cartão (positivo e negativo)', () => {
    const makeTx = (
      id: string,
      accountId: string,
      amount: number,
      date: string,
      type: 'DEBIT' | 'CREDIT'
    ): PluggyTransaction => ({
      id,
      description: `Mov ${id}`,
      currencyCode: 'BRL',
      amount,
      date: `${date}T12:00:00.000Z`,
      type,
      status: 'POSTED',
      accountId,
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
    });

    const mapped = [
      // Par positivo 1: checking A -> checking B (1 dia de diferença, R$ 500)
      mapPluggyTransaction(makeTx('tx-out-1', 'pg-a', -500, '2026-11-10', 'DEBIT'), {
        accountId: 'acc-a',
        accountType: 'checking',
      }),
      mapPluggyTransaction(makeTx('tx-in-1', 'pg-b', 500, '2026-11-11', 'CREDIT'), {
        accountId: 'acc-b',
        accountType: 'checking',
      }),
      // Par positivo 2: pagamento de fatura (checking A débito R$ 1200 + cartão C pagamento -1200 em 2 dias)
      mapPluggyTransaction(makeTx('tx-bill-pay', 'pg-a', -1200, '2026-11-15', 'DEBIT'), {
        accountId: 'acc-a',
        accountType: 'checking',
      }),
      mapPluggyTransaction(makeTx('tx-card-pay', 'pg-c', -1200, '2026-11-16', 'CREDIT'), {
        accountId: 'acc-card',
        accountType: 'card',
      }),
      // Par negativo: 4 dias de diferença (> 2 dias) NÃO casa como transferência
      mapPluggyTransaction(makeTx('tx-far-out', 'pg-a', -300, '2026-11-01', 'DEBIT'), {
        accountId: 'acc-a',
        accountType: 'checking',
      }),
      mapPluggyTransaction(makeTx('tx-far-in', 'pg-b', 300, '2026-11-05', 'CREDIT'), {
        accountId: 'acc-b',
        accountType: 'checking',
      }),
    ];

    const res = reconcilePluggyTransactions(mapped, [], {
      accountTypesById: {
        'acc-a': 'checking',
        'acc-b': 'checking',
        'acc-card': 'card',
      },
    });

    expect(res.transferPairs).toHaveLength(2);
    const checkingPair = res.transferPairs.find((p) => p.outExternalId === 'tx-out-1');
    expect(checkingPair).toBeDefined();
    expect(checkingPair?.inExternalId).toBe('tx-in-1');
    expect(checkingPair?.isBillPayment).toBe(false);

    const billPair = res.transferPairs.find((p) => p.outExternalId === 'tx-bill-pay');
    expect(billPair).toBeDefined();
    expect(billPair?.inExternalId).toBe('tx-card-pay');
    expect(billPair?.isBillPayment).toBe(true);

    const txFarOut = res.transactions.find((t) => t.externalId === 'tx-far-out');
    const txFarIn = res.transactions.find((t) => t.externalId === 'tx-far-in');
    expect(txFarOut?.transferGroupId).toBeUndefined();
    expect(txFarIn?.transferGroupId).toBeUndefined();
  });

  test('S65-D08: preservação de edição manual (user_edited_fields) e helpers de janela/saldo/tempo', () => {
    const merged = mergeUserEditedFields(null, ['category_id']);
    const merged2 = mergeUserEditedFields(merged, ['description', 'category_id']);
    expect(parseUserEditedFields(merged2)).toEqual(['category_id', 'description']);

    const preserved = applyUserEditedPreservation(
      {
        category_id: 'cat-lazer',
        description: 'Jantar com amigos',
        user_edited_fields: merged2,
      },
      {
        category_id: 'cat-outros-despesa',
        description: 'PAG*RESTAURANTE XYZ',
      }
    );
    expect(preserved).toEqual({
      category_id: 'cat-lazer',
      description: 'Jantar com amigos',
    });

    // Janela de sync: primeira vez = 12 meses; com último sucesso = último sucesso - 7 dias
    const nowIso = '2026-11-16T12:00:00.000Z';
    expect(computeSyncWindowStart(null, nowIso)).toBe('2025-11-16');
    expect(computeSyncWindowStart('2026-11-10T10:00:00.000Z', nowIso)).toBe('2026-11-03');

    // Auto-sync > 12h
    const nowMs = Date.parse('2026-11-16T12:00:00.000Z');
    expect(shouldAutoSync(null, nowMs)).toBe(true);
    expect(shouldAutoSync('2026-11-15T23:00:00.000Z', nowMs)).toBe(true); // 13h
    expect(shouldAutoSync('2026-11-16T02:00:00.000Z', nowMs)).toBe(false); // 10h

    // Divergência e formatações
    expect(computeBalanceDivergence(452050, 450000)).toEqual({
      hasDivergence: true,
      diffCents: 2050,
    });
    expect(computeBalanceDivergence(452050, 452050)).toEqual({
      hasDivergence: false,
      diffCents: 0,
    });
    expect(formatReportedBalanceDate('2026-11-16T10:00:00.000Z')).toBe('saldo de 16/11');
    expect(formatUpdatedAgo('2026-11-16T09:00:00.000Z', nowMs)).toBe('Atualizado há 3 h');
  });
});
