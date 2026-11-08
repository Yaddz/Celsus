import Decimal from 'decimal.js';
import { STATIC_CATALOG_ASSETS } from '../../services/marketApi';

export {
  B3ParsingError,
  EmptyFileError,
  UnrecognizedFormatError,
  MissingColumnError,
  UnsupportedStatementError,
} from '../../services/b3/readStatementFile';

export interface ParsedStatementRow {
  rowNo: number;
  entryExit: 'CREDIT' | 'DEBIT';
  rawDate: string;
  tradeDate: string;
  rawMovement: string;
  rawProduct: string;
  ticker: string;
  productName: string;
  institution: string;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
}

export type MovementKind = 'BUY' | 'SELL' | 'INCOME' | 'IGNORE' | 'REVIEW';

export interface MovementClassification {
  kind: MovementKind;
  reason: string;
}

function matchCanonicalKey(header: string): string | null {
  const clean = header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (/entrada.*saida/.test(clean)) return 'entradaSaida';
  if (/^data$/.test(clean)) return 'data';
  if (/movimentaca?o/.test(clean)) return 'movimentacao';
  if (/^produto/.test(clean)) return 'produto';
  if (/instituica?o/.test(clean)) return 'instituicao';
  if (/^quantidade/.test(clean)) return 'quantidade';
  if (/pre[cç]o.*unit[aá]rio/.test(clean)) return 'precoUnitario';
  if (/valor.*opera[cç][aã]o/.test(clean)) return 'valorOperacao';

  return null;
}

function getRowField(row: Record<string, string>, canonicalKey: string): string {
  if (row[canonicalKey] !== undefined) return row[canonicalKey];
  for (const [k, v] of Object.entries(row)) {
    if (matchCanonicalKey(k) === canonicalKey) {
      return v ?? '';
    }
  }
  return '';
}

