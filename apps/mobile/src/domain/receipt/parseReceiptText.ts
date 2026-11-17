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
  const pureValueRe = /^\s*(?:R\$\s*)?(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*$/i;
  const ignoreRe = /\b(TROCO|DESCONTO|TRIBUT|TRIB\.?\s*APROX|SUBTOTAL|QTD\.?\s*TOTAL)\b/i;
  const primaryLabelRe =
    /\b(VALOR\s+TOTAL\s+DA\s+NOTA|VALOR\s+A\s+PAGAR|TOTAL\s+A\s+PAGAR|VALOR\s+TOTAL|TOTAL\s+R\$)\b/i;
  const paidLabelRe = /\bVALOR\s+PAGO\b/i;
  const trocoLabelRe = /\bTROCO\b/i;
  const paymentLabelRe =
    /\b(PIX|CARTAO(?:\s+DE)?\s*(?:CREDITO|DEBITO)?|CREDITO|DEBITO|DINHEIRO|VALE\s+(?:ALIMENTACAO|REFEICAO)|VALE)\b/i;
  const columnLabelRe =
    /\b(QTD\.?\s*TOTAL|SUBTOTAL|DESCONTO|VALOR\s+TOTAL(?:\s+DA\s+NOTA)?|VALOR\s+A\s+PAGAR|TOTAL\s+A\s+PAGAR|TOTAL\s+R\$|VALOR\s+PAGO|TROCO|PIX|CARTAO(?:\s+DE)?\s*(?:CREDITO|DEBITO)?|CREDITO|DEBITO|DINHEIRO|VALE)\b/i;

  const candidates = new Map<number, { score: number; signals: Set<string> }>();
  const addCandidate = (cents: number | null, weight: number, signal: string) => {
    if (cents == null || cents <= 0) return;
    const existing = candidates.get(cents);
    if (existing) {
      existing.score += weight;
      existing.signals.add(signal);
    } else {
      candidates.set(cents, { score: weight, signals: new Set([signal]) });
    }
  };

  let paidCents: number | null = null;
  let changeCents: number | null = null;

  const extractMoneyFromLineOrNext = (idx: number, allowIgnore = false): number | null => {
    const m = moneyRe.exec(lines[idx]);
    if (m) return parseMoneyToCents(m[1]);
    if (idx + 1 < lines.length && (allowIgnore || !ignoreRe.test(lines[idx + 1]))) {
      const mNext = moneyRe.exec(lines[idx + 1]);
      if (mNext) return parseMoneyToCents(mNext[1]);
    }
    return null;
  };

  // a) Rótulos em linha única ou linha seguinte + leitura de VALOR PAGO / TROCO / forma de pagamento
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (trocoLabelRe.test(line)) {
      const c = extractMoneyFromLineOrNext(i, true);
      if (c != null) changeCents = c;
      continue;
    }

    if (paidLabelRe.test(line)) {
      const p = extractMoneyFromLineOrNext(i);
      if (p != null) paidCents = p;
      continue;
    }

    if (ignoreRe.test(line)) continue;

    if (primaryLabelRe.test(line)) {
      const cents = extractMoneyFromLineOrNext(i);
      if (cents != null) {
        addCandidate(cents, 100, 'primary_label');
      }
      continue;
    }

    if (/\bTOTAL\b/i.test(line)) {
      const cents = extractMoneyFromLineOrNext(i);
      if (cents != null) {
        addCandidate(cents, 40, 'generic_total');
      }
      continue;
    }

    if (paymentLabelRe.test(line)) {
      const m = moneyRe.exec(line);
      if (m) {
        const cents = parseMoneyToCents(m[1]);
        if (cents != null) {
          addCandidate(cents, 45, 'payment_confirm');
          if (paidCents == null) paidCents = cents;
        }
      }
    }
  }

  // Cupom amassado com rótulo quebrado em 2-3 linhas ("VALOR\nTOTAL\nR$ 89,30")
  for (let i = 0; i < lines.length - 1; i++) {
    const pair = `${lines[i]} ${lines[i + 1]}`;
    if (ignoreRe.test(pair) || paidLabelRe.test(pair)) continue;
    if (/\b(VALOR\s+TOTAL|VALOR\s+A\s+PAGAR|TOTAL\s+A\s+PAGAR)\b/i.test(pair)) {
      const mSame = moneyRe.exec(pair);
      if (mSame) {
        addCandidate(parseMoneyToCents(mSame[1]), 60, 'broken_label');
      } else if (i + 2 < lines.length && !ignoreRe.test(lines[i + 2])) {
        const mNext = moneyRe.exec(lines[i + 2]);
        if (mNext) {
          addCandidate(parseMoneyToCents(mNext[1]), 60, 'broken_label');
        }
      }
    }
  }

  // b) Leitura em colunas: bloco de rótulos seguido por bloco de valores de mesmo tamanho
  for (let i = 0; i < lines.length; i++) {
    if (!columnLabelRe.test(lines[i]) || moneyRe.test(lines[i])) continue;
    let labelEnd = i;
    while (
      labelEnd + 1 < lines.length &&
      columnLabelRe.test(lines[labelEnd + 1]) &&
      !moneyRe.test(lines[labelEnd + 1])
    ) {
      labelEnd++;
    }
    const blockLen = labelEnd - i + 1;
    if (blockLen < 2 || labelEnd + blockLen >= lines.length) {
      i = labelEnd;
      continue;
    }

    let allValues = true;
    for (let k = 1; k <= blockLen; k++) {
      if (!pureValueRe.test(lines[labelEnd + k])) {
        allValues = false;
        break;
      }
    }
    if (allValues) {
      for (let k = 0; k < blockLen; k++) {
        const label = lines[i + k];
        const rawVal = lines[labelEnd + 1 + k];
        const cents = parseMoneyToCents(rawVal);
        if (trocoLabelRe.test(label)) {
          if (cents != null) changeCents = cents;
        } else if (paidLabelRe.test(label)) {
          if (cents != null) paidCents = cents;
        } else if (ignoreRe.test(label)) {
          continue;
        } else if (primaryLabelRe.test(label)) {
          addCandidate(cents, 100, 'column_primary');
        } else if (paymentLabelRe.test(label)) {
          addCandidate(cents, 45, 'payment_confirm');
          if (paidCents == null && cents != null) paidCents = cents;
        }
      }
    }
    i = labelEnd;
  }

  // c) Confirmação por VALOR PAGO e cálculo pago - troco
  if (changeCents != null && paidCents != null && paidCents > changeCents) {
    const netTotal = paidCents - changeCents;
    addCandidate(netTotal, 95, 'valor_pago');
    addCandidate(netTotal, 20, 'troco_diff');
  } else if (changeCents == null && paidCents != null) {
    addCandidate(paidCents, 55, 'valor_pago');
  }

  // d) Desempate por soma dos itens do cupom
  let itemSumCents = 0;
  for (const line of lines) {
    if (
      ignoreRe.test(line) ||
      primaryLabelRe.test(line) ||
      paidLabelRe.test(line) ||
      paymentLabelRe.test(line) ||
      /\bTOTAL\b/i.test(line)
    ) {
      continue;
    }
    const m = moneyRe.exec(line);
    if (m && /[A-Za-zÀ-ÿ]{2,}/.test(line)) {
      const c = parseMoneyToCents(m[1]);
      if (c != null) itemSumCents += c;
    }
  }
  if (itemSumCents > 0 && candidates.has(itemSumCents)) {
    addCandidate(itemSumCents, 25, 'item_sum');
  }

  if (candidates.size === 0) {
    return absent();
  }

  let bestCents = 0;
  let bestScore = -1;
  let bestSignals = 0;
  let bestHasPrimary = false;
  for (const [cents, entry] of candidates.entries()) {
    const hasPrimary =
      entry.signals.has('primary_label') || entry.signals.has('column_primary');
    if (
      entry.score > bestScore ||
      (entry.score === bestScore && entry.signals.size > bestSignals) ||
      (entry.score === bestScore && entry.signals.size === bestSignals && cents > bestCents)
    ) {
      bestCents = cents;
      bestScore = entry.score;
      bestSignals = entry.signals.size;
      bestHasPrimary = hasPrimary;
    }
  }

  const confidence: 'alta' | 'baixa' =
    bestSignals >= 2 || bestHasPrimary ? 'alta' : 'baixa';

  return { value: bestCents, confidence };
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
