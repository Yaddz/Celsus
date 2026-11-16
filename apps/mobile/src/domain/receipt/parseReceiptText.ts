import type { ParsedField, ParsedReceipt, ReceiptPaymentMethod } from './types';

function absent<T>(): ParsedField<T> {
  return { value: null, confidence: 'ausente' };
}

export function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const d1 = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[12])) return false;

  const d2 = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[13]);
}

function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // 1.245,90
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,299.00
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals <= 2 ? cleaned : cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }

  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

function extractTotal(lines: string[]): ParsedField<number> {
  const moneyRe = /(?:R\$\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})/i;
  const ignoreRe = /\b(TROCO|DESCONTO|TRIBUT|TRIB\.?\s*APROX|SUBTOTAL|VALOR\s+PAGO|QTD\.?\s*TOTAL)\b/i;

  const priorityPatterns: Array<{ re: RegExp; confidence: 'alta' | 'baixa' }> = [
    { re: /\bVALOR\s+TOTAL\b/i, confidence: 'alta' },
    { re: /\bVALOR\s+A\s+PAGAR\b/i, confidence: 'alta' },
    { re: /\bTOTAL\s+A\s+PAGAR\b/i, confidence: 'alta' },
    { re: /\bTOTAL\s+R\$/i, confidence: 'alta' },
    { re: /\bTOTAL\b/i, confidence: 'baixa' },
  ];

  // 1) Busca em linha única por ordem de prioridade
  for (const { re, confidence } of priorityPatterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ignoreRe.test(line)) continue;
      if (!re.test(line)) continue;
      const m = moneyRe.exec(line);
      if (m) {
        const cents = parseMoneyToCents(m[1]);
        if (cents !== null) return { value: cents, confidence };
      }
      // Valor na linha imediatamente seguinte (ex: "VALOR A PAGAR\n159,90")
      if (i + 1 < lines.length && !ignoreRe.test(lines[i + 1])) {
        const nextMatch = moneyRe.exec(lines[i + 1]);
        if (nextMatch) {
          const cents = parseMoneyToCents(nextMatch[1]);
          if (cents !== null) return { value: cents, confidence };
        }
      }
    }
  }

  // 2) Cupom amassado com rótulo quebrado em 2-3 linhas ("VALOR\nTOTAL\nR$ 89,30")
  for (let i = 0; i < lines.length - 1; i++) {
    const pair = `${lines[i]} ${lines[i + 1]}`;
    if (ignoreRe.test(pair)) continue;
    if (/\b(VALOR\s+TOTAL|VALOR\s+A\s+PAGAR|TOTAL\s+A\s+PAGAR)\b/i.test(pair)) {
      const mSame = moneyRe.exec(pair);
      if (mSame) {
        const cents = parseMoneyToCents(mSame[1]);
        if (cents !== null) return { value: cents, confidence: 'baixa' };
      }
      if (i + 2 < lines.length) {
        const mNext = moneyRe.exec(lines[i + 2]);
        if (mNext) {
          const cents = parseMoneyToCents(mNext[1]);
          if (cents !== null) return { value: cents, confidence: 'baixa' };
        }
      }
    }
  }

  return absent();
}

function extractCnpj(lines: string[]): ParsedField<string> {
  const cnpjRe = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;
  for (const line of lines) {
    const m = cnpjRe.exec(line);
    if (m && isValidCnpj(m[1])) {
      return { value: m[1].replace(/\D/g, ''), confidence: 'alta' };
    }
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const joined = `${lines[i]}${lines[i + 1]}`;
    const m = cnpjRe.exec(joined);
    if (m && isValidCnpj(m[1])) {
      return { value: m[1].replace(/\D/g, ''), confidence: 'baixa' };
    }
  }
  return absent();
}

function extractDate(lines: string[]): ParsedField<string> {
  const isoRe = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/;
  const br4Re = /\b(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(20\d{2})\b/;
  const br2Re = /\b(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(\d{2})\b/;

  for (const line of lines) {
    const mIso = isoRe.exec(line);
    if (mIso) return { value: `${mIso[1]}-${mIso[2]}-${mIso[3]}`, confidence: 'alta' };

    const m4 = br4Re.exec(line);
    if (m4) return { value: `${m4[3]}-${m4[2]}-${m4[1]}`, confidence: 'alta' };

    const m2 = br2Re.exec(line);
    if (m2) return { value: `20${m2[3]}-${m2[2]}-${m2[1]}`, confidence: 'baixa' };
  }
  return absent();
}

function extractTime(lines: string[]): ParsedField<string> {
  const timeSecRe = /\b([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\b/;
  const timeMinRe = /\b([01]\d|2[0-3]):([0-5]\d)\b/;

  for (const line of lines) {
    const mSec = timeSecRe.exec(line);
    if (mSec) return { value: `${mSec[1]}:${mSec[2]}:${mSec[3]}`, confidence: 'alta' };

    const mMin = timeMinRe.exec(line);
    if (mMin) return { value: `${mMin[1]}:${mMin[2]}`, confidence: 'alta' };
  }
  return absent();
}

function extractMerchantName(lines: string[]): ParsedField<string> {
  const skipRe =
    /^(DANFE|DOCUMENTO\s+AUXILIAR|CUPOM\s+FISCAL|EXTRATO|SAT\b|NFC-?E\b|CNPJ|IE:|\*\*\*|---)/i;
  const maxScan = Math.min(lines.length, 6);

  for (let i = 0; i < maxScan; i++) {
    const line = lines[i].trim();
    if (line.length < 3) continue;
    if (skipRe.test(line)) continue;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(line)) continue;
    return {
      value: line.replace(/\s+/g, ' '),
      confidence: i < 3 ? 'alta' : 'baixa',
    };
  }
  return absent();
}

function extractPaymentMethod(lines: string[]): ParsedField<ReceiptPaymentMethod> {
  const patterns: Array<{ re: RegExp; method: ReceiptPaymentMethod }> = [
    { re: /\bPIX\b/i, method: 'PIX' },
    { re: /\b(VALE\s+ALIMENTACAO|VALE\s+REFEICAO|SODEXO|ALELO|TICKET)\b/i, method: 'VALE' },
    { re: /\b(CARTAO\s+(?:DE\s+)?CREDITO|CREDITO)\b/i, method: 'CREDITO' },
    { re: /\b(CARTAO\s+(?:DE\s+)?DEBITO|DEBITO)\b/i, method: 'DEBITO' },
    { re: /\bDINHEIRO\b/i, method: 'DINHEIRO' },
  ];

  for (const line of lines) {
    for (const { re, method } of patterns) {
      if (re.test(line)) return { value: method, confidence: 'alta' };
    }
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const pair = `${lines[i]} ${lines[i + 1]}`;
    for (const { re, method } of patterns) {
      if (re.test(pair)) return { value: method, confidence: 'baixa' };
    }
  }
  return absent();
}

export function parseReceiptText(lines: string[]): ParsedReceipt {
  const normalized = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  return {
    totalCents: extractTotal(normalized),
    dateIso: extractDate(normalized),
    time: extractTime(normalized),
    cnpj: extractCnpj(normalized),
    merchantName: extractMerchantName(normalized),
    paymentMethod: extractPaymentMethod(normalized),
  };
}
