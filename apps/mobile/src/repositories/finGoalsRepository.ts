import { eq } from 'drizzle-orm';
import { getDatabase, runInTransaction } from '../db/client';
import {
  finGoalContributions,
  finGoals,
  finGoalSources,
  netWorthSnapshots,
  portfolios,
  type FinGoal,
  type FinGoalContribution,
  type FinGoalSource,
  type NetWorthSnapshot,
} from '../db/schema';
import { decimalReaisToCents, type FinGoalSourceType } from '../domain/finance/goal';

export interface SaveGoalInput {
  id?: string;
  name: string;
  icon: string;
  color: string;
  target_cents: number;
  target_date?: string | null;
  source_type: FinGoalSourceType;
  monthly_contribution_cents?: number | null;
  sources?: Array<{
    ref_type: 'account' | 'portfolio';
    ref_id: string;
    asset_class?: string | null;
    share_percent: number;
  }>;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const finGoalsRepository = {
  async listGoals(includeArchived = false): Promise<FinGoal[]> {
    const db = getDatabase();
    const rows = await db.select().from(finGoals);
    return includeArchived ? rows : rows.filter((g) => !g.archived);
  },

  async getGoalById(id: string): Promise<FinGoal | null> {
    const db = getDatabase();
    const rows = await db.select().from(finGoals).where(eq(finGoals.id, id));
    return rows[0] ?? null;
  },

  async saveGoal(input: SaveGoalInput): Promise<FinGoal> {
    const now = new Date().toISOString();
    const id = input.id ?? makeId('goal');

    return runInTransaction(async () => {
      const db = getDatabase();
      const existing = await db.select().from(finGoals).where(eq(finGoals.id, id));
      const row: FinGoal = {
        id,
        name: input.name.trim(),
        icon: input.icon || 'flag',
        color: input.color || '#4F9A65',
        target_cents: Math.max(0, Math.round(input.target_cents)),
        target_date: input.target_date ?? null,
        source_type: input.source_type,
        monthly_contribution_cents:
          input.monthly_contribution_cents !== undefined && input.monthly_contribution_cents !== null
            ? Math.round(input.monthly_contribution_cents)
            : null,
        archived: existing[0]?.archived ?? 0,
        created_at: existing[0]?.created_at ?? now,
      };

      if (existing.length > 0) {
        await db.update(finGoals).set(row).where(eq(finGoals.id, id));
      } else {
        await db.insert(finGoals).values(row);
      }

      await db.delete(finGoalSources).where(eq(finGoalSources.goal_id, id));
      if (input.sources && input.sources.length > 0) {
        const sourceRows: FinGoalSource[] = input.sources.map((s) => ({
          id: makeId('gs'),
          goal_id: id,
          ref_type: s.ref_type,
          ref_id: s.ref_id,
          asset_class: s.asset_class ?? null,
          share_percent: Math.round(s.share_percent),
        }));
        await db.insert(finGoalSources).values(sourceRows);
      }

      return row;
    });
  },

  async archiveGoal(id: string, archived = true): Promise<void> {
    const db = getDatabase();
    await db
      .update(finGoals)
      .set({ archived: archived ? 1 : 0 })
      .where(eq(finGoals.id, id));
  },

  async listGoalSources(goalId?: string): Promise<FinGoalSource[]> {
    const db = getDatabase();
    if (goalId) {
      return db.select().from(finGoalSources).where(eq(finGoalSources.goal_id, goalId));
    }
    return db.select().from(finGoalSources);
  },

  async listPortfolioGoalSources(portfolioId: string): Promise<FinGoalSource[]> {
    const db = getDatabase();
    const all = await db.select().from(finGoalSources);
    return all.filter((s) => s.ref_type === 'portfolio' && s.ref_id === portfolioId);
  },

  async addContribution(input: {
    goal_id: string;
    amount_cents: number;
    date: string;
    notes?: string | null;
  }): Promise<FinGoalContribution> {
    const db = getDatabase();
    const row: FinGoalContribution = {
      id: makeId('gc'),
      goal_id: input.goal_id,
      amount_cents: Math.round(input.amount_cents),
      date: input.date,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
    };
    await db.insert(finGoalContributions).values(row);
    return row;
  },

  async listContributions(goalId?: string): Promise<FinGoalContribution[]> {
    const db = getDatabase();
    if (goalId) {
      return db
        .select()
        .from(finGoalContributions)
        .where(eq(finGoalContributions.goal_id, goalId));
    }
    return db.select().from(finGoalContributions);
  },

  async listNetWorthSnapshots(): Promise<NetWorthSnapshot[]> {
    const db = getDatabase();
    const rows = await db.select().from(netWorthSnapshots);
    return [...rows].sort((a, b) => a.year_month.localeCompare(b.year_month));
  },

  async recordMonthlySnapshot(
    snapshot: NetWorthSnapshot,
    options?: { forceUpdate?: boolean }
  ): Promise<NetWorthSnapshot> {
    const db = getDatabase();
    const existing = await db
      .select()
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.year_month, snapshot.year_month));

    if (existing.length > 0) {
      if (!options?.forceUpdate) {
        return existing[0];
      }
      await db
        .update(netWorthSnapshots)
        .set({
          accounts_cents: snapshot.accounts_cents,
          investments_cents: snapshot.investments_cents,
          card_debt_cents: snapshot.card_debt_cents,
          total_cents: snapshot.total_cents,
        })
        .where(eq(netWorthSnapshots.year_month, snapshot.year_month));
      return snapshot;
    }

    await db.insert(netWorthSnapshots).values(snapshot);
    return snapshot;
  },

  async migrateLegacyPortfolioGoals(): Promise<number> {
    const db = getDatabase();
    const allPortfolios = await db.select().from(portfolios);
    const existingSources = await db.select().from(finGoalSources);
    const existingGoals = await db.select().from(finGoals);

    const migratedPortfolioIds = new Set(
      existingSources.filter((s) => s.ref_type === 'portfolio').map((s) => s.ref_id)
    );
    const existingGoalIds = new Set(existingGoals.map((g) => g.id));

    let migratedCount = 0;
    const now = new Date().toISOString();

    for (const p of allPortfolios) {
      if (p.is_archived) continue;
      const goalVal = Number(p.patrimony_goal);
      if (!p.patrimony_goal || !Number.isFinite(goalVal) || goalVal <= 0) continue;

      const legacyGoalId = `goal_legacy_${p.id}`;
      if (migratedPortfolioIds.has(p.id) || existingGoalIds.has(legacyGoalId)) {
        continue;
      }

      const targetCents = decimalReaisToCents(p.patrimony_goal);
      const monthlyCents =
        p.monthly_contribution && Number(p.monthly_contribution) > 0
          ? decimalReaisToCents(p.monthly_contribution)
          : null;

      await db.insert(finGoals).values({
        id: legacyGoalId,
        name: `Meta · ${p.name}`,
        icon: 'flag',
        color: '#4F9A65',
        target_cents: targetCents,
        target_date: null,
        source_type: 'portfolio',
        monthly_contribution_cents: monthlyCents,
        archived: 0,
        created_at: now,
      });

      await db.insert(finGoalSources).values({
        id: `gs_legacy_${p.id}`,
        goal_id: legacyGoalId,
        ref_type: 'portfolio',
        ref_id: p.id,
        asset_class: null,
        share_percent: 100,
      });

      migratedPortfolioIds.add(p.id);
      existingGoalIds.add(legacyGoalId);
      migratedCount++;
    }

    return migratedCount;
  },
};
