import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import * as Font from 'expo-font';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../../../App';
import { resetDatabase } from '../../db/client';
import { getTodayIsoLocal, formatYearMonthPtBr } from '../../domain/financeFlow';
import { finRepository, DEFAULT_FIN_CATEGORIES } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { typography } from '../../theme/tokens';
import {
  CategoriesScreen,
  EntriesListScreen,
  EntryFormSheet,
  FinanceHomeScreen,
} from '../finance';
import { resolveCategoryVisual } from '../finance/finTheme';

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

async function seedEntries() {
  await finService.initializeFinanceModule('2026-11-13');
  const acc = await finRepository.createAccount({
    name: 'Nubank',
    type: 'checking',
    initialBalanceCents: 0,
    color: '#D96628',
  });
  const cats = await finRepository.listCategories();
  const mercado = cats.find((c) => c.name === 'Mercado')!;
  const base = {
    paid_date: null,
    paid_amount_cents: null,
    account_id: acc.id,
    category_id: mercado.id,
    recurrence_id: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
  };
  const overdue = await finRepository.createEntry({
    ...base,
    kind: 'expense',
    amount_cents: 11990,
    due_date: '2026-11-08',
    status: 'pending',
    description: 'Internet',
  });
  const upcoming = await finRepository.createEntry({
    ...base,
    kind: 'expense',
    amount_cents: 185000,
    due_date: '2026-11-15',
    status: 'pending',
    description: 'Aluguel',
  });
  const paid = await finRepository.createEntry({
    ...base,
    kind: 'income',
    amount_cents: 720000,
    due_date: '2026-11-05',
    paid_date: '2026-11-05',
    paid_amount_cents: 720000,
    status: 'paid',
    description: 'Salário',
  });
  const installments = await finService.createInstallmentPurchase({
    kind: 'expense',
    totalAmountCents: 40000,
    installmentTotal: 4,
    firstDueDate: '2026-10-18',
    accountId: acc.id,
    categoryId: mercado.id,
    description: 'Notebook',
  });
  const novPart = installments.find((p) => p.due_date.startsWith('2026-11'))!;
  finStore.setSelectedMonth('2026-11');
  return { acc, overdue, upcoming, paid, novPart };
}

