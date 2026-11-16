import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DotTrack } from '../../components/ui';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import {
  AccountsScreen,
  CategoriesScreen,
  EntriesListScreen,
  EntryFormSheet,
  FinanceHomeScreen,
  RecurrencesScreen,
  SubscriptionsScreen,
} from '../finance';
import { APPROVED_FIN_PALETTE } from '../finance/finTheme';

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

async function seedBaseFinanceData() {
  await finService.initializeFinanceModule('2026-11-13');
  const nubank = await finRepository.createAccount({
    name: 'Nubank',
    type: 'checking',
    initialBalanceCents: 638725,
    color: '#D96628',
  });
  const card = await finRepository.createAccount({
    name: 'Cartão Nubank',
    type: 'card',
    initialBalanceCents: 0,
    color: '#C49A45',
  });
  const archivedAcc = await finRepository.createAccount({
    name: 'Poupança antiga',
    type: 'checking',
    initialBalanceCents: 0,
    color: '#B8B2A6',
  });
  await finRepository.archiveAccount(archivedAcc.id);

  // Receita paga no mês
  await finRepository.createEntry({
    kind: 'income',
    status: 'paid',
    amount_cents: 720000,
    paid_amount_cents: 720000,
    due_date: '2026-11-05',
    paid_date: '2026-11-05',
    description: 'Salário',
    category_id: 'cat-salario',
    account_id: nubank.id,
    recurrence_id: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
  });

  // Receita pendente no mês
  await finRepository.createEntry({
    kind: 'income',
    status: 'pending',
    amount_cents: 100000,
    paid_amount_cents: null,
    due_date: '2026-11-25',
    paid_date: null,
    description: 'Freelance',
    category_id: 'cat-outros-receita',
    account_id: nubank.id,
    recurrence_id: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
  });

  // 6 categorias de despesa para testar 4 maiores + "Outros"
  const mkExpense = (
    catId: string,
    amountCents: number,
    dueDate: string,
    description: string,
    status: 'pending' | 'paid' = 'pending',
    accountId: string = nubank.id
  ) =>
    finRepository.createEntry({
      kind: 'expense',
      status,
      amount_cents: amountCents,
      paid_amount_cents: status === 'paid' ? amountCents : null,
      due_date: dueDate,
      paid_date: status === 'paid' ? dueDate : null,
      description,
      category_id: catId,
      account_id: accountId,
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });

  // Moradia (38% aprox), Mercado (24%), Transporte (14%), Assinaturas (9%), Saúde + Lazer -> Outros (15%)
  await mkExpense('cat-moradia', 38000, '2026-11-15', 'Aluguel');
  await mkExpense('cat-moradia', 11990, '2026-11-08', 'Internet'); // atrasada
  await mkExpense('cat-mercado', 24000, '2026-11-16', 'Supermercado', 'paid');
  await mkExpense('cat-transporte', 14000, '2026-11-18', 'Combustível', 'pending', card.id);
  await mkExpense('cat-assinaturas', 9000, '2026-11-17', 'Nuvem');
  await mkExpense('cat-saude', 8000, '2026-11-19', 'Farmácia');
  await mkExpense('cat-lazer', 7000, '2026-11-22', 'Cinema');

  finStore.setSelectedMonth('2026-11');
  return { nubank, card, archivedAcc };
}

