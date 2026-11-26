import { eq } from 'drizzle-orm';
import { getDatabase } from '../../db/client';
import { assets, finEntries, incomeEvents } from '../../db/schema';
import { incomeRepository } from '../../repositories/incomeRepository';
import { findEquivalentIncome } from '../../domain/finance/incomeDedup';
import { detectBankIncomeCandidate, type KnownIncomeAsset } from '../../domain/openFinance/income';
import { normalizeInvestmentTicker } from '../../domain/openFinance/investments';
import { centsToDecimal } from '../../domain/money';
import type { PluggyTransaction } from './types';

export interface RelinkBankIncomesResult {
  relinked: number;
  created: number;
  matched: number;
}

/**
 * Sprint 95: reavalia créditos Open Finance já gravados na conta ("RENDIMENTOS DE CLIENTES MXRF11 S/ 637")
 * que ficaram sem provento — por exemplo, quando a conta foi sincronizada antes de os ativos existirem e o
 * crédito já saiu da janela de 40 dias das sincronizações seguintes.
 */
export async function relinkStoredBankIncomes(): Promise<RelinkBankIncomesResult> {
  const result: RelinkBankIncomesResult = { relinked: 0, created: 0, matched: 0 };
  const db = getDatabase();
  const [allAssets, allEntries, existingIncomes] = await Promise.all([
    db.select().from(assets),
    db.select().from(finEntries),
    db.select().from(incomeEvents),
  ]);
  if (allAssets.length === 0) return result;

  const knownIncomeAssets: KnownIncomeAsset[] = allAssets.map((a) => ({
    ticker: a.ticker,
    name: a.name,
    status: a.of_status,
  }));
  const assetsByTicker = new Map<string, typeof allAssets>();
  for (const a of allAssets) {
    const t = normalizeInvestmentTicker(a.ticker);
    if (!t) continue;
    const list = assetsByTicker.get(t) ?? [];
    list.push(a);
    assetsByTicker.set(t, list);
  }
  const workingIncomes = [...existingIncomes];

  for (const e of allEntries) {
    if (e.source !== 'OPEN_FINANCE') continue;
    if (e.linked_income_id || e.of_removed_at) continue;
    if (e.kind !== 'income' && e.kind !== 'transfer_in') continue;
    if (e.transfer_group_id) continue;
    if (!(e.amount_cents > 0)) continue;

    const pseudoTx: Pick<
      PluggyTransaction,
      'id' | 'type' | 'amount' | 'date' | 'description' | 'category' | 'categoryId'
    > = {
      id: e.external_id ?? e.id,
      type: 'CREDIT',
      amount: centsToDecimal(e.amount_cents).toNumber(),
      date: e.due_date,
      description: e.description_raw || e.description,
      category: null,
      categoryId: e.of_category_id ?? null,
    };
    const candidate = detectBankIncomeCandidate(pseudoTx as PluggyTransaction, knownIncomeAssets);
    if (!candidate) continue;

    const owners = assetsByTicker.get(candidate.ticker) ?? [];
    const owner = owners.find((a) => a.of_status === 'ACTIVE') ?? owners[0];
    if (!owner) continue;

    const byExt = workingIncomes.find((i) => i.external_id === candidate.externalId);
    const equiv =
      byExt ??
      findEquivalentIncome(
        {
          ticker: candidate.ticker,
          payDate: candidate.payDate,
          amount: candidate.amount,
          kind: candidate.kind,
        },
        workingIncomes.map((i) => ({
          id: i.id,
          portfolioId: i.portfolio_id,
          ticker: i.ticker,
          payDate: i.pay_date,
          amount: i.amount,
          kind: i.kind,
          source: i.source,
          externalId: i.external_id,
          notes: i.notes,
          quantity: i.quantity,
          unitAmount: i.unit_amount,
          createdAt: i.created_at,
        }))
      );

    let incomeId: string;
    if (equiv && equiv.id) {
      incomeId = equiv.id;
      result.matched += 1;
    } else {
      const created = await incomeRepository.addIncome({
        portfolioId: owner.portfolio_id,
        ticker: candidate.ticker,
        payDate: candidate.payDate,
        amount: candidate.amount,
        notes: candidate.notes ?? undefined,
        source: 'OPEN_FINANCE_BANK',
        externalId: candidate.externalId,
        kind: candidate.kind,
        quantity: candidate.quantity ?? undefined,
        unitAmount: candidate.unitAmount ?? undefined,
        itemId: owner.institution_id ?? undefined,
        assetId: owner.id,
      });
      workingIncomes.push(created);
      incomeId = created.id;
      result.created += 1;
    }

    await db
      .update(finEntries)
      .set({ linked_income_id: incomeId, kind: 'income', of_class_reason: 'INCOME_LINKED' })
      .where(eq(finEntries.id, e.id));
    result.relinked += 1;
  }

  return result;
}