export function parseStatementRows(rawRows: Array<Record<string, string>>): ParsedStatementRow[] {
  return rawRows.map((row, idx) => {
    const entryExitRaw = getRowField(row, 'entradaSaida')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const entryExit: 'CREDIT' | 'DEBIT' = entryExitRaw.startsWith('deb') ? 'DEBIT' : 'CREDIT';

    const rawDate = getRowField(row, 'data').trim();
    let tradeDate = rawDate;
    if (rawDate.includes('/')) {
      const parts = rawDate.split('/');
      if (parts.length === 3) {
        tradeDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    const rawMovement = getRowField(row, 'movimentacao').trim();
    const rawProduct = getRowField(row, 'produto').trim();
    let ticker = rawProduct;
    let productName = rawProduct;
    const dashIdx = rawProduct.indexOf(' - ');
    if (dashIdx !== -1) {
      ticker = rawProduct.slice(0, dashIdx).trim().toUpperCase();
      productName = rawProduct.slice(dashIdx + 3).trim();
    }

    const rawInst = getRowField(row, 'instituicao').trim();
    const institution = rawInst.replace(/\.+$/, '').trim();

    const rawQty = getRowField(row, 'quantidade').trim();
    const quantity = rawQty === '-' || rawQty === '' ? '0' : rawQty;

    const rawPrice = getRowField(row, 'precoUnitario').trim();
    const unitPrice = rawPrice === '-' || rawPrice === '' ? null : rawPrice.replace(',', '.');

    const rawVal = getRowField(row, 'valorOperacao').trim();
    const operationValue = rawVal === '-' || rawVal === '' ? null : rawVal.replace(',', '.');

    return {
      rowNo: idx + 1,
      entryExit,
      rawDate,
      tradeDate,
      rawMovement,
      rawProduct,
      ticker,
      productName,
      institution,
      quantity,
      unitPrice,
      operationValue,
    };
  });
}

export function classifyMovement(row: ParsedStatementRow): MovementClassification {
  const normMovement = row.rawMovement.trim();
  const lowerMovement = normMovement.toLowerCase();

  // 1. Subscrição exercida (treated as BUY of base ticker)
  if (
    lowerMovement.includes('subscri') &&
    lowerMovement.includes('exercid') &&
    !lowerMovement.includes('não exercid') &&
    !lowerMovement.includes('nao exercid')
  ) {
    const qtyNum = Number(row.quantity);
    const priceNum = row.unitPrice !== null ? Number(row.unitPrice) : NaN;
    if (qtyNum > 0 && !isNaN(priceNum) && priceNum > 0) {
      return { kind: 'BUY', reason: 'Subscrição exercida' };
    }
    return { kind: 'REVIEW', reason: 'Subscrição exercida sem preço ou quantidade' };
  }

  // 2. Ignored movements (no financial impact)
  if (
    /^(atualiza[cç][aã]o|recibo de subscri[cç][aã]o|direito(s)? de subscri[cç][aã]o|direito(s)? sobras de subscri[cç][aã]o|solicita[cç][aã]o de subscri[cç][aã]o)/i.test(
      normMovement
    ) ||
    lowerMovement.includes('não exercido') ||
    lowerMovement.includes('nao exercido') ||
    (normMovement.startsWith('Transferência') && !normMovement.includes('Liquidação'))
  ) {
    return { kind: 'IGNORE', reason: 'Sem efeito financeiro' };
  }

  // 3. Liquidação (BUY or SELL)
  if (normMovement === 'Transferência - Liquidação') {
    const qtyNum = Number(row.quantity);
    const priceNum = row.unitPrice !== null ? Number(row.unitPrice) : NaN;

    if (qtyNum <= 0 || isNaN(priceNum) || priceNum <= 0) {
      return { kind: 'REVIEW', reason: 'Quantidade ou preço inválido para liquidação' };
    }

    if (row.entryExit === 'CREDIT') {
      return { kind: 'BUY', reason: 'Transferência - Liquidação' };
    } else {
      return { kind: 'SELL', reason: 'Transferência - Liquidação' };
    }
  }

  // 4. Proventos (INCOME)
  if (
    normMovement === 'Rendimento' ||
    normMovement === 'Dividendo' ||
    normMovement === 'Juros Sobre Capital Próprio' ||
    normMovement === 'JCP'
  ) {
    if (row.entryExit === 'CREDIT') {
      return { kind: 'INCOME', reason: row.rawMovement };
    } else {
      return { kind: 'REVIEW', reason: 'Provento não creditado' };
    }
  }

  // 5. Unmapped or corporate action (splits, groupings, loans, etc.)
  return { kind: 'REVIEW', reason: `Movimentação requer revisão: ${row.rawMovement}` };
}

export function normalizeTicker(ticker: string): string {
  const clean = ticker.trim().toUpperCase();
  const match = clean.match(/^([A-Z]{4})(12|13)$/);
  if (match) {
    return `${match[1]}11`;
  }
  return clean;
}

const STOCK_UNITS = new Set([
  'ALUP11',
  'BPAC11',
  'SAPR11',
  'TAEE11',
  'KLBN11',
  'SANB11',
  'ENGI11',
  'TIET11',
  'SULA11',
  'BBAS11',
]);

const KNOWN_FIIS = new Set([
  'HGLG11',
  'MXRF11',
  'BTLG11',
  'XPML11',
  'KNIP11',
  'VISC11',
  'KNCR11',
  'XPLG11',
  'HGRU11',
  'TGAR11',
  'CPTS11',
  'IRDM11',
  'RBRR11',
  'ALZR11',
  'TRXF11',
]);

export function inferAssetClass(params: {
  ticker: string;
  productName?: string;
  catalog?: any[];
  existingClass?: string;
}): {
  class: 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO';
  confidence: 'sure' | 'guess' | 'unknown';
} {
  const cleanTicker = params.ticker.trim().toUpperCase();
  const pName = (params.productName || '').toUpperCase();

  // 1. Existing class
  if (params.existingClass) {
    return {
      class: params.existingClass as 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO',
      confidence: 'sure',
    };
  }

  // 2. Known Stock Units
  if (STOCK_UNITS.has(cleanTicker)) {
    return { class: 'STOCK', confidence: 'sure' };
  }

  // 3. User catalog or static catalog
  const catalogList = params.catalog || STATIC_CATALOG_ASSETS;
  const inCatalog = catalogList.find((a) => a.ticker === cleanTicker);
  if (inCatalog && inCatalog.asset_class) {
    return { class: inCatalog.asset_class, confidence: 'sure' };
  }

  // 4. Known FIIs
  if (KNOWN_FIIS.has(cleanTicker)) {
    return { class: 'FII', confidence: 'sure' };
  }

  // 5. Product name heuristic for FII
  const hasFiiInName =
    pName.includes('FII') ||
    pName.includes('FDO INV IMOB') ||
    pName.includes('FUNDO DE INVESTIMENTO IMOBILIARIO') ||
    pName.includes('FUNDO DE INVESTIMENTO IMOBILIÁRIO');

  if (hasFiiInName) {
    return { class: 'FII', confidence: 'guess' };
  }

  // 6. Suffixes 3, 4, 5, 6 -> Standard stocks
  if (/^[A-Z]{4}[3456]$/.test(cleanTicker)) {
    return { class: 'STOCK', confidence: 'sure' };
  }

  // 7. Ends with 11 without prior match
  if (cleanTicker.endsWith('11')) {
    return { class: 'FII', confidence: 'guess' };
  }

  // 8. Unknown
  return { class: 'STOCK', confidence: 'unknown' };
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function reconcileOpeningBalances(rows: ParsedStatementRow[]): Array<{
  ticker: string;
  missingQuantity: string;
  asOfDate: string;
  firstRowDate?: string;
}> {
  const byTicker = new Map<string, ParsedStatementRow[]>();

  for (const r of rows) {
    const baseTicker = normalizeTicker(r.ticker);
    const list = byTicker.get(baseTicker) ?? [];
    list.push(r);
    byTicker.set(baseTicker, list);
  }

  const result: Array<{
    ticker: string;
    missingQuantity: string;
    asOfDate: string;
    firstRowDate?: string;
  }> = [];

  for (const [ticker, tickerRows] of byTicker.entries()) {
    // Sort chronologically ascending
    const sorted = [...tickerRows].sort((a, b) => {
      const cmp = a.tradeDate.localeCompare(b.tradeDate);
      if (cmp !== 0) return cmp;
      return a.rowNo - b.rowNo;
    });

    const firstRowDate = sorted[0].tradeDate;
    const asOfDate = subtractOneDay(firstRowDate);

    let currentPos = new Decimal(0);
    const history: Array<{ date: string; posBefore: Decimal; posAfter: Decimal }> = [];
    let maxDeficit = new Decimal(0);

    for (const row of sorted) {
      const cls = classifyMovement(row);

      if (cls.kind === 'BUY') {
        const qty = new Decimal(row.quantity || 0);
        const posBefore = currentPos;
        currentPos = currentPos.plus(qty);
        history.push({ date: row.tradeDate, posBefore, posAfter: currentPos });
      } else if (cls.kind === 'SELL') {
        const qty = new Decimal(row.quantity || 0);
        const posBefore = currentPos;
        if (qty.gt(currentPos)) {
          const deficit = qty.minus(currentPos);
          if (deficit.gt(maxDeficit)) {
            maxDeficit = deficit;
          }
        }
        currentPos = currentPos.minus(qty);
        history.push({ date: row.tradeDate, posBefore, posAfter: currentPos });
      } else if (cls.kind === 'INCOME') {
        const incomeQty = new Decimal(row.quantity || 0);
        if (incomeQty.gt(0)) {
          const payDate = new Date(`${row.tradeDate}T12:00:00Z`);
          const windowStart = new Date(payDate);
          windowStart.setUTCDate(windowStart.getUTCDate() - 20);
          const windowStartStr = windowStart.toISOString().slice(0, 10);

          // Find position right before windowStart
          let peakInWindow = new Decimal(0);
          let foundPrior = false;
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].date < windowStartStr) {
              peakInWindow = history[i].posAfter;
              foundPrior = true;
              break;
            }
          }
          if (!foundPrior && history.length > 0 && history[0].date >= windowStartStr) {
            peakInWindow = new Decimal(0);
          }

          // Evaluate all changes inside the window
          for (const h of history) {
            if (h.date >= windowStartStr && h.date <= row.tradeDate) {
              if (h.posBefore.gt(peakInWindow)) peakInWindow = h.posBefore;
              if (h.posAfter.gt(peakInWindow)) peakInWindow = h.posAfter;
            }
          }

          if (incomeQty.gt(peakInWindow)) {
            const deficit = incomeQty.minus(peakInWindow);
            if (deficit.gt(maxDeficit)) {
              maxDeficit = deficit;
            }
          }
        }
      }
    }

    if (maxDeficit.gt(0)) {
      result.push({
        ticker,
        missingQuantity: maxDeficit.toString(),
        asOfDate,
        firstRowDate,
      });
    }
  }

  return result;
}