describe('Sprint 60 — Fidelidade visual e funcional ao artifact Celsus Finanças', () => {
  beforeEach(() => {
    resetDatabase();
    finStore.reset();
    jest.clearAllMocks();
  });

  describe('S60-T01: Resumo (Home) — dois tiles de atenção, 5 categorias com Outros, tema claro e privacidade', () => {
    it('renderiza Saldo do mês (32px), Receitas, Despesas, dois tiles separados (gold A vencer + Atrasadas com warning), sem os 4 atalhos e com navbar', async () => {
      await seedBaseFinanceData();

      render(
        <FinanceHomeScreen
          onBack={jest.fn()}
          themeMode="dark"
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => expect(screen.getByTestId('finance-month-balance')).toBeTruthy());

      // Hero Saldo do mês 32px
      const heroValStyle = StyleSheet.flatten(screen.getByTestId('finance-month-balance').props.style);
      expect(heroValStyle.fontSize).toBe(32);
      expect(screen.getByTestId('finance-month-comparison')).toBeTruthy();

      // Dois tiles separados (sem finance-attention-tile único)
      expect(screen.queryByTestId('finance-attention-tile')).toBeNull();
      const upcomingTile = screen.getByTestId('finance-upcoming-tile');
      const upcomingStyle = StyleSheet.flatten(upcomingTile.props.style);
      expect(upcomingStyle.backgroundColor).toBe('#D4A83B');
      expect(screen.getByText(/A VENCER · 7 DIAS/i)).toBeTruthy();

      expect(screen.getByTestId('finance-overdue-tile')).toBeTruthy();
      expect(screen.getByTestId('finance-overdue-warning-icon')).toBeTruthy();

      // Ausência dos 4 atalhos, presença da navbar e padding inferior do ScrollView
      for (const id of ['subscriptions', 'recurrences', 'accounts', 'categories']) {
        expect(screen.queryByTestId(`finance-shortcut-${id}`)).toBeNull();
      }
      expect(screen.getByTestId('finance-dock')).toBeTruthy();
      const scrollStyle = StyleSheet.flatten(
        screen.getByTestId('finance-home-scroll').props.contentContainerStyle
      );
      expect(scrollStyle.paddingBottom).toBeGreaterThanOrEqual(120);
      const fabStyle = StyleSheet.flatten(
        screen.getByTestId('finance-add-entry-btn').props.style
      );
      // FAB fica acima da navbar (bottom >= 80)
      expect(fabStyle?.bottom ?? 96).toBeGreaterThanOrEqual(80);
    });

    it('exibe 5 linhas em Gasto por categoria (4 maiores + Outros somando o resto) usando DotTrack', async () => {
      await seedBaseFinanceData();

      render(
        <FinanceHomeScreen
          onBack={jest.fn()}
          themeMode="dark"
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => expect(screen.getByTestId('finance-category-chart')).toBeTruthy());

      expect(screen.getByTestId('finance-category-dot-row-cat-moradia')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-row-cat-mercado')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-row-cat-transporte')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-row-cat-assinaturas')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-row-outros')).toBeTruthy();
      expect(screen.queryByTestId('finance-category-dot-row-cat-saude')).toBeNull();
      expect(screen.queryByTestId('finance-category-dot-row-cat-lazer')).toBeNull();

      expect(screen.getByTestId('finance-category-dot-track-cat-moradia')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-track-outros')).toBeTruthy();
    });

    it('tema claro segue HomeLight (#F4F1EA, tiles #FFFFFF, receitas #1D6F5B, despesas #C24D18, gold #D4A83B)', async () => {
      await seedBaseFinanceData();

      render(
        <FinanceHomeScreen
          onBack={jest.fn()}
          themeMode="light"
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => expect(screen.getByTestId('finance-month-income')).toBeTruthy());
      const screenStyle = StyleSheet.flatten(
        screen.getByTestId('finance-home-screen').props.style
      );
      expect(screenStyle.backgroundColor).toBe('#F4F1EA');
      const incomeStyle = StyleSheet.flatten(
        screen.getByTestId('finance-month-income').props.style
      );
      expect(incomeStyle.color).toBe('#1D6F5B');
      const expenseStyle = StyleSheet.flatten(
        screen.getByTestId('finance-month-expense').props.style
      );
      expect(expenseStyle.color).toBe('#C24D18');
      const upcomingStyle = StyleSheet.flatten(
        screen.getByTestId('finance-upcoming-tile').props.style
      );
      expect(upcomingStyle.backgroundColor).toBe('#D4A83B');
    });

    it('modo privacidade mascara valores monetários e mantém contagens e percentuais visíveis', async () => {
      await seedBaseFinanceData();

      render(
        <FinanceHomeScreen
          onBack={jest.fn()}
          themeMode="dark"
          isPrivacyMode={true}
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => expect(screen.getByTestId('finance-month-balance')).toBeTruthy());
      expect(screen.getByTestId('finance-month-balance')).toHaveTextContent('R$ ••••••');
      expect(screen.getByTestId('finance-month-income')).toHaveTextContent('R$ ••••••');
      expect(screen.getByTestId('finance-month-expense')).toHaveTextContent('R$ ••••••');
      expect(screen.getByText(/1 a receber/i)).toBeTruthy();
      expect(screen.getByTestId('finance-category-pct-cat-moradia')).toHaveTextContent(/\d+%/);
    });
  });

  describe('S60-T02: Lançamentos — seções, chips e subtítulos fiéis ao artifact', () => {
    it('exibe seções Em atraso, Próximos dias e Liquidados (com Ver tudo › se > 5), chips e subtítulos exatos', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Nubank',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });

      const rec = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 185000,
        description: 'Aluguel',
        account_id: acc.id,
        category_id: 'cat-moradia',
        frequency: 'monthly',
        day_of_month: 15,
        start_date: '2026-11-15',
        end_date: null,
        is_subscription: 0,
        active: 1,
        generated_until: null,
      });

      const sub = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 3990,
        description: 'Streaming de vídeo',
        account_id: acc.id,
        category_id: 'cat-assinaturas',
        frequency: 'monthly',
        day_of_month: 10,
        start_date: '2026-11-10',
        end_date: null,
        is_subscription: 1,
        active: 1,
        generated_until: null,
      });

      // Atrasado
      const overdue = await finRepository.createEntry({
        kind: 'expense',
        status: 'pending',
        amount_cents: 11990,
        paid_amount_cents: null,
        due_date: '2026-11-08',
        paid_date: null,
        description: 'Internet',
        category_id: 'cat-moradia',
        account_id: acc.id,
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      // Recorrente pendente
      const recEntry = await finRepository.createEntry({
        kind: 'expense',
        status: 'pending',
        amount_cents: 185000,
        paid_amount_cents: null,
        due_date: '2026-11-15',
        paid_date: null,
        description: 'Aluguel',
        category_id: 'cat-moradia',
        account_id: acc.id,
        recurrence_id: rec.id,
        recurrence_period: '2026-11',
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      // Parcela 3/12
      const instEntry = await finRepository.createEntry({
        kind: 'expense',
        status: 'pending',
        amount_cents: 41660,
        paid_amount_cents: null,
        due_date: '2026-11-18',
        paid_date: null,
        description: 'Notebook',
        category_id: 'cat-lazer',
        account_id: acc.id,
        recurrence_id: null,
        installment_group_id: 'grp-1',
        installment_number: 3,
        installment_total: 12,
      });

      // Assinatura liquidada
      const subEntry = await finRepository.createEntry({
        kind: 'expense',
        status: 'paid',
        amount_cents: 3990,
        paid_amount_cents: 3990,
        due_date: '2026-11-10',
        paid_date: '2026-11-10',
        description: 'Streaming de vídeo',
        category_id: 'cat-assinaturas',
        account_id: acc.id,
        recurrence_id: sub.id,
        recurrence_period: '2026-11',
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      // Recebido
      const incEntry = await finRepository.createEntry({
        kind: 'income',
        status: 'paid',
        amount_cents: 720000,
        paid_amount_cents: 720000,
        due_date: '2026-11-05',
        paid_date: '2026-11-05',
        description: 'Salário',
        category_id: 'cat-salario',
        account_id: acc.id,
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      // Mais 4 pagos para passar de 5 em Liquidados e mostrar "Ver tudo ›"
      for (let i = 0; i < 4; i++) {
        await finRepository.createEntry({
          kind: 'expense',
          status: 'paid',
          amount_cents: 5000 + i * 100,
          paid_amount_cents: 5000 + i * 100,
          due_date: `2026-11-0${i + 1}`,
          paid_date: `2026-11-0${i + 1}`,
          description: `Compra ${i + 1}`,
          category_id: 'cat-mercado',
          account_id: acc.id,
          recurrence_id: null,
          installment_group_id: null,
          installment_number: null,
          installment_total: null,
        });
      }

      finStore.setSelectedMonth('2026-11');

      render(
        <EntriesListScreen
          onBack={jest.fn()}
          themeMode="light"
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => expect(screen.getByTestId('entries-section-overdue')).toBeTruthy());
      expect(screen.getByTestId('entries-section-upcoming')).toBeTruthy();
      expect(screen.getByTestId('entries-section-paid')).toBeTruthy();

      expect(screen.getByText(/Pendentes · 3/)).toBeTruthy();
      expect(screen.getByText('Pagos')).toBeTruthy();
      expect(screen.getByText('Categoria ▾')).toBeTruthy();
      expect(screen.getByText('Conta ▾')).toBeTruthy();
      expect(screen.getByText('Ver tudo ›')).toBeTruthy();
      fireEvent.press(screen.getByText('Ver tudo ›'));

      const overdueSub = screen.getByTestId(`entry-subtitle-${overdue.id}`);
      expect(overdueSub).toHaveTextContent('Venceu 08/11 • Moradia');
      expect(StyleSheet.flatten(overdueSub.props.style).color).toBe('#D96628');

      expect(screen.getByTestId(`entry-subtitle-${recEntry.id}`)).toHaveTextContent(
        '15/11/2026 • Recorrente'
      );
      expect(screen.getByTestId(`entry-subtitle-${instEntry.id}`)).toHaveTextContent(
        '18/11/2026 • Parcela 3/12'
      );
      expect(screen.getByTestId(`entry-subtitle-${subEntry.id}`)).toHaveTextContent(
        '10/11/2026 • Assinatura'
      );
      expect(screen.getByTestId(`entry-subtitle-${incEntry.id}`)).toHaveTextContent(
        '05/11/2026 • Recebido'
      );
    });
  });

  describe('S60-T03: Novo lançamento — tiles separados, chip + Nova interativo e botão 56px', () => {
    it('renderiza tiles separados e permite criar nova categoria pelo chip "+ Nova" voltando selecionada', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      await finRepository.createAccount({
        name: 'Nubank',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });

      render(
        <EntryFormSheet
          visible={true}
          onClose={jest.fn()}
          defaultDueDate="2026-11-15"
          themeMode="dark"
        />
      );

      await waitFor(() => expect(screen.getByTestId('entry-form-tile-valor')).toBeTruthy());
      expect(screen.getByTestId('entry-form-tile-descricao')).toBeTruthy();
      expect(screen.getByTestId('entry-form-tile-categoria')).toBeTruthy();
      expect(screen.getByTestId('entry-form-tile-repeticao')).toBeTruthy();

      const saveBtn = screen.getByTestId('entry-form-save-btn');
      expect(StyleSheet.flatten(saveBtn.props.style).height).toBe(56);

      // Tocar em "+ Nova" abre criação rápida de categoria e volta selecionando-a
      fireEvent.press(screen.getByTestId('entry-form-new-category-btn'));
      await waitFor(() => expect(screen.getByTestId('quick-category-name-input')).toBeTruthy());
      fireEvent.changeText(screen.getByTestId('quick-category-name-input'), 'Pets');
      fireEvent.press(screen.getByTestId('quick-category-save-btn'));

      await waitFor(() => expect(screen.getByText('Pets')).toBeTruthy());
      const allCats = await finRepository.listCategories(false);
      const pets = allCats.find((c) => c.name === 'Pets');
      expect(pets).toBeTruthy();
      const petsChipStyle = StyleSheet.flatten(
        screen.getByTestId(`entry-form-category-${pets!.id}`).props.style
      );
      expect(petsChipStyle.borderColor).toBe('#D96628');
    });
  });

  describe('S60-T04: Recorrências — totais mensais, encerradas 70% e valor variável', () => {
    it('calcula Fixo saídas/entradas por mês (semanal × 52/12, anual ÷ 12), exibe Encerradas e formata valor variável', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Nubank',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });

      // Saída mensal variável
      const luz = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 21000,
        description: 'Conta de luz',
        account_id: acc.id,
        category_id: 'cat-moradia',
        frequency: 'monthly',
        day_of_month: 20,
        start_date: '2026-11-20',
        end_date: null,
        is_subscription: 0,
        active: 1,
        variable_amount: 1,
        generated_until: null,
      });

      // Saída semanal R$ 120,00 -> 120 * 52 / 12 = R$ 520,00/mês
      await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 12000,
        description: 'Diarista',
        account_id: acc.id,
        category_id: 'cat-moradia',
        frequency: 'weekly',
        day_of_month: 5,
        start_date: '2026-11-06',
        end_date: null,
        is_subscription: 0,
        active: 1,
        variable_amount: 0,
        generated_until: null,
      });

      // Entrada anual R$ 12.000,00 -> 12000 / 12 = R$ 1.000,00/mês
      await finRepository.createRecurrence({
        kind: 'income',
        amount_cents: 1200000,
        description: 'Bônus anual',
        account_id: acc.id,
        category_id: 'cat-salario',
        frequency: 'yearly',
        day_of_month: 10,
        start_date: '2026-01-10',
        end_date: null,
        is_subscription: 0,
        active: 1,
        variable_amount: 0,
        generated_until: null,
      });

      // Encerrada
      await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 12900,
        description: 'Academia',
        account_id: acc.id,
        category_id: 'cat-saude',
        frequency: 'monthly',
        day_of_month: 1,
        start_date: '2026-01-01',
        end_date: '2026-08-31',
        is_subscription: 0,
        active: 0,
        variable_amount: 0,
        generated_until: null,
      });

      render(<RecurrencesScreen onBack={jest.fn()} themeMode="dark" />);

      await waitFor(() => expect(screen.getByTestId('recurrences-monthly-expense')).toBeTruthy());
      // 210 + 520 = 730,00
      expect(screen.getByTestId('recurrences-monthly-expense')).toHaveTextContent('R$ 730,00');
      expect(screen.getByTestId('recurrences-monthly-income')).toHaveTextContent('R$ 1.000,00');

      expect(screen.getByText(/Ativas · 3/i)).toBeTruthy();
      expect(screen.getByText(/Encerradas · 1/i)).toBeTruthy();

      const endedCard = screen.getByTestId('recurrences-section-ended');
      expect(StyleSheet.flatten(endedCard.props.style).opacity).toBeCloseTo(0.7, 1);

      expect(screen.getByTestId(`recurrence-amount-${luz.id}`)).toHaveTextContent('-~R$ 210,00');
      const luzSub = screen.getByTestId(`recurrence-subtitle-${luz.id}`);
      expect(luzSub).toHaveTextContent(/valor variável/);
      expect(StyleSheet.flatten(luzSub.props.style).color).toBe('#D4A83B');
    });

    it('na baixa de lançamento de recorrência variável, solicita o valor real', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Nubank',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const luz = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 21000,
        description: 'Conta de luz',
        account_id: acc.id,
        category_id: 'cat-moradia',
        frequency: 'monthly',
        day_of_month: 20,
        start_date: '2026-11-20',
        end_date: null,
        is_subscription: 0,
        active: 1,
        variable_amount: 1,
        generated_until: null,
      });
      const entry = await finRepository.createEntry({
        kind: 'expense',
        status: 'pending',
        amount_cents: 21000,
        paid_amount_cents: null,
        due_date: '2026-11-20',
        paid_date: null,
        description: 'Conta de luz',
        category_id: 'cat-moradia',
        account_id: acc.id,
        recurrence_id: luz.id,
        recurrence_period: '2026-11',
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });
      finStore.setSelectedMonth('2026-11');

      render(<EntriesListScreen onBack={jest.fn()} themeMode="dark" referenceDateIso="2026-11-13" />);
      await waitFor(() => expect(screen.getByTestId(`entry-row-${entry.id}`)).toBeTruthy());

      fireEvent.press(screen.getByTestId(`entry-row-${entry.id}`));
      await waitFor(() => expect(screen.getByTestId(`entry-action-pay-${entry.id}`)).toBeTruthy());
      fireEvent.press(screen.getByTestId(`entry-action-pay-${entry.id}`));

      await waitFor(() => expect(screen.getByTestId('entry-pay-variable-hint')).toBeTruthy());
    });
  });

  describe('S60-T05: Assinaturas — herói verde-floresta, expansão ao tocar e "Cobra em N dias"', () => {
    it('expande Pausar e Cancelar só ao tocar na linha e exibe "Cobra em N dias • dd/mm" quando <= 7 dias', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Nubank',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#D96628',
      });

      const soonSub = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 3990,
        description: 'Streaming de vídeo',
        account_id: acc.id,
        category_id: 'cat-assinaturas',
        frequency: 'monthly',
        day_of_month: 16,
        start_date: '2026-11-16',
        end_date: null,
        is_subscription: 1,
        active: 1,
        generated_until: null,
      });

      render(
        <SubscriptionsScreen
          onBack={jest.fn()}
          themeMode="dark"
          referenceDateIso="2026-11-13"
        />
      );

      await waitFor(() => expect(screen.getByTestId('subscriptions-hero-tile')).toBeTruthy());
      const heroStyle = StyleSheet.flatten(
        screen.getByTestId('subscriptions-hero-tile').props.style
      );
      expect(heroStyle.backgroundColor).toBe('#2E4A44');

      expect(screen.getByTestId('subscriptions-monthly-total')).toHaveTextContent('R$ 39,90');
      expect(screen.getByTestId('subscriptions-yearly-total')).toHaveTextContent('R$ 478,80');

      expect(screen.getByTestId(`subscription-subtitle-${soonSub.id}`)).toHaveTextContent(
        'Cobra em 3 dias • 16/11'
      );

      // Botões Pausar/Cancelar só aparecem após tocar na linha
      expect(screen.queryByTestId(`subscription-pause-btn-${soonSub.id}`)).toBeNull();
      fireEvent.press(screen.getByTestId(`subscription-row-${soonSub.id}`));
      await waitFor(() =>
        expect(screen.getByTestId(`subscription-pause-btn-${soonSub.id}`)).toBeTruthy()
      );
      expect(screen.getByTestId(`subscription-cancel-btn-${soonSub.id}`)).toBeTruthy();
    });
  });

  describe('S60-T06: Contas — herói laranja, seções Contas/Cartões/Arquivadas e privacidade', () => {
    it('exibe Saldo total laranja, contagem de lançamentos, Cartões com "Gasto no mês" e Arquivadas com Restaurar', async () => {
      const { nubank } = await seedBaseFinanceData();

      render(
        <AccountsScreen
          onBack={jest.fn()}
          themeMode="dark"
          isPrivacyMode={false}
        />
      );

      await waitFor(() => expect(screen.getByTestId('accounts-total-tile')).toBeTruthy());
      expect(screen.getByText(/1 conta ativa • cartões ficam fora do saldo/i)).toBeTruthy();
      expect(screen.getByTestId(`account-row-${nubank.id}`)).toBeTruthy();
      expect(screen.getByText(/Conta corrente • \d+ lançamentos/)).toBeTruthy();
      expect(screen.getByText('Gasto no mês')).toBeTruthy();
      expect(screen.getByText(/Arquivadas · 1/i)).toBeTruthy();
      expect(screen.getByText('Restaurar')).toBeTruthy();
    });
  });

  describe('S60-T07: Categorias — edição inline com 7 cores e migração das cores padrão', () => {
    it('exibe abas Despesas/Receitas, contagem de lançamentos, edição inline com as 7 cores do artifact', async () => {
      await seedBaseFinanceData();

      render(<CategoriesScreen onBack={jest.fn()} themeMode="dark" />);

      await waitFor(() => expect(screen.getByTestId('category-edit-save-btn')).toBeTruthy());
      expect(screen.getByText('Despesas')).toBeTruthy();
      expect(screen.getByText('Receitas')).toBeTruthy();
      expect(screen.getByText(/2 lançamentos/)).toBeTruthy();

      for (const hex of APPROVED_FIN_PALETTE) {
        expect(screen.getByTestId(`category-edit-color-${hex}`)).toBeTruthy();
      }
      expect(screen.getByTestId('category-edit-archive-btn')).toBeTruthy();
      expect(screen.getByTestId('category-edit-save-btn')).toBeTruthy();
    });

    it('migra cores padrão antigas para a paleta do artifact sem sobrescrever categoria customizada pelo usuário', async () => {
      // Simula banco antigo com cores pré-Sprint 60
      await finRepository.seedDefaultCategoriesIfNeeded();
      await finRepository.updateCategory('cat-transporte', { color: '#3386B0' });
      await finRepository.updateCategory('cat-saude', { color: '#CD528F' });
      await finRepository.updateCategory('cat-lazer', { color: '#2E4A44' }); // customizada pelo usuário

      await finService.initializeFinanceModule('2026-11-13');

      const cats = await finRepository.listCategories(true);
      const transp = cats.find((c) => c.id === 'cat-transporte');
      const saude = cats.find((c) => c.id === 'cat-saude');
      const lazer = cats.find((c) => c.id === 'cat-lazer');

      expect(transp?.color).toBe('#C49A45');
      expect(saude?.color).toBe('#AECDC5');
      expect(lazer?.color).toBe('#2E4A44'); // preservada!
    });
  });

  describe('S60-T08: DotTrack — componente extraído', () => {
    it('renderiza trilha de pontos com preenchimento proporcional e altura 8', () => {
      render(
        <DotTrack
          testID="dot-track-sample"
          percentage={38}
          color="#D96628"
          trackColor="#2A2D30"
        />
      );
      const track = screen.getByTestId('dot-track-sample');
      const style = StyleSheet.flatten(track.props.style);
      expect(style.height).toBe(8);
      expect(screen.getByTestId('dot-track-sample-fill')).toBeTruthy();
      const fillStyle = StyleSheet.flatten(
        screen.getByTestId('dot-track-sample-fill').props.style
      );
      expect(fillStyle.width).toBe('38%');
    });
  });
});
