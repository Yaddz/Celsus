import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { FinListCard, FinListRow } from '../../components/ui';
import {
  AccountsScreen,
  CategoriesScreen,
  EntriesListScreen,
  EntryFormSheet,
  FinanceHomeScreen,
  RecurrencesScreen,
  SubscriptionsScreen,
} from '../finance';
import {
  APPROVED_FIN_PALETTE,
  FIN_COLOR_SWATCHES,
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  formatSignedCentsBRL,
  getFinUiColors,
  resolveCategoryVisual,
} from '../finance/finTheme';

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

const FORBIDDEN_COLORS = ['#2A904C', '#3386B0', '#A958E4', '#CD528F', '#178D84'];

function expectFabStyle(testId: string) {
  const fab = screen.getByTestId(testId);
  expect(fab).toBeTruthy();
  const flat = StyleSheet.flatten(fab.props.style);
  expect(flat.width).toBe(56);
  expect(flat.height).toBe(56);
  expect(flat.borderRadius).toBe(28);
  expect(flat.backgroundColor).toBe('#D96628');
  expect(fab.props.accessibilityLabel).toBeTruthy();
}

describe('Sprint 55 — Reskin Visual do Módulo Finanças (Bento Design System)', () => {
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

  describe('S55-T01: Paleta aprovada, cores claro/escuro e mapeamento de categorias', () => {
    it('restringe FIN_COLOR_SWATCHES estritamente à paleta aprovada do app', () => {
      expect(APPROVED_FIN_PALETTE).toEqual([
        '#D96628',
        '#D5CAA8',
        '#C49A45',
        '#AECDC5',
        '#2E4A44',
        '#B8B2A6',
        '#E6DECA',
      ]);
      expect(Array.from(FIN_COLOR_SWATCHES)).toEqual(Array.from(APPROVED_FIN_PALETTE));
      for (const forbidden of FORBIDDEN_COLORS) {
        expect(FIN_COLOR_SWATCHES).not.toContain(forbidden);
      }
    });

    it('fornece tokens corretos para entrada, saída, alerta e superfície nos temas escuro e claro', () => {
      const dark = getFinUiColors('dark');
      expect(dark.background).toBe('#111315');
      expect(dark.surface).toBe('#1C1E20');
      expect(dark.text).toBe('#E6DECA');
      expect(dark.muted).toBe('#8A8A8E');
      expect(dark.income).toBe('#AECDC5');
      expect(dark.expense).toBe('#D96628');
      expect(dark.warning).toBe('#D4A83B');

      const light = getFinUiColors('light');
      expect(light.background).toBe('#F4F1EA');
      expect(light.surface).toBe('#FFFFFF');
      expect(light.text).toBe('#111315');
      expect(light.muted).toBe('#6E6A63');
      expect(light.income).toBe('#1D6F5B');
      expect(light.expense).toBe('#C24D18');
      expect(light.warning).toBe('#D4A83B');
    });

    it('mapeia ícones Material e cores da paleta aprovada para todas as categorias padrão e contrasta sobre #2E4A44', () => {
      const cases = [
        { name: 'Moradia', id: 'cat-moradia', icon: 'home', color: '#D96628', iconColor: '#111315' },
        { name: 'Mercado', id: 'cat-mercado', icon: 'shopping-cart', color: '#D5CAA8', iconColor: '#111315' },
        { name: 'Transporte', id: 'cat-transporte', icon: 'directions-car', color: '#C49A45', iconColor: '#111315' },
        { name: 'Saúde', id: 'cat-saude', icon: 'local-hospital', color: '#AECDC5', iconColor: '#111315' },
        { name: 'Lazer', id: 'cat-lazer', icon: 'movie', color: '#B8B2A6', iconColor: '#111315' },
        { name: 'Assinaturas', id: 'cat-assinaturas', icon: 'autorenew', color: '#E6DECA', iconColor: '#111315' },
        { name: 'Salário', id: 'cat-salario', icon: 'payments', color: '#AECDC5', iconColor: '#111315' },
        { name: 'Outros', id: 'cat-outros-despesa', icon: 'category', color: '#8A8A8E', iconColor: '#111315' },
      ];

      for (const item of cases) {
        const res = resolveCategoryVisual({ id: item.id, name: item.name, color: '#3386B0' });
        expect(res.icon).toBe(item.icon);
        expect(res.color).toBe(item.color);
        expect(res.iconColor).toBe(item.iconColor);
      }

      const forestVisual = resolveCategoryVisual({
        id: 'custom-forest',
        name: 'Investimentos',
        icon: 'savings',
        color: '#2E4A44',
      });
      expect(forestVisual.color).toBe('#2E4A44');
      expect(forestVisual.iconColor).toBe('#E6DECA');
    });

    it('formata valores com prefixo +/- e mascara no modo privacidade', () => {
      expect(formatSignedCentsBRL(500000, 'income', false)).toBe('+R$ 5.000,00');
      expect(formatSignedCentsBRL(185000, 'expense', false)).toBe('-R$ 1.850,00');
      expect(formatSignedCentsBRL(500000, 'income', true)).toBe('R$ ••••••');
      expect(formatSignedCentsBRL(185000, 'expense', true)).toBe('R$ ••••••');
    });
  });

  describe('S55-T02: FinListCard e FinListRow (tile único com filetes)', () => {
    it('renderiza tile único nos temas escuro e claro e remove filete apenas da última linha', async () => {
      const darkRender = await render(
        <FinListCard testID="test-fin-list-card" title="SEÇÃO TESTE" actionLabel="Ver tudo ›" themeMode="dark">
          <FinListRow testID="test-row-1" icon="home" avatarColor="#D96628" title="Aluguel" subtitle="10/11" amountText="-R$ 1.500,00" themeMode="dark" />
          <FinListRow testID="test-row-2" icon="shopping-cart" avatarColor="#D5CAA8" title="Mercado" subtitle="12/11" amountText="-R$ 420,00" themeMode="dark" />
          <FinListRow testID="test-row-3" icon="payments" avatarColor="#AECDC5" title="Salário" subtitle="05/11" amountText="+R$ 5.000,00" isLast themeMode="dark" />
        </FinListCard>
      );

      const darkCardStyle = StyleSheet.flatten(screen.getByTestId('test-fin-list-card').props.style);
      expect(darkCardStyle.backgroundColor).toBe('#1C1E20');
      expect(darkCardStyle.borderRadius).toBe(28);
      expect(darkCardStyle.paddingHorizontal).toBe(18);
      expect(darkCardStyle.paddingVertical).toBe(6);

      const row1Style = StyleSheet.flatten(screen.getByTestId('test-row-1').props.style);
      const row2Style = StyleSheet.flatten(screen.getByTestId('test-row-2').props.style);
      const row3Style = StyleSheet.flatten(screen.getByTestId('test-row-3').props.style);
      expect(row1Style.minHeight).toBe(72);
      expect(row1Style.borderBottomWidth).toBe(1);
      expect(row1Style.borderBottomColor).toBe('#26292C');
      expect(row2Style.borderBottomWidth).toBe(1);
      expect(row3Style.borderBottomWidth).toBe(0);

      await darkRender.unmount();

      await render(
        <FinListCard testID="test-fin-list-card" title="SEÇÃO CLARA" themeMode="light">
          <FinListRow testID="test-row-1" icon="home" avatarColor="#D96628" title="Aluguel" themeMode="light" />
          <FinListRow testID="test-row-2" icon="payments" avatarColor="#AECDC5" title="Salário" isLast themeMode="light" />
        </FinListCard>
      );

      const lightCardStyle = StyleSheet.flatten(screen.getByTestId('test-fin-list-card').props.style);
      expect(lightCardStyle.backgroundColor).toBe('#FFFFFF');
      const lightRow1Style = StyleSheet.flatten(screen.getByTestId('test-row-1').props.style);
      const lightRow2Style = StyleSheet.flatten(screen.getByTestId('test-row-2').props.style);
      expect(lightRow1Style.borderBottomColor).toBe('#F0EBE1');
      expect(lightRow2Style.borderBottomWidth).toBe(0);
    });
  });

  describe('S55-T03: XpMinimalHeader com título, subtítulo e olho em todas as 6 telas', () => {
    it('exibe título, subtítulo exato e globo laranja ativo no Resumo', async () => {
      finStore.setSelectedMonth('2026-11');

      const r1 = await render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId('finance-home-screen')).toBeTruthy());
      expect(screen.getByText('Finanças')).toBeTruthy();
      expect(screen.getByText('Controle pessoal')).toBeTruthy();
      expect(screen.getByTestId('header-back-button')).toBeTruthy();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      const globeIcon = screen.getByTestId('header-globe-icon');
      expect(globeIcon.props.color).toBe('#D96628');
      await r1.unmount();

      const r2 = await render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      expect(screen.getByText('Lançamentos')).toBeTruthy();
      expect(screen.getByTestId('entries-month-label')).toHaveTextContent('Novembro 2026');
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      await r2.unmount();

      const r3 = await render(<RecurrencesScreen onBack={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('recurrences-screen')).toBeTruthy());
      expect(screen.getByText('Recorrências')).toBeTruthy();
      expect(screen.getByText('Lançamentos que se repetem')).toBeTruthy();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      await r3.unmount();

      const r4 = await render(<SubscriptionsScreen onBack={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('subscriptions-screen')).toBeTruthy());
      expect(screen.getByText('Assinaturas')).toBeTruthy();
      expect(screen.getByText('Cobranças recorrentes')).toBeTruthy();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      await r4.unmount();

      const r5 = await render(<AccountsScreen onBack={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('accounts-screen')).toBeTruthy());
      expect(screen.getByText('Contas')).toBeTruthy();
      expect(screen.getByText('Onde está o seu dinheiro')).toBeTruthy();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      await r5.unmount();

      const r6 = await render(<CategoriesScreen onBack={jest.fn()} />);
      await waitFor(() => expect(screen.getByTestId('categories-screen')).toBeTruthy());
      expect(screen.getByText('Categorias')).toBeTruthy();
      expect(screen.getByText('Organize seus lançamentos')).toBeTruthy();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      await r6.unmount();
    });
  });

  describe('S55-T04: FinanceHomeScreen — Bento tiles, matriz de pontos (top 5) e FAB 56px nos 2 temas', () => {
    async function seedHomeCategoriesData() {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Conta Principal',
        type: 'checking',
        initialBalanceCents: 200000,
        color: '#2E4A44',
      });
      const cats = await finRepository.listCategories();
      const catNames = ['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Lazer', 'Assinaturas'];
      const amounts = [50000, 20000, 15000, 8000, 5000, 2000]; // Soma = 100.000 centavos (50%, 20%, 15%, 8%, 5%, 2%)
      const salario = cats.find((c) => c.name === 'Salário')!;

      await finRepository.createEntry({
        kind: 'income',
        amount_cents: 500000,
        due_date: '2026-11-05',
        paid_date: '2026-11-05',
        paid_amount_cents: 500000,
        status: 'paid',
        account_id: acc.id,
        category_id: salario.id,
        description: 'Salário Nov',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      const createdCatIds: string[] = [];
      for (let i = 0; i < catNames.length; i++) {
        const cat = cats.find((c) => c.name === catNames[i])!;
        createdCatIds.push(cat.id);
        await finRepository.createEntry({
          kind: 'expense',
          amount_cents: amounts[i],
          due_date: i === 0 ? '2026-11-08' : '2026-11-16',
          paid_date: null,
          paid_amount_cents: null,
          status: 'pending',
          account_id: acc.id,
          category_id: cat.id,
          description: `Gasto ${catNames[i]}`,
          recurrence_id: null,
          installment_group_id: null,
          installment_number: null,
          installment_total: null,
        });
      }

      finStore.setSelectedMonth('2026-11');
      return createdCatIds;
    }

    it('renderiza tiles Bento, top 5 categorias em matriz de pontos, FAB 56px e funciona nos temas escuro e claro', async () => {
      const catIds = await seedHomeCategoriesData();

      const dark = await render(
        <FinanceHomeScreen onBack={jest.fn()} themeMode="dark" referenceDateIso="2026-11-13" />
      );

      await waitFor(() => {
        expect(screen.getByTestId('finance-month-balance')).toBeTruthy();
        expect(screen.getByTestId('finance-category-chart')).toBeTruthy();
      });

      expect(screen.getByTestId('finance-home-month-prev')).toBeTruthy();
      expect(screen.getByTestId('finance-home-month-label')).toHaveTextContent('Novembro 2026');
      expect(screen.getByTestId('finance-home-month-next')).toBeTruthy();

      const balanceText = screen.getByTestId('finance-month-balance');
      const balanceStyle = StyleSheet.flatten(balanceText.props.style);
      expect(balanceStyle.fontSize).toBe(32);
      expect(balanceStyle.color).toBe('#1A0E08');
      expect(screen.getByTestId('finance-month-comparison')).toBeTruthy();

      const incomeText = screen.getByTestId('finance-month-income');
      expect(incomeText).toHaveTextContent(/^\+R\$\s*5\.000,00$/);
      expect(StyleSheet.flatten(incomeText.props.style).color).toBe('#AECDC5');

      const expenseText = screen.getByTestId('finance-month-expense');
      expect(expenseText).toHaveTextContent(/^-R\$\s*1\.000,00$/);
      expect(StyleSheet.flatten(expenseText.props.style).color).toBe('#D96628');

      expect(screen.getByTestId('finance-upcoming-7d')).toBeTruthy();
      expect(screen.getByTestId('finance-overdue-tile')).toBeTruthy();

      // Matriz de pontos com as 5 principais categorias e percentuais exatos (6ª fica de fora)
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`finance-category-dot-row-${catIds[i]}`)).toBeTruthy();
      }
      expect(screen.queryByTestId(`finance-category-dot-row-${catIds[5]}`)).toBeNull();
      expect(screen.getByTestId(`finance-category-pct-${catIds[0]}`)).toHaveTextContent('50%');
      expect(screen.getByTestId(`finance-category-pct-${catIds[1]}`)).toHaveTextContent('20%');

      expect(screen.getByTestId('finance-shortcut-subscriptions')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-recurrences')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-accounts')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-categories')).toBeTruthy();
      expect(screen.getByTestId('finance-shortcut-entries')).toBeTruthy();

      expectFabStyle('finance-add-entry-btn');
      await dark.unmount();

      // Tema claro
      await render(
        <FinanceHomeScreen onBack={jest.fn()} themeMode="light" referenceDateIso="2026-11-13" />
      );
      await waitFor(() => expect(screen.getByTestId('finance-month-income')).toBeTruthy());
      expect(StyleSheet.flatten(screen.getByTestId('finance-month-income').props.style).color).toBe('#1D6F5B');
      expect(StyleSheet.flatten(screen.getByTestId('finance-month-expense').props.style).color).toBe('#C24D18');
      const lightScreenBg = StyleSheet.flatten(screen.getByTestId('finance-home-screen').props.style).backgroundColor;
      expect(lightScreenBg).toBe('#F4F1EA');
    });
  });

  describe('S55-T05: EntriesListScreen e EntryFormSheet', () => {
    it('renderiza SegmentedControl, seções EM ATRASO / PRÓXIMOS DIAS / LIQUIDADOS em FinListCard e FAB 56px', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Conta Corrente',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#2E4A44',
      });
      const cats = await finRepository.listCategories();
      const catMoradia = cats.find((c) => c.name === 'Moradia')!;
      const catSalario = cats.find((c) => c.name === 'Salário')!;

      const overdue = await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 185000,
        due_date: '2026-11-08',
        paid_date: null,
        paid_amount_cents: null,
        status: 'pending',
        account_id: acc.id,
        category_id: catMoradia.id,
        description: 'Aluguel',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      const upcoming = await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 9500,
        due_date: '2026-11-16',
        paid_date: null,
        paid_amount_cents: null,
        status: 'pending',
        account_id: acc.id,
        category_id: catMoradia.id,
        description: 'Internet',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      const paid = await finRepository.createEntry({
        kind: 'income',
        amount_cents: 500000,
        due_date: '2026-11-05',
        paid_date: '2026-11-05',
        paid_amount_cents: 500000,
        status: 'paid',
        account_id: acc.id,
        category_id: catSalario.id,
        description: 'Salário Mensal',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      finStore.setSelectedMonth('2026-11');
      await render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />);

      await waitFor(() => {
        expect(screen.getByTestId(`entry-row-${overdue.id}`)).toBeTruthy();
        expect(screen.getByTestId(`entry-row-${upcoming.id}`)).toBeTruthy();
        expect(screen.getByTestId(`entry-row-${paid.id}`)).toBeTruthy();
      });

      expect(screen.getByTestId('entries-kind-segmented')).toBeTruthy();
      expect(screen.getByTestId('entries-filter-kind-all')).toBeTruthy();
      expect(screen.getByTestId('entries-filter-kind-income')).toBeTruthy();
      expect(screen.getByTestId('entries-filter-kind-expense')).toBeTruthy();
      expect(screen.getByTestId('entries-filter-status-pending')).toBeTruthy();
      expect(screen.getByTestId('entries-filter-status-paid')).toBeTruthy();

      expect(screen.getByText('EM ATRASO')).toBeTruthy();
      expect(screen.getByText('PRÓXIMOS DIAS')).toBeTruthy();
      expect(screen.getByText('LIQUIDADOS')).toBeTruthy();

      const overdueCardStyle = StyleSheet.flatten(screen.getByTestId('entries-section-overdue').props.style);
      expect(overdueCardStyle.backgroundColor).toBe('#1C1E20');
      expect(overdueCardStyle.borderRadius).toBe(28);
      expect(screen.getByTestId('entries-section-upcoming')).toBeTruthy();
      expect(screen.getByTestId('entries-section-paid')).toBeTruthy();

      const overdueSub = screen.getByTestId(`entry-subtitle-${overdue.id}`);
      expect(StyleSheet.flatten(overdueSub.props.style).color).toBe('#D96628');

      expectFabStyle('entries-add-btn');
    });

    it('EntryFormSheet usa BentoSections VALOR, DESCRIÇÃO, CATEGORIA, REPETIÇÃO e botão Salvar lançamento 56px', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      await finRepository.createAccount({
        name: 'Carteira',
        type: 'cash',
        initialBalanceCents: 0,
        color: '#D96628',
      });

      await render(<EntryFormSheet visible onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('entry-form-description')).toBeTruthy();
      });

      expect(screen.getByTestId('entry-form-kind-segmented')).toBeTruthy();
      expect(screen.getByTestId('entry-form-section-valor')).toBeTruthy();
      expect(screen.getByTestId('entry-form-section-descricao')).toBeTruthy();
      expect(screen.getByTestId('entry-form-section-categoria')).toBeTruthy();
      expect(screen.getByTestId('entry-form-section-repeticao')).toBeTruthy();
      expect(screen.getByTestId('entry-form-repeat-segmented')).toBeTruthy();
      expect(screen.getByTestId('entry-form-repeat-helper')).toBeTruthy();

      expect(screen.getByText('Salvar lançamento')).toBeTruthy();
      const saveStyle = StyleSheet.flatten(screen.getByTestId('entry-form-save-btn').props.style);
      expect(saveStyle.height).toBe(56);
      expect(saveStyle.borderRadius).toBe(28);
      expect(saveStyle.backgroundColor).toBe('#D96628');
    });
  });

  describe('S55-T06: RecurrencesScreen e SubscriptionsScreen', () => {
    it('RecurrencesScreen exibe tiles FIXO SAÍDAS/ENTRADAS, seções ATIVAS/ENCERRADAS em tile único e FAB 56px', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Conta Corrente',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#2E4A44',
      });
      const cats = await finRepository.listCategories();
      const catMoradia = cats.find((c) => c.name === 'Moradia')!;
      const catSalario = cats.find((c) => c.name === 'Salário')!;

      await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 150000,
        description: 'Aluguel Fixo',
        account_id: acc.id,
        category_id: catMoradia.id,
        frequency: 'monthly',
        day_of_month: 15,
        start_date: '2026-01-15',
        end_date: '2027-03-15',
        is_subscription: 0,
        active: 1,
        generated_until: null,
      });

      await finRepository.createRecurrence({
        kind: 'income',
        amount_cents: 600000,
        description: 'Salário Fixo',
        account_id: acc.id,
        category_id: catSalario.id,
        frequency: 'monthly',
        day_of_month: 5,
        start_date: '2026-01-05',
        end_date: null,
        is_subscription: 0,
        active: 1,
        generated_until: null,
      });

      await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 12000,
        description: 'Academia Antiga',
        account_id: acc.id,
        category_id: catMoradia.id,
        frequency: 'monthly',
        day_of_month: 10,
        start_date: '2025-01-10',
        end_date: '2026-06-10',
        is_subscription: 0,
        active: 0,
        generated_until: null,
      });

      await render(<RecurrencesScreen onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('recurrences-fixed-expense-tile')).toBeTruthy();
      });

      expect(screen.getByTestId('recurrences-fixed-income-tile')).toBeTruthy();
      expect(screen.getByText('FIXO · SAÍDAS')).toBeTruthy();
      expect(screen.getByText('FIXO · ENTRADAS')).toBeTruthy();
      expect(screen.getByText('ATIVAS · 2')).toBeTruthy();
      expect(screen.getByText('ENCERRADAS · 1')).toBeTruthy();
      expect(screen.getByTestId('recurrences-active-list')).toBeTruthy();
      const endedStyle = StyleSheet.flatten(screen.getByTestId('recurrences-ended-list').props.style);
      expect(endedStyle.opacity).toBeCloseTo(0.7, 1);

      expectFabStyle('recurrences-add-btn');
    });

    it('SubscriptionsScreen exibe tile forest, SegmentedControl, botões Pausar/Cancelar/Retomar e FAB 56px', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Cartão',
        type: 'card',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const cats = await finRepository.listCategories();
      const catAssin = cats.find((c) => c.name === 'Assinaturas')!;

      const activeSub = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 5000,
        description: 'Cloud Storage',
        account_id: acc.id,
        category_id: catAssin.id,
        frequency: 'monthly',
        day_of_month: 10,
        start_date: '2026-10-10',
        end_date: null,
        is_subscription: 1,
        active: 1,
        generated_until: null,
      });

      const pausedSub = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 3500,
        description: 'Music Plus',
        account_id: acc.id,
        category_id: catAssin.id,
        frequency: 'monthly',
        day_of_month: 20,
        start_date: '2026-09-20',
        end_date: null,
        is_subscription: 1,
        active: 0,
        generated_until: null,
      });

      await render(<SubscriptionsScreen onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('subscriptions-summary-tile')).toBeTruthy();
      });

      expect(screen.getByText('GASTO COM ASSINATURAS')).toBeTruthy();
      const summaryStyle = StyleSheet.flatten(screen.getByTestId('subscriptions-summary-tile').props.style);
      expect(summaryStyle.backgroundColor).toBe('#2E4A44');

      expect(StyleSheet.flatten(screen.getByTestId('subscriptions-monthly-total').props.style).fontSize).toBe(24);
      expect(StyleSheet.flatten(screen.getByTestId('subscriptions-annual-total').props.style).fontSize).toBe(24);

      expect(screen.getByTestId('subscriptions-status-segmented')).toBeTruthy();

      const pauseBtnStyle = StyleSheet.flatten(screen.getByTestId(`subscription-pause-btn-${activeSub.id}`).props.style);
      const cancelBtnStyle = StyleSheet.flatten(screen.getByTestId(`subscription-cancel-btn-${activeSub.id}`).props.style);
      expect(pauseBtnStyle.height).toBe(36);
      expect(pauseBtnStyle.borderRadius).toBe(11);
      expect(cancelBtnStyle.height).toBe(36);
      expect(cancelBtnStyle.borderRadius).toBe(11);

      expect(screen.getByText('PAUSADAS')).toBeTruthy();
      const resumeBtnStyle = StyleSheet.flatten(screen.getByTestId(`subscription-resume-btn-${pausedSub.id}`).props.style);
      expect(resumeBtnStyle.backgroundColor).toBe('#D96628');

      expectFabStyle('subscriptions-add-btn');
    });
  });

  describe('S55-T07: AccountsScreen e CategoriesScreen', () => {
    it('AccountsScreen exibe tile SALDO TOTAL, seções CONTAS, CARTÕES e ARQUIVADAS com Restaurar e FAB 56px', async () => {
      await finRepository.createAccount({
        name: 'NuConta',
        type: 'checking',
        initialBalanceCents: 300000,
        color: '#2E4A44',
      });
      await finRepository.createAccount({
        name: 'Carteira Física',
        type: 'cash',
        initialBalanceCents: 20000,
        color: '#D5CAA8',
      });
      await finRepository.createAccount({
        name: 'Cartão Celsus',
        type: 'card',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const oldAcc = await finRepository.createAccount({
        name: 'Conta Antiga',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#8A8A8E',
      });
      await finRepository.archiveAccount(oldAcc.id);

      await render(<AccountsScreen onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('accounts-total-balance-tile')).toBeTruthy();
      });

      const totalTileStyle = StyleSheet.flatten(screen.getByTestId('accounts-total-balance-tile').props.style);
      expect(totalTileStyle.backgroundColor).toBe('#D96628');
      expect(screen.getByText('2 contas ativas • cartões ficam fora do saldo')).toBeTruthy();

      expect(screen.getByText('CONTAS')).toBeTruthy();
      expect(screen.getByText('CARTÕES')).toBeTruthy();
      expect(screen.getByText('ARQUIVADAS · 1')).toBeTruthy();
      expect(screen.getByTestId('accounts-section-checking')).toBeTruthy();
      expect(screen.getByTestId('accounts-section-cards')).toBeTruthy();

      const archivedSection = screen.getByTestId('accounts-section-archived');
      expect(StyleSheet.flatten(archivedSection.props.style).opacity).toBeCloseTo(0.7, 1);
      expect(screen.getByTestId(`account-restore-btn-${oldAcc.id}`)).toBeTruthy();

      expectFabStyle('accounts-add-btn');
    });

    it('CategoriesScreen exibe SegmentedControl, lista única em tile com avatar 40px, edição inline EDITAR · <nome> e FAB 56px', async () => {
      await finService.initializeFinanceModule('2026-11-13');

      await render(<CategoriesScreen onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('categories-list-card')).toBeTruthy();
      });

      expect(screen.getByTestId('categories-kind-segmented')).toBeTruthy();

      const listCardStyle = StyleSheet.flatten(screen.getByTestId('categories-list-card').props.style);
      expect(listCardStyle.backgroundColor).toBe('#1C1E20');
      expect(listCardStyle.borderRadius).toBe(28);

      const moradiaAvatar = screen.getByTestId('category-avatar-cat-moradia');
      expect(StyleSheet.flatten(moradiaAvatar.props.style).width).toBe(40);
      expect(StyleSheet.flatten(moradiaAvatar.props.style).height).toBe(40);

      fireEvent.press(screen.getByTestId('category-row-cat-moradia'));

      await waitFor(() => {
        expect(screen.getByTestId('categories-edit-tile')).toBeTruthy();
      });
      expect(screen.getByText('EDITAR · MORADIA')).toBeTruthy();
      expect(screen.getByTestId('category-edit-name-input')).toBeTruthy();
      expect(screen.getByTestId('category-edit-color-row')).toBeTruthy();
      expect(screen.getByTestId('category-edit-archive-btn')).toBeTruthy();
      expect(screen.getByTestId('category-edit-save-btn')).toBeTruthy();

      const firstSwatch = screen.getByTestId(`category-edit-color-${FIN_COLOR_SWATCHES[0]}`);
      expect(StyleSheet.flatten(firstSwatch.props.style).width).toBe(30);
      expect(StyleSheet.flatten(firstSwatch.props.style).height).toBe(30);

      expectFabStyle('categories-add-btn');
    });
  });

  describe('S55-T08: Estados vazio, carregamento (Skeleton) e erro reestilizados', () => {
    it('renderiza FinLoadingView, FinErrorView e FinEmptyState nos temas escuro e claro com tokens Bento', async () => {
      const l = await render(<FinLoadingView themeMode="dark" />);
      expect(screen.getByTestId('fin-loading-state')).toBeTruthy();
      await l.unmount();

      const onRetry = jest.fn();
      const errDark = await render(<FinErrorView message="Falha na leitura" onRetry={onRetry} themeMode="dark" />);
      const errBoxDark = StyleSheet.flatten(screen.getByTestId('fin-error-state').props.style);
      expect(errBoxDark.backgroundColor).toBe('#1C1E20');
      expect(errBoxDark.borderRadius).toBe(28);
      fireEvent.press(screen.getByText('Tentar novamente'));
      expect(onRetry).toHaveBeenCalledTimes(1);
      await errDark.unmount();

      const emptyLight = await render(
        <FinEmptyState
          testID="fin-empty-light"
          icon="account-balance"
          title="Sem registros"
          subtitle="Comece agora"
          themeMode="light"
        />
      );
      const emptyBoxLight = StyleSheet.flatten(screen.getByTestId('fin-empty-light').props.style);
      expect(emptyBoxLight.backgroundColor).toBe('#FFFFFF');
      expect(emptyBoxLight.borderRadius).toBe(28);
      await emptyLight.unmount();
    });
  });
});
