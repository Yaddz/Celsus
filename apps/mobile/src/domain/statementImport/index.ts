import { parseIsoDate, type FinKind } from '../financeFlow';

export type StatementEncoding = 'utf-8' | 'latin1';

export interface OfxAccount {
  bankId?: string;
  acctId: string;
  acctType: 'checking' | 'card';
}

export interface OfxTransaction {
  fitid: string;
  dtPosted: string;
  trnamt: string;
  memo: string;
  name?: string;
  trnType?: string;
  accountId?: string;
}

export interface OfxParseResult {
  format: 'sgml' | 'xml';
  encoding: StatementEncoding;
  accounts: OfxAccount[];
  transactions: OfxTransaction[];
}

export type CsvProfileId =
  | 'nubank_card'
  | 'nubank_checking'
  | 'inter'
  | 'c6'
  | 'itau'
  | 'manual'
  | 'unknown';

export interface CsvColumnMapping {
  dateCol: number | string;
  descriptionCol: number | string;
  amountCol: number | string;
  invertSign?: boolean;
}

export interface CsvRawRow {
  date: string;
  description: string;
  amount: string;
  fitid?: string;
  installmentHint?: string;
  invertSign?: boolean;
}

export interface CsvParseResult {
  profile: CsvProfileId;
  delimiter: ',' | ';' | '\t';
  headers: string[];
  needsManualMapping: boolean;
  sampleRows: string[][];
  rows: CsvRawRow[];
}

export interface RawStatementRowInput {
  date: string;
  description: string;
  amount: string;
  fitid?: string;
  installmentHint?: string;
  invertSign?: boolean;
}

export interface NormalizeRowContext {
  accountId: string;
  occurrenceIndex?: number;
}

export interface NormalizedStatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // positive integer
  direction: 'in' | 'out';
  externalId: string;
  installment?: {
    number: number;
    total: number;
  };
}

export type CategoryRuleMatchType = 'contains' | 'starts_with' | 'exact';

export interface CategoryRuleLike {
  id: string;
  match_type: CategoryRuleMatchType;
  pattern: string;
  kind: FinKind;
  category_id: string;
  hits: number;
}

export interface CategorizedStatementRow extends NormalizedStatementRow {
  categoryId: string;
  matchedRuleId?: string;
}

export type ReconcileStatus = 'new' | 'duplicate' | 'settle_pending';

export interface ReconcilableExistingEntry {
  id: string;
  account_id: string;
  external_id?: string | null;
  amount_cents: number;
  kind: string;
  status: string;
  due_date: string;
}

export interface ReconciledStatementRow extends CategorizedStatementRow {
  reconcileStatus: ReconcileStatus;
  matchedEntryId?: string;
}

const CP1252_EXTRA: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function decodeLatin1Bytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x80 && b <= 0x9f && CP1252_EXTRA[b] !== undefined) {
      out += String.fromCharCode(CP1252_EXTRA[b]);
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
  } catch {
    return null;
  }
  // Pure JS fallback when TextDecoder is unavailable
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i++;
    } else if ((b0 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const b1 = bytes[i + 1];
      if ((b1 & 0xc0) !== 0x80) return null;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      i += 2;
    } else if ((b0 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) return null;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      i += 3;
    } else {
      return null;
    }
  }
  return out;
}

