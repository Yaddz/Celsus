/**
 * Sprint 93: grava o pacote .celsus.zip num arquivo e entrega ao sistema (compartilhar / salvar),
 * e lê de volta um pacote escolhido pelo usuário para importação.
 * Stub da Fase A — implementação na Fase B.
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
  async saveAndShareArchive(_archive: ArchiveToShare): Promise<SharedArchiveResult> {
    throw new Error('Não implementado');
  },

  async pickArchive(): Promise<PickedArchive | null> {
    throw new Error('Não implementado');
  },
};
