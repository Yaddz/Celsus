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

export class FinReminderService {
  async getPreferences(): Promise<FinReminderPreferences> {
    throw new Error('Not implemented (Sprint 67 Fase A stub)');
  }

  async savePreferences(_prefs: FinReminderPreferences): Promise<void> {
    throw new Error('Not implemented (Sprint 67 Fase A stub)');
  }

  async rescheduleReminders(_options?: FinReminderRescheduleOptions): Promise<FinReminderRescheduleResult> {
    throw new Error('Not implemented (Sprint 67 Fase A stub)');
  }

  async checkAndNotifyBudgetAlerts(_yearMonth: string, _options?: FinBudgetAlertOptions): Promise<number> {
    throw new Error('Not implemented (Sprint 67 Fase A stub)');
  }

  handleNotificationResponse(_response: {
    notification?: { request?: { content?: { data?: Record<string, unknown> } } };
  }): { route: 'entries'; filterDue: 'soon' } | null {
    throw new Error('Not implemented (Sprint 67 Fase A stub)');
  }
}

export const finReminderService = new FinReminderService();
