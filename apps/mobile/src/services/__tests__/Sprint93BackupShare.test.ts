/**
 * Sprint 93 — Exportação completa grava e compartilha o .celsus.zip; importação lê o arquivo escolhido.
 */

const mockWritten: Record<string, { created: boolean; overwrite: boolean; bytes: Uint8Array | null }> = {};
const mockReadable: Record<string, Uint8Array> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : p.uri))
        .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+/, '')))
        .join('/');
    }
    create(options?: { overwrite?: boolean }) {
      mockWritten[this.uri] = { created: true, overwrite: !!options?.overwrite, bytes: null };
    }
    async write(content: Uint8Array) {
      if (!mockWritten[this.uri]) {
        mockWritten[this.uri] = { created: false, overwrite: false, bytes: null };
      }
      mockWritten[this.uri].bytes = content;
    }
    writeSync(content: Uint8Array) {
      if (!mockWritten[this.uri]) {
        mockWritten[this.uri] = { created: false, overwrite: false, bytes: null };
      }
      mockWritten[this.uri].bytes = content;
    }
    async bytes() {
      const b = mockReadable[this.uri];
      if (!b) throw new Error(`arquivo inexistente: ${this.uri}`);
      return b;
    }
    bytesSync() {
      const b = mockReadable[this.uri];
      if (!b) throw new Error(`arquivo inexistente: ${this.uri}`);
      return b;
    }
  }
  return {
    File: MockFile,
    Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///docs/' } },
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  backupFileService,
  BACKUP_MIME_TYPE,
  BACKUP_SHARE_DIALOG_TITLE,
} from '../backupFileService';

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

beforeEach(() => {
  for (const k of Object.keys(mockWritten)) delete mockWritten[k];
  for (const k of Object.keys(mockReadable)) delete mockReadable[k];
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Sharing.shareAsync as jest.Mock).mockClear();
  (DocumentPicker.getDocumentAsync as jest.Mock).mockReset();
});

describe('Sprint 93 — backupFileService', () => {
  it('S93-T01: grava o zip no cache com o nome do pacote e abre o compartilhamento como application/zip', async () => {
    const res = await backupFileService.saveAndShareArchive({
      fileName: 'celsus-dossier-20261117-1903.celsus.zip',
      zipBytes: ZIP,
    });

    const uri = 'file:///cache/celsus-dossier-20261117-1903.celsus.zip';
    expect(res).toEqual({ uri, shared: true });
    expect(mockWritten[uri]).toBeDefined();
    expect(Array.from(mockWritten[uri].bytes ?? [])).toEqual(Array.from(ZIP));
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({ mimeType: BACKUP_MIME_TYPE, dialogTitle: BACKUP_SHARE_DIALOG_TITLE })
    );
    expect(BACKUP_MIME_TYPE).toBe('application/zip');
  });

  it('S93-T01b: sobrescreve um pacote com o mesmo nome já gravado', async () => {
    const uri = 'file:///cache/a.celsus.zip';
    mockWritten[uri] = { created: true, overwrite: false, bytes: new Uint8Array([9]) };
    await backupFileService.saveAndShareArchive({ fileName: 'a.celsus.zip', zipBytes: ZIP });
    expect(Array.from(mockWritten[uri].bytes ?? [])).toEqual(Array.from(ZIP));
  });

  it('S93-T02: sem compartilhamento disponível, mantém o arquivo gravado e devolve shared=false', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const res = await backupFileService.saveAndShareArchive({ fileName: 'b.celsus.zip', zipBytes: ZIP });
    expect(res).toEqual({ uri: 'file:///cache/b.celsus.zip', shared: false });
    expect(mockWritten['file:///cache/b.celsus.zip'].bytes).not.toBeNull();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('S93-T03: pickArchive abre o seletor e devolve os bytes do .celsus.zip escolhido', async () => {
    mockReadable['file:///cache/DocumentPicker/x.zip'] = ZIP;
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/DocumentPicker/x.zip', name: 'celsus-dossier-1.celsus.zip', size: ZIP.length }],
    });

    const picked = await backupFileService.pickArchive();
    expect(picked).not.toBeNull();
    expect(picked!.fileName).toBe('celsus-dossier-1.celsus.zip');
    expect(Array.from(picked!.zipBytes)).toEqual(Array.from(ZIP));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ copyToCacheDirectory: true, multiple: false })
    );
  });

  it('S93-T03b: seletor cancelado devolve null', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await expect(backupFileService.pickArchive()).resolves.toBeNull();
  });

  it('S93-T03c: arquivo que não é .zip é recusado com mensagem clara', async () => {
    mockReadable['file:///cache/DocumentPicker/y.csv'] = new Uint8Array([1]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/DocumentPicker/y.csv', name: 'planilha.csv', size: 1 }],
    });
    await expect(backupFileService.pickArchive()).rejects.toThrow('Escolha um arquivo .celsus.zip');
  });
});
