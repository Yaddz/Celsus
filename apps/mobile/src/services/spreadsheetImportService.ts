import Decimal from 'decimal.js';
import seed from '../data/planilhaSeed.json';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { incomeRepository } from '../repositories/incomeRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { transactionService } from './transactionService';

export interface SpreadsheetSeed {
  portfolioName: string;
  docketCode: string;
  patrimonyGoal: string;
  monthlyContribution: string;
  classTargets: Array<{ assetClass: string; targetPercentage: number; receivesContribution: boolean }>;
  assets: Array<{ ticker: string; assetClass: string; inPlan: boolean; targetInClass: number; sheetPrice: number | null }>;
  trades: Array<{ ref: string; type: 'BUY' | 'SELL'; ticker: string; date: string; quantity: number; unitPrice: number; broker?: string; notes?: string | null }>;
  incomes: Array<{ ticker: string; date: string; amount: number; notes?: string | null }>;
}

export interface ImportFailure {
  kind: 'ativo' | 'lançamento' | 'provento';
  ref: string;
  reason: string;
}

export interface ImportReport {
  portfolioId: string;
  portfolioName: string;
  /** 'created' = carteira nova; 'reused' = já existia com esse nome; 'renamed' = importação antiga renomeada. */
  portfolio: 'created' | 'reused' | 'renamed';
  assets: { expected: number; inserted: number; existing: number };
  trades: { expected: number; inserted: number; existing: number };
  incomes: { expected: number; inserted: number; existing: number };
  failures: ImportFailure[];
  /** Conferência final contra o banco: contagens e totais da fonte vs o que está gravado. */
  verification: {
    assetsInDb: number;
    tradesInDb: number;
    incomesInDb: number;
    buyTotalExpected: string;
    buyTotalInDb: string;
    incomeTotalExpected: string;
    incomeTotalInDb: string;
    matches: boolean;
  };
}

const LEGACY_DOCKET = 'PLANILHA-V2';
export const AUVP_SEED_FLAG = 'seed:auvp:v1';

type Listener = (r: ImportReport) => void;

/**
 * Importa a planilha "Controle de investimentos v2" (já convertida em planilhaSeed.json) para a
 * carteira "AUVP". Não destrutivo e idempotente: reaproveita a carteira se já existir, só insere o
 * que falta (lançamentos por `external_id`, ativos por ticker, proventos por ticker+data+valor) e
 * relata cada falha com o motivo, sem descartar nada em silêncio.
 */
export class SpreadsheetImportService {
  private listeners: Listener[] = [];

