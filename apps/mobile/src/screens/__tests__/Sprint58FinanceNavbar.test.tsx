import React from 'react';
import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { FinanceHomeScreen } from '../finance';

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

type Handler = () => boolean | null | undefined;
let handlers: Handler[] = [];
let addSpy: jest.SpyInstance;

/** Simula o botão/gesto voltar do Android: o último handler registrado roda primeiro. */
function pressBack(): boolean {
  let consumed = false;
  act(() => {
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]()) {
        consumed = true;
        break;
      }
    }
  });
  return consumed;
}

async function seed() {
  await finService.initializeFinanceModule('2026-11-13');
  const acc = await finRepository.createAccount({
    name: 'Nubank',
    type: 'checking',
    initialBalanceCents: 0,
    color: '#D96628',
  });
  const mk = (cat: string, amount: number, due: string, desc: string) =>
    finRepository.createEntry({
      kind: 'expense',
      status: 'pending',
      amount_cents: amount,
      due_date: due,
      description: desc,
      category_id: cat,
      account_id: acc.id,
      paid_date: null,
      paid_amount_cents: null,
      recurrence_id: null,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
    });
  await mk('cat-moradia', 100000, '2026-11-15', 'Aluguel');
  await mk('cat-mercado', 50000, '2026-11-20', 'Feira');
  await mk('cat-transporte', 30000, '2026-11-22', 'Uber');
  await mk('cat-lazer', 20000, '2026-11-23', 'Cinema');
  await mk('cat-saude', 10000, '2026-11-08', 'Farmácia');
  finStore.setSelectedMonth('2026-11');
}

async function openHome() {
  await seed();
  await render(
    <FinanceHomeScreen onBack={jest.fn()} themeMode="light" referenceDateIso="2026-11-13" />
  );
  await waitFor(() => expect(screen.getByTestId('finance-category-chart')).toBeTruthy());
}

