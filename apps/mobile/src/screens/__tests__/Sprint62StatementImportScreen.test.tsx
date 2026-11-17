import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { statementImportService } from '../../services/statementImportService';
import { finStore } from '../../stores/finStore';
import { StatementImportSheet } from '../../components/StatementImportSheet';
import { CardBillScreen } from '../finance/CardBillScreen';
import { CategoryRulesScreen } from '../finance/CategoryRulesScreen';
import { FinanceMoreScreen } from '../finance/FinanceMoreScreen';

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

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

// Sprint 94: telas leem o arquivo escolhido pela API nova (`File.bytes()`) do expo-file-system.
let mockPickedFileBytes: Uint8Array | null = null;
jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      if (!mockPickedFileBytes) throw new Error(`arquivo inexistente: ${this.uri}`);
      return mockPickedFileBytes;
    }
  },
}));

const SAMPLE_CSV = `date,title,amount
2026-11-14,ARCOS DOURADOS COMERCIO - NuPay,"19,90"
2026-11-06,Pagamento recebido,"- 528,11"
`;

describe('Sprint 62 — Telas de Importação de Extrato e Regras de Categoria (Fase A)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
  });

  test('S62-T16: FinanceMoreScreen exibe "Importar fatura ou extrato" e "Regras de categoria"', () => {
    const onOpen = jest.fn();
    render(<FinanceMoreScreen onBack={jest.fn()} onOpen={onOpen} />);

    const importRow = screen.getByText('Importar fatura ou extrato');
    const rulesRow = screen.getByText('Regras de categoria');
    expect(importRow).toBeTruthy();
    expect(rulesRow).toBeTruthy();

    fireEvent.press(importRow);
    expect(onOpen).toHaveBeenCalledWith('statementImport');

    fireEvent.press(rulesRow);
    expect(onOpen).toHaveBeenCalledWith('categoryRules');
  });

  test('S62-T17: CardBillScreen exibe botão "Importar fatura ou extrato" para o cartão atual', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank Ultravioleta',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
    });

    render(
      <CardBillScreen
        accountId={card.id}
        initialBillMonth="2026-11"
        onBack={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Importar fatura ou extrato')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Importar fatura ou extrato'));
    await waitFor(() => {
      expect(screen.getByTestId('statement-import-sheet')).toBeTruthy();
    });
  });

  test('S62-T18: StatementImportSheet executa fluxo arquivo -> conta -> prévia -> regra por trecho -> resultado', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank Cartão',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
    });

    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/nubank.csv', name: 'nubank.csv' }],
    });
    mockPickedFileBytes = new TextEncoder().encode(SAMPLE_CSV);

    render(
      <StatementImportSheet
        visible={true}
        onClose={jest.fn()}
        initialAccountId={card.id}
      />
    );

    fireEvent.press(screen.getByTestId('statement-pick-file-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('statement-preview-counts')).toBeTruthy();
    });

    expect(screen.getByTestId('statement-count-new')).toHaveTextContent('2');
    expect(screen.getByTestId('statement-count-duplicate')).toHaveTextContent('0');
    expect(screen.getByTestId('statement-count-settle')).toHaveTextContent('0');

    // Editar categoria da primeira linha oferece "Sempre usar esta categoria para ..."
    fireEvent.press(screen.getByTestId('statement-row-category-0'));
    fireEvent.press(screen.getByText('Lazer'));
    await waitFor(() => {
      expect(screen.getByText(/Sempre usar esta categoria para/i)).toBeTruthy();
    });
    fireEvent.press(screen.getByText(/Sempre usar esta categoria para/i));

    fireEvent.press(screen.getByTestId('statement-confirm-import-btn'));

    await waitFor(() => {
      expect(screen.getByText('Desfazer importação')).toBeTruthy();
    });

    const rules = await statementImportService.listCategoryRules();
    expect(rules.length).toBe(1);
    expect(rules[0].category_id).toBe('cat-lazer');
  });

  test('S62-T19: "Desfazer importação" na tela de resultado remove os lançamentos importados', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank Cartão',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
    });

    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/nubank.csv', name: 'nubank.csv' }],
    });
    mockPickedFileBytes = new TextEncoder().encode(SAMPLE_CSV);

    render(
      <StatementImportSheet
        visible={true}
        onClose={jest.fn()}
        initialAccountId={card.id}
      />
    );

    fireEvent.press(screen.getByTestId('statement-pick-file-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('statement-confirm-import-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('statement-confirm-import-btn'));

    await waitFor(() => {
      expect(screen.getByText('Desfazer importação')).toBeTruthy();
    });
    expect((await finRepository.listAllEntries()).length).toBe(2);

    fireEvent.press(screen.getByText('Desfazer importação'));
    await waitFor(async () => {
      expect((await finRepository.listAllEntries()).length).toBe(0);
    });
  });

  test('S62-T20: CategoryRulesScreen lista, edita e exclui regras de categoria', async () => {
    await statementImportService.saveCategoryRule({
      pattern: 'arcos dourados',
      matchType: 'contains',
      kind: 'expense',
      categoryId: 'cat-lazer',
    });

    render(<CategoryRulesScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('arcos dourados')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('rule-edit-0'));
    fireEvent.changeText(
      screen.getByTestId('rule-pattern-input'),
      'arcos dourados comercio'
    );
    fireEvent.press(screen.getByTestId('rule-save-btn'));

    await waitFor(() => {
      expect(screen.getByText('arcos dourados comercio')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('rule-delete-0'));
    await waitFor(() => {
      expect(screen.queryByText('arcos dourados comercio')).toBeNull();
    });
  });
});
