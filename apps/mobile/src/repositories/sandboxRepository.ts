import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { sandboxScenarios, type SandboxScenario } from '../db/schema';

export interface TimeMachineLegSpec {
  id?: string;
  ticker: string;
  assetClass: string;
  investedBRL?: number;
  quantity?: number;
  buyDate: string;
  sellDate: string;
  feesBRL?: number;
}

export interface TimeMachineScenarioSpec {
  legs: TimeMachineLegSpec[];
  options: {
    reinvestDividends: boolean;
    taxEnabled: boolean;
  };
}

export type SandboxScenarioRecord = SandboxScenario;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Repositório de cenários do Simulador (`sandbox_scenarios`).
 * Persiste apenas a especificação (`spec_json`); o resultado é sempre recalculado ao abrir.
 */
export const sandboxRepository = {
  async listScenarios(kind?: string): Promise<SandboxScenarioRecord[]> {
    const db = getDatabase();
    if (kind) {
      return db
        .select()
        .from(sandboxScenarios)
        .where(eq(sandboxScenarios.kind, kind))
        .orderBy(desc(sandboxScenarios.updated_at));
    }
    return db
      .select()
      .from(sandboxScenarios)
      .orderBy(desc(sandboxScenarios.updated_at));
  },

  async getScenarioById(id: string): Promise<SandboxScenarioRecord | null> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(sandboxScenarios)
      .where(eq(sandboxScenarios.id, id));
    return rows[0] ?? null;
  },

  async saveScenario(input: {
    id?: string;
    name: string;
    kind?: 'time_machine';
    spec: TimeMachineScenarioSpec;
  }): Promise<SandboxScenarioRecord> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = input.id ?? makeId('sbx');
    const existing = input.id ? await this.getScenarioById(input.id) : null;
    const specJson = JSON.stringify({
      legs: input.spec.legs,
      options: input.spec.options,
    });

    if (existing) {
      const updated: SandboxScenarioRecord = {
        ...existing,
        name: input.name.trim() || existing.name,
        kind: input.kind ?? existing.kind,
        spec_json: specJson,
        updated_at: now,
      };
      await db
        .update(sandboxScenarios)
        .set({
          name: updated.name,
          kind: updated.kind,
          spec_json: updated.spec_json,
          updated_at: updated.updated_at,
        })
        .where(eq(sandboxScenarios.id, id));
      return updated;
    }

    const row: SandboxScenarioRecord = {
      id,
      name: input.name.trim(),
      kind: input.kind ?? 'time_machine',
      spec_json: specJson,
      created_at: now,
      updated_at: now,
    };
    await db.insert(sandboxScenarios).values(row);
    return row;
  },

  async deleteScenario(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(sandboxScenarios).where(eq(sandboxScenarios.id, id));
  },
};
