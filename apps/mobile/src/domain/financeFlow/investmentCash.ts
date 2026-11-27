import type { FinAccount, FinEntry } from '../../db/schema';

/**
 * Sprint 116 (W1/W2) — dinheiro real da corretora via Open Finance.
 *
 * Regra de fundo: em conta vinculada de origem Open Finance o extrato do banco é a verdade do dinheiro;
 * o app nunca lança `investment_buy`/`investment_sell`/`investment_income` nem transferência nela.
 */

function normalizeText(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * W1a: conta vinculada gerida pelo app (o app lança o dinheiro). Conta Open Finance: o extrato manda.
 * Conta desconhecida (`null`/`undefined`) não é provadamente Open Finance e mantém o comportamento legado.
 */
export function isAppManagedCashAccount(
  account: Pick<FinAccount, 'source'> | null | undefined
): boolean {
  return account?.source !== 'OPEN_FINANCE';
}

const AUTOMATIC_SWEEP_RE = /aplicacao automatica|resgate aplicacao|resgate remuneracao/;

/**
 * W2c: aplicação/resgate automático de conta remunerada. Movimenta o dinheiro dentro do mesmo banco:
 * nunca é aporte, despesa nem candidato a casamento com transferência do app.
 */
export function isAutomaticSweep(description: string | null | undefined): boolean {
  return AUTOMATIC_SWEEP_RE.test(normalizeText(description));
}

const SETTLEMENT_RE = /operacoes em bolsa|liq bolsa\s*-\s*vista bruto/;
const B3_FEE_RE = /liq bolsa\s*-\s*vista tx\b/;

/** W1b: liquidação de pregão no extrato ("OPERAÇÕES EM BOLSA … NOTA", "LIQ BOLSA - VISTA BRUTO"). */
export function isBrokerSettlementDescription(description: string | null | undefined): boolean {
  return SETTLEMENT_RE.test(normalizeText(description));
}

/** Taxas B3 do pregão ("LIQ BOLSA - VISTA TX EMOL/TTA/CCP B3"). */
export function isBrokerFeeDescription(description: string | null | undefined): boolean {
  return B3_FEE_RE.test(normalizeText(description));
}

export interface BrokerSettlementMatchParams {
  accountId: string;
  /** Data do pregão (YYYY-MM-DD). */
  tradeDate: string;
  /** Σ compras − Σ vendas manuais do pregão na carteira, em centavos (>0 saída, <0 crédito). */
  netCents: number;
}

/** Máximo de dias úteis (sáb/dom não contam) entre o pregão e a liquidação no extrato. */
export const BROKER_SETTLEMENT_MAX_BUSINESS_DAYS = 4;

function parseIsoUtc(iso: string): number | null {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

/** Dias úteis (seg–sex) transcorridos de `fromIso` (exclusivo) até `toIso` (inclusivo); negativo se `toIso` é anterior. */
function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoUtc(fromIso);
  const to = parseIsoUtc(toIso);
  if (from === null || to === null) return Number.POSITIVE_INFINITY;
  if (to < from) return -1;
  let count = 0;
  for (let t = from + 86_400_000; t <= to; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

function entryCents(e: FinEntry): number {
  return e.status === 'paid' ? (e.paid_amount_cents ?? e.amount_cents) : e.amount_cents;
}

/**
 * W1b: procura, na conta vinculada Open Finance, o lançamento de liquidação do pregão ainda não ligado,
 * entre a data da compra e +4 dias úteis. Como a nota agrupa as operações do pregão, o valor comparado é o
 * líquido (compras − vendas) do pregão; a tolerância é a soma das taxas B3 do mesmo dia da liquidação ou
 * 0,5% do valor (o que for maior; mínimo de 1 centavo). Em empate, vence a data e a diferença menores.
 * Nunca altera nada: quem chama só grava `linked_transaction_id`.
 */
export function matchBrokerSettlement(
  entries: FinEntry[],
  params: BrokerSettlementMatchParams
): FinEntry | null {
  const target = Math.abs(params.netCents);
  if (target <= 0) return null;
  const isDebit = params.netCents > 0;

  const candidates: { entry: FinEntry; days: number; diff: number }[] = [];
  for (const e of entries) {
    if (e.of_removed_at) continue;
    if (e.source !== 'OPEN_FINANCE') continue;
    if (e.account_id !== params.accountId) continue;
    if (e.linked_transaction_id) continue;
    if (!isBrokerSettlementDescription(`${e.description ?? ''} ${e.description_raw ?? ''}`)) continue;

    const isOutflow = e.kind === 'transfer_out' || e.kind === 'expense';
    const isInflow = e.kind === 'transfer_in' || e.kind === 'income';
    if (isDebit ? !isOutflow : !isInflow) continue;

    const days = businessDaysBetween(params.tradeDate, e.due_date);
    // mesma data do pregão conta como 0 dia útil; anterior ao pregão não casa
    if (days < 0 || days > BROKER_SETTLEMENT_MAX_BUSINESS_DAYS) continue;

    const feesCents = entries
      .filter(
        (f) =>
          !f.of_removed_at &&
          f.source === 'OPEN_FINANCE' &&
          f.account_id === params.accountId &&
          f.due_date === e.due_date &&
          isBrokerFeeDescription(`${f.description ?? ''} ${f.description_raw ?? ''}`)
      )
      .reduce((sum, f) => sum + entryCents(f), 0);
    const tolerance = Math.max(1, feesCents, Math.round(target * 0.005));
    const diff = Math.abs(entryCents(e) - target);
    if (diff > tolerance) continue;
    candidates.push({ entry: e, days, diff });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.days - b.days || a.diff - b.diff);
  return candidates[0].entry;
}
