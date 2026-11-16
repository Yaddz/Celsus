// eslint-disable-next-line @typescript-eslint/no-var-requires
const Notifications = require('expo-notifications') as any;
import {
  INITIAL_SCHEMA_SQL,
  SCHEMA_INDEXES_SQL,
  resetDatabase,
} from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../finService';
import { finReminderService } from '../finReminderService';
import { finStore } from '../../stores/finStore';

describe('Sprint 67 — Serviços de Lembretes Locais (expo-notifications) e Orçamentos', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await resetDatabase();
    finStore.reset();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S67-T08: schema cria tabela fin_budgets e CRUD de orçamento prioriza mês específico sobre todo mês', async () => {
    expect(INITIAL_SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS fin_budgets/i);
    expect(SCHEMA_INDEXES_SQL).toMatch(/fin_budgets/i);

    const repo = finRepository as any;
    expect(typeof repo.upsertBudget).toBe('function');
    expect(typeof repo.listBudgets).toBe('function');

    await repo.upsertBudget({
      categoryId: 'cat-mercado',
      yearMonth: null,
      limitCents: 100000,
    });
    await repo.upsertBudget({
      categoryId: 'cat-mercado',
      yearMonth: '2026-11',
      limitCents: 140000,
    });

    const all = await repo.listBudgets();
    expect(all.length).toBe(2);
    const nov = all.find((b: any) => b.year_month === '2026-11');
    const global = all.find((b: any) => b.year_month === null);
    expect(nov.limit_cents).toBe(140000);
    expect(global.limit_cents).toBe(100000);
  });

  test('S67-T09: rescheduleReminders é idempotente, agenda só próximos 30 dias com trigger DATE e respeita limite do sistema', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 100000,
    });

    // 1 lançamento dentro de 30 dias e 1 fora (45 dias depois)
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 15000,
      dueDate: '2026-11-25',
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'Energia',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 20000,
      dueDate: '2027-01-10',
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'IPTU futuro',
    });

    await finReminderService.savePreferences({
      enabled: true,
      leadDays: 1,
      hour: 9,
      minute: 0,
    });

    // Simula agendamento prévio existente que deve ser cancelado na reagendamento
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      {
        identifier: 'old-rem-1',
        content: { data: { kind: 'fin_due_reminder' } },
      },
    ]);

    const first = await finReminderService.rescheduleReminders({
      todayIso: '2026-11-16',
      now: new Date(2026, 10, 16, 8, 0, 0),
      isPrivacyMode: false,
    });

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-rem-1');
    expect(first.scheduledCount).toBe(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const callArg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(callArg.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DATE);
    // 25/11 com 1 dia de antecedência -> 24/11 às 09:00
    const triggerDate = new Date(callArg.trigger.date);
    expect(triggerDate.getFullYear()).toBe(2026);
    expect(triggerDate.getMonth()).toBe(10);
    expect(triggerDate.getDate()).toBe(24);
    expect(triggerDate.getHours()).toBe(9);

    // Respeita limite do sistema quando há > 60 contas nos próximos 30 dias
    jest.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    for (let i = 0; i < 65; i++) {
      await finRepository.createEntry({
        kind: 'expense',
        amountCents: 1000,
        dueDate: '2026-11-28',
        accountId: checking.id,
        categoryId: 'cat-moradia',
        description: `Conta ${i}`,
      });
    }

    const capped = await finReminderService.rescheduleReminders({
      todayIso: '2026-11-16',
      now: new Date(2026, 10, 16, 8, 0, 0),
      isPrivacyMode: false,
    });
    expect(capped.scheduledCount).toBeLessThanOrEqual(60);
    expect((Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length).toBeLessThanOrEqual(60);
  });

  test('S67-T10: faturas de cartão contam como um vencimento só e baixa/exclusão cancelam lembrete ao reagendar', async () => {
    const checking = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 500000,
    });
    const card = await (finRepository as any).createAccount({
      name: 'Nubank',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 25,
      creditLimitCents: 500000,
    });

    // 3 compras no cartão na mesma fatura 2026-11 -> devem gerar apenas 1 lembrete de fatura
    for (let i = 1; i <= 3; i++) {
      await (finRepository as any).createEntry({
        kind: 'expense',
        amountCents: 10000 * i,
        dueDate: `2026-11-0${i}`,
        accountId: card.id,
        categoryId: 'cat-mercado',
        description: `Compra cartão ${i}`,
        billMonth: '2026-11',
      });
    }

    // + 1 boleto na conta corrente
    const boleto = await finRepository.createEntry({
      kind: 'expense',
      amountCents: 25000,
      dueDate: '2026-11-27',
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'Condomínio',
    });

    await finReminderService.savePreferences({
      enabled: true,
      leadDays: 1,
      hour: 9,
      minute: 0,
    });

    const res1 = await finReminderService.rescheduleReminders({
      todayIso: '2026-11-16',
      now: new Date(2026, 10, 16, 8, 0, 0),
      isPrivacyMode: false,
    });
    // 1 fatura + 1 boleto = 2 notificações (não 4)
    expect(res1.scheduledCount).toBe(2);

    // Dá baixa no boleto -> passa a agendar apenas 1 (a fatura)
    jest.clearAllMocks();
    await finService.markEntryAsPaid(boleto.id, { paidDate: '2026-11-16' });
    const res2 = await finReminderService.rescheduleReminders({
      todayIso: '2026-11-16',
      now: new Date(2026, 10, 16, 8, 0, 0),
      isPrivacyMode: false,
    });
    expect(res2.scheduledCount).toBe(1);
  });

  test('S67-T11: preferências (desligado, antecedência 0/1/3, horário) e modo privacidade ocultam valores no texto', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta',
      type: 'checking',
      initialBalanceCents: 100000,
    });
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 185000,
      dueDate: '2026-11-20',
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'Aluguel',
    });

    // Desligado -> 0 agendamentos
    await finReminderService.savePreferences({
      enabled: false,
      leadDays: 1,
      hour: 8,
      minute: 30,
    });
    const offRes = await finReminderService.rescheduleReminders({
      todayIso: '2026-11-16',
      now: new Date(2026, 10, 16, 8, 0, 0),
      isPrivacyMode: false,
    });
    expect(offRes.scheduledCount).toBe(0);

    // Ligado + modo privacidade ativo -> sem R$ no corpo da notificação
    jest.clearAllMocks();
    await finReminderService.savePreferences({
      enabled: true,
      leadDays: 1,
      hour: 10,
      minute: 15,
    });
    const privRes = await finReminderService.rescheduleReminders({
      todayIso: '2026-11-16',
      now: new Date(2026, 10, 16, 8, 0, 0),
      isPrivacyMode: true,
    });
    expect(privRes.scheduledCount).toBe(1);
    const callArg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(callArg.content.body).not.toMatch(/R\$|1\.850/);
    expect(callArg.content.body).toMatch(/vence amanhã/i);
    const triggerDate = new Date(callArg.trigger.date);
    expect(triggerDate.getHours()).toBe(10);
    expect(triggerDate.getMinutes()).toBe(15);
  });

  test('S67-T12: alerta de orçamento em 80% e 100% dispara no máximo uma vez por categoria e mês', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta',
      type: 'checking',
      initialBalanceCents: 500000,
    });
    const repo = finRepository as any;
    await repo.upsertBudget({
      categoryId: 'cat-mercado',
      yearMonth: null,
      limitCents: 100000,
    });

    await finReminderService.savePreferences({
      enabled: true,
      leadDays: 1,
      hour: 9,
      minute: 0,
    });

    // Gasto de 85% (85000) -> dispara 1 alerta de 80%
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 85000,
      dueDate: '2026-11-10',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Compras',
      status: 'paid',
      paidDate: '2026-11-10',
    });

    const sent1 = await finReminderService.checkAndNotifyBudgetAlerts('2026-11', { isPrivacyMode: false });
    expect(sent1).toBe(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // Chamar novamente no mesmo mês sem cruzar 100% -> 0 novos alertas
    const sent2 = await finReminderService.checkAndNotifyBudgetAlerts('2026-11', { isPrivacyMode: false });
    expect(sent2).toBe(0);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // Novo gasto cruza 100% -> dispara 1 alerta de 100%
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 20000,
      dueDate: '2026-11-12',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Mais compras',
      status: 'paid',
      paidDate: '2026-11-12',
    });

    const sent3 = await finReminderService.checkAndNotifyBudgetAlerts('2026-11', { isPrivacyMode: false });
    expect(sent3).toBe(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);

    // Chamar de novo -> 0
    const sent4 = await finReminderService.checkAndNotifyBudgetAlerts('2026-11', { isPrivacyMode: false });
    expect(sent4).toBe(0);
  });

  test('S67-T13: tocar na notificação de vencimento abre Lançamentos filtrado por "a vencer"', () => {
    const nav = finReminderService.handleNotificationResponse({
      notification: {
        request: {
          content: {
            data: { kind: 'fin_due_reminder', route: 'entries', filterDue: 'soon' },
          },
        },
      },
    });

    expect(nav).toEqual({ route: 'entries', filterDue: 'soon' });
    expect(finStore.getState().filters.status).toBe('pending');
    expect(finStore.getState().filters.due).toBe('soon');
  });
});
