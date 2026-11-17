import { isValidAccessKeyMod11, parseAccessKey } from './parseAccessKey';
import type { ParsedNfceQr } from './types';

export { isValidAccessKeyMod11 };

function invalidResult(partial?: Partial<ParsedNfceQr>): ParsedNfceQr {
  return {
    valid: false,
    accessKey: null,
    ufCode: null,
    uf: null,
    aamm: null,
    cnpj: null,
    model: null,
    amountCents: null,
    ...partial,
  };
}

function parseAmountParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(',', '.').trim();
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

export function parseNfceQr(url: string): ParsedNfceQr {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return invalidResult({ error: 'QR vazio' });

  let pParam: string | null = null;
  let chNFeParam: string | null = null;
  let vNfParam: string | null = null;

  const queryIndex = trimmed.indexOf('?');
  if (queryIndex !== -1) {
    const query = trimmed.slice(queryIndex + 1);
    for (const part of query.split('&')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const k = decodeURIComponent(part.slice(0, eqIdx));
      const v = decodeURIComponent(part.slice(eqIdx + 1));
      if (k === 'p') pParam = v;
      else if (k === 'chNFe') chNFeParam = v;
      else if (k === 'vNF') vNfParam = v;
    }
  }

  let candidateKey: string | null = null;
  let amountCents: number | null = parseAmountParam(vNfParam ?? undefined);

  if (pParam) {
    const parts = pParam.split('|');
    candidateKey = parts[0]?.replace(/\D/g, '') ?? null;
    // NFC-e v2 offline: chave|versao|tpAmb|diaEmis|vNF|digVal|idCSC|cHashQRCode
    if (parts.length >= 8 && amountCents === null) {
      amountCents = parseAmountParam(parts[4]);
    }
  } else if (chNFeParam) {
    candidateKey = chNFeParam.replace(/\D/g, '');
  } else {
    const cleanedDigits = trimmed.replace(/[\s.-]+/g, '');
    if (/^\d{44}$/.test(cleanedDigits)) {
      candidateKey = cleanedDigits;
    } else {
      const match44 = /\b(\d{44})\b/.exec(trimmed);
      candidateKey = match44 ? match44[1] : null;
    }
  }

  if (!candidateKey) {
    return invalidResult({ error: 'Chave de acesso com tamanho inválido' });
  }

  const parsedKey = parseAccessKey(candidateKey);
  if (!parsedKey.valid || !parsedKey.accessKey) {
    return invalidResult({
      ufCode: parsedKey.ufCode,
      uf: parsedKey.uf,
      aamm: parsedKey.aamm,
      cnpj: parsedKey.cnpj,
      model: parsedKey.model,
      amountCents,
      error: parsedKey.error,
    });
  }

  return {
    valid: true,
    accessKey: parsedKey.accessKey,
    ufCode: parsedKey.ufCode,
    uf: parsedKey.uf,
    aamm: parsedKey.aamm,
    cnpj: parsedKey.cnpj,
    model: parsedKey.model,
    amountCents,
  };
}