function fnv1a(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x5bd1e995);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  );
}

export interface ImportPlanItem {
  rowNo: number;
  entryExit: 'CREDIT' | 'DEBIT';
  tradeDate: string;
  rawDate: string;
  ticker: string;
  originalTicker: string;
  productName: string;
  institution: string;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
  rawMovement: string;
  kind: MovementKind;
  reason: string;
  externalId: string;
  notes?: string;
}

export interface ImportPlan {
  summary: {
    totalRowsRead: number;
    buysCount: number;
    sellsCount: number;
    incomesCount: number;
    ignoredCount: number;
    reviewCount: number;
  };
  totals: {
    buys: Decimal;
    sells: Decimal;
    incomes: Decimal;
  };
  buys: ImportPlanItem[];
  sells: ImportPlanItem[];
  incomes: ImportPlanItem[];
  ignored: ImportPlanItem[];
  review: ImportPlanItem[];
  chronologicalItems: ImportPlanItem[];
  assetsToCreate: Array<{
    ticker: string;
    name: string;
    assetClass: 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO';
    confidence: 'sure' | 'guess' | 'unknown';
  }>;
  openingBalances: Array<{
    ticker: string;
    missingQuantity: string;
    asOfDate: string;
    firstRowDate?: string;
  }>;
  duplicates: ImportPlanItem[];
  newItemsCount: number;
}

