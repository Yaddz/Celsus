import type { FinEntry } from '../../db/schema';
import { getTodayIsoLocal } from '../../domain/financeFlow';
import {
  classifyOpenFinanceBankEntry,
  findCardTopupPairs,
  findOwnTransferPairs,
  type OwnTransferCandidate,
  type OwnTransferPair,
} from '../../domain/openFinance/classification';
import type { CategoryRuleLike } from '../../domain/statementImport';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { finRepository } from '../../repositories/finRepository';
import type { PluggyTransaction } from './types';

export const OF_RECLASSIFY_META_KEY = 'fin:of:reclassify:s91';
export const OF_RECLASSIFY_LOG_META_KEY = 'fin:of:reclassify:s91:log';

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

export const pluggyClassificationService = {
  /**
   * R18/R19: pareamento entre TODAS as contas Open Finance (últimos 40 dias, sem transfer_group_id).
   * Roda depois do sync de cada conexão. Recarga pelo cartão primeiro (mesma conta), depois contas próprias.
   */
  async pairOwnTransfersAcrossItems(todayIso: string = getTodayIsoLocal()): Promise<{ paired: number; topups: number }> {
    const [accounts, entries] = await Promise.all([finRepository.listAccounts(true), finRepository.listAllEntries()]);
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));
    const candidates = entries
      .filter((e) => e.source === 'OPEN_FINANCE' && !e.of_removed_at)
      .map((e) => toCandidate(e, typeById.get(e.account_id) ?? 'checking'));

    const topups = findCardTopupPairs(candidates, todayIso);
    await applyPairs(topups, 'CARD_TOPUP');
    const grouped = new Map(topups.flatMap((p) => [[p.outId, p.transferGroupId], [p.inId, p.transferGroupId]] as const));
    const remaining = candidates.map((c) => (grouped.has(c.id) ? { ...c, transfer_group_id: grouped.get(c.id)! } : c));

    const pairs = findOwnTransferPairs(remaining, todayIso);
    await applyPairs(pairs, 'OWN_ACCOUNT_PAIRED');
    return { paired: pairs.length, topups: topups.length };
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
        amount: isDebit ? -e.amount_cents / 100 : e.amount_cents / 100,
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
};
