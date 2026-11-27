import * as Notifications from 'expo-notifications';
import {
  addDaysIso,
  addMonthsYearMonth,
  calculateBudgetUsage,
  detectOverdueAndDueSoonWithBills,
  formatCentsBRL,
  formatYearMonthPtBr,
  getTodayIsoLocal,
} from '../domain/financeFlow';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { finRepository } from '../repositories/finRepository';
import { finStore } from '../stores/finStore';
import { privacyAndAuthService } from './privacyAndAuth';

export type ReminderLeadDays = 0 | 1 | 3;

export interface FinReminderPreferences {
  enabled: boolean;
  leadDays: ReminderLeadDays;
  hour: number;
  minute: number;
}

export interface FinReminderRescheduleResult {
  scheduledCount: number;
  cancelledCount: number;
}

export interface FinReminderRescheduleOptions {
  todayIso?: string;
  now?: Date;
  isPrivacyMode?: boolean;
  preferences?: FinReminderPreferences;
}

export interface FinBudgetAlertOptions {
  isPrivacyMode?: boolean;
  preferences?: FinReminderPreferences;
  todayIso?: string;
}

const PREFS_META_KEY = 'fin:reminder_prefs:v1';
const REMINDER_HORIZON_DAYS = 30;
const MAX_SYSTEM_NOTIFICATIONS = 60;

const DEFAULT_PREFERENCES: FinReminderPreferences = {
  enabled: true,
  leadDays: 1,
  hour: 9,
  minute: 0,
};

function leadDaysPhrase(leadDays: ReminderLeadDays): string {
  if (leadDays === 0) return 'hoje';
  if (leadDays === 1) return 'amanhã';
  return `em ${leadDays} dias`;
}