export function buildImportPlan(params: {
  rows: Array<Record<string, string>>;
  existingExternalIds?: Set<string>;
  existingAssets?: any[];
  catalog?: any[];
}): ImportPlan {
  const parsed = parseStatementRows(params.rows);
  const occurrenceCount = new Map<string, number>();

  const buys: ImportPlanItem[] = [];
  const sells: ImportPlanItem[] = [];
  const incomes: ImportPlanItem[] = [];
  const ignored: ImportPlanItem[] = [];
  const review: ImportPlanItem[] = [];

  let totalBuys = new Decimal(0);
  let totalSells = new Decimal(0);
  let totalIncomes = new Decimal(0);

  const uniqueTickers = new Map<string, string>();

  for (const row of parsed) {
    const normalized = normalizeTicker(row.ticker);
    if (!uniqueTickers.has(normalized)) {
      uniqueTickers.set(normalized, row.productName);
    }

    const classification = classifyMovement(row);

    const key = `${row.tradeDate}|${row.rawMovement}|${normalized}|${row.quantity}|${row.unitPrice || ''}|${row.operationValue || ''}|${row.institution}`;
    const n = occurrenceCount.get(key) ?? 0;
    occurrenceCount.set(key, n + 1);

    const hashInput = `${key}|${n}`;
    const externalId = `b3:${fnv1a(hashInput)}`;

    let notes: string | undefined;
    if (row.rawMovement.toLowerCase().includes('subscri') && row.rawMovement.toLowerCase().includes('exercid')) {
      notes = 'Subscrição exercida';
    } else if (classification.kind === 'INCOME') {
      notes = row.rawMovement;
    }

    const item: ImportPlanItem = {
      rowNo: row.rowNo,
      entryExit: row.entryExit,
      tradeDate: row.tradeDate,
      rawDate: row.rawDate,
      ticker: normalized,
      originalTicker: row.ticker,
      productName: row.productName,
      institution: row.institution,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      operationValue: row.operationValue,
      rawMovement: row.rawMovement,
      kind: classification.kind,
      reason: classification.reason,
      externalId,
      notes,
    };

    if (classification.kind === 'BUY') {
      buys.push(item);
      if (row.operationValue) {
        totalBuys = totalBuys.plus(new Decimal(row.operationValue));
      }
    } else if (classification.kind === 'SELL') {
      sells.push(item);
      if (row.operationValue) {
        totalSells = totalSells.plus(new Decimal(row.operationValue));
      }
    } else if (classification.kind === 'INCOME') {
      incomes.push(item);
      if (row.operationValue) {
        totalIncomes = totalIncomes.plus(new Decimal(row.operationValue));
      }
    } else if (classification.kind === 'IGNORE') {
      ignored.push(item);
    } else {
      review.push(item);
    }
  }

  // Chronological items: all actionable items (buys, sells, incomes) sorted ascending by tradeDate
  const actionable = [...buys, ...sells, ...incomes];
  const chronologicalItems = [...actionable].sort((a, b) => {
    const cmp = a.tradeDate.localeCompare(b.tradeDate);
    if (cmp !== 0) return cmp;
    return b.rowNo - a.rowNo; // Preserves inverted order if original file is newest first
  });

  // Assets to create
  const existingSet = new Set(
    (params.existingAssets || []).map((a) => (a.ticker || '').toUpperCase())
  );
  const assetsToCreate: ImportPlan['assetsToCreate'] = [];

  for (const [ticker, productName] of uniqueTickers.entries()) {
    if (!existingSet.has(ticker)) {
      const inference = inferAssetClass({
        ticker,
        productName,
        catalog: params.catalog,
      });
      assetsToCreate.push({
        ticker,
        name: productName,
        assetClass: inference.class,
        confidence: inference.confidence,
      });
    }
  }

  // Deduplication
  const duplicates: ImportPlanItem[] = [];
  let newItemsCount = 0;

  if (params.existingExternalIds && params.existingExternalIds.size > 0) {
    for (const item of actionable) {
      if (params.existingExternalIds.has(item.externalId)) {
        duplicates.push(item);
      } else {
        newItemsCount++;
      }
    }
  } else {
    newItemsCount = actionable.length;
  }

  const openingBalances = reconcileOpeningBalances(parsed);

  return {
    summary: {
      totalRowsRead: parsed.length,
      buysCount: buys.length,
      sellsCount: sells.length,
      incomesCount: incomes.length,
      ignoredCount: ignored.length,
      reviewCount: review.length,
    },
    totals: {
      buys: totalBuys,
      sells: totalSells,
      incomes: totalIncomes,
    },
    buys,
    sells,
    incomes,
    ignored,
    review,
    chronologicalItems,
    assetsToCreate,
    openingBalances,
    duplicates,
    newItemsCount,
  };
}
