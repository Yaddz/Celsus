import type { PluggyTransaction } from '../../services/pluggy/types';
import { applyCategoryRules, type CategoryRuleLike } from '../statementImport';
import { openFinanceWindowStart } from './stalePending';

export { isStaleOpenFinancePending, openFinanceWindowStart, OPEN_FINANCE_WINDOW_DAYS } from './stalePending';

export type OpenFinanceClassReason =
  | 'INCOME_LINKED'
  | 'INVESTMENT_MOVE'
  | 'OWN_ACCOUNT_UNPAIRED'
  | 'OWN_ACCOUNT_PAIRED'
  | 'CARD_TOPUP'
  | 'CARD_BILL_PAYMENT'
  | 'SIGN';

export interface ClassifyContext {
  rules?: CategoryRuleLike[];
  /** Crédito já reconhecido como provento (R9/R15): tem precedência sobre qualquer outra regra. */
  isIncomeLinked?: boolean;
}

export interface ClassifyResult {
  kind: 'income' | 'expense' | 'transfer_in' | 'transfer_out';
  categoryId: string;
  matchedRuleId?: string;
  reason: OpenFinanceClassReason;
}

export function normalizeKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------- R20: categorias

const PLUGGY_L1_EXPENSE_CATEGORY_MAP: Record<string, string> = {
  groceries: 'cat-mercado',
  supermarket: 'cat-mercado',
  supermercado: 'cat-mercado',
  'food and beverage': 'cat-mercado',
  alimentacao: 'cat-mercado',
  restaurants: 'cat-lazer',
  transportation: 'cat-transporte',
  transporte: 'cat-transporte',
  automotive: 'cat-transporte',
  health: 'cat-saude',
  healthcare: 'cat-saude',
  saude: 'cat-saude',
  pharmacy: 'cat-saude',
  entertainment: 'cat-lazer',
  leisure: 'cat-lazer',
  lazer: 'cat-lazer',
  travel: 'cat-lazer',
  shopping: 'cat-lazer',
  compras: 'cat-lazer',
  housing: 'cat-moradia',
  home: 'cat-moradia',
  moradia: 'cat-moradia',
  utilities: 'cat-moradia',
  bills: 'cat-moradia',
  contas: 'cat-moradia',
  subscriptions: 'cat-assinaturas',
  assinaturas: 'cat-assinaturas',
  telecom: 'cat-assinaturas',
  telecommunications: 'cat-assinaturas',
};

const PLUGGY_L1_INCOME_CATEGORY_MAP: Record<string, string> = {
  salary: 'cat-salario',
  salario: 'cat-salario',
  payroll: 'cat-salario',
  income: 'cat-outros-receita',
  receitas: 'cat-outros-receita',
};

/** Prefixos da árvore de categorias da Pluggy (dois dígitos por nível). O prefixo mais longo vence. */
const PLUGGY_ID_EXPENSE_PREFIXES: Array<[string, string]> = [
  ['0701', 'cat-assinaturas'],
  ['0702', 'cat-educacao'],
  ['0703', 'cat-saude'],
  ['07', 'cat-servicos'],
  ['08', 'cat-compras'],
  ['09', 'cat-assinaturas'],
  ['10', 'cat-mercado'],
  ['11', 'cat-alimentacao'],
  ['12', 'cat-lazer'],
  ['14', 'cat-lazer'],
  ['17', 'cat-moradia'],
  ['18', 'cat-saude'],
  ['19', 'cat-transporte'],
  ['21', 'cat-lazer'],
];

const PLUGGY_ID_INCOME_PREFIXES: Array<[string, string]> = [['0101', 'cat-salario']];