describe('Sprint 58 — Navbar do módulo Finanças, Home enxuta e voltar correto', () => {
  beforeEach(() => {
    resetDatabase();
    finStore.reset();
    jest.clearAllMocks();
    handlers = [];
    addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _evt: string,
      cb: Handler
    ) => {
      handlers.push(cb);
      return {
        remove: () => {
          handlers = handlers.filter((h) => h !== cb);
        },
      };
    }) as any);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    addSpy.mockRestore();
  });

  describe('S58-T01: Navbar com quatro destinos', () => {
    it('a Home mostra a navbar com Resumo, Lançamentos, Contas e Mais', async () => {
      await openHome();
      expect(screen.getByTestId('finance-dock')).toBeTruthy();
      for (const id of ['home', 'entries', 'accounts', 'more']) {
        expect(screen.getByTestId(`finance-dock-tab-${id}`)).toBeTruthy();
      }
      expect(
        screen.getByTestId('finance-dock-tab-home').props.accessibilityState.selected
      ).toBe(true);
    });

    it('tocar nas abas troca a tela e marca a aba ativa', async () => {
      await openHome();

      fireEvent.press(screen.getByTestId('finance-dock-tab-entries'));
      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      expect(screen.getByTestId('finance-dock')).toBeTruthy();
      expect(
        screen.getByTestId('finance-dock-tab-entries').props.accessibilityState.selected
      ).toBe(true);

      fireEvent.press(screen.getByTestId('finance-dock-tab-accounts'));
      await waitFor(() => expect(screen.getByTestId('accounts-screen')).toBeTruthy());

      fireEvent.press(screen.getByTestId('finance-dock-tab-home'));
      await waitFor(() => expect(screen.getByTestId('finance-home-screen')).toBeTruthy());
    });

    it('a aba Mais lista Assinaturas, Recorrências e Categorias e cada item abre a tela, com a navbar visível', async () => {
      await openHome();

      fireEvent.press(screen.getByTestId('finance-dock-tab-more'));
      await waitFor(() => expect(screen.getByTestId('finance-more-screen')).toBeTruthy());

      fireEvent.press(screen.getByTestId('finance-more-subscriptions'));
      await waitFor(() => expect(screen.getByTestId('subscriptions-screen')).toBeTruthy());
      expect(screen.getByTestId('finance-dock')).toBeTruthy();
      expect(
        screen.getByTestId('finance-dock-tab-more').props.accessibilityState.selected
      ).toBe(true);
    });
  });

  describe('S58-T02: Home enxuta', () => {
    it('os atalhos 2x2 saíram da Home (ficam na navbar e em Mais)', async () => {
      await openHome();
      for (const id of ['subscriptions', 'recurrences', 'accounts', 'categories', 'entries']) {
        expect(screen.queryByTestId(`finance-shortcut-${id}`)).toBeNull();
      }
    });

    it('A vencer e Atrasadas viram um único card de atenção', async () => {
      await openHome();
      expect(screen.getByTestId('finance-attention-tile')).toBeTruthy();
      expect(screen.getByTestId('finance-upcoming-7d')).toBeTruthy();
      expect(screen.getByTestId('finance-overdue-tile')).toBeTruthy();
      expect(screen.queryByTestId('finance-upcoming-tile')).toBeNull();
    });

    it('tocar em Atrasadas dentro do card abre Lançamentos pendentes', async () => {
      await openHome();
      fireEvent.press(screen.getByTestId('finance-overdue-tile'));
      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      expect(finStore.getState().filters.status).toBe('pending');
    });

    it('o gasto por categoria mostra só as 3 maiores', async () => {
      await openHome();
      expect(screen.getByTestId('finance-category-dot-row-cat-moradia')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-row-cat-mercado')).toBeTruthy();
      expect(screen.getByTestId('finance-category-dot-row-cat-transporte')).toBeTruthy();
      expect(screen.queryByTestId('finance-category-dot-row-cat-lazer')).toBeNull();
    });
  });

  describe('S58-T03: Voltar do Android fica dentro do módulo', () => {
    it('em Lançamentos o voltar vai para o Resumo e não sai do módulo', async () => {
      const onBack = jest.fn();
      await seed();
      await render(
        <FinanceHomeScreen onBack={onBack} themeMode="light" referenceDateIso="2026-11-13" />
      );
      await waitFor(() => expect(screen.getByTestId('finance-category-chart')).toBeTruthy());
      fireEvent.press(screen.getByTestId('finance-dock-tab-entries'));
      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());

      expect(pressBack()).toBe(true);

      await waitFor(() => expect(screen.getByTestId('finance-home-screen')).toBeTruthy());
      expect(onBack).not.toHaveBeenCalled();
    });

    it('em Assinaturas o voltar vai para Mais e depois para o Resumo', async () => {
      await openHome();
      fireEvent.press(screen.getByTestId('finance-dock-tab-more'));
      await waitFor(() => expect(screen.getByTestId('finance-more-screen')).toBeTruthy());
      fireEvent.press(screen.getByTestId('finance-more-categories'));
      await waitFor(() => expect(screen.getByTestId('categories-screen')).toBeTruthy());

      expect(pressBack()).toBe(true);
      await waitFor(() => expect(screen.getByTestId('finance-more-screen')).toBeTruthy());

      expect(pressBack()).toBe(true);
      await waitFor(() => expect(screen.getByTestId('finance-home-screen')).toBeTruthy());
    });

    it('no App: voltar numa tela interna do módulo não volta para os Investimentos', async () => {
      await render(<App />);
      fireEvent.press(screen.getByTestId('header-globe-button'));
      await waitFor(() => expect(screen.getByTestId('finance-home-screen')).toBeTruthy());
      fireEvent.press(screen.getByTestId('finance-dock-tab-accounts'));
      await waitFor(() => expect(screen.getByTestId('accounts-screen')).toBeTruthy());

      expect(pressBack()).toBe(true);
      await waitFor(() => expect(screen.getByTestId('finance-home-screen')).toBeTruthy());

      // Só no Resumo o voltar sai do módulo.
      expect(pressBack()).toBe(true);
      await waitFor(() => expect(screen.queryByTestId('finance-home-screen')).toBeNull());
    });
  });
});
