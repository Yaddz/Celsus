import type { FinEntry } from '../../db/schema';
import {
  isAppManagedCashAccount,
  isAppTransferMatchCandidate,
  isAutomaticSweep,
  isBrokerSettlementDescription,
  matchBrokerSettlement,
  monthSummary,
} from '../financeFlow';
import { classifyOpenFinanceBankEntry } from '../openFinance/classification';

let seq = 0;
function entry(overrides: Partial<FinEntry>): FinEntry {
  seq += 1;
  return {
    id: `e-${seq}`,
    kind: 'expense',
    amount_cents: 0,
    due_date: '2026-11-10',
    paid_date: '2026-11-10',
    paid_amount_cents: null,
    status: 'paid',
    account_id: 'acc-bank',
    category_id: 'cat-outros-despesa',
    description: 'x',
    transfer_group_id: null,
    source: 'OPEN_FINANCE',
    linked_transaction_id: null,
    linked_income_id: null,
    of_removed_at: null,
    of_class_reason: null,
    of_link_restore: null,
    created_at: '2026-11-10T00:00:00.000Z',
    ...overrides,
  } as unknown as FinEntry;
}

const BROKER = 'acc-broker';
const BANK = 'acc-bank';
const ACCOUNTS = [
  { id: BROKER, type: 'checking' },
  { id: BANK, type: 'checking' },
] as Array<{ id: string; type: 'checking' }>;

function summarize(entries: FinEntry[], ym = '2026-11') {
  return monthSummary(entries, ym, {
    todayIso: '2026-11-17',
    accounts: ACCOUNTS as never,
    linkedAccountIds: [BROKER],
  });
}

