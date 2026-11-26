import type { FinEntry } from '../../db/schema';
import { getTodayIsoLocal } from '../../domain/financeFlow';
import {
  classifyOpenFinanceBankEntry,
  findCardTopupPairs,
  findOwnTransferPairs,
  isCardBillPayment,
  isTransferCompatibleCategoryId,
  type OwnTransferCandidate,
  type OwnTransferPair,
} from '../../domain/openFinance/classification';
import { toBrtDate } from '../../domain/openFinance/dates';
import { toCentsDecimal } from '../../domain/openFinance';
import { centsToDecimal } from '../../domain/money';
import type { CategoryRuleLike } from '../../domain/statementImport';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { finRepository } from '../../repositories/finRepository';
import type { PluggyBillPayment, PluggyTransaction } from './types';

export const OF_RECLASSIFY_META_KEY = 'fin:of:reclassify:s91';
export const OF_RECLASSIFY_LOG_META_KEY = 'fin:of:reclassify:s91:log';
export const OF_RECLASSIFY_S100_META_KEY = 'fin:of:reclassify:s100';
export const OF_RECLASSIFY_S100_LOG_META_KEY = 'fin:of:reclassify:s100:log';

function editedFields(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

function toCandidate(e: FinEntry, accountType: string): OwnTransferCandidate {
  return {
    id: e.id,
    external_id: e.external_id,
    account_id: e.account_id,
    account_type: accountType,
    kind: e.kind,
    amount_cents: e.amount_cents,
    due_date: e.due_date,
    status: e.status,
    category_id: e.category_id,
    description: e.description_raw ?? e.description,
    transfer_group_id: e.transfer_group_id,
    of_category_id: e.of_category_id ?? null,
    of_class_reason: e.of_class_reason ?? null,
    user_edited_fields: e.user_edited_fields,
    source: e.source,
    of_removed_at: e.of_removed_at,
    linked_income_id: e.linked_income_id,
  };
}

async function applyPairs(
  pairs: OwnTransferPair[],
  reason: 'OWN_ACCOUNT_PAIRED' | 'CARD_TOPUP'
): Promise<void> {
  for (const pair of pairs) {
    await finRepository.updateEntry(pair.outId, {
      kind: 'transfer_out',
      transfer_group_id: pair.transferGroupId,
      of_class_reason: reason,
    });
    await finRepository.updateEntry(pair.inId, {
      kind: 'transfer_in',
      transfer_group_id: pair.transferGroupId,
      of_class_reason: reason,
    });
  }
}

const revertKind = (kind: string): FinEntry['kind'] =>
  kind === 'transfer_out' ? 'expense' : kind === 'transfer_in' ? 'income' : kind;

/**
 * Sprint 92: pares entre contas gravados pela Sprint 91 em que um lado tem categoria de compra ou de salário eram
 * coincidência de valor. Desfaz os dois lados (voltam a receita/despesa) para o pareamento atual decidir de novo.
 */
async function undoIncompatibleOwnPairs(entries: FinEntry[]): Promise<Set<string>> {
  const byGroup = new Map<string, FinEntry[]>();
  for (const e of entries) {
    if (e.of_class_reason !== 'OWN_ACCOUNT_PAIRED' || !e.transfer_group_id?.startsWith('of-tr-')) continue;
    byGroup.set(e.transfer_group_id, [...(byGroup.get(e.transfer_group_id) ?? []), e]);
  }
  const undone = new Set<string>();
  for (const group of byGroup.values()) {
    if (group.every((e) => isTransferCompatibleCategoryId(e.of_category_id ?? null))) continue;
    // Edição do usuário em qualquer lado mantém o par inteiro
    if (group.some((e) => editedFields(e.user_edited_fields).includes('kind'))) continue;
    for (const e of group) {
      await finRepository.updateEntry(e.id, {
        kind: revertKind(e.kind),
        transfer_group_id: null,
        of_class_reason: 'SIGN',
      });
      undone.add(e.id);
    }
  }
  return undone;
}

export const pluggyClassificationService = {
  /**
   * R18/R19: pareamento entre TODAS as contas Open Finance (últimos 40 dias, sem transfer_group_id).
   * Roda depois do sync de cada conexão. Recarga pelo cartão primeiro (mesma conta), depois contas próprias.
   */
  async pairOwnTransfersAcrossItems(
    todayIso: string = getTodayIsoLocal(),
    options: { windowStart?: string } = {}
  ): Promise<{ paired: number; topups: number; unpaired: number }> {
    const [accounts, entries] = await Promise.all([finRepository.listAccounts(true), finRepository.listAllEntries()]);
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));
    const unpairedIds = await undoIncompatibleOwnPairs(entries);
    const candidates = entries
      .filter((e) => e.source === 'OPEN_FINANCE' && !e.of_removed_at)
      .map((e) => {
        const c = toCandidate(e, typeById.get(e.account_id) ?? 'checking');
        return unpairedIds.has(e.id) ? { ...c, transfer_group_id: null, kind: revertKind(e.kind), of_class_reason: 'SIGN' } : c;
      });

    const topups = findCardTopupPairs(candidates, todayIso);
    await applyPairs(topups, 'CARD_TOPUP');
    const grouped = new Map(topups.flatMap((p) => [[p.outId, p.transferGroupId], [p.inId, p.transferGroupId]] as const));
    const remaining = candidates.map((c) => (grouped.has(c.id) ? { ...c, transfer_group_id: grouped.get(c.id)! } : c));

    const pairs = findOwnTransferPairs(remaining, todayIso, { windowStart: options.windowStart });
    await applyPairs(pairs, 'OWN_ACCOUNT_PAIRED');
    return { paired: pairs.length, topups: topups.length, unpaired: unpairedIds.size };
  },

  /**
   * F: uma passada (marcada em app_meta) que aplica R17–R20 aos lançamentos de conta já gravados em "Outros".
   * Não toca em lançamento com kind/category_id editados, com par, vinculado a provento ou de cartão.
   * Para desfazer: edite o lançamento; a edição do usuário prevalece nas sincronizações seguintes.
   */
  async reclassifyOpenFinanceEntries(): Promise<{
    ran: boolean;
    changed: number;
    byReason: Record<string, number>;
  }> {
    const done = await appMetaRepository.get(OF_RECLASSIFY_META_KEY);
    if (done === '1') return { ran: false, changed: 0, byReason: {} };

    const [accounts, entries, rules] = await Promise.all([
      finRepository.listAccounts(true),
      finRepository.listAllEntries(),
      finRepository.listCategoryRules(),
    ]);
    const checkingIds = new Set(accounts.filter((a) => a.type !== 'card').map((a) => a.id));
    const byReason: Record<string, number> = {};
    let changed = 0;

    for (const e of entries) {
      if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) continue;
      if (!checkingIds.has(e.account_id)) continue;
      if (e.kind !== 'income' && e.kind !== 'expense') continue;
      if (e.transfer_group_id || e.linked_income_id) continue;
      if (e.category_id !== 'cat-outros-despesa' && e.category_id !== 'cat-outros-receita') continue;
      const edited = editedFields(e.user_edited_fields);
      if (edited.includes('kind') || edited.includes('category_id')) continue;

      const isDebit = e.kind === 'expense';
      const pseudoTx = {
        description: e.description_raw ?? e.description,
        descriptionRaw: e.description_raw ?? e.description,
        category: null,
        categoryId: e.of_category_id ?? null,
        type: isDebit ? 'DEBIT' : 'CREDIT',
        amount: centsToDecimal(isDebit ? -e.amount_cents : e.amount_cents).toNumber(),
      } as unknown as PluggyTransaction;
      const result = classifyOpenFinanceBankEntry(pseudoTx, { rules: rules as unknown as CategoryRuleLike[] });

      const patch: Partial<FinEntry> = {};
      if (result.kind !== e.kind) {
        patch.kind = result.kind;
        patch.of_class_reason = result.reason;
      }
      if (result.categoryId !== e.category_id && result.reason === 'SIGN') {
        patch.category_id = result.categoryId;
      }
      if (Object.keys(patch).length === 0) continue;

      await finRepository.updateEntry(e.id, patch);
      changed += 1;
      const key = patch.of_class_reason ?? 'CATEGORY';
      byReason[key] = (byReason[key] ?? 0) + 1;
    }

    await appMetaRepository.set(OF_RECLASSIFY_LOG_META_KEY, JSON.stringify({ changed, byReason }));
    await appMetaRepository.set(OF_RECLASSIFY_META_KEY, '1');
    return { ran: true, changed, byReason };
  },

  /**
   * R30: pareamento de pagamento de fatura na conta corrente com cartão conectado ou payments_json.
   */
  async pairCardBillPayments(
    todayIso: string = getTodayIsoLocal(),
    options: { windowStart?: string } = {}
  ): Promise<{ paired: number; billMatched: number; unmatched: number }> {
    const [accounts, entries, bills] = await Promise.all([
      finRepository.listAccounts(true),
      finRepository.listAllEntries(),
      finRepository.listAllBills(),
    ]);
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));
    const windowStart =
      options.windowStart ??
      new Date(Date.parse(`${todayIso}T00:00:00Z`) - 40 * 86400000).toISOString().slice(0, 10);

    const daysDiff = (a: string, b: string) =>
      Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000));

    const checkingCandidates = entries.filter((e) => {
      if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) return false;
      if (typeById.get(e.account_id) === 'card') return false;
      if (e.transfer_group_id || e.linked_income_id) return false;
      if (e.due_date < windowStart) return false;
      if (editedFields(e.user_edited_fields).includes('kind')) return false;
      return (
        e.of_class_reason === 'CARD_BILL_PAYMENT_CANDIDATE' ||
        e.of_class_reason === 'CARD_BILL_PAYMENT_UNMATCHED' ||
        (e.kind === 'expense' &&
          isCardBillPayment({
            description: e.description_raw ?? e.description,
            category: null,
            operationType: e.of_operation_type,
          }))
      );
    });

    const cardPaymentCredits = entries.filter((e) => {
      if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) return false;
      if (typeById.get(e.account_id) !== 'card') return false;
      if (e.kind !== 'transfer_in' || e.of_class_reason !== 'CARD_BILL_PAYMENT') return false;
      if (e.transfer_group_id) return false;
      if (editedFields(e.user_edited_fields).includes('kind')) return false;
      return true;
    });

    const usedCardIds = new Set<string>();
    const billPayments: Array<{ amountCents: number; date: string }> = [];
    for (const b of bills) {
      if (!b.payments_json) continue;
      try {
        const parsed = JSON.parse(b.payments_json) as PluggyBillPayment[];
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            billPayments.push({
              amountCents: toCentsDecimal(p.amount),
              date: toBrtDate(p.paymentDate),
            });
          }
        }
      } catch {
        // ignore invalid json
      }
    }

    let paired = 0;
    let billMatched = 0;
    let unmatched = 0;

    for (const out of checkingCandidates) {
      const cardMatch = cardPaymentCredits
        .filter(
          (c) =>
            !usedCardIds.has(c.id) &&
            c.amount_cents === out.amount_cents &&
            daysDiff(c.due_date, out.due_date) <= 5
        )
        .sort((a, b) => daysDiff(a.due_date, out.due_date) - daysDiff(b.due_date, out.due_date))[0];

      if (cardMatch) {
        usedCardIds.add(cardMatch.id);
        const groupId = `of-cardpay-${out.id}-${cardMatch.id}`;
        await finRepository.updateEntry(out.id, {
          kind: 'transfer_out',
          transfer_group_id: groupId,
          of_class_reason: 'CARD_BILL_PAYMENT_PAIRED',
        });
        await finRepository.updateEntry(cardMatch.id, {
          kind: 'transfer_in',
          transfer_group_id: groupId,
          of_class_reason: 'CARD_BILL_PAYMENT',
        });
        paired += 1;
        continue;
      }

      const billMatch = billPayments.some(
        (bp) => bp.amountCents === out.amount_cents && daysDiff(bp.date, out.due_date) <= 3
      );
      if (billMatch) {
        await finRepository.updateEntry(out.id, {
          kind: 'transfer_out',
          of_class_reason: 'CARD_BILL_PAYMENT_BILL_MATCH',
        });
        billMatched += 1;
        continue;
      }

      if (out.of_class_reason !== 'CARD_BILL_PAYMENT_UNMATCHED') {
        await finRepository.updateEntry(out.id, {
          of_class_reason: 'CARD_BILL_PAYMENT_UNMATCHED',
        });
      }
      unmatched += 1;
    }

    return { paired, billMatched, unmatched };
  },

  /**
   * Sprint 100: reclassificação única fin:of:reclassify:s100.
   */
  async reclassifyOpenFinanceEntriesS100(
    todayIso: string = getTodayIsoLocal()
  ): Promise<{ ran: boolean; cardFixed: number; bankFixed: number }> {
    const done = await appMetaRepository.get(OF_RECLASSIFY_S100_META_KEY);
    if (done === '1') return { ran: false, cardFixed: 0, bankFixed: 0 };

    const [accounts, entries] = await Promise.all([
      finRepository.listAccounts(true),
      finRepository.listAllEntries(),
    ]);
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));
    let cardFixed = 0;

    for (const e of entries) {
      if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) continue;
      if (editedFields(e.user_edited_fields).includes('kind')) continue;
      if (typeById.get(e.account_id) === 'card' && e.kind === 'income') {
        if (
          isCardBillPayment({
            description: e.description_raw ?? e.description,
            category: null,
            operationType: e.of_operation_type,
          })
        ) {
          await finRepository.updateEntry(e.id, {
            kind: 'transfer_in',
            of_class_reason: 'CARD_BILL_PAYMENT',
          });
          cardFixed += 1;
        }
      }
    }

    const r30 = await this.pairCardBillPayments(todayIso);
    const bankFixed = r30.paired + r30.billMatched;

    await appMetaRepository.set(
      OF_RECLASSIFY_S100_LOG_META_KEY,
      JSON.stringify({ cardFixed, bankFixed, unmatched: r30.unmatched })
    );
    await appMetaRepository.set(OF_RECLASSIFY_S100_META_KEY, '1');
    return { ran: true, cardFixed, bankFixed };
  },
};
