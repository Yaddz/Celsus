/**
 * Sprint 94 — leitura de arquivo escolhido pela API nova do expo-file-system (SDK 58).
 */

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
  }
  return {
    File: MockFile,
    readAsStringAsync: (...args: unknown[]) => mockLegacyRead(...(args as [])),
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  };
});

import { readPickedFileBytes } from '../pickedFileReader';

beforeEach(() => {
  for (const k of Object.keys(mockReadable)) delete mockReadable[k];
  mockLegacyRead.mockClear();
});

describe('Sprint 94 — readPickedFileBytes', () => {
  it('S94-T01: devolve os bytes do arquivo pela URI escolhida (file://)', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 8, 7]);
    mockReadable['file:///cache/DocumentPicker/planilha.xlsx'] = bytes;

    const out = await readPickedFileBytes('file:///cache/DocumentPicker/planilha.xlsx');

    expect(Array.from(out)).toEqual(Array.from(bytes));
    expect(mockLegacyRead).not.toHaveBeenCalled();
  });

  it('S94-T02: aceita URI content:// do Android', async () => {
    const bytes = new TextEncoder().encode('date,title,amount\n');
    mockReadable['content://com.android.providers.downloads/document/42'] = bytes;

    const out = await readPickedFileBytes('content://com.android.providers.downloads/document/42');

    expect(new TextDecoder().decode(out)).toBe('date,title,amount\n');
  });

  it('S94-T03: propaga o erro de leitura e nunca recorre à API legada', async () => {
    await expect(readPickedFileBytes('file:///nao/existe.csv')).rejects.toThrow(/inexistente/);
    expect(mockLegacyRead).not.toHaveBeenCalled();
  });
});
