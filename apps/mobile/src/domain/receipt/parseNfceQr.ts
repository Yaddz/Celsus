import type { ParsedNfceQr } from './types';

const UF_BY_CODE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

export function isValidAccessKeyMod11(key44: string): boolean {
  if (!/^\d{44}$/.test(key44)) return false;
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key44[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  const expectedDv = rem < 2 ? 0 : 11 - rem;
  return expectedDv === Number(key44[43]);
}

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
    const match44 = /\b(\d{44})\b/.exec(trimmed);
    candidateKey = match44 ? match44[1] : null;
  }

  if (!candidateKey || candidateKey.length !== 44) {
    return invalidResult({ error: 'Chave de acesso com tamanho inválido' });
  }

  if (!isValidAccessKeyMod11(candidateKey)) {
    return invalidResult({ error: 'Dígito verificador da chave inválido' });
  }

  const ufCode = candidateKey.slice(0, 2);
  const uf = UF_BY_CODE[ufCode] ?? null;
  const aamm = candidateKey.slice(2, 6);
  const cnpj = candidateKey.slice(6, 20);
  const model = candidateKey.slice(20, 22);

  if (model !== '65') {
    return invalidResult({
      ufCode,
      uf,
      aamm,
      cnpj,
      model,
      amountCents,
      error: `Modelo ${model} não é NFC-e (65)`,
    });
  }

  return {
    valid: true,
    accessKey: candidateKey,
    ufCode,
    uf,
    aamm,
    cnpj,
    model,
    amountCents,
  };
}