export function decodeStatementBytes(bytes: Uint8Array): {
  text: string;
  encoding: StatementEncoding;
} {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const utf8 = decodeUtf8Strict(bytes.subarray(3));
    if (utf8 !== null) {
      return { text: utf8, encoding: 'utf-8' };
    }
  }

  // Inspect ASCII header for explicit charset/encoding declaration
  const headerSlice = bytes.subarray(0, Math.min(bytes.length, 512));
  let headerAscii = '';
  for (let i = 0; i < headerSlice.length; i++) {
    headerAscii += String.fromCharCode(headerSlice[i] & 0x7f);
  }
  const upperHeader = headerAscii.toUpperCase();
  const declaresLatin1 =
    /CHARSET\s*:\s*1252/.test(upperHeader) ||
    /CHARSET\s*:\s*ISO-8859-1/.test(upperHeader) ||
    /ENCODING\s*=\s*["']?(ISO-8859-1|WINDOWS-1252)/i.test(upperHeader);

  if (declaresLatin1) {
    return { text: decodeLatin1Bytes(bytes), encoding: 'latin1' };
  }

  const utf8Text = decodeUtf8Strict(bytes);
  if (utf8Text !== null) {
    return { text: utf8Text, encoding: 'utf-8' };
  }

  return { text: decodeLatin1Bytes(bytes), encoding: 'latin1' };
}

function unescapeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function extractOfxTag(block: string, tagName: string): string | undefined {
  const closedRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const closedMatch = block.match(closedRegex);
  if (closedMatch) {
    return unescapeXmlEntities(closedMatch[1]);
  }
  const sgmlRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
  const sgmlMatch = block.match(sgmlRegex);
  if (sgmlMatch) {
    return unescapeXmlEntities(sgmlMatch[1]);
  }
  return undefined;
}

export function parseOfx(input: string | Uint8Array): OfxParseResult {
  const decoded =
    typeof input === 'string'
      ? {
          text: input,
          encoding: (/CHARSET\s*:\s*1252/i.test(input.slice(0, 512))
            ? 'latin1'
            : 'utf-8') as StatementEncoding,
        }
      : decodeStatementBytes(input);

  const text = decoded.text;
  const format: 'sgml' | 'xml' = /<\?xml|<\?OFX/i.test(text.slice(0, 512))
    ? 'xml'
    : 'sgml';

  const fiFid = extractOfxTag(text, 'FID');
  const accounts: OfxAccount[] = [];

  const bankAcctRegex = /<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/gi;
  let acctMatch: RegExpExecArray | null;
  while ((acctMatch = bankAcctRegex.exec(text)) !== null) {
    const block = acctMatch[1];
    const acctId = extractOfxTag(block, 'ACCTID') ?? '';
    const bankId = extractOfxTag(block, 'BANKID') ?? fiFid;
    if (acctId) {
      accounts.push({ bankId, acctId, acctType: 'checking' });
    }
  }

  const ccAcctRegex = /<CCACCTFROM>([\s\S]*?)<\/CCACCTFROM>/gi;
  while ((acctMatch = ccAcctRegex.exec(text)) !== null) {
    const block = acctMatch[1];
    const acctId = extractOfxTag(block, 'ACCTID') ?? '';
    const bankId = extractOfxTag(block, 'BANKID') ?? fiFid;
    if (acctId) {
      accounts.push({ bankId, acctId, acctType: 'card' });
    }
  }

  const defaultAcctId = accounts[0]?.acctId;
  const transactions: OfxTransaction[] = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let trnMatch: RegExpExecArray | null;
  while ((trnMatch = trnRegex.exec(text)) !== null) {
    const block = trnMatch[1];
    const fitid = extractOfxTag(block, 'FITID') ?? '';
    const dtPosted = extractOfxTag(block, 'DTPOSTED') ?? '';
    const trnamt = extractOfxTag(block, 'TRNAMT') ?? '';
    const memo = extractOfxTag(block, 'MEMO') ?? '';
    const name = extractOfxTag(block, 'NAME');
    const trnType = extractOfxTag(block, 'TRNTYPE');
    if (dtPosted && trnamt) {
      transactions.push({
        fitid,
        dtPosted,
        trnamt,
        memo: memo || name || '',
        name,
        trnType,
        accountId: defaultAcctId,
      });
    }
  }

  return {
    format,
    encoding: decoded.encoding,
    accounts,
    transactions,
  };
}

function detectCsvDelimiter(firstLine: string): ',' | ';' | '\t' {
  const candidates: Array<',' | ';' | '\t'> = [';', ',', '\t'];
  let best: ',' | ';' | '\t' = ',';
  let bestCount = 0;

  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === delim && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }

  return best;
}

