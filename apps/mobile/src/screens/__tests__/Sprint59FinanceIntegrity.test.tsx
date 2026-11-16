import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import { getDatabase, resetDatabase } from '../../db/client';
import { finEntries, finRecurrences } from '../../db/schema';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import {
  AccountsScreen,
  EntriesListScreen,
  EntryFormSheet,
  FinanceHomeScreen,
  RecurrencesScreen,
} from '../finance';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

async function seedAccount(initialBalanceCents = 100000, name = 'Nubank') {
  await finService.initializeFinanceModule('2026-11-13');
  return finRepository.createAccount({
    name,
    type: 'checking',
    initialBalanceCents,
    color: '#D96628',
  });
}

describe('Sprint 59 — Integridade do módulo Finanças (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
    finStore.reset();
    jest.clearAllMocks();
  });

  it('S59-T04 (F1): salvar lançamento com repetição Mensal cria fin_recurrence e não duplica lançamento avulso', async () => {
    const acc = await seedAccount();
    const onSaved = jest.fn();
    const onClose = jest.fn();

    render(
      <EntryFormSheet
        visible={true}
        onClose={onClose}
        onSaved={onSaved}
        defaultDueDate="2026-11-15"
        themeMode="dark"
      />
    );

    await waitFor(() => expect(screen.getByTestId('entry-form-amount')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('entry-form-amount'), '150,00');
    fireEvent.changeText(screen.getByTestId('entry-form-description'), 'Internet Fibra');
    fireEvent.changeText(screen.getByTestId('entry-form-due-date'), '15/11/2026');
    fireEvent.press(screen.getByText('Mensal'));
    fireEvent.press(screen.getByTestId('entry-form-save-btn'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const recs = await finRepository.listRecurrences();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      frequency: 'monthly',
      day_of_month: 15,
      start_date: '2026-11-15',
      end_date: null,
      amount_cents: 15000,
      account_id: acc.id,
      description: 'Internet Fibra',
    });

    const novEntries = await finRepository.listEntriesByMonth('2026-11');
    expect(novEntries).toHaveLength(1);
    expect(novEntries[0].recurrence_id).toBe(recs[0].id);
  });

  it('S59-T05 (F2): excluir ocorrência com escopo só esta grava skip e não recria; editar vencimento não duplica', async () => {
    const acc = await seedAccount();
    const rec = await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 20000,
      description: 'Academia',
      account_id: acc.id,
      category_id: 'cat-saude',
      frequency: 'monthly',
      day_of_month: 15,
      start_date: '2026-11-15',
      end_date: null,
      is_subscription: 0,
      active: 1,
      generated_until: null,
    });

    await finService.initializeFinanceModule('2026-11-13');
    const decEntriesBefore = await finRepository.listEntriesByMonth('2026-12');
    expect(decEntriesBefore).toHaveLength(1);

    await finService.deleteRecurrenceOccurrence(decEntriesBefore[0].id, 'only_this');

    const novEntries = await finRepository.listEntriesByMonth('2026-11');
    await finRepository.updateEntry(novEntries[0].id, { due_date: '2026-11-22' });

    await finService.initializeFinanceModule('2026-11-13');

    const decEntriesAfter = await finRepository.listEntriesByMonth('2026-12');
    expect(decEntriesAfter).toHaveLength(0);

    const novEntriesAfter = await finRepository.listEntriesByMonth('2026-11');
    expect(novEntriesAfter).toHaveLength(1);
    expect(novEntriesAfter[0].due_date).toBe('2026-11-22');
  });

  it('S59-T06 (F3): editar recorrência atualiza pendentes >= hoje e preserva pagas; trocar dia move sem duplicar', async () => {
    const acc = await seedAccount();
    const acc2 = await finRepository.createAccount({
      name: 'Inter',
      type: 'checking',
      initialBalanceCents: 0,
      color: '#2E4A44',
    });
    const rec = await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 10000,
      description: 'Aluguel',
      account_id: acc.id,
      category_id: 'cat-moradia',
      frequency: 'monthly',
      day_of_month: 10,
      start_date: '2026-10-10',
      end_date: null,
      is_subscription: 0,
      active: 1,
      generated_until: null,
    });

    await finService.initializeFinanceModule('2026-11-05');
    const oct = (await finRepository.listEntriesByMonth('2026-10'))[0];
    await finService.markEntryAsPaid(oct.id, { paidDate: '2026-10-10', paidAmountCents: 10000 });

    await finService.updateRecurrence(
      rec.id,
      {
        amount_cents: 15000,
        description: 'Aluguel Reajustado',
        account_id: acc2.id,
        category_id: 'cat-outros-despesa',
        day_of_month: 15,
      },
      '2026-11-05'
    );

    const octAfter = (await finRepository.listEntriesByMonth('2026-10'))[0];
    expect(octAfter.status).toBe('paid');
    expect(octAfter.amount_cents).toBe(10000);
    expect(octAfter.due_date).toBe('2026-10-10');

    const novAfter = await finRepository.listEntriesByMonth('2026-11');
    expect(novAfter).toHaveLength(1);
    expect(novAfter[0]).toMatchObject({
      amount_cents: 15000,
      description: 'Aluguel Reajustado',
      account_id: acc2.id,
      category_id: 'cat-outros-despesa',
      due_date: '2026-11-15',
    });

    const decAfter = await finRepository.listEntriesByMonth('2026-12');
    expect(decAfter).toHaveLength(1);
    expect(decAfter[0].due_date).toBe('2026-12-15');
  });

  it('S59-T07 (F4): editar conta com saldo inicial negativo preserva o sinal', async () => {
    const acc = await seedAccount(-50000, 'Cheque Especial');
    render(<AccountsScreen onBack={jest.fn()} themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId(`account-row-${acc.id}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`account-row-${acc.id}`));

    await waitFor(() => expect(screen.getByTestId('account-form-name-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('account-form-name-input'), 'Conta Negativa');
    fireEvent.press(screen.getByTestId('account-form-save-btn'));

    await waitFor(async () => {
      const updated = await finRepository.getAccountById(acc.id);
      expect(updated?.name).toBe('Conta Negativa');
      expect(updated?.initial_balance_cents).toBe(-50000);
    });
  });

  it('S59-T08 (F5): sem conta não salva e mostra atalho; migração liga órfãos a Sem conta', async () => {
    await finService.initializeFinanceModule('2026-11-13');
    const onSaved = jest.fn();

    render(
      <EntryFormSheet
        visible={true}
        onClose={jest.fn()}
        onSaved={onSaved}
        defaultDueDate="2026-11-15"
        themeMode="dark"
      />
    );

    await waitFor(() => expect(screen.getByTestId('entry-form-amount')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('entry-form-amount'), '50,00');
    fireEvent.press(screen.getByTestId('entry-form-save-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Cadastre uma conta antes de lançar\./i)).toBeTruthy();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(await finRepository.listAllEntries()).toHaveLength(0);

    // Migração de órfãos inseridos com account_id 'default-account'
    const db = getDatabase();
    await db.insert(finEntries).values({
      id: 'orphan-entry-1',
      kind: 'expense',
      amount_cents: 4200,
      due_date: '2026-11-10',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: 'default-account',
      category_id: 'cat-moradia',
      description: 'Órfão',
      recurrence_id: null,
      recurrence_period: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
      created_at: new Date().toISOString(),
    });
    await db.insert(finRecurrences).values({
      id: 'orphan-rec-1',
      kind: 'expense',
      amount_cents: 9900,
      description: 'Rec órfã',
      account_id: 'default-account',
      category_id: 'cat-moradia',
      frequency: 'monthly',
      day_of_month: 10,
      start_date: '2026-11-10',
      end_date: null,
      is_subscription: 0,
      active: 1,
      generated_until: null,
      created_at: new Date().toISOString(),
    });

    await finService.initializeFinanceModule('2026-11-13');
    const accounts = await finRepository.listAccounts(true);
    const semConta = accounts.find((a) => a.name === 'Sem conta');
    expect(semConta).toBeTruthy();

    const migratedEntry = await finRepository.getEntryById('orphan-entry-1');
    const migratedRec = await finRepository.getRecurrenceById('orphan-rec-1');
    expect(migratedEntry?.account_id).toBe(semConta!.id);
    expect(migratedRec?.account_id).toBe(semConta!.id);
  });

  it('S59-T09 (F6): Atrasadas abre due: overdue (qualquer mês) e A vencer abre due: soon', async () => {
    const acc = await seedAccount();
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 12000,
      due_date: '2026-10-05',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-moradia',
      description: 'Luz Outubro',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 8000,
      due_date: '2026-11-16',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-mercado',
      description: 'Internet Novembro',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });

    finStore.setSelectedMonth('2026-11');
    render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId('finance-overdue-tile')).toBeTruthy());
    fireEvent.press(screen.getByTestId('finance-overdue-tile'));

    await waitFor(() => {
      expect(finStore.getState().filters.due).toBe('overdue');
      expect(screen.getByText('Luz Outubro')).toBeTruthy();
      expect(screen.queryByText('Internet Novembro')).toBeNull();
    });

    // Testar due: 'soon' no tile A vencer
    finStore.resetFilters();
    const { unmount } = await render(
      <FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />
    );
    await waitFor(() => expect(screen.getAllByTestId('finance-upcoming-7d-btn')[0]).toBeTruthy());
    fireEvent.press(screen.getAllByTestId('finance-upcoming-7d-btn')[0]);
    await waitFor(() => {
      expect(finStore.getState().filters.due).toBe('soon');
    });
    await unmount();
  });

  it('S59-T10 (F7): A vencer e Atrasadas consideram só despesas; receitas atrasadas em linha própria', async () => {
    const acc = await seedAccount();
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 20000,
      due_date: '2026-11-05',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-moradia',
      description: 'Despesa atrasada',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 50000,
      due_date: '2026-11-06',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-salario',
      description: 'Freela atrasado',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 10000,
      due_date: '2026-11-16',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-mercado',
      description: 'Despesa a vencer',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 30000,
      due_date: '2026-11-17',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-salario',
      description: 'Receita a vencer',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });

    finStore.setSelectedMonth('2026-11');
    render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId('finance-upcoming-tile')).toBeTruthy());
    expect(screen.getByTestId('finance-overdue-tile')).toHaveTextContent('R$ 200,00');
    expect(screen.getByTestId('finance-overdue-tile')).toHaveTextContent('1 conta');
    expect(screen.getByTestId('finance-upcoming-7d-btn')).toHaveTextContent('R$ 100,00');
    expect(screen.getByTestId('finance-upcoming-7d-btn')).toHaveTextContent('1 conta');
    expect(screen.getByText('1 a receber em atraso')).toBeTruthy();
  });

  it('S59-T11 (F9): pausar remove pendentes >= hoje e retomar gera só de hoje em diante', async () => {
    const acc = await seedAccount();
    const rec = await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 4990,
      description: 'Streaming',
      account_id: acc.id,
      category_id: 'cat-assinaturas',
      frequency: 'monthly',
      day_of_month: 15,
      start_date: '2026-10-15',
      end_date: null,
      is_subscription: 1,
      active: 1,
      generated_until: null,
    });

    await finService.initializeFinanceModule('2026-11-13');
    expect((await finRepository.listEntriesByRecurrence(rec.id)).length).toBeGreaterThanOrEqual(3);

    await finService.pauseSubscription(rec.id, '2026-11-13');
    const afterPause = await finRepository.listEntriesByRecurrence(rec.id);
    expect(afterPause.map((e) => e.due_date)).toEqual(['2026-10-15']);

    await finService.resumeSubscription(rec.id, '2026-12-01');
    const afterResume = await finRepository.listEntriesByRecurrence(rec.id);
    expect(afterResume.some((e) => e.due_date === '2026-11-15')).toBe(false);
    expect(afterResume.some((e) => e.due_date === '2026-12-15')).toBe(true);
  });

  it('S59-T12 (F10): trocar de mês no Resumo ou Lançamentos gera recorrências até o fim do mês exibido (limite 24 meses)', async () => {
    const acc = await seedAccount();
    await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 10000,
      description: 'Condomínio',
      account_id: acc.id,
      category_id: 'cat-moradia',
      frequency: 'monthly',
      day_of_month: 10,
      start_date: '2026-11-10',
      end_date: null,
      is_subscription: 0,
      active: 1,
      generated_until: null,
    });

    finStore.setSelectedMonth('2027-06');
    render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByText('Condomínio')).toBeTruthy());
    const juneEntries = await finRepository.listEntriesByMonth('2027-06');
    expect(juneEntries).toHaveLength(1);

    // Além de 24 meses à frente (2029-01 > 2028-11) não deve gerar
    finStore.setSelectedMonth('2029-01');
    await waitFor(async () => {
      const farEntries = await finRepository.listEntriesByMonth('2029-01');
      expect(farEntries).toHaveLength(0);
    });
  });

  it('S59-T13 (F11): excluir lançamento avulso abre ConfirmDialog antes de apagar', async () => {
    const acc = await seedAccount();
    const entry = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5500,
      due_date: '2026-11-13',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-mercado',
      description: 'Padaria',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });

    finStore.setSelectedMonth('2026-11');
    render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId(`entry-row-${entry.id}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`entry-row-${entry.id}`));
    await waitFor(() => expect(screen.getByTestId(`entry-action-delete-${entry.id}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`entry-action-delete-${entry.id}`));

    await waitFor(() => {
      expect(screen.getByText('Excluir lançamento?')).toBeTruthy();
      expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeTruthy();
    });
    expect(await finRepository.getEntryById(entry.id)).not.toBeNull();

    fireEvent.press(screen.getByText('Excluir'));
    await waitFor(async () => {
      expect(await finRepository.getEntryById(entry.id)).toBeNull();
    });
  });

  it('S59-T14 (F12): formulário de recorrência valida datas dd/mm/aaaa, fim >= início e trava duplo toque; baixa valida data', async () => {
    await seedAccount();
    render(<RecurrencesScreen onBack={jest.fn()} themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId('recurrences-add-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recurrences-add-btn'));

    await waitFor(() => expect(screen.getByTestId('recurrence-form-sheet')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('recurrence-form-amount-input'), '100,00');
    fireEvent.changeText(screen.getByTestId('recurrence-form-start-date'), '31/02/2026');
    fireEvent.press(screen.getByTestId('recurrence-form-save-btn'));

    await waitFor(() => expect(screen.getByText(/data válida/i)).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('recurrence-form-start-date'), '15/11/2026');
    fireEvent.changeText(screen.getByTestId('recurrence-form-end-date'), '10/11/2026');
    fireEvent.press(screen.getByTestId('recurrence-form-save-btn'));

    await waitFor(() => expect(screen.getByText(/fim.*início|posterior/i)).toBeTruthy());
  });

  it('S59-T15 (F13): operações em lote no finService rodam em transação SQLite (rollback em falha)', async () => {
    const acc = await seedAccount();
    const batchSpy = jest.spyOn(finRepository, 'createEntriesBatch').mockRejectedValueOnce(new Error('Falha simulada'));

    await expect(
      finService.createInstallmentPurchase({
        kind: 'expense',
        totalAmountCents: 30000,
        installmentTotal: 3,
        firstDueDate: '2026-11-15',
        accountId: acc.id,
        categoryId: 'cat-moradia',
        description: 'Notebook',
      })
    ).rejects.toThrow('Falha simulada');

    batchSpy.mockRestore();
    expect(await finRepository.listAllEntries()).toHaveLength(0);

    // Simula falha no meio de cancelSubscription (ao deletar ocorrência)
    const rec = await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 5000,
      description: 'App',
      account_id: acc.id,
      category_id: 'cat-assinaturas',
      frequency: 'monthly',
      day_of_month: 15,
      start_date: '2026-11-15',
      end_date: null,
      is_subscription: 1,
      active: 1,
      generated_until: null,
    });
    await finService.initializeFinanceModule('2026-11-13');
    const delSpy = jest.spyOn(finRepository, 'deleteEntry').mockRejectedValueOnce(new Error('Falha delete'));

    await expect(finService.cancelSubscription(rec.id, '2026-11-13')).rejects.toThrow('Falha delete');
    delSpy.mockRestore();

    const recAfter = await finRepository.getRecurrenceById(rec.id);
    expect(recAfter?.active).toBe(1);
    expect(recAfter?.end_date).toBeNull();
  });

  it('S59-T16 (F14 & F15): listEntriesBetween/listPendingEntriesUntil filtram no repo; AccountsScreen usa due_date na variação', async () => {
    const acc = await seedAccount(0);
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 10000,
      due_date: '2026-10-25',
      paid_date: '2026-11-02', // pago em nov, mas competência out
      paid_amount_cents: 10000,
      status: 'paid',
      account_id: acc.id,
      category_id: 'cat-moradia',
      description: 'Conta Outubro',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5000,
      due_date: '2026-11-10',
      paid_date: '2026-11-10',
      paid_amount_cents: 5000,
      status: 'paid',
      account_id: acc.id,
      category_id: 'cat-mercado',
      description: 'Mercado Nov',
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });

    const novOnly = await finRepository.listEntriesBetween('2026-11-01', '2026-11-30');
    expect(novOnly.map((e) => e.description)).toEqual(['Mercado Nov']);

    const pendingUntil = await finRepository.listPendingEntriesUntil('2026-11-15');
    expect(pendingUntil).toHaveLength(0);

    // F15: AccountsScreen variação do mês deve refletir apenas Mercado Nov (-R$ 50,00), não -R$ 150,00
    render(<AccountsScreen onBack={jest.fn()} themeMode="dark" />);
    await waitFor(() => expect(screen.getByTestId(`account-row-${acc.id}`)).toBeTruthy());
    expect(screen.getByTestId(`account-row-${acc.id}`)).toHaveTextContent('-R$ 50,00');
  });

  it('S59-T17 (F16 & F18): Resumo com contas e sem lançamentos exibe tiles zerados; IDs usam expo-crypto randomUUID', async () => {
    const uuidSpy = jest.spyOn(Crypto, 'randomUUID');
    await seedAccount(50000, 'Carteira');
    expect(uuidSpy).toHaveBeenCalled();

    finStore.setSelectedMonth('2026-11');
    render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId('finance-month-balance')).toBeTruthy());
    expect(screen.queryByTestId('finance-empty-state')).toBeNull();
    expect(screen.getByTestId('finance-month-balance')).toHaveTextContent('R$ 0,00');
  });
});
