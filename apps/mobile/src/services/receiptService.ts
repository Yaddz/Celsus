import type { ReceiptDraft } from '../domain/receipt';

export const receiptService = {
  async processReceiptImage(_uri: string): Promise<ReceiptDraft> {
    throw new Error('Not implemented');
  },
  async processNfceQr(_url: string): Promise<ReceiptDraft> {
    throw new Error('Not implemented');
  },
};