describe('Sprint 116 — domínio: dinheiro real da corretora (W1, W2, W5)', () => {
  test('S116-T01 (W2c): isAutomaticSweep reconhece aplicação/resgate automático e nada mais', () => {
    expect(isAutomaticSweep('CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA')).toBe(true);
    expect(isAutomaticSweep('Conta Remunerada - Aplicação Automática')).toBe(true);
    expect(isAutomaticSweep('CONTA REMUNERADA - RESGATE APLICAÇÃO')).toBe(true);
    expect(isAutomaticSweep('CONTA REMUNERADA - RESGATE REMUNERAÇÃO')).toBe(true);
    expect(isAutomaticSweep('LIQ BOLSA - VISTA BRUTO - PREGÃO: 06/11/2026')).toBe(false);
    expect(isAutomaticSweep('TED CORRETORA')).toBe(false);
    expect(isAutomaticSweep('Pix enviado para <contraparte>')).toBe(false);
    expect(isAutomaticSweep(null)).toBe(false);
    expect(isAutomaticSweep('')).toBe(false);
  });

  test('S116-T02 (W1a/b): isAppManagedCashAccount nega só conta Open Finance; isBrokerSettlementDescription reconhece a nota', () => {
    expect(isAppManagedCashAccount({ source: 'OPEN_FINANCE' })).toBe(false);
    expect(isAppManagedCashAccount({ source: 'MANUAL' })).toBe(true);
    expect(isAppManagedCashAccount(null)).toBe(true);

    expect(isBrokerSettlementDescription('LIQ BOLSA - VISTA BRUTO - PREGÃO: 06/11/2026')).toBe(true);
    expect(isBrokerSettlementDescription('Liq Bolsa - Vista Bruto - Pregão: 06/...')).toBe(true);
    expect(isBrokerSettlementDescription('OPERAÇÕES EM BOLSA PR 22/12/2025 NOTA...')).toBe(true);
    expect(isBrokerSettlementDescription('CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA')).toBe(false);
    expect(isBrokerSettlementDescription('Pix enviado para <contraparte>')).toBe(false);
  });

  describe('W1b — matchBrokerSettlement', () => {
    const settlement = entry({
      id: 'liq-bruto',
      account_id: BROKER,
      kind: 'transfer_out',
      amount_cents: 62_309,
      paid_amount_cents: 62_309,
      due_date: '2026-11-10',
      description: 'Liq Bolsa - Vista Bruto - Pregão: 06/...',
      of_class_reason: 'INVESTMENT_MOVE',
    });
    const fees = [
      entry({ id: 'tx-emol', account_id: BROKER, kind: 'transfer_out', amount_cents: 3, due_date: '2026-11-10', description: 'Liq Bolsa - Vista Tx Emol B3 - Pregão...', of_class_reason: 'INVESTMENT_MOVE' }),
      entry({ id: 'tx-tta', account_id: BROKER, kind: 'transfer_out', amount_cents: 1, due_date: '2026-11-10', description: 'Liq Bolsa - Vista Tx Tta B3 - Pregão...', of_class_reason: 'INVESTMENT_MOVE' }),
      entry({ id: 'tx-ccp', account_id: BROKER, kind: 'transfer_out', amount_cents: 13, due_date: '2026-11-10', description: 'Liq Bolsa - Vista Tx Ccp B3 - Pregão...', of_class_reason: 'INVESTMENT_MOVE' }),
    ];

    test('S116-T03: casa pela soma das compras do pregão (−623,09 + taxas −0,17) dentro de +4 dias úteis', () => {
      const all = [settlement, ...fees];
      // sexta 06/11 → liquidação terça 10/11
      expect(matchBrokerSettlement(all, { accountId: BROKER, tradeDate: '2026-11-06', netCents: 62_309 })?.id).toBe('liq-bruto');
      // soma das compras já com as taxas B3 (623,09 + 0,17 = 623,26): tolerância = taxas do pregão
      expect(matchBrokerSettlement(all, { accountId: BROKER, tradeDate: '2026-11-06', netCents: 62_326 })?.id).toBe('liq-bruto');
    });

    test('S116-T04: não casa fora da janela, fora da tolerância, em outra conta, já ligada ou com sentido oposto', () => {
      const all = [settlement, ...fees];
      // antes da data da compra
      expect(matchBrokerSettlement(all, { accountId: BROKER, tradeDate: '2026-11-11', netCents: 62_309 })).toBeNull();
      // pregão de 02/11 (segunda): a liquidação de 10/11 está a 6 dias úteis, além dos +4 permitidos
      expect(matchBrokerSettlement(all, { accountId: BROKER, tradeDate: '2026-11-02', netCents: 62_309 })).toBeNull();
      // valor muito diferente
      expect(matchBrokerSettlement(all, { accountId: BROKER, tradeDate: '2026-11-06', netCents: 50_000 })).toBeNull();
      // outra conta
      expect(matchBrokerSettlement(all, { accountId: BANK, tradeDate: '2026-11-06', netCents: 62_309 })).toBeNull();
      // já ligada
      const linked = { ...settlement, linked_transaction_id: 'tx-1' } as FinEntry;
      expect(matchBrokerSettlement([linked, ...fees], { accountId: BROKER, tradeDate: '2026-11-06', netCents: 62_309 })).toBeNull();
      // venda líquida procura crédito, não débito
      expect(matchBrokerSettlement(all, { accountId: BROKER, tradeDate: '2026-11-06', netCents: -62_309 })).toBeNull();
      // lançamento que não é liquidação (aplicação automática) nunca casa
      const sweep = entry({ account_id: BROKER, kind: 'transfer_out', amount_cents: 22_717, due_date: '2026-11-07', description: 'Conta Remunerada - Aplicação Automática', of_class_reason: 'INVESTMENT_MOVE' });
      expect(matchBrokerSettlement([sweep], { accountId: BROKER, tradeDate: '2026-11-06', netCents: 22_717 })).toBeNull();
    });

    test('S116-T05: venda líquida casa com crédito de liquidação', () => {
      const credit = entry({
        id: 'liq-credito',
        account_id: BROKER,
        kind: 'transfer_in',
        amount_cents: 30_000,
        due_date: '2026-11-10',
        description: 'Liq Bolsa - Vista Bruto - Pregão: 06/...',
        of_class_reason: 'INVESTMENT_MOVE',
      });
      expect(matchBrokerSettlement([credit], { accountId: BROKER, tradeDate: '2026-11-06', netCents: -30_000 })?.id).toBe('liq-credito');
    });
  });

  describe('W2 — monthSummary: aporte só do que passou de conta não de investimento para investimento', () => {
    test('S116-T06 (b/c): liquidação, taxas B3, aplicação e resgate automáticos dentro da conta de investimento não contam', () => {
      const entries = [
        entry({ account_id: BROKER, kind: 'transfer_out', amount_cents: 22_717, due_date: '2026-11-07', description: 'Conta Remunerada - Aplicação Automática', of_class_reason: 'INVESTMENT_MOVE' }),
        entry({ account_id: BROKER, kind: 'transfer_out', amount_cents: 62_309, due_date: '2026-11-10', description: 'Liq Bolsa - Vista Bruto - Pregão: 06/...', of_class_reason: 'INVESTMENT_MOVE' }),
        entry({ account_id: BROKER, kind: 'transfer_out', amount_cents: 17, due_date: '2026-11-10', description: 'Liq Bolsa - Vista Tx Emol B3', of_class_reason: 'INVESTMENT_MOVE' }),
        entry({ account_id: BROKER, kind: 'transfer_in', amount_cents: 22_489, due_date: '2026-11-11', description: 'Conta Remunerada - Resgate Aplicação', of_class_reason: 'INVESTMENT_MOVE' }),
        entry({ account_id: BROKER, kind: 'transfer_in', amount_cents: 39_836, due_date: '2026-11-11', description: 'Conta Remunerada - Resgate Aplicação', of_class_reason: 'INVESTMENT_MOVE' }),
      ];
      const s = summarize(entries);
      expect(s.contributionCents).toBe(0);
      expect(s.expenseCents).toBe(0);
      expect(s.incomeCents).toBe(0);
    });

    test('S116-T07 (b): TED de R$ 1.000 da conta corrente para a corretora (par of-tr-) soma 1.000; resgate de volta subtrai', () => {
      const tedOut = entry({ account_id: BANK, kind: 'transfer_out', amount_cents: 100_000, transfer_group_id: 'of-tr-a-b', description: 'TED', of_class_reason: 'OWN_ACCOUNT_PAIRED' });
      const tedIn = entry({ account_id: BROKER, kind: 'transfer_in', amount_cents: 100_000, transfer_group_id: 'of-tr-a-b', description: 'TED', of_class_reason: 'OWN_ACCOUNT_PAIRED' });
      expect(summarize([tedOut, tedIn]).contributionCents).toBe(100_000);

      const backOut = entry({ account_id: BROKER, kind: 'transfer_out', amount_cents: 40_000, transfer_group_id: 'of-tr-c-d', description: 'TED', of_class_reason: 'OWN_ACCOUNT_PAIRED' });
      const backIn = entry({ account_id: BANK, kind: 'transfer_in', amount_cents: 40_000, transfer_group_id: 'of-tr-c-d', description: 'TED', of_class_reason: 'OWN_ACCOUNT_PAIRED' });
      expect(summarize([tedOut, tedIn, backOut, backIn]).contributionCents).toBe(60_000);
    });

    test('S116-T08 (b/c): aplicação e resgate automáticos em conta que NÃO é de investimento valem 0', () => {
      const entries = [
        entry({ account_id: BANK, kind: 'transfer_out', amount_cents: 39_836, description: 'Conta Remunerada - Aplicação Automática', of_class_reason: 'INVESTMENT_MOVE' }),
        entry({ account_id: BANK, kind: 'transfer_in', amount_cents: 70_000, description: 'Conta Remunerada - Resgate Aplicação', of_class_reason: 'INVESTMENT_MOVE' }),
        entry({ account_id: BANK, kind: 'income', amount_cents: 41, description: 'Conta Remunerada - Resgate Remuneração', of_class_reason: 'SIGN' }),
      ];
      expect(summarize(entries).contributionCents).toBe(0);
    });

    test('S116-T09 (b): saída OF INVESTMENT_MOVE sem par em conta não de investimento soma; crédito sem par subtrai (exceto resgate automático)', () => {
      const out = entry({ account_id: BANK, kind: 'transfer_out', amount_cents: 80_000, description: 'TED CORRETORA', of_class_reason: 'INVESTMENT_MOVE' });
      expect(summarize([out]).contributionCents).toBe(80_000);
      const legacyExpense = entry({ account_id: BANK, kind: 'expense', amount_cents: 80_000, description: 'TED CORRETORA', of_class_reason: 'INVESTMENT_MOVE' });
      expect(summarize([legacyExpense]).contributionCents).toBe(80_000);
      expect(summarize([legacyExpense]).expenseCents).toBe(0);

      const credit = entry({ account_id: BANK, kind: 'transfer_in', amount_cents: 30_000, description: 'RESGATE CORRETORA', of_class_reason: 'INVESTMENT_MOVE' });
      expect(summarize([out, credit]).contributionCents).toBe(50_000);
    });

    test('S116-T10 (b): transfer_in/out criados pelo app entre conta comum e conta de investimento seguem contando', () => {
      const out = entry({ account_id: BANK, source: 'MANUAL', kind: 'transfer_out', amount_cents: 150_000, transfer_group_id: 'tr-1', description: 'Aporte' });
      const inn = entry({ account_id: BROKER, source: 'MANUAL', kind: 'transfer_in', amount_cents: 150_000, transfer_group_id: 'tr-1', description: 'Aporte' });
      const buy = entry({ account_id: BROKER, source: 'MANUAL', kind: 'investment_buy', amount_cents: 150_000, description: 'Compra X' });
      expect(summarize([out, inn, buy]).contributionCents).toBe(150_000);
      const back = entry({ account_id: BROKER, source: 'MANUAL', kind: 'transfer_out', amount_cents: 50_000, transfer_group_id: 'tr-2', description: 'Resgate' });
      const backIn = entry({ account_id: BANK, source: 'MANUAL', kind: 'transfer_in', amount_cents: 50_000, transfer_group_id: 'tr-2', description: 'Resgate' });
      expect(summarize([out, inn, buy, back, backIn]).contributionCents).toBe(100_000);
    });
  });

  describe('W2d — classificação não manda movimento de investimento para despesa/receita', () => {
    const cases: Array<[string, number, string]> = [
      ['CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA', -227.17, '03000000'],
      ['CONTA REMUNERADA - RESGATE APLICAÇÃO', 224.89, '03000000'],
      ['LIQ BOLSA - VISTA BRUTO - PREGÃO: 06/11/2026', -623.09, '03000000'],
      ['LIQ BOLSA - VISTA TX CCP B3 - PREGÃO: 06/11/2026', -0.13, '03000000'],
      ['OPERAÇÕES EM BOLSA PR 22/12/2025 NOTA 123', -1097.42, '03000000'],
    ];
    test.each(cases)('S116-T11: %s vira transferência INVESTMENT_MOVE', (description, amount, categoryId) => {
      const r = classifyOpenFinanceBankEntry({
        description,
        descriptionRaw: description,
        category: 'Investments',
        categoryId,
        type: amount < 0 ? 'DEBIT' : 'CREDIT',
        amount,
      });
      expect(r.reason).toBe('INVESTMENT_MOVE');
      expect(r.kind).toBe(amount < 0 ? 'transfer_out' : 'transfer_in');
    });
  });

  describe('W5 — casamento inverso só com movimento de investimento', () => {
    test('S116-T12: INVESTMENT_MOVE e conta própria candidatam; PIX comum e aplicação automática não', () => {
      const base = { accountType: 'checking', transferGroupId: null as string | null };
      expect(isAppTransferMatchCandidate({ ...base, kind: 'transfer_out', classReason: 'INVESTMENT_MOVE', description: 'TED CORRETORA' })).toBe(true);
      expect(isAppTransferMatchCandidate({ ...base, kind: 'expense', classReason: 'INVESTMENT_MOVE', description: 'TED CORRETORA' })).toBe(true);
      expect(isAppTransferMatchCandidate({ ...base, kind: 'transfer_out', classReason: 'OWN_ACCOUNT_UNPAIRED', description: 'TED para minha conta' })).toBe(true);
      // PIX de mesmo valor para outra pessoa (transfer_out sem grupo e sem motivo de investimento/conta própria)
      expect(isAppTransferMatchCandidate({ ...base, kind: 'transfer_out', classReason: 'SIGN', description: 'Pix enviado para <contraparte>' })).toBe(false);
      expect(isAppTransferMatchCandidate({ ...base, kind: 'transfer_out', classReason: null, description: 'Pix enviado' })).toBe(false);
      // aplicação automática da conta remunerada nunca substitui transferência do app
      expect(isAppTransferMatchCandidate({ ...base, kind: 'transfer_out', classReason: 'INVESTMENT_MOVE', description: 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA' })).toBe(false);
      // cartão nunca
      expect(isAppTransferMatchCandidate({ accountType: 'card', transferGroupId: null, kind: 'transfer_out', classReason: 'INVESTMENT_MOVE', description: 'x' })).toBe(false);
    });
  });
});