function buildTriggerDate(dueIso: string, leadDays: ReminderLeadDays, hour: number, minute: number): Date {
  const targetIso = addDaysIso(dueIso, -leadDays);
  const [y, m, d] = targetIso.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

export class FinReminderService {
  async getPreferences(): Promise<FinReminderPreferences> {
    const raw = await appMetaRepository.get(PREFS_META_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    try {
      const parsed = JSON.parse(raw) as Partial<FinReminderPreferences>;
      const leadDays: ReminderLeadDays =
        parsed.leadDays === 0 || parsed.leadDays === 1 || parsed.leadDays === 3
          ? parsed.leadDays
          : DEFAULT_PREFERENCES.leadDays;
      const hour =
        typeof parsed.hour === 'number' && parsed.hour >= 0 && parsed.hour <= 23
          ? Math.floor(parsed.hour)
          : DEFAULT_PREFERENCES.hour;
      const minute =
        typeof parsed.minute === 'number' && parsed.minute >= 0 && parsed.minute <= 59
          ? Math.floor(parsed.minute)
          : DEFAULT_PREFERENCES.minute;
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFERENCES.enabled,
        leadDays,
        hour,
        minute,
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  async savePreferences(prefs: FinReminderPreferences): Promise<void> {
    await appMetaRepository.set(PREFS_META_KEY, JSON.stringify(prefs));
  }

  async rescheduleReminders(
    options: FinReminderRescheduleOptions = {}
  ): Promise<FinReminderRescheduleResult> {
    const prefs = options.preferences ?? (await this.getPreferences());
    const todayIso = options.todayIso ?? getTodayIsoLocal();
    const now = options.now ?? new Date();
    const isPrivacyMode =
      options.isPrivacyMode ?? privacyAndAuthService.getState().isPrivacyModeEnabled;

    // Cancelamento idempotente apenas dos lembretes de vencimento do módulo Finanças
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    let cancelledCount = 0;
    for (const item of existing ?? []) {
      const data = item?.content?.data as Record<string, unknown> | undefined;
      if (data?.kind === 'fin_due_reminder' && item.identifier) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
        cancelledCount += 1;
      }
    }

    if (!prefs.enabled) {
      return { scheduledCount: 0, cancelledCount };
    }

    const [accounts, entries] = await Promise.all([
      finRepository.listAccounts(false),
      finRepository.listAllEntries(),
    ]);

    const { dueSoon, dueSoonBills } = detectOverdueAndDueSoonWithBills(
      entries,
      accounts,
      todayIso,
      REMINDER_HORIZON_DAYS
    );

    const phrase = leadDaysPhrase(prefs.leadDays);
    interface Candidate {
      triggerDate: Date;
      title: string;
      body: string;
    }
    const candidates: Candidate[] = [];

    for (const entry of dueSoon) {
      if (entry.kind !== 'expense') continue;
      const triggerDate = buildTriggerDate(entry.due_date, prefs.leadDays, prefs.hour, prefs.minute);
      if (triggerDate.getTime() <= now.getTime()) continue;
      const label = entry.description?.trim() || 'Conta a pagar';
      const body = isPrivacyMode
        ? `Uma conta vence ${phrase}`
        : `${label} (${formatCentsBRL(entry.amount_cents)}) vence ${phrase}`;
      candidates.push({
        triggerDate,
        title: 'Lembrete de vencimento',
        body,
      });
    }

    for (const bill of dueSoonBills) {
      if (bill.openCents <= 0) continue;
      const triggerDate = buildTriggerDate(bill.dueDate, prefs.leadDays, prefs.hour, prefs.minute);
      if (triggerDate.getTime() <= now.getTime()) continue;
      const body = isPrivacyMode
        ? `Uma fatura vence ${phrase}`
        : `Fatura ${bill.account.name} (${formatCentsBRL(bill.openCents)}) vence ${phrase}`;
      candidates.push({
        triggerDate,
        title: 'Lembrete de fatura',
        body,
      });
    }

    candidates.sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime());
    const toSchedule = candidates.slice(0, MAX_SYSTEM_NOTIFICATIONS);

    for (const item of toSchedule) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          body: item.body,
          data: {
            kind: 'fin_due_reminder',
            route: 'entries',
            filterDue: 'soon',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.triggerDate,
        },
      });
    }

    return {
      scheduledCount: toSchedule.length,
      cancelledCount,
    };
  }

  async checkAndNotifyBudgetAlerts(
    yearMonth: string,
    options: FinBudgetAlertOptions = {}
  ): Promise<number> {
    const prefs = options.preferences ?? (await this.getPreferences());
    if (!prefs.enabled) return 0;

    const isPrivacyMode =
      options.isPrivacyMode ?? privacyAndAuthService.getState().isPrivacyModeEnabled;
    const todayIso = options.todayIso ?? getTodayIsoLocal();

    const [entries, budgets, categories] = await Promise.all([
      finRepository.listAllEntries(),
      finRepository.listBudgets(),
      finRepository.listCategories(),
    ]);

    const catNameById = new Map(categories.map((c) => [c.id, c.name]));
    const usage = calculateBudgetUsage(entries, budgets, yearMonth, { todayIso });

    let sent = 0;
    for (const item of usage) {
      if (item.limitCents === null || item.status === null || item.status === 'ok') continue;
      const threshold = item.status === 'estourado' ? 100 : 80;
      const metaKey = `fin:budget_alert:${yearMonth}:${item.categoryId}:${threshold}`;
      const alreadySent = await appMetaRepository.get(metaKey);
      if (alreadySent) continue;

      const catName = catNameById.get(item.categoryId) ?? 'Categoria';
      const title =
        threshold === 100 ? 'Orçamento estourado' : 'Orçamento em atenção';
      const body = isPrivacyMode
        ? `${catName} atingiu ${threshold}% do orçamento mensal`
        : `${catName} atingiu ${Math.round(item.percentage ?? threshold)}% do limite (${formatCentsBRL(item.spentCents)} / ${formatCentsBRL(item.limitCents)})`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            kind: 'fin_budget_alert',
            route: 'budgets',
            categoryId: item.categoryId,
            yearMonth,
            threshold,
          },
        },
        trigger: null,
      });

      await appMetaRepository.set(metaKey, new Date().toISOString());
      sent += 1;
    }

    return sent;
  }

  /**
   * R45 — Lembrete opcional no dia 1º: "Feche <mês anterior>" quando não houver marca `month-close:YYYY-MM`.
   */
  async checkAndNotifyMonthClose(
    options: FinBudgetAlertOptions = {}
  ): Promise<boolean> {
    const prefs = options.preferences ?? (await this.getPreferences());
    if (!prefs.enabled) return false;

    const todayIso = options.todayIso ?? getTodayIsoLocal();
    if (todayIso.slice(8, 10) !== '01') return false;

    const prevMonth = addMonthsYearMonth(todayIso.slice(0, 7), -1);
    const closedMark = await appMetaRepository.get(`month-close:${prevMonth}`);
    if (closedMark) return false;

    const notifiedKey = `fin:month_close_reminder:${prevMonth}`;
    if (await appMetaRepository.get(notifiedKey)) return false;

    const monthName = formatYearMonthPtBr(prevMonth).split(' ')[0].toLowerCase();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Feche ${monthName}`,
        body: `O mês de ${monthName} terminou. Revise sua sobra e decida o aporte.`,
        data: {
          kind: 'fin_month_close_reminder',
          route: 'monthClose',
          yearMonth: prevMonth,
        },
      },
      trigger: null,
    });
    await appMetaRepository.set(notifiedKey, new Date().toISOString());
    return true;
  }

  handleNotificationResponse(response: {
    notification?: { request?: { content?: { data?: Record<string, unknown> } } };
  }): { route: 'entries'; filterDue: 'soon' } | null {
    const data = response?.notification?.request?.content?.data;
    if (!data) return null;
    if (data.kind === 'fin_due_reminder' || data.route === 'entries') {
      finStore.setFilters({ status: 'pending', due: 'soon' });
      return { route: 'entries', filterDue: 'soon' };
    }
    return null;
  }
}

export const finReminderService = new FinReminderService();
