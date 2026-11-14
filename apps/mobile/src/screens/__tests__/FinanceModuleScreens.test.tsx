import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { QuickActionBentoRow } from '../../components/ui/DirectiveButton';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import {
  FinanceHomeScreen,
  EntriesListScreen,
  EntryFormSheet,
  RecurrencesScreen,
  SubscriptionsScreen,
  AccountsScreen,
  CategoriesScreen,
} from '../finance';

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 54 — Módulo Finanças (Navegação, Telas, Privacidade e Estados Vazios)', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    resetDatabase();
    finStore.reset();
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  describe('Ponto de entrada: Globo abre Finanças e onMais permanece isolado', () => {
    it('tocar no globo na Home abre o módulo Finanças com XpMinimalHeader (voltar + Finanças) e voltar retorna à Home', async () => {
      await render(<App />);

      const globeBtn = screen.getByTestId('header-globe-button');
      fireEvent.press(globeBtn);

      await waitFor(() => {
        expect(screen.getByTestId('finance-home-screen')).toBeTruthy();
      });

      expect(screen.getByTestId('header-back-button')).toBeTruthy();
      expect(screen.getByText('Finanças')).toBeTruthy();
      expect(alertSpy).not.toHaveBeenCalledWith('Funcionalidade em desenvolvimento');

      // Voltar retorna para a Home de investimentos
      fireEvent.press(screen.getByTestId('header-back-button'));
      await waitFor(() => {
        expect(screen.getByTestId('home-screen-root')).toBeTruthy();
      });
      expect(screen.queryByTestId('finance-home-screen')).toBeNull();
    });

    it('tocar no botão Mais exibe alerta de desenvolvimento e NÃO abre o módulo Finanças', async () => {
      const onMaisMock = jest.fn();
      await render(
        <QuickActionBentoRow
          variant="v2"
          showMais={true}
          onMais={onMaisMock}
        />
      );

      fireEvent.press(screen.getByTestId('quick-action-mais'));

      expect(alertSpy).toHaveBeenCalledWith('Funcionalidade em desenvolvimento');
      expect(onMaisMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('finance-home-screen')).toBeNull();
    });
  });

  describe('FinanceHomeScreen (Resumo e Estado Vazio)', () => {
    it('renderiza estado vazio quando não há lançamentos e exibe atalhos do módulo', async () => {
      await render(
        <FinanceHomeScreen
          onBack={jest.fn()}
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('finance-empty-state')).toBeTruthy();
      });

      expect(screen.getByTestId('finance-shortcut-entries')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-subscriptions')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-recurrences')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-accounts')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-categories')).toBeTruthy();
      expect(screen.getByTestId('finance-add-entry-btn')).toBeTruthy();
    });

    it('exibe saldo do mês, receitas × despesas, próximos 7 dias, gráfico por categoria e oculta no modo privacidade', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Conta Corrente',
        type: 'checking',
        initialBalanceCents: 100000,
        color: '#2E4A44',
      });
      const cats = await finRepository.listCategories();
      const catSalario = cats.find((c) => c.name === 'Salário')!;
      const catMoradia = cats.find((c) => c.name === 'Moradia')!;

      await finRepository.createEntry({
        kind: 'income',
        amount_cents: 500000, // R$ 5.000,00
        due_date: '2026-11-05',
        paid_date: '2026-11-05',
        paid_amount_cents: 500000,
        status: 'paid',
        account_id: acc.id,
        category_id: catSalario.id,
        description: 'Salário',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 123456, // R$ 1.234,56
        due_date: '2026-11-16',
        paid_date: null,
        paid_amount_cents: null,
        status: 'pending',
        account_id: acc.id,
        category_id: catMoradia.id,
        description: 'Condomínio',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      finStore.setSelectedMonth('2026-11');

      const { rerender } = await render(
        <FinanceHomeScreen
          onBack={jest.fn()}
          isPrivacyMode={false}
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('finance-month-balance')).toBeTruthy();
        expect(screen.getByTestId('finance-category-chart')).toBeTruthy();
      });

      expect(screen.getByTestId('finance-month-income')).toHaveTextContent('R$ 5.000,00');
      expect(screen.getByTestId('finance-month-expense')).toHaveTextContent('R$ 1.234,56');
      expect(screen.getByTestId('finance-upcoming-7d')).toHaveTextContent('R$ 1.234,56');

      // Modo privacidade deve mascarar todos os valores
      await rerender(
        <FinanceHomeScreen
          onBack={jest.fn()}
          isPrivacyMode={true}
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('finance-month-income')).toHaveTextContent('R$ ••••••');
        expect(screen.getByTestId('finance-month-expense')).toHaveTextContent('R$ ••••••');
        expect(screen.getByTestId('finance-month-balance')).toHaveTextContent('R$ ••••••');
      });
      expect(screen.queryByText(/5\.000,00/)).toBeNull();
      expect(screen.queryByText(/1\.234,56/)).toBeNull();
    });
  });

  describe('EntriesListScreen e EntryFormSheet', () => {
    it('exibe estado vazio no mês sem lançamentos e permite navegar entre meses', async () => {
      finStore.setSelectedMonth('2026-11');

      await render(
        <EntriesListScreen
          onBack={jest.fn()}
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('entries-empty-state')).toBeTruthy();
      });

      const initialLabel = screen.getByTestId('entries-month-label').props.children;
      fireEvent.press(screen.getByTestId('entries-month-prev'));
      await waitFor(() => {
        expect(screen.getByTestId('entries-month-label').props.children).not.toBe(initialLabel);
      });
      fireEvent.press(screen.getByTestId('entries-month-next'));
    });

    it('exibe atrasadas, a vencer em 7 dias, badge de parcela, filtros e pergunta escopo ao excluir parcela', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Cartão',
        type: 'card',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const cats = await finRepository.listCategories();
      const catMercado = cats.find((c) => c.name === 'Mercado')!;

      const overdue = await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 8000,
        due_date: '2026-11-05',
        paid_date: null,
        paid_amount_cents: null,
        status: 'pending',
        account_id: acc.id,
        category_id: catMercado.id,
        description: 'Conta atrasada',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      const dueSoon = await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 12000,
        due_date: '2026-11-18',
        paid_date: null,
        paid_amount_cents: null,
        status: 'pending',
        account_id: acc.id,
        category_id: catMercado.id,
        description: 'Conta em 5 dias',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      const installments = await finService.createInstallmentPurchase({
        kind: 'expense',
        totalAmountCents: 40000,
        installmentTotal: 4,
        firstDueDate: '2026-10-15',
        accountId: acc.id,
        categoryId: catMercado.id,
        description: 'Notebook',
      });
      const novPart = installments.find((p) => p.due_date.startsWith('2026-11'))!;

      finStore.setSelectedMonth('2026-11');

      await render(
        <EntriesListScreen
          onBack={jest.fn()}
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId(`entry-row-${overdue.id}`)).toBeTruthy();
        expect(screen.getByTestId(`entry-row-${dueSoon.id}`)).toBeTruthy();
        expect(screen.getByTestId(`entry-row-${novPart.id}`)).toBeTruthy();
      });

      expect(screen.getByTestId(`entry-overdue-badge-${overdue.id}`)).toBeTruthy();
      expect(screen.getByTestId(`entry-duesoon-badge-${dueSoon.id}`)).toBeTruthy();
      expect(screen.getByText(/2\/4/)).toBeTruthy();

      // Marcar como pago
      fireEvent.press(screen.getByTestId(`entry-pay-btn-${dueSoon.id}`));
      await waitFor(() => {
        expect(screen.getByTestId('pay-entry-modal')).toBeTruthy();
      });
      fireEvent.changeText(screen.getByTestId('pay-entry-amount-input'), '125,00');
      fireEvent.press(screen.getByTestId('pay-entry-confirm-btn'));

      await waitFor(async () => {
        const refreshed = await finRepository.getEntryById(dueSoon.id);
        expect(refreshed?.status).toBe('paid');
        expect(refreshed?.paid_amount_cents).toBe(12500);
      });

      // Ao tentar excluir item parcelado, pergunta escopo (só esta, esta e próximas, todas)
      fireEvent.press(screen.getByTestId(`entry-delete-btn-${novPart.id}`));
      await waitFor(() => {
        expect(screen.getByTestId('installment-scope-dialog')).toBeTruthy();
        expect(screen.getByTestId('installment-scope-only_this')).toBeTruthy();
        expect(screen.getByTestId('installment-scope-this_and_next')).toBeTruthy();
        expect(screen.getByTestId('installment-scope-all')).toBeTruthy();
      });
    });

    it('EntryFormSheet cria lançamento avulso via formulário', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Carteira',
        type: 'cash',
        initialBalanceCents: 0,
        color: '#D96628',
      });

      const onSaved = jest.fn();
      const onClose = jest.fn();

      await render(
        <EntryFormSheet
          visible={true}
          onClose={onClose}
          onSaved={onSaved}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('entry-form-description')).toBeTruthy();
      });

      fireEvent.changeText(screen.getByTestId('entry-form-description'), 'Almoço');
      fireEvent.changeText(screen.getByTestId('entry-form-amount'), '45,90');
      fireEvent.changeText(screen.getByTestId('entry-form-due-date'), '2026-11-13');
      fireEvent.press(screen.getByTestId(`entry-form-account-${acc.id}`));
      fireEvent.press(screen.getByTestId('entry-form-save-btn'));

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalledTimes(1);
      });

      const entries = await finRepository.listAllEntries();
      expect(entries.some((e) => e.description === 'Almoço' && e.amount_cents === 4590)).toBe(true);
    });
  });

  describe('SubscriptionsScreen, RecurrencesScreen, AccountsScreen e CategoriesScreen', () => {
    it('SubscriptionsScreen exibe estado vazio, totais mensal/anual e ações de pausar, retomar e cancelar', async () => {
      const { unmount } = await render(<SubscriptionsScreen onBack={jest.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('subscriptions-empty-state')).toBeTruthy();
      });
      await unmount();

      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Cartão',
        type: 'card',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const cats = await finRepository.listCategories();
      const catAssin = cats.find((c) => c.name === 'Assinaturas')!;

      const sub = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 5000, // R$ 50,00/mês -> R$ 600,00/ano
        description: 'Cloud Storage',
        account_id: acc.id,
        category_id: catAssin.id,
        frequency: 'monthly',
        day_of_month: 10,
        start_date: '2026-10-10',
        end_date: null,
        is_subscription: 1,
        generated_until: null,
      });

      const { rerender } = await render(<SubscriptionsScreen onBack={jest.fn()} isPrivacyMode={false} />);
      await waitFor(() => {
        expect(screen.getByTestId(`subscription-row-${sub.id}`)).toBeTruthy();
      });

      expect(screen.getByTestId('subscriptions-monthly-total')).toHaveTextContent('R$ 50,00');
      expect(screen.getByTestId('subscriptions-annual-total')).toHaveTextContent('R$ 600,00');

      // Pausar
      fireEvent.press(screen.getByTestId(`subscription-pause-btn-${sub.id}`));
      await waitFor(() => {
        expect(screen.getByTestId(`subscription-resume-btn-${sub.id}`)).toBeTruthy();
      });

      // Retomar
      fireEvent.press(screen.getByTestId(`subscription-resume-btn-${sub.id}`));
      await waitFor(() => {
        expect(screen.getByTestId(`subscription-pause-btn-${sub.id}`)).toBeTruthy();
      });

      // Privacidade oculta totais
      await rerender(<SubscriptionsScreen onBack={jest.fn()} isPrivacyMode={true} />);
      await waitFor(() => {
        expect(screen.getByTestId('subscriptions-monthly-total')).toHaveTextContent('R$ ••••••');
        expect(screen.getByTestId('subscriptions-annual-total')).toHaveTextContent('R$ ••••••');
      });

      // Cancelar com confirmação
      fireEvent.press(screen.getByTestId(`subscription-cancel-btn-${sub.id}`));
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
      await waitFor(async () => {
        const after = await finRepository.getRecurrenceById(sub.id);
        expect(after?.active).toBe(0);
        expect(after?.end_date).not.toBeNull();
      });
    });

    it('RecurrencesScreen, AccountsScreen e CategoriesScreen renderizam estados vazios e dados reais', async () => {
      const r1 = await render(<RecurrencesScreen onBack={jest.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('recurrences-empty-state')).toBeTruthy();
      });
      expect(screen.getByTestId('recurrences-add-btn')).toBeTruthy();
      await r1.unmount();

      const r2 = await render(<AccountsScreen onBack={jest.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('accounts-empty-state')).toBeTruthy();
      });
      expect(screen.getByTestId('accounts-add-btn')).toBeTruthy();
      await r2.unmount();

      const r3 = await render(<CategoriesScreen onBack={jest.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('categories-empty-state')).toBeTruthy();
      });
      expect(screen.getByTestId('categories-add-btn')).toBeTruthy();
      await r3.unmount();

      // Populado
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'NuConta',
        type: 'checking',
        initialBalanceCents: 300000,
        color: '#A958E4',
      });

      const r4 = await render(<AccountsScreen onBack={jest.fn()} isPrivacyMode={false} />);
      await waitFor(() => {
        expect(screen.getByTestId(`account-row-${acc.id}`)).toBeTruthy();
      });
      expect(screen.getByTestId(`account-row-${acc.id}`)).toHaveTextContent('NuConta');
      expect(screen.getByTestId(`account-row-${acc.id}`)).toHaveTextContent('R$ 3.000,00');
      await r4.unmount();

      const r5 = await render(<CategoriesScreen onBack={jest.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('Moradia')).toBeTruthy();
        expect(screen.getByText('Mercado')).toBeTruthy();
      });
      await r5.unmount();
    });
  });
});