function splitCsvTable(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function detectCsvProfile(normHeaders: string[]): CsvProfileId {
  const has = (name: string) => normHeaders.includes(name);

  if (has('date') && has('title') && has('amount')) {
    return 'nubank_card';
  }
  if (has('data') && has('valor') && has('identificador') && has('descricao')) {
    return 'nubank_checking';
  }
  if (has('data lancamento') && has('descricao') && has('valor')) {
    return 'inter';
  }
  if (
    has('data de compra') &&
    has('descricao') &&
    (has('valor (em r$)') || has('valor'))
  ) {
    return 'c6';
  }
  if (has('data') && has('lancamento') && has('valor')) {
    return 'itau';
  }
  return 'unknown';
}

function resolveColIndex(
  col: number | string,
  headers: string[],
  normHeaders: string[]
): number {
  if (typeof col === 'number') return col;
  const exactIdx = headers.indexOf(col);
  if (exactIdx >= 0) return exactIdx;
  return normHeaders.indexOf(normalizeHeader(col));
}

export function parseCsv(
  text: string,
  manualMapping?: CsvColumnMapping
): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, '');
  const firstNonEmpty =
    clean.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const delimiter = detectCsvDelimiter(firstNonEmpty);
  const table = splitCsvTable(clean, delimiter);

  if (table.length === 0) {
    return {
      profile: 'unknown',
      delimiter,
      headers: [],
      needsManualMapping: true,
      sampleRows: [],
      rows: [],
    };
  }

  const headers = table[0];
  const normHeaders = headers.map(normalizeHeader);
  const dataRows = table.slice(1);
  const sampleRows = dataRows.slice(0, 3);

  if (manualMapping) {
    const dateIdx = resolveColIndex(manualMapping.dateCol, headers, normHeaders);
    const descIdx = resolveColIndex(
      manualMapping.descriptionCol,
      headers,
      normHeaders
    );
    const amountIdx = resolveColIndex(
      manualMapping.amountCol,
      headers,
      normHeaders
    );

    const rows: CsvRawRow[] = dataRows
      .filter((r) => dateIdx >= 0 && descIdx >= 0 && amountIdx >= 0 && r[dateIdx] && r[amountIdx])
      .map((r) => ({
        date: r[dateIdx] ?? '',
        description: r[descIdx] ?? '',
        amount: r[amountIdx] ?? '',
        invertSign: manualMapping.invertSign,
      }));

    return {
      profile: 'manual',
      delimiter,
      headers,
      needsManualMapping: false,
      sampleRows,
      rows,
    };
  }

  const profile = detectCsvProfile(normHeaders);
  if (profile === 'unknown') {
    return {
      profile: 'unknown',
      delimiter,
      headers,
      needsManualMapping: true,
      sampleRows,
      rows: [],
    };
  }

  const idxOf = (name: string) => normHeaders.indexOf(name);
  const rows: CsvRawRow[] = [];

  for (const r of dataRows) {
    if (profile === 'nubank_card') {
      rows.push({
        date: r[idxOf('date')] ?? '',
        description: r[idxOf('title')] ?? '',
        amount: r[idxOf('amount')] ?? '',
        invertSign: true,
      });
    } else if (profile === 'nubank_checking') {
      rows.push({
        date: r[idxOf('data')] ?? '',
        description: r[idxOf('descricao')] ?? '',
        amount: r[idxOf('valor')] ?? '',
        fitid: r[idxOf('identificador')] ?? undefined,
      });
    } else if (profile === 'inter') {
      rows.push({
        date: r[idxOf('data lancamento')] ?? '',
        description: r[idxOf('descricao')] ?? '',
        amount: r[idxOf('valor')] ?? '',
      });
    } else if (profile === 'c6') {
      const valIdx =
        idxOf('valor (em r$)') >= 0 ? idxOf('valor (em r$)') : idxOf('valor');
      const parcIdx = idxOf('parcela');
      const rawParc = parcIdx >= 0 ? r[parcIdx] : undefined;
      rows.push({
        date: r[idxOf('data de compra')] ?? '',
        description: r[idxOf('descricao')] ?? '',
        amount: r[valIdx] ?? '',
        installmentHint:
          rawParc && /^\d{1,2}\/\d{1,2}$/.test(rawParc.trim())
            ? rawParc.trim()
            : undefined,
        invertSign: true,
      });
    } else if (profile === 'itau') {
      rows.push({
        date: r[idxOf('data')] ?? '',
        description: r[idxOf('lancamento')] ?? '',
        amount: r[idxOf('valor')] ?? '',
      });
    }
  }

  return {
    profile,
    delimiter,
    headers,
    needsManualMapping: false,
    sampleRows,
    rows: rows.filter((r) => r.date.length > 0 && r.amount.length > 0),
  };
}

function parseStatementDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  const ofxMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
  }
  return trimmed.slice(0, 10);
}

function parseSignedAmountCents(rawAmount: string): {
  cents: number;
  isNegative: boolean;
} {
  let s = rawAmount.trim().replace(/R\$/gi, '').replace(/\s+/g, '');
  let isNegative = false;
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized = s;
  if (lastComma > lastDot) {
    // Brazilian format: 1.234,56
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US format: 1,234.56
    normalized = s.replace(/,/g, '');
  }

  const [wholePart = '0', fracPart = ''] = normalized.split('.');
  const cleanWhole = wholePart.replace(/\D/g, '') || '0';
  const cleanFrac = (fracPart.replace(/\D/g, '') + '00').slice(0, 2);
  const cents = Number(cleanWhole) * 100 + Number(cleanFrac);
  return { cents, isNegative };
}

function extractInstallment(
  description: string,
  hint?: string
): { number: number; total: number } | undefined {
  const validate = (numStr: string, totStr: string) => {
    const number = Number(numStr);
    const total = Number(totStr);
    if (
      Number.isInteger(number) &&
      Number.isInteger(total) &&
      number >= 1 &&
      total >= 2 &&
      total <= 99 &&
      number <= total
    ) {
      return { number, total };
    }
    return undefined;
  };

  if (hint) {
    const m = hint.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
    if (m) {
      const valid = validate(m[1], m[2]);
      if (valid) return valid;
    }
  }

  const trimmed = description.trim();
  const patterns = [
    /(?:-\s*|\s+)parc(?:ela)?\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})$/i,
    /(?:-\s*|\s+)(\d{1,2})\s+de\s+(\d{1,2})$/i,
    /(?:-\s*|\s+)(\d{1,2})\s*\/\s*(\d{1,2})$/i,
  ];

  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) {
      const valid = validate(m[1], m[2]);
      if (valid) return valid;
    }
  }

  return undefined;
}

