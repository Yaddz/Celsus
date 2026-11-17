export const SEFAZ_LOOKUP_META_KEY = 'receipt.sefaz_lookup';

export interface NfceLookupResult {
  amountCents: number | null;
  uf: string | null;
}

export const nfceLookupService = {
  async isEnabled(): Promise<boolean> {
    return true;
  },

  async setEnabled(_enabled: boolean): Promise<void> {},

  async fetchNfceTotal(_url: string): Promise<NfceLookupResult> {
    return { amountCents: null, uf: null };
  },
};
