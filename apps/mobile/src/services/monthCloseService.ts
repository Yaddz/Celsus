import { Alert } from 'react-native';
import { getDatabase } from '../db/client';
import { assets, type FinAccount } from '../db/schema';
import {
  availableSurplus,
  averageMonthlyExpenses,
  emergencyReserve,
  filterPendingUntilDay,
  getTodayIsoLocal,
  monthSummary,
  type AvailableSurplusResult,
  type EmergencyReserveResult,
  type MonthSummaryR43,
} from '../domain/financeFlow';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { finRepository } from '../repositories/finRepository';
import { pendingContributionStore } from '../stores/pendingContributionStore';
import { getInvestmentAccountIds } from './investmentAccountsService';
import { patrimonyService } from './patrimonyService';

export const MONTH_CLOSE_META_PREFIX = 'month-close:';
export const DEFAULT_CUTOFF_DAY = 5;
export const DEFAULT_RESERVE_TARGET_MONTHS = 6;

export interface MonthCloseProposal {
  yearMonth: string;
  isAlreadyClosed: boolean;
  summary: MonthSummaryR43;
  pendingUntilDayCount: number;
  availableSurplus: AvailableSurplusResult;
  liquidFixedIncomeCents: number;
  avgExpenses6mCents: number;
  reserve: EmergencyReserveResult;
  suggestedToInvestCents: number;
  sourceAccounts: Array<FinAccount & { balanceCents: number }>;
  defaultSourceAccountId: string | null;
}

export class MonthCloseService {
  metaKey(yearMonth: string): string {
    return `${MONTH_CLOSE_META_PREFIX}${yearMonth}`;
  }

  async isMonthClosed(yearMonth: string): Promise<boolean> {
    const existing = await appMetaRepository.get(this.metaKey(yearMonth));
    return Boolean(existing);
  }

  async getProposal(
    yearMonth: string,
    options?: { cutoffDay?: number; targetMonths?: number; todayIso?: string }
  ): Promise<MonthCloseProposal> {
    const todayIso = options?.todayIso ?? getTodayIsoLocal();
    const cutoffDay = options?.cutoffDay ?? DEFAULT_CUTOFF_DAY;
    const targetMonths = options?.targetMonths ?? DEFAULT_RESERVE_TARGET_MONTHS;

    const db = getDatabase();
    const [patrimony, allEntries, activeAccounts, allAssets, closedFlag, linkedAccountIds] =
      await Promise.all([
        patrimonyService.getPatrimony(todayIso),
        finRepository.listAllEntries(),
        finRepository.listAccounts(false),
        db.select().from(assets),
        appMetaRepository.get(this.metaKey(yearMonth)),
        getInvestmentAccountIds(),
      ]);

    const summary = monthSummary(allEntries, yearMonth, {
      todayIso,
      accounts: activeAccounts,
      linkedAccountIds,
    });
    const pendingList = filterPendingUntilDay(allEntries, yearMonth, cutoffDay);
    const surplus = availableSurplus(summary, pendingList);

    // R45: Renda fixa líquida = apenas assets FIXED_INCOME com rf_daily_liquidity === 1 (NULL = não líquida)
    // R42: Valor por ativo vem exclusivamente de patrimonyService.getPatrimony().byAsset
    const valueByAssetId = new Map(
      (patrimony.byAsset ?? []).map((item) => [item.assetId, item.marketValueCents])
    );
    const liquidFixedIncomeCents = allAssets.reduce((sum, asset) => {
      if (asset.asset_class !== 'FIXED_INCOME') return sum;
      if (asset.rf_daily_liquidity !== 1) return sum;
      return sum + (valueByAssetId.get(asset.id) ?? 0);
    }, 0);

    const balanceById = new Map(patrimony.byAccount.map((a) => [a.accountId, a.balanceCents]));
    const sourceAccounts = activeAccounts
      .filter((a) => a.type === 'checking' || a.type === 'cash')
      .map((a) => ({
        ...a,
        balanceCents: balanceById.get(a.id) ?? a.initial_balance_cents,
      }));

    const avgExpenses6mCents = averageMonthlyExpenses(allEntries, yearMonth, 6);
    const reserve = emergencyReserve(
      sourceAccounts,
      liquidFixedIncomeCents,
      avgExpenses6mCents,
      targetMonths,
      surplus.availableCents
    );

    const suggestedToInvestCents = Math.max(
      0,
      surplus.availableCents - reserve.suggestedToReserveCents
    );

    return {
      yearMonth,
      isAlreadyClosed: Boolean(closedFlag),
      summary,
      pendingUntilDayCount: pendingList.length,
      availableSurplus: surplus,
      liquidFixedIncomeCents,
      avgExpenses6mCents,
      reserve,
      suggestedToInvestCents,
      sourceAccounts,
      defaultSourceAccountId: sourceAccounts[0]?.id ?? null,
    };
  }

  async closeAndContribute(params: {
    yearMonth: string;
    amountCents: number;
    sourceAccountId: string;
  }): Promise<void> {
    await appMetaRepository.set(
      this.metaKey(params.yearMonth),
      JSON.stringify({
        closedAt: new Date().toISOString(),
        mode: 'contribute',
        amountCents: params.amountCents,
        sourceAccountId: params.sourceAccountId,
      })
    );
    pendingContributionStore.set({
      amountCents: params.amountCents,
      sourceAccountId: params.sourceAccountId,
      month: params.yearMonth,
    });
  }

  async closeWithoutContributing(yearMonth: string): Promise<void> {
    await appMetaRepository.set(
      this.metaKey(yearMonth),
      JSON.stringify({
        closedAt: new Date().toISOString(),
        mode: 'keep',
      })
    );
  }

  confirmOrRun(isAlreadyClosed: boolean, onConfirm: () => void): void {
    if (!isAlreadyClosed) {
      onConfirm();
      return;
    }
    Alert.alert(
      'Mês já fechado',
      'Este mês já foi fechado anteriormente. Deseja fechar novamente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Fechar novamente', onPress: onConfirm },
      ]
    );
  }
}

export const monthCloseService = new MonthCloseService();