function fnv1aHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}`;
}

export function normalizeStatementRow(
  raw: RawStatementRowInput,
  context: NormalizeRowContext
): NormalizedStatementRow {
  const date = parseStatementDate(raw.date);
  const description = raw.description.replace(/\s+/g, ' ').trim();
  const { cents, isNegative } = parseSignedAmountCents(raw.amount);

  const direction: 'in' | 'out' = raw.invertSign
    ? isNegative
      ? 'in'
      : 'out'
    : isNegative
      ? 'out'
      : 'in';

  const installment = extractInstallment(description, raw.installmentHint);
  const fitid = raw.fitid?.trim();
  const externalId =
    fitid && fitid.length > 0
      ? fitid
      : `stmt:${fnv1aHex(
          `${context.accountId}|${date}|${cents}|${direction}|${normalizeRulePattern(description)}|${context.occurrenceIndex ?? 0}`
        )}`;

  return {
    date,
    description,
    amountCents: cents,
    direction,
    externalId,
    ...(installment ? { installment } : {}),
  };
}

export function normalizeRulePattern(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function suggestRulePattern(description: string): string {
  let clean = description.replace(/\s+/g, ' ').trim();
  clean = clean
    .replace(/(?:-\s*|\s+)parc(?:ela)?\.?\s*\d{1,2}\s*\/\s*\d{1,2}$/i, '')
    .replace(/(?:-\s*|\s+)\d{1,2}\s+de\s+\d{1,2}$/i, '')
    .replace(/(?:-\s*|\s+)\d{1,2}\s*\/\s*\d{1,2}$/i, '')
    .trim();
  return clean || description.trim();
}

const MATCH_TYPE_RANK: Record<CategoryRuleMatchType, number> = {
  exact: 3,
  starts_with: 2,
  contains: 1,
};

function ruleMatches(
  normDescription: string,
  rule: CategoryRuleLike
): boolean {
  const normPattern = normalizeRulePattern(rule.pattern);
  if (!normPattern) return false;
  if (rule.match_type === 'exact') return normDescription === normPattern;
  if (rule.match_type === 'starts_with') {
    return normDescription.startsWith(normPattern);
  }
  return normDescription.includes(normPattern);
}

export function applyCategoryRules<T extends NormalizedStatementRow>(
  rows: T[],
  rules: CategoryRuleLike[]
): Array<T & { categoryId: string; matchedRuleId?: string }> {
  return rows.map((row) => {
    const rowKind: FinKind = row.direction === 'in' ? 'income' : 'expense';
    const normDesc = normalizeRulePattern(row.description);

    const matching = rules.filter(
      (r) => r.kind === rowKind && ruleMatches(normDesc, r)
    );

    matching.sort((a, b) => {
      const rankDiff =
        MATCH_TYPE_RANK[b.match_type] - MATCH_TYPE_RANK[a.match_type];
      if (rankDiff !== 0) return rankDiff;
      const lenDiff =
        normalizeRulePattern(b.pattern).length -
        normalizeRulePattern(a.pattern).length;
      if (lenDiff !== 0) return lenDiff;
      return (b.hits ?? 0) - (a.hits ?? 0);
    });

    const best = matching[0];
    const fallbackCategory =
      rowKind === 'income' ? 'cat-outros-receita' : 'cat-outros-despesa';

    return {
      ...row,
      categoryId: best ? best.category_id : fallbackCategory,
      ...(best ? { matchedRuleId: best.id } : {}),
    };
  });
}

function daysBetweenIso(aIso: string, bIso: string): number {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.abs(Math.round((utcA - utcB) / 86400000));
}

export function reconcileImportedRows<T extends CategorizedStatementRow>(
  rows: T[],
  existingEntries: ReconcilableExistingEntry[],
  accountId: string
): Array<T & { reconcileStatus: ReconcileStatus; matchedEntryId?: string }> {
  const accountEntries = existingEntries.filter(
    (e) => e.account_id === accountId
  );
  const existingExternalIds = new Set(
    accountEntries
      .map((e) => e.external_id)
      .filter((id): id is string => Boolean(id))
  );
  const usedPendingIds = new Set<string>();

  return rows.map((row) => {
    if (existingExternalIds.has(row.externalId)) {
      return {
        ...row,
        reconcileStatus: 'duplicate' as ReconcileStatus,
      };
    }

    const rowKind: FinKind = row.direction === 'in' ? 'income' : 'expense';
    const pendingCandidate = accountEntries.find(
      (e) =>
        !usedPendingIds.has(e.id) &&
        e.status === 'pending' &&
        e.kind === rowKind &&
        e.amount_cents === row.amountCents &&
        daysBetweenIso(e.due_date, row.date) <= 5
    );

    if (pendingCandidate) {
      usedPendingIds.add(pendingCandidate.id);
      return {
        ...row,
        reconcileStatus: 'settle_pending' as ReconcileStatus,
        matchedEntryId: pendingCandidate.id,
      };
    }

    return {
      ...row,
      reconcileStatus: 'new' as ReconcileStatus,
    };
  });
}
