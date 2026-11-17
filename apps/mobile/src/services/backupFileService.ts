import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Sprint 93: grava o pacote .celsus.zip num arquivo e entrega ao sistema (compartilhar / salvar),
 * e lê de volta um pacote escolhido pelo usuário para importação.
 */

export interface ArchiveToShare {
  fileName: string;
  zipBytes: Uint8Array;
}

export interface SharedArchiveResult {
  /** URI local do arquivo gravado (cache do app). */
  uri: string;
  /** true quando a folha de compartilhamento do sistema foi aberta. */
  shared: boolean;
}

export interface PickedArchive {
  fileName: string;
  zipBytes: Uint8Array;
}

export const BACKUP_SHARE_DIALOG_TITLE = 'Salvar backup do Celsus';
export const BACKUP_MIME_TYPE = 'application/zip';

export const backupFileService = {
  async saveAndShareArchive(archive: ArchiveToShare): Promise<SharedArchiveResult> {
    const file = new File(Paths.cache, archive.fileName);
    file.create({ overwrite: true });
    await file.write(archive.zipBytes);

    if (!(await Sharing.isAvailableAsync())) {
      return { uri: file.uri, shared: false };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: BACKUP_MIME_TYPE,
      dialogTitle: BACKUP_SHARE_DIALOG_TITLE,
      UTI: 'public.zip-archive',
    });
    return { uri: file.uri, shared: true };
  },

  async pickArchive(): Promise<PickedArchive | null> {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) {
      return null;
    }

    const asset = res.assets[0];
    const fileName = asset.name || '';
    if (!fileName.toLowerCase().endsWith('.zip')) {
      throw new Error('Escolha um arquivo .celsus.zip gerado pelo Celsus.');
    }

    const zipBytes = await new File(asset.uri).bytes();
    return { fileName, zipBytes };
  },
};
