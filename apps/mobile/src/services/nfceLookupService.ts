import { parseNfceQr } from '../domain/receipt/parseNfceQr';
import { appMetaRepository } from '../repositories/appMetaRepository';

export const SEFAZ_LOOKUP_META_KEY = 'receipt.sefaz_lookup';
const SUPPORTED_SEFAZ_UFS = new Set(['DF', 'SP', 'RJ', 'MG', 'PR', 'RS']);
const LOOKUP_TIMEOUT_MS = 6000;

export interface NfceLookupResult {
  amountCents: number | null;
  uf: string | null;
}

function parseBrOrDotAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma !== -1) {
    normalized = cleaned.replace(',', '.');
  }
  const val = Number.parseFloat(normalized);
  if (!Number.isFinite(val) || val <= 0) return null;
  return Math.round(val * 100);
}

function extractTotalFromSefazHtml(html: string, uf: string): number | null {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');

  const ufSpecificPatterns: Record<string, RegExp[]> = {
    DF: [
      /Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
      /Valor\s+total\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
    ],
    SP: [
      /Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
      /Valor\s+total\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
    ],
    RJ: [
      /Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
      /Valor\s+total\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
    ],
    MG: [
      /Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
      /Valor\s+total\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
    ],
    PR: [
      /Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
      /Valor\s+total\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
    ],
    RS: [
      /Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
      /Valor\s+total\s*(?:R\$)?\s*:?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/i,
    ],
  };

  const patterns = ufSpecificPatterns[uf] ?? [];
  for (const re of patterns) {
    const m = re.exec(plain);
    if (m) {
      const cents = parseBrOrDotAmount(m[1]);
      if (cents !== null) return cents;
    }
  }
  return null;
}

export const nfceLookupService = {
  async isEnabled(): Promise<boolean> {
    const val = await appMetaRepository.get(SEFAZ_LOOKUP_META_KEY);
    if (val === null) return true;
    return val !== '0' && val !== 'false';
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await appMetaRepository.set(SEFAZ_LOOKUP_META_KEY, enabled ? '1' : '0');
  },

  async fetchNfceTotal(url: string): Promise<NfceLookupResult> {
    const parsed = parseNfceQr(url);
    const uf = parsed.uf ?? null;
    if (!parsed.valid || !uf || !SUPPORTED_SEFAZ_UFS.has(uf)) {
      return { amountCents: null, uf };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { amountCents: null, uf };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        return { amountCents: null, uf };
      }
      const html = await res.text();
      const amountCents = extractTotalFromSefazHtml(html, uf);
      return { amountCents, uf };
    } catch {
      return { amountCents: null, uf };
    } finally {
      clearTimeout(timer);
    }
  },
};