function categoryByPluggyId(
  categoryId: string | null | undefined,
  kind: 'income' | 'expense'
): string | null {
  const id = (categoryId ?? '').trim();
  if (!id) return null;
  const table = kind === 'income' ? PLUGGY_ID_INCOME_PREFIXES : PLUGGY_ID_EXPENSE_PREFIXES;
  let best: [string, string] | null = null;
  for (const entry of table) {
    if (id.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

/** Prioridade: regras do usuário → categoryId → nome da categoria → Outros. */
export function mapPluggyCategory(
  pluggyCategory: string | null | undefined,
  kind: 'income' | 'expense',
  rules: CategoryRuleLike[],
  description: string,
  pluggyCategoryId?: string | null
): { categoryId: string; matchedRuleId?: string } {
  const [ruleResult] = applyCategoryRules(
    [
      {
        date: '2026-01-01',
        description,
        amountCents: 100,
        direction: kind === 'income' ? 'in' : 'out',
        externalId: 'rule-probe',
      },
    ],
    rules
  );
  if (ruleResult?.matchedRuleId) {
    return { categoryId: ruleResult.categoryId, matchedRuleId: ruleResult.matchedRuleId };
  }

  const byId = categoryByPluggyId(pluggyCategoryId, kind);
  if (byId) return { categoryId: byId };

  if (pluggyCategory && pluggyCategory.trim()) {
    const key = normalizeKey(pluggyCategory);
    const map = kind === 'income' ? PLUGGY_L1_INCOME_CATEGORY_MAP : PLUGGY_L1_EXPENSE_CATEGORY_MAP;
    if (map[key]) return { categoryId: map[key] };
  }

  return { categoryId: kind === 'income' ? 'cat-outros-receita' : 'cat-outros-despesa' };
}

export function resolveCategoryByPluggyId(input: {
  category?: string | null;
  categoryId?: string | null;
  kind: 'income' | 'expense';
  rules: CategoryRuleLike[];
  description: string;
}): { categoryId: string; matchedRuleId?: string } {
  return mapPluggyCategory(input.category, input.kind, input.rules, input.description, input.categoryId);
}

// ---------------------------------------------------------------- pagamento de fatura

const CARD_PAYMENT_DESCRIPTION_RE =
  /\bpag(amento|to|mto)?\b.*\b(fatura|recebido|efetuado|realizado)\b|\bpayment received\b/;
const CARD_PAYMENT_CATEGORY_RE = /credit card payment|pagamento de cartao/;

/** Lançamento de crédito no cartão que representa o pagamento da fatura (e não um estorno). */
export function isCardBillPayment(tx: Pick<PluggyTransaction, 'description' | 'category'>): boolean {
  if (tx.category && CARD_PAYMENT_CATEGORY_RE.test(normalizeKey(tx.category))) return true;
  return CARD_PAYMENT_DESCRIPTION_RE.test(normalizeKey(tx.description ?? ''));
}

// ---------------------------------------------------------------- R17 / R18: classificação de conta

const INVESTMENT_DESCRIPTION_RE =
  /aplicacao automatica|resgate aplicacao|liq bolsa|operacoes em bolsa|\btx\s+(emol|tta|ccp)\b.*\bb3\b|\b(emol|tta|ccp)\b.*\bb3\b/;

export function isInvestmentMoveCategoryId(categoryId: string | null | undefined): boolean {
  const id = (categoryId ?? '').trim();
  return id.startsWith('03') && !id.startsWith('0306');
}

export function isOwnAccountCategoryId(categoryId: string | null | undefined): boolean {
  return (categoryId ?? '').trim().startsWith('04');
}

/**
 * Sprint 92: só lançamentos sem categoria ou com categoria de transferência (04 conta própria, 05 transferências)
 * podem formar par. Valor igual entre um gasto de restaurante e um salário é coincidência, não transferência.
 */
export function isTransferCompatibleCategoryId(categoryId: string | null | undefined): boolean {
  const id = (categoryId ?? '').trim();
  return !id || id.startsWith('04') || id.startsWith('05');
}

export function isInvestmentMoveDescription(description: string | null | undefined): boolean {
  return INVESTMENT_DESCRIPTION_RE.test(normalizeKey(description ?? ''));
}

/**
 * Classificação de um lançamento de conta (não cartão). Ordem da R18:
 * provento → investimento → conta própria → pagamento de fatura → sinal.
 * O pagamento de fatura debitado na conta continua sendo `expense` aqui: o pareamento com o crédito do cartão
 * (reconcilePluggyTransactions) é quem o converte em transferência.
 */
export function classifyOpenFinanceBankEntry(
  tx: Pick<PluggyTransaction, 'description' | 'descriptionRaw' | 'category' | 'categoryId' | 'type' | 'amount'> & {
    amountInAccountCurrency?: number | null;
  },
  ctx: ClassifyContext = {}
): ClassifyResult {
  const rules = ctx.rules ?? [];
  const rawAmount = tx.amountInAccountCurrency ?? tx.amount;
  const isDebit = tx.type === 'DEBIT' || rawAmount < 0;
  const signKind: 'income' | 'expense' = isDebit ? 'expense' : 'income';
  const description = tx.descriptionRaw ?? tx.description ?? '';
  const category = mapPluggyCategory(tx.category, signKind, rules, description, tx.categoryId);

  if (ctx.isIncomeLinked && !isDebit) {
    return { kind: 'income', categoryId: category.categoryId, matchedRuleId: category.matchedRuleId, reason: 'INCOME_LINKED' };
  }

  if (isInvestmentMoveCategoryId(tx.categoryId) || isInvestmentMoveDescription(`${tx.description ?? ''} ${description}`)) {
    return {
      kind: isDebit ? 'transfer_out' : 'transfer_in',
      categoryId: isDebit ? 'cat-outros-despesa' : 'cat-outros-receita',
      reason: 'INVESTMENT_MOVE',
    };
  }

  if (isOwnAccountCategoryId(tx.categoryId)) {
    return {
      kind: isDebit ? 'transfer_out' : 'transfer_in',
      categoryId: isDebit ? 'cat-outros-despesa' : 'cat-outros-receita',
      reason: 'OWN_ACCOUNT_UNPAIRED',
    };
  }

  return {
    kind: signKind,
    categoryId: category.categoryId,
    matchedRuleId: category.matchedRuleId,
    reason: 'SIGN',
  };
}

// ---------------------------------------------------------------- R18 / R19: pareamentos globais

export interface OwnTransferCandidate {
  id: string;
  external_id: string | null;
  account_id: string;
  account_type: string;
  kind: string;
  amount_cents: number;
  due_date: string;
  status: string;
  category_id: string;
  description: string;
  transfer_group_id: string | null;
  of_category_id: string | null;
  of_class_reason: string | null;
  user_edited_fields: string | null;
  source: string;
  of_removed_at: string | null;
  linked_income_id?: string | null;
}

export interface OwnTransferPair {
  outId: string;
  inId: string;
  transferGroupId: string;
}

function dayDiff(a: string, b: string): number {
  const toMs = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map((n) => Number.parseInt(n, 10));
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(Math.round((toMs(a) - toMs(b)) / 86400000));
}

function editedPins(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && (parsed.includes('kind') || parsed.includes('category_id'));
  } catch {
    return false;
  }
}

function isEligible(c: OwnTransferCandidate, windowStart: string): boolean {
  if (c.source !== 'OPEN_FINANCE') return false;
  if (c.of_removed_at) return false;
  if (c.transfer_group_id) return false;
  if (c.account_type !== 'checking') return false;
  if (c.due_date < windowStart) return false;
  if (c.of_class_reason === 'INVESTMENT_MOVE') return false;
  if (c.linked_income_id) return false;
  if (editedPins(c.user_edited_fields)) return false;
  return true;
}

const isOutKind = (k: string) => k === 'expense' || k === 'transfer_out';
const isInKind = (k: string) => k === 'income' || k === 'transfer_in';
const groupKey = (c: OwnTransferCandidate) => c.external_id ?? c.id;

/** R18: pareia, entre todas as contas, valor igual em centavos, direção oposta, contas diferentes, até 2 dias. */
export function findOwnTransferPairs(
  candidates: OwnTransferCandidate[],
  todayIso: string,
  options: { windowStart?: string } = {}
): OwnTransferPair[] {
  const windowStart = options.windowStart ?? openFinanceWindowStart(todayIso);
  const pool = candidates.filter(
    (c) => isEligible(c, windowStart) && isTransferCompatibleCategoryId(c.of_category_id)
  );
  const outs = pool.filter((c) => isOutKind(c.kind)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const used = new Set<string>();
  const pairs: OwnTransferPair[] = [];

  for (const out of outs) {
    if (used.has(out.id)) continue;
    const options = pool
      .filter(
        (inn) =>
          !used.has(inn.id) &&
          isInKind(inn.kind) &&
          inn.account_id !== out.account_id &&
          inn.amount_cents === out.amount_cents &&
          dayDiff(inn.due_date, out.due_date) <= 2
      )
      .map((inn) => ({
        inn,
        has04:
          isOwnAccountCategoryId(inn.of_category_id) || isOwnAccountCategoryId(out.of_category_id) ? 0 : 1,
        diff: dayDiff(inn.due_date, out.due_date),
      }))
      .sort((a, b) => a.has04 - b.has04 || a.diff - b.diff);
    const best = options[0]?.inn;
    if (!best) continue;
    used.add(out.id);
    used.add(best.id);
    pairs.push({ outId: out.id, inId: best.id, transferGroupId: `of-tr-${groupKey(out)}-${groupKey(best)}` });
  }
  return pairs;
}

const TOPUP_DESCRIPTION_RE = /adicionad[oa] na conta por cartao|recarga.*cartao/;

/** R19: crédito "adicionado na conta por cartão" + débito do mesmo valor na mesma conta em até 1 dia. */
export function findCardTopupPairs(candidates: OwnTransferCandidate[], todayIso?: string): OwnTransferPair[] {
  const windowStart = todayIso ? openFinanceWindowStart(todayIso) : '0000-00-00';
  const pool = candidates.filter((c) => isEligible(c, windowStart));
  const ins = pool
    .filter((c) => isInKind(c.kind) && TOPUP_DESCRIPTION_RE.test(normalizeKey(c.description ?? '')))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const used = new Set<string>();
  const pairs: OwnTransferPair[] = [];

  for (const inn of ins) {
    const out = pool
      .filter(
        (o) =>
          !used.has(o.id) &&
          isOutKind(o.kind) &&
          o.account_id === inn.account_id &&
          o.amount_cents === inn.amount_cents &&
          dayDiff(o.due_date, inn.due_date) <= 1
      )
      .sort((a, b) => dayDiff(a.due_date, inn.due_date) - dayDiff(b.due_date, inn.due_date))[0];
    if (!out) continue;
    used.add(out.id);
    used.add(inn.id);
    pairs.push({ outId: out.id, inId: inn.id, transferGroupId: `of-topup-${groupKey(out)}-${groupKey(inn)}` });
  }
  return pairs;
}