  onImported(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async importSeed(data: SpreadsheetSeed = seed as SpreadsheetSeed): Promise<ImportReport> {
    const failures: ImportFailure[] = [];

    // 1. Carteira: por nome (sem diferenciar maiúsculas) > importação antiga renomeada > nova.
    const all = await portfolioRepository.listPortfolios(true);
    const wanted = data.portfolioName.trim().toLowerCase();
    let portfolio = all.find((p) => p.name.trim().toLowerCase() === wanted) ?? null;
    let how: ImportReport['portfolio'] = 'reused';
    const freshTargets = { apply: false };
    if (!portfolio) {
      const legacy = all.find((p) => p.docket_code === LEGACY_DOCKET);
      if (legacy) {
        portfolio = await portfolioRepository.updatePortfolio(legacy.id, { name: data.portfolioName, docket_code: data.docketCode });
        how = 'renamed';
      } else {
        portfolio = await portfolioRepository.createPortfolio({
          name: data.portfolioName,
          docket_code: data.docketCode,
          description: 'Importada da planilha Controle de investimentos v2',
          classTargets: data.classTargets.map((c) => ({ asset_class: c.assetClass, target_percentage: c.targetPercentage })),
        });
        how = 'created';
        freshTargets.apply = true;
      }
    }
    if (!portfolio) throw new Error('Não foi possível criar ou localizar a carteira AUVP.');
    const portfolioId = portfolio.id;

    // 2. Metas por classe e meta de patrimônio: só em carteira nova; em carteira existente preserva as suas.
    if (freshTargets.apply) {
      await portfolioRepository.setClassTargets(
        portfolioId,
        data.classTargets.map((c) => ({
          asset_class: c.assetClass,
          target_percentage: c.targetPercentage,
          receives_contribution: c.receivesContribution,
        }))
      );
    }
    if (!portfolio.patrimony_goal) {
      await portfolioRepository.setGoal(portfolioId, {
        patrimonyGoal: data.patrimonyGoal,
        monthlyContribution: portfolio.monthly_contribution ?? data.monthlyContribution,
      });
    }

    // 3. Ativos (por ticker).
    const currentAssets = await assetRepository.getAssetsByPortfolio(portfolioId);
    const byTicker = new Map(currentAssets.map((a) => [a.ticker.toUpperCase(), a]));
    const assetsR = { expected: data.assets.length, inserted: 0, existing: 0 };
    for (const a of data.assets) {
      if (byTicker.has(a.ticker.toUpperCase())) {
        assetsR.existing++;
        continue;
      }
      try {
        const created = await assetRepository.createAsset({
          portfolio_id: portfolioId,
          ticker: a.ticker,
          name: a.ticker,
          asset_class: a.assetClass,
          target_percentage_in_class: a.targetInClass,
          quantity: '0',
          average_price: '0.00',
        });
        byTicker.set(a.ticker.toUpperCase(), created);
        assetsR.inserted++;
      } catch (e: any) {
        failures.push({ kind: 'ativo', ref: a.ticker, reason: e?.message ?? 'erro ao criar ativo' });
      }
    }

    // 4. Lançamentos em ordem cronológica; já gravados (external_id) são pulados.
    const knownTxs = await transactionRepository.getTransactionsByPortfolio(portfolioId);
    const knownRefs = new Set(knownTxs.map((t) => t.external_id).filter(Boolean) as string[]);
    const tradesR = { expected: data.trades.length, inserted: 0, existing: 0 };
    const ordered = [...data.trades].sort((x, y) => x.date.localeCompare(y.date) || x.ref.localeCompare(y.ref));
    for (const t of ordered) {
      if (knownRefs.has(t.ref)) {
        tradesR.existing++;
        continue;
      }
      try {
        await transactionService.createTransaction({
          portfolioId,
          ticker: t.ticker,
          type: t.type,
          tradeDate: t.date,
          quantity: String(t.quantity),
          unitPrice: String(t.unitPrice),
          notes: [t.broker ? `Corretora ${t.broker}` : null, t.notes].filter(Boolean).join(' · ') || null,
          externalId: t.ref,
        });
        tradesR.inserted++;
      } catch (e: any) {
        failures.push({ kind: 'lançamento', ref: `${t.ref} (${t.type} ${t.quantity} ${t.ticker} em ${t.date})`, reason: e?.message ?? 'erro ao registrar lançamento' });
      }
    }

    // 5. Proventos (dedupe por ticker + data + valor).
    const knownIncomes = await incomeRepository.listByPortfolio(portfolioId);
    const incomeKey = (ticker: string, date: string, amount: string | number) =>
      `${ticker.toUpperCase()}|${date}|${new Decimal(amount).toFixed(2)}`;
    const knownIncomeKeys = new Set(knownIncomes.map((i) => incomeKey(i.ticker, i.pay_date, i.amount)));
    const incomesR = { expected: data.incomes.length, inserted: 0, existing: 0 };
    for (const i of data.incomes) {
      if (knownIncomeKeys.has(incomeKey(i.ticker, i.date, i.amount))) {
        incomesR.existing++;
        continue;
      }
      try {
        await incomeRepository.addIncome({ portfolioId, ticker: i.ticker, payDate: i.date, amount: String(i.amount), notes: i.notes ?? undefined });
        knownIncomeKeys.add(incomeKey(i.ticker, i.date, i.amount));
        incomesR.inserted++;
      } catch (e: any) {
        failures.push({ kind: 'provento', ref: `${i.ticker} ${i.date} R$ ${i.amount}`, reason: e?.message ?? 'erro ao registrar provento' });
      }
    }

    // 6. Conferência contra o banco.
    const dbAssets = await assetRepository.getAssetsByPortfolio(portfolioId);
    const dbTxs = await transactionRepository.getTransactionsByPortfolio(portfolioId);
    const dbIncomes = await incomeRepository.listByPortfolio(portfolioId);
    const seedRefs = new Set(data.trades.map((t) => t.ref));
    const seedTxsInDb = dbTxs.filter((t) => t.external_id && seedRefs.has(t.external_id));
    const seedIncomeKeys = new Set(data.incomes.map((i) => incomeKey(i.ticker, i.date, i.amount)));
    const seedIncomesInDb = dbIncomes.filter((i) => seedIncomeKeys.has(incomeKey(i.ticker, i.pay_date, i.amount)));
    const buyTotalExpected = data.trades
      .filter((t) => t.type === 'BUY')
      .reduce((s, t) => s.plus(new Decimal(t.quantity).mul(t.unitPrice)), new Decimal(0));
    const buyTotalInDb = seedTxsInDb
      .filter((t) => t.type === 'BUY')
      .reduce((s, t) => s.plus(new Decimal(t.quantity).mul(t.unit_price)), new Decimal(0));
    const incomeTotalExpected = data.incomes.reduce((s, i) => s.plus(i.amount), new Decimal(0));
    const incomeTotalInDb = seedIncomesInDb.reduce((s, i) => s.plus(i.amount), new Decimal(0));
    const tickersInDb = new Set(dbAssets.map((a) => a.ticker.toUpperCase()));
    const assetsPresent = data.assets.filter((a) => tickersInDb.has(a.ticker.toUpperCase())).length;

    const verification = {
      assetsInDb: assetsPresent,
      tradesInDb: seedTxsInDb.length,
      incomesInDb: seedIncomesInDb.length,
      buyTotalExpected: buyTotalExpected.toFixed(2),
      buyTotalInDb: buyTotalInDb.toFixed(2),
      incomeTotalExpected: incomeTotalExpected.toFixed(2),
      incomeTotalInDb: incomeTotalInDb.toFixed(2),
      matches:
        assetsPresent === data.assets.length &&
        seedTxsInDb.length === data.trades.length &&
        seedIncomesInDb.length === data.incomes.length &&
        buyTotalExpected.eq(buyTotalInDb) &&
        incomeTotalExpected.eq(incomeTotalInDb),
    };

    const report: ImportReport = {
      portfolioId,
      portfolioName: portfolio.name,
      portfolio: how,
      assets: assetsR,
      trades: tradesR,
      incomes: incomesR,
      failures,
      verification,
    };
    this.listeners.forEach((l) => l(report));
    return report;
  }

  /**
   * Aplica a semente da AUVP uma única vez por instalação (marca gravada no SQLite). Se o usuário
   * apagar a carteira depois, ela não é recriada sozinha; a importação manual segue no Perfil.
   */
  async runStartupSeedOnce(): Promise<ImportReport | null> {
    try {
      if (await appMetaRepository.get(AUVP_SEED_FLAG)) return null;
      const report = await this.importSeed();
      if (report.failures.length === 0 && report.verification.matches) {
        await appMetaRepository.set(AUVP_SEED_FLAG, new Date().toISOString());
      }
      return report;
    } catch (e) {
      console.error('[Seed AUVP] falhou:', e);
      return null;
    }
  }
}

export const spreadsheetImportService = new SpreadsheetImportService();

/** Texto curto para exibir o resultado da importação ao usuário. */
export function describeImportReport(r: ImportReport): string {
  const head =
    r.portfolio === 'created' ? `Carteira ${r.portfolioName} criada.` : r.portfolio === 'renamed' ? `Importação anterior renomeada para ${r.portfolioName}.` : `Carteira ${r.portfolioName} reaproveitada.`;
  const line = (label: string, x: { expected: number; inserted: number; existing: number }) =>
    `${label}: ${x.inserted} novos, ${x.existing} já existiam (fonte: ${x.expected})`;
  const v = r.verification;
  const parts = [
    head,
    line('Ativos', r.assets),
    line('Lançamentos', r.trades),
    line('Proventos', r.incomes),
    `Conferência: ${v.matches ? 'OK' : 'DIVERGENTE'} — compras R$ ${v.buyTotalInDb} de R$ ${v.buyTotalExpected}; proventos R$ ${v.incomeTotalInDb} de R$ ${v.incomeTotalExpected}.`,
  ];
  if (r.failures.length) {
    parts.push(`Falhas (${r.failures.length}):`, ...r.failures.map((f) => `• ${f.kind} ${f.ref}: ${f.reason}`));
  }
  return parts.join('\n');
}