describe('Sprint 56 — Fidelidade visual do módulo Finanças ao modelo aprovado', () => {
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

  describe('S56-T01: Mês atual ao abrir o módulo (fim do mês antigo em memória)', () => {
    it('finStore.resetMonthToCurrent() volta ao mês de hoje sem apagar os filtros', () => {
      finStore.setSelectedMonth('2026-08');
      finStore.setFilters({ kind: 'income' });

      finStore.resetMonthToCurrent();

      expect(finStore.getState().selectedMonth).toBe(getTodayIsoLocal().slice(0, 7));
      expect(finStore.getState().filters.kind).toBe('income');
    });

    it('tocar no globo na Home abre o módulo no mês atual mesmo com mês antigo no store', async () => {
      finStore.setSelectedMonth('2026-08');

      await render(<App />);
      fireEvent.press(screen.getByTestId('header-globe-button'));

      await waitFor(() => {
        expect(screen.getByTestId('finance-home-screen')).toBeTruthy();
      });
      const current = getTodayIsoLocal().slice(0, 7);
      expect(finStore.getState().selectedMonth).toBe(current);
      expect(screen.getByTestId('finance-home-month-label')).toHaveTextContent(
        formatYearMonthPtBr(current)
      );
    });
  });

  describe('S56-T02: Fonte Space Mono carregada no app', () => {
    it('o App registra a fonte "Space Mono" no expo-font e o token de tipografia a referencia', async () => {
      const loadSpy = Font.loadAsync as unknown as jest.Mock;
      loadSpy.mockClear();

      await render(<App />);

      expect(typography.fontFamily).toBe('Space Mono');
      const registered = loadSpy.mock.calls.some(
        (args) => args[0] && typeof args[0] === 'object' && 'Space Mono' in (args[0] as object)
      );
      expect(registered).toBe(true);
    });
  });

  describe('S56-T03: Resumo — seletor de mês e matriz de pontos de uma linha', () => {
    it('trilho do mês usa #141618 (escuro) e #F1ECE2 (claro) com setas de 38 px', async () => {
      const dark = await render(
        <FinanceHomeScreen onBack={jest.fn()} themeMode="dark" referenceDateIso="2026-11-13" />
      );
      await waitFor(() => expect(screen.getByTestId('finance-home-month-rail')).toBeTruthy());
      expect(StyleSheet.flatten(screen.getByTestId('finance-home-month-rail').props.style).backgroundColor).toBe(
        '#141618'
      );
      const prev = StyleSheet.flatten(screen.getByTestId('finance-home-month-prev').props.style);
      expect(prev.width).toBe(38);
      expect(prev.height).toBe(38);
      await dark.unmount();

      await render(
        <FinanceHomeScreen onBack={jest.fn()} themeMode="light" referenceDateIso="2026-11-13" />
      );
      await waitFor(() => expect(screen.getByTestId('finance-home-month-rail')).toBeTruthy());
      expect(StyleSheet.flatten(screen.getByTestId('finance-home-month-rail').props.style).backgroundColor).toBe(
        '#F1ECE2'
      );
    });

    it('cada linha de categoria mostra nome, pontos e percentual, sem o valor em R$', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Conta',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 50000,
        due_date: '2026-11-10',
        paid_date: '2026-11-10',
        paid_amount_cents: 50000,
        status: 'paid',
        account_id: acc.id,
        category_id: 'cat-moradia',
        description: 'Aluguel',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });
      await render(
        <FinanceHomeScreen onBack={jest.fn()} themeMode="dark" referenceDateIso="2026-11-13" />
      );
      await waitFor(() => expect(screen.getByTestId('finance-category-chart')).toBeTruthy());

      const row = screen.getByTestId('finance-category-dot-row-cat-moradia');
      expect(within(row).getByText('Moradia')).toBeTruthy();
      expect(screen.getByTestId('finance-category-pct-cat-moradia')).toHaveTextContent('100%');
      expect(row).not.toHaveTextContent(/R\$/);
      const flat = StyleSheet.flatten(row.props.style);
      expect(flat.flexDirection).toBe('row');
    });
  });

  describe('S56-T04: Lançamentos — linhas limpas e folha de ações', () => {
    it('as linhas não exibem selos nem botões Pagar/Excluir e a parcela mostra "data • Parcela n/N"', async () => {
      const { overdue, upcoming, novPart } = await seedEntries();

      await render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId(`entry-row-${overdue.id}`)).toBeTruthy());

      expect(screen.queryByTestId(`entry-overdue-badge-${overdue.id}`)).toBeNull();
      expect(screen.queryByTestId(`entry-duesoon-badge-${upcoming.id}`)).toBeNull();
      expect(screen.queryByTestId(`entry-pay-btn-${upcoming.id}`)).toBeNull();
      expect(screen.queryByTestId(`entry-delete-btn-${novPart.id}`)).toBeNull();

      expect(screen.getByTestId(`entry-subtitle-${overdue.id}`)).toHaveTextContent(/^Venceu 08\/11 • /);
      expect(screen.getByTestId(`entry-subtitle-${novPart.id}`)).toHaveTextContent(
        /^18\/11\/2026 • Parcela 2\/4$/
      );
    });

    it('tocar na linha pendente abre a folha com Pagar, Editar e Excluir', async () => {
      const { upcoming } = await seedEntries();

      await render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId(`entry-row-${upcoming.id}`)).toBeTruthy());

      fireEvent.press(screen.getByTestId(`entry-row-${upcoming.id}`));

      await waitFor(() => expect(screen.getByTestId('entry-actions-sheet')).toBeTruthy());
      expect(screen.getByTestId(`entry-action-pay-${upcoming.id}`)).toBeTruthy();
      expect(screen.getByTestId(`entry-action-edit-${upcoming.id}`)).toBeTruthy();
      expect(screen.getByTestId(`entry-action-delete-${upcoming.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`entry-action-reopen-${upcoming.id}`)).toBeNull();
    });

    it('a folha da linha liquidada oferece Reabrir e reabrir volta o lançamento para pendente', async () => {
      const { paid } = await seedEntries();

      await render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId(`entry-row-${paid.id}`)).toBeTruthy());

      fireEvent.press(screen.getByTestId(`entry-row-${paid.id}`));
      await waitFor(() => expect(screen.getByTestId(`entry-action-reopen-${paid.id}`)).toBeTruthy());
      expect(screen.queryByTestId(`entry-action-pay-${paid.id}`)).toBeNull();

      fireEvent.press(screen.getByTestId(`entry-action-reopen-${paid.id}`));
      await waitFor(async () => {
        const refreshed = await finRepository.getEntryById(paid.id);
        expect(refreshed?.status).toBe('pending');
      });
    });

    it('excluir pela folha remove o lançamento avulso', async () => {
      const { upcoming } = await seedEntries();

      await render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId(`entry-row-${upcoming.id}`)).toBeTruthy());

      fireEvent.press(screen.getByTestId(`entry-row-${upcoming.id}`));
      await waitFor(() => expect(screen.getByTestId(`entry-action-delete-${upcoming.id}`)).toBeTruthy());
      fireEvent.press(screen.getByTestId(`entry-action-delete-${upcoming.id}`));

      await waitFor(async () => {
        expect(await finRepository.getEntryById(upcoming.id)).toBeFalsy();
      });
    });
  });

  describe('S56-T05: Formulário — data dd/mm/aaaa, conta ao lado do vencimento e rodapé fixo', () => {
    it('exibe o vencimento como dd/mm/aaaa com placeholder dd/mm/aaaa e grava em ISO', async () => {
      await finService.initializeFinanceModule('2026-11-14');
      await finRepository.createAccount({
        name: 'Carteira',
        type: 'cash',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const onSaved = jest.fn();

      await render(
        <EntryFormSheet visible={true} onClose={jest.fn()} onSaved={onSaved} defaultDueDate="2026-11-14" />
      );
      await waitFor(() => expect(screen.getByTestId('entry-form-due-date')).toBeTruthy());

      const dateInput = screen.getByTestId('entry-form-due-date');
      expect(dateInput.props.value).toBe('14/11/2026');
      expect(dateInput.props.placeholder).toBe('dd/mm/aaaa');

      fireEvent.changeText(screen.getByTestId('entry-form-amount'), '10,00');
      fireEvent.changeText(screen.getByTestId('entry-form-description'), 'Café');
      fireEvent.changeText(dateInput, '20/11/2026');
      fireEvent.press(screen.getByTestId('entry-form-save-btn'));

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      const entries = await finRepository.listAllEntries();
      expect(entries.find((e) => e.description === 'Café')?.due_date).toBe('2026-11-20');
    });

    it('mostra Vencimento e Conta na mesma linha e a lista de contas só aparece ao tocar em Conta', async () => {
      await finService.initializeFinanceModule('2026-11-14');
      const first = await finRepository.createAccount({
        name: 'Nubank',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const second = await finRepository.createAccount({
        name: 'Itaú',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D5CAA8',
      });

      await render(<EntryFormSheet visible={true} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('entry-form-account-select')).toBeTruthy());

      expect(screen.getByTestId('entry-form-meta-row')).toBeTruthy();
      expect(within(screen.getByTestId('entry-form-meta-row')).getByTestId('entry-form-due-date')).toBeTruthy();
      expect(
        within(screen.getByTestId('entry-form-meta-row')).getByTestId('entry-form-account-select')
      ).toBeTruthy();
      expect(screen.getByTestId('entry-form-account-select')).toHaveTextContent(/Nubank|Itaú/);

      expect(screen.queryByTestId(`entry-form-account-${first.id}`)).toBeNull();
      fireEvent.press(screen.getByTestId('entry-form-account-select'));
      expect(screen.getByTestId(`entry-form-account-${first.id}`)).toBeTruthy();
      fireEvent.press(screen.getByTestId(`entry-form-account-${second.id}`));
      expect(screen.getByTestId('entry-form-account-select')).toHaveTextContent('Itaú');
    });

    it('sem contas cadastradas exibe o aviso "Nenhuma conta cadastrada"', async () => {
      await finService.initializeFinanceModule('2026-11-14');

      await render(<EntryFormSheet visible={true} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('entry-form-account-empty')).toBeTruthy());

      expect(screen.getByTestId('entry-form-account-empty')).toHaveTextContent(/Nenhuma conta cadastrada/);
    });

    it('o botão Salvar fica num rodapé fixo (entry-form-footer), fora da área rolável', async () => {
      await finService.initializeFinanceModule('2026-11-14');

      await render(<EntryFormSheet visible={true} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('entry-form-footer')).toBeTruthy());

      const footer = screen.getByTestId('entry-form-footer');
      expect(within(footer).getByTestId('entry-form-save-btn')).toBeTruthy();
    });
  });

  describe('S56-T06: Categorias — tile de edição por tema, linhas sem arquivar e campo com linha', () => {
    it('o tile de edição é #1C1E20 no escuro e #FFFFFF no claro', async () => {
      await finService.initializeFinanceModule('2026-11-13');

      const dark = await render(<CategoriesScreen onBack={jest.fn()} themeMode="dark" />);
      await waitFor(() => expect(screen.getByTestId('category-row-cat-moradia')).toBeTruthy());
      fireEvent.press(screen.getByTestId('category-row-cat-moradia'));
      await waitFor(() => expect(screen.getByTestId('categories-edit-tile')).toBeTruthy());
      expect(StyleSheet.flatten(screen.getByTestId('categories-edit-tile').props.style).backgroundColor).toBe(
        '#1C1E20'
      );
      await dark.unmount();

      await render(<CategoriesScreen onBack={jest.fn()} themeMode="light" />);
      await waitFor(() => expect(screen.getByTestId('category-row-cat-moradia')).toBeTruthy());
      fireEvent.press(screen.getByTestId('category-row-cat-moradia'));
      await waitFor(() => expect(screen.getByTestId('categories-edit-tile')).toBeTruthy());
      expect(StyleSheet.flatten(screen.getByTestId('categories-edit-tile').props.style).backgroundColor).toBe(
        '#FFFFFF'
      );
    });

    it('as linhas não têm ícone de arquivar e o campo Nome é só texto com linha inferior laranja', async () => {
      await finService.initializeFinanceModule('2026-11-13');

      await render(<CategoriesScreen onBack={jest.fn()} themeMode="light" />);
      await waitFor(() => expect(screen.getByTestId('category-row-cat-moradia')).toBeTruthy());

      expect(screen.queryByTestId('category-archive-btn-cat-moradia')).toBeNull();
      expect(screen.queryByTestId('category-archive-btn-cat-mercado')).toBeNull();

      fireEvent.press(screen.getByTestId('category-row-cat-moradia'));
      await waitFor(() => expect(screen.getByTestId('category-edit-name-input')).toBeTruthy());

      const input = StyleSheet.flatten(screen.getByTestId('category-edit-name-input').props.style);
      expect(input.backgroundColor).toBeUndefined();
      expect(input.borderBottomWidth).toBe(1);
      expect(input.borderBottomColor).toBe('#D96628');
      expect(input.borderWidth ?? 0).toBe(0);
    });

    it('botões Arquivar e Salvar do tile têm 48 px de altura e raio 24', async () => {
      await finService.initializeFinanceModule('2026-11-13');

      await render(<CategoriesScreen onBack={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('category-row-cat-moradia')).toBeTruthy());
      fireEvent.press(screen.getByTestId('category-row-cat-moradia'));
      await waitFor(() => expect(screen.getByTestId('category-edit-save-btn')).toBeTruthy());

      for (const id of ['category-edit-archive-btn', 'category-edit-save-btn']) {
        const flat = StyleSheet.flatten(screen.getByTestId(id).props.style);
        expect(flat.height).toBe(48);
        expect(flat.borderRadius).toBe(24);
      }
    });
  });

  describe('S56-T07: Categoria Mercado na cor creme #D5CAA8', () => {
    it('a semente padrão usa #D5CAA8 para Mercado e o visual ignora o verde antigo da semente', () => {
      expect(DEFAULT_FIN_CATEGORIES.find((c) => c.id === 'cat-mercado')?.color).toBe('#D5CAA8');
      const legacy = resolveCategoryVisual({ id: 'cat-mercado', name: 'Mercado', color: '#2E4A44' });
      expect(legacy.color).toBe('#D5CAA8');
      expect(legacy.iconColor).toBe('#111315');
    });
  });
});
