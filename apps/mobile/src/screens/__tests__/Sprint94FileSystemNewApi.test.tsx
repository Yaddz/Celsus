/**
 * Sprint 94 — importar planilha da B3 e extrato pelo seletor usando a API nova do expo-file-system.
 * No SDK 58, `readAsStringAsync`/`EncodingType` do import principal lançam erro em runtime.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

const nodeFs = jest.requireActual('fs') as typeof import('fs');
const nodePath = jest.requireActual('path') as typeof import('path');

const mockReadable: Record<string, Uint8Array> = {};
const mockLegacyRead = jest.fn(async () => {
  throw new Error('legacy readAsStringAsync throws in SDK 58');
});

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      const b = mockReadable[this.uri];
      if (!b) throw new Error(`arquivo inexistente: ${this.uri}`);
      return b;
    }
    async text() {
      const b = mockReadable[this.uri];
      if (!b) throw new Error(`arquivo inexistente: ${this.uri}`);
      return new TextDecoder().decode(b);
    }
  }
  return {
    File: MockFile,
    Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///docs/' } },
    readAsStringAsync: (...args: unknown[]) => mockLegacyRead(...(args as [])),
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

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

import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { StatementImportSheet } from '../../components/StatementImportSheet';
import { B3ImportScreen } from '../B3ImportScreen';

const SAMPLE_CSV = `date,title,amount
2026-11-14,ARCOS DOURADOS COMERCIO - NuPay,"19,90"
2026-11-06,Pagamento recebido,"- 528,11"
`;

const B3_FIXTURE = nodePath.resolve(__dirname, '../../../../../docs/exemplos/b3-movimentacao-exemplo.xlsx');

const originalFetch = global.fetch;

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockReadable)) delete mockReadable[k];
  // fetch de URI local não funciona no aparelho para content://; força a leitura pelo expo-file-system
  global.fetch = jest.fn(async () => {
    throw new Error('fetch indisponível para URI local');
  }) as any;
  await resetDatabase();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('Sprint 94 — telas de importação leem o arquivo pela API nova', () => {
  it('S94-T04: StatementImportSheet lê o CSV escolhido com File e mostra a prévia', async () => {
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
    const card = await finRepository.createAccount({
      name: 'Nubank Cartão S94',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
    });

    const uri = 'content://com.android.providers.downloads/document/nubank-s94.csv';
    mockReadable[uri] = new TextEncoder().encode(SAMPLE_CSV);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: 'nubank-s94.csv' }],
    });

    render(<StatementImportSheet visible={true} onClose={jest.fn()} initialAccountId={card.id} />);
    fireEvent.press(screen.getByTestId('statement-pick-file-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('statement-preview-counts')).toBeTruthy();
    });
    expect(screen.getByTestId('statement-count-new')).toHaveTextContent('2');
    expect(mockLegacyRead).not.toHaveBeenCalled();
  });

  it('S94-T05: StatementImportSheet mostra erro quando o arquivo não pode ser lido', async () => {
    await finService.initializeFinanceModule('2026-11-16');
    const card = await finRepository.createAccount({
      name: 'Conta S94',
      type: 'checking',
      initialBalanceCents: 0,
    } as any);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/sumiu.csv', name: 'sumiu.csv' }],
    });

    render(<StatementImportSheet visible={true} onClose={jest.fn()} initialAccountId={card.id} />);
    fireEvent.press(screen.getByTestId('statement-pick-file-btn'));

    await waitFor(() => {
      expect(screen.getByText(/inexistente/)).toBeTruthy();
    });
    expect(screen.queryByTestId('statement-preview-counts')).toBeNull();
    expect(mockLegacyRead).not.toHaveBeenCalled();
  });

  it('S94-T06: B3ImportScreen lê a planilha escolhida com File e mostra a prévia', async () => {
    const uri = 'content://com.android.externalstorage.documents/document/minha-b3-s94.xlsx';
    mockReadable[uri] = new Uint8Array(nodeFs.readFileSync(B3_FIXTURE));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri, name: 'minha-b3-s94.xlsx' }],
    });

    render(<B3ImportScreen onBack={jest.fn()} />);
    fireEvent.press(screen.getByTestId('b3-pick-file'));

    await waitFor(() => {
      expect(screen.getByTestId('b3-preview-summary')).toBeTruthy();
    });
    expect(mockLegacyRead).not.toHaveBeenCalled();
  });

  it('S94-T07: B3ImportScreen mostra "Não foi possível ler o arquivo" quando nenhuma leitura funciona', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cache/sumiu-s94.xlsx', name: 'sumiu-s94.xlsx' }],
    });

    render(<B3ImportScreen onBack={jest.fn()} />);
    fireEvent.press(screen.getByTestId('b3-pick-file'));

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível ler o arquivo/i)).toBeTruthy();
    });
    expect(mockLegacyRead).not.toHaveBeenCalled();
  });

  it('S94-T08: as duas telas não usam mais readAsStringAsync/EncodingType do expo-file-system', () => {
    const srcRoot = nodePath.resolve(__dirname, '../..');
    for (const rel of ['screens/B3ImportScreen.tsx', 'components/StatementImportSheet.tsx']) {
      const code = nodeFs.readFileSync(nodePath.join(srcRoot, rel), 'utf8');
      expect(code).not.toMatch(/readAsStringAsync/);
      expect(code).not.toMatch(/EncodingType/);
      expect(code).not.toMatch(/from 'expo-file-system\/legacy'/);
    }
  });
});
