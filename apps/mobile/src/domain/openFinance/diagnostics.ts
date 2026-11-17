import Decimal from 'decimal.js';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyTransaction,
} from '../../services/pluggy/types';

export type DiagnosticResourceKind =
  | 'account'
  | 'transaction'
  | 'bill'
  | 'investment'
  | 'investmentTransaction';

export interface FieldCoverageEntry {
  field: string;
  filledCount: number;
  persistedCount: number;
}

export interface ResourceCoverageTable {
  resource: DiagnosticResourceKind;
  totalReceived: number;
  totalPersisted: number;
  fields: FieldCoverageEntry[];
}

export interface SyncDivergence {
  kind:
    | 'QUANTITY_MISMATCH'
    | 'ACCOUNT_BALANCE_MISMATCH'
    | 'TRANSACTION_NOT_PERSISTED'
    | 'INVESTMENT_ERROR';
  resourceId: string;
  detail: string;
}

export interface RawSyncSnapshot {
  itemId: string;
  connectorName?: string | null;
  accounts?: PluggyAccount[];
  transactions?: PluggyTransaction[];
  bills?: PluggyBill[];
  investments?: PluggyInvestment[];
  investmentTransactions?: PluggyInvestmentTransaction[];
  investmentErrors?: number;
}

export interface PersistedSyncSnapshot {
  accounts?: Array<{
    ofAccountId: string | null;
    reportedBalanceCents: number | null;
    calculatedBalanceCents: number;
    hasOwner?: boolean;
    hasMaskedNumber?: boolean;
  }>;
  transactions?: Array<{
    externalId: string | null;
    hasDescriptionRaw?: boolean;
    hasCategory?: boolean;
    hasBillMonth?: boolean;
    hasInstallments?: boolean;
  }>;
  bills?: Array<{
    billId?: string | null;
    hasClosingDate?: boolean;
    hasMinimumPayment?: boolean;
  }>;
  assets?: Array<{
    externalId: string | null;
    quantity: string;
    hasIssuer?: boolean;
    hasIssuerCnpj?: boolean;
    hasIssueDate?: boolean;
    hasPurchaseDate?: boolean;
    hasTaxes?: boolean;
  }>;
  investmentTransactions?: Array<{
    externalId: string | null;
    type: string;
    hasFees?: boolean;
  }>;
}

export interface SyncDiagnosticsReport {
  itemId: string;
  counts: {
    accounts: { received: number; persisted: number };
    transactions: { received: number; persisted: number };
    bills: { received: number; persisted: number };
    investments: { received: number; persisted: number };
    investmentTransactions: { received: number; persisted: number };
    investmentErrors: number;
  };
  investmentsByKind: Array<{ type: string; subtype: string | null; count: number }>;
  investmentTransactionsByType: Array<{ type: string; count: number }>;
  divergences: SyncDivergence[];
  fieldCoverage: ResourceCoverageTable[];
  sums: {
    reportedAccountsBalanceCents: number;
    calculatedAccountsBalanceCents: number;
    investmentsBalance: string;
  };
}

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

export function buildSyncDiagnostics(
  raw: RawSyncSnapshot,
  persisted: PersistedSyncSnapshot
): SyncDiagnosticsReport {
  const rawAccounts = raw.accounts ?? [];
  const rawTxs = raw.transactions ?? [];
  const rawBills = raw.bills ?? [];
  const rawInvs = raw.investments ?? [];
  const rawInvTxs = raw.investmentTransactions ?? [];
  const investmentErrors = raw.investmentErrors ?? 0;

  const perAccounts = persisted.accounts ?? [];
  const perTxs = persisted.transactions ?? [];
  const perBills = persisted.bills ?? [];
  const perAssets = persisted.assets ?? [];
  const perInvTxs = persisted.investmentTransactions ?? [];

  // Agrupamento de investimentos por type/subtype
  const invKindsMap = new Map<string, { type: string; subtype: string | null; count: number }>();
  for (const inv of rawInvs) {
    const subtype = inv.subtype ?? null;
    const key = `${inv.type}::${subtype ?? ''}`;
    const prev = invKindsMap.get(key);
    if (prev) prev.count += 1;
    else invKindsMap.set(key, { type: inv.type, subtype, count: 1 });
  }

  // Agrupamento de movimentações de investimento por type
  const invTxTypeMap = new Map<string, number>();
  for (const tx of rawInvTxs) {
    invTxTypeMap.set(tx.type, (invTxTypeMap.get(tx.type) ?? 0) + 1);
  }

  // Divergências
  const divergences: SyncDivergence[] = [];

  for (const acc of perAccounts) {
    if (
      acc.reportedBalanceCents !== null &&
      Math.abs(acc.reportedBalanceCents - acc.calculatedBalanceCents) > 1
    ) {
      divergences.push({
        kind: 'ACCOUNT_BALANCE_MISMATCH',
        resourceId: acc.ofAccountId ?? 'unknown',
        detail: `Diferença de saldo entre informado e calculado (${acc.reportedBalanceCents - acc.calculatedBalanceCents} centavos)`,
      });
    }
  }

  const persistedTxIds = new Set(perTxs.map((t) => t.externalId).filter(Boolean));
  for (const tx of rawTxs) {
    if (!persistedTxIds.has(tx.id)) {
      divergences.push({
        kind: 'TRANSACTION_NOT_PERSISTED',
        resourceId: tx.id,
        detail: 'Transação recebida da API não encontrada no banco local',
      });
    }
  }

  const assetByExt = new Map(
    perAssets.filter((a) => a.externalId).map((a) => [a.externalId!, a])
  );
  for (const inv of rawInvs) {
    const asset = assetByExt.get(inv.id);
    if (asset && inv.quantity !== null && inv.quantity !== undefined) {
      const diff = new Decimal(asset.quantity || '0').minus(inv.quantity).abs();
      if (diff.gt('0.0001')) {
        divergences.push({
          kind: 'QUANTITY_MISMATCH',
          resourceId: inv.id,
          detail: `Quantidade divergente (API=${inv.quantity}, local=${asset.quantity})`,
        });
      }
    }
  }

  if (investmentErrors > 0) {
    divergences.push({
      kind: 'INVESTMENT_ERROR',
      resourceId: raw.itemId,
      detail: `${investmentErrors} investimento(s) falharam ao buscar movimentações`,
    });
  }

  // Cobertura campo a campo
  const fieldCoverage: ResourceCoverageTable[] = [
    {
      resource: 'account',
      totalReceived: rawAccounts.length,
      totalPersisted: perAccounts.length,
      fields: [
        {
          field: 'owner',
          filledCount: rawAccounts.filter((a) => isFilled(a.owner)).length,
          persistedCount: perAccounts.filter((a) => a.hasOwner).length,
        },
        {
          field: 'number',
          filledCount: rawAccounts.filter((a) => isFilled(a.number)).length,
          persistedCount: perAccounts.filter((a) => a.hasMaskedNumber).length,
        },
        {
          field: 'balance',
          filledCount: rawAccounts.filter((a) => isFilled(a.balance)).length,
          persistedCount: perAccounts.filter((a) => a.reportedBalanceCents !== null).length,
        },
        {
          field: 'taxNumber',
          filledCount: rawAccounts.filter((a) => isFilled(a.taxNumber)).length,
          persistedCount: 0, // Dado sensível (CPF/CNPJ do titular) — ignorado por privacidade
        },
        {
          field: 'bankData.automaticallyInvestedBalance',
          filledCount: rawAccounts.filter((a) => isFilled(a.bankData?.automaticallyInvestedBalance)).length,
          persistedCount: 0,
        },
      ],
    },
    {
      resource: 'transaction',
      totalReceived: rawTxs.length,
      totalPersisted: perTxs.length,
      fields: [
        {
          field: 'description',
          filledCount: rawTxs.filter((t) => isFilled(t.description)).length,
          persistedCount: perTxs.length,
        },
        {
          field: 'descriptionRaw',
          filledCount: rawTxs.filter((t) => isFilled(t.descriptionRaw)).length,
          persistedCount: perTxs.filter((t) => t.hasDescriptionRaw).length,
        },
        {
          field: 'category',
          filledCount: rawTxs.filter((t) => isFilled(t.category)).length,
          persistedCount: perTxs.filter((t) => t.hasCategory).length,
        },
        {
          field: 'creditCardMetadata.billId',
          filledCount: rawTxs.filter((t) => isFilled(t.creditCardMetadata?.billId)).length,
          persistedCount: perTxs.filter((t) => t.hasBillMonth).length,
        },
        {
          field: 'creditCardMetadata.installmentNumber',
          filledCount: rawTxs.filter((t) => isFilled(t.creditCardMetadata?.installmentNumber)).length,
          persistedCount: perTxs.filter((t) => t.hasInstallments).length,
        },
      ],
    },
    {
      resource: 'bill',
      totalReceived: rawBills.length,
      totalPersisted: perBills.length,
      fields: [
        {
          field: 'billClosingDate',
          filledCount: rawBills.filter((b) => isFilled(b.billClosingDate)).length,
          persistedCount: perBills.filter((b) => b.hasClosingDate).length,
        },
        {
          field: 'minimumPaymentAmount',
          filledCount: rawBills.filter((b) => isFilled(b.minimumPaymentAmount)).length,
          persistedCount: perBills.filter((b) => b.hasMinimumPayment).length,
        },
      ],
    },
    {
      resource: 'investment',
      totalReceived: rawInvs.length,
      totalPersisted: perAssets.length,
      fields: [
        {
          field: 'issuer',
          filledCount: rawInvs.filter((i) => isFilled(i.issuer)).length,
          persistedCount: perAssets.filter((a) => a.hasIssuer).length,
        },
        {
          field: 'issuerCNPJ',
          filledCount: rawInvs.filter((i) => isFilled(i.issuerCNPJ)).length,
          persistedCount: perAssets.filter((a) => a.hasIssuerCnpj).length,
        },
        {
          field: 'issueDate',
          filledCount: rawInvs.filter((i) => isFilled(i.issueDate)).length,
          persistedCount: perAssets.filter((a) => a.hasIssueDate).length,
        },
        {
          field: 'purchaseDate',
          filledCount: rawInvs.filter((i) => isFilled(i.purchaseDate)).length,
          persistedCount: perAssets.filter((a) => a.hasPurchaseDate).length,
        },
        {
          field: 'taxes',
          filledCount: rawInvs.filter((i) => isFilled(i.taxes)).length,
          persistedCount: perAssets.filter((a) => a.hasTaxes).length,
        },
      ],
    },
    {
      resource: 'investmentTransaction',
      totalReceived: rawInvTxs.length,
      totalPersisted: perInvTxs.length,
      fields: [
        {
          field: 'expenses',
          filledCount: rawInvTxs.filter((t) => isFilled(t.expenses)).length,
          persistedCount: perInvTxs.filter((t) => t.hasFees).length,
        },
      ],
    },
  ];

  const reportedAccountsBalanceCents = perAccounts.reduce(
    (sum, a) => sum + (a.reportedBalanceCents ?? 0),
    0
  );
  const calculatedAccountsBalanceCents = perAccounts.reduce(
    (sum, a) => sum + a.calculatedBalanceCents,
    0
  );
  const investmentsBalance = rawInvs
    .reduce((sum, i) => sum.plus(i.balance ?? 0), new Decimal(0))
    .toFixed(2);

  return {
    itemId: raw.itemId,
    counts: {
      accounts: { received: rawAccounts.length, persisted: perAccounts.length },
      transactions: { received: rawTxs.length, persisted: perTxs.length },
      bills: { received: rawBills.length, persisted: perBills.length },
      investments: { received: rawInvs.length, persisted: perAssets.length },
      investmentTransactions: { received: rawInvTxs.length, persisted: perInvTxs.length },
      investmentErrors,
    },
    investmentsByKind: Array.from(invKindsMap.values()),
    investmentTransactionsByType: Array.from(invTxTypeMap.entries()).map(([type, count]) => ({
      type,
      count,
    })),
    divergences,
    fieldCoverage,
    sums: {
      reportedAccountsBalanceCents,
      calculatedAccountsBalanceCents,
      investmentsBalance,
    },
  };
}

export function formatDiagnosticsReportText(report: SyncDiagnosticsReport): string {
  const lines: string[] = [
    `Diagnóstico Open Finance`,
    `Contas: ${report.counts.accounts.persisted}/${report.counts.accounts.received}`,
    `Transações: ${report.counts.transactions.persisted}/${report.counts.transactions.received}`,
    `Faturas: ${report.counts.bills.persisted}/${report.counts.bills.received}`,
    `Investimentos: ${report.counts.investments.persisted}/${report.counts.investments.received}`,
    `Movimentações de investimento: ${report.counts.investmentTransactions.persisted}/${report.counts.investmentTransactions.received}`,
    `Erros em investimentos: ${report.counts.investmentErrors}`,
    `Soma contas (informado/calculado): ${(report.sums.reportedAccountsBalanceCents / 100).toFixed(2)} / ${(report.sums.calculatedAccountsBalanceCents / 100).toFixed(2)}`,
    `Soma investimentos: ${report.sums.investmentsBalance}`,
  ];

  if (report.investmentsByKind.length > 0) {
    lines.push('Investimentos por tipo:');
    for (const k of report.investmentsByKind) {
      lines.push(`- ${k.type}/${k.subtype ?? 'OTHER'}: ${k.count}`);
    }
  }

  if (report.investmentTransactionsByType.length > 0) {
    lines.push('Movimentações por tipo:');
    for (const t of report.investmentTransactionsByType) {
      lines.push(`- ${t.type}: ${t.count}`);
    }
  }

  lines.push(`Divergências: ${report.divergences.length}`);
  for (const d of report.divergences) {
    lines.push(`- [${d.kind}]`);
  }

  lines.push('Cobertura de campos (preenchidos -> gravados):');
  for (const table of report.fieldCoverage) {
    const filledSummary = table.fields
      .filter((f) => f.filledCount > 0 || f.persistedCount > 0)
      .map((f) => `${f.field}=${f.filledCount}->${f.persistedCount}`)
      .join(', ');
    if (filledSummary) {
      lines.push(`- ${table.resource}: ${filledSummary}`);
    }
  }

  return lines.join('\n');
}

export type OutlierAlertKind =
  | 'EXTREME_PROFITABILITY'
  | 'MARKET_VALUE_DIVERGENCE'
  | 'MISSING_COST_BASIS'
  | 'RF_RATE_OUT_OF_RANGE'
  | 'INVALID_QUOTE_TICKER'
  | 'DUPLICATE_FIN_ENTRY'
  | 'ACCOUNT_BALANCE_DIVERGENCE';

export interface OutlierAlert {
  id: string;
  kind: OutlierAlertKind;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
}

export interface OutlierAuditInput {
  assets?: Array<{
    id: string;
    ticker: string;
    name: string;
    quantity: string;
    average_price: string | null;
    marketValue?: string | number | null;
    of_reported_value?: string | null;
    value_source?: string | null;
    rf_indexer?: string | null;
    rf_rate?: number | null;
    source?: string | null;
  }>;
  accounts?: Array<{
    id: string;
    name: string;
    type: string;
    source?: string | null;
    reported_balance_cents?: number | null;
    calculated_balance_cents?: number | null;
  }>;
  entries?: Array<{
    id: string;
    account_id: string;
    kind: string;
    amount_cents: number;
    due_date: string;
    source?: string | null;
    external_id?: string | null;
    of_removed_at?: string | null;
  }>;
}

const VALID_B3_TICKER_RE = /^[A-Z]{4}\d{1,2}$/;

function daysBetweenIso(a: string, b: string): number {
  const t1 = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const t2 = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 999;
  return Math.abs(Math.round((t1 - t2) / 86_400_000));
}

export function auditOpenFinanceOutliers(input: OutlierAuditInput): OutlierAlert[] {
  const alerts: OutlierAlert[] = [];

  for (const a of input.assets ?? []) {
    const qty = new Decimal(a.quantity || '0');
    const hasAvg =
      a.average_price !== null &&
      a.average_price !== undefined &&
      a.average_price !== '' &&
      new Decimal(a.average_price).gt(0);

    if (qty.gt(0) && !hasAvg) {
      alerts.push({
        id: `missing-cost-${a.id}`,
        kind: 'MISSING_COST_BASIS',
        severity: 'medium',
        title: `${a.ticker}: custo médio ausente`,
        detail: `Quantidade ${a.quantity} sem preço médio conhecido.`,
      });
    }

    if (hasAvg && qty.gt(0) && a.marketValue !== null && a.marketValue !== undefined && a.marketValue !== '') {
      const invested = qty.mul(new Decimal(a.average_price!));
      const mv = new Decimal(a.marketValue);
      if (invested.gt(0)) {
        const profitPct = mv.minus(invested).div(invested).mul(100);
        if (profitPct.gt(300) || profitPct.lt(-90)) {
          alerts.push({
            id: `extreme-profit-${a.id}`,
            kind: 'EXTREME_PROFITABILITY',
            severity: 'high',
            title: `${a.ticker}: rentabilidade atípica (${profitPct.toFixed(1)}%)`,
            detail: `Investido R$ ${invested.toFixed(2)} vs. mercado R$ ${mv.toFixed(2)}.`,
          });
        }
      }
    }

    if (
      a.of_reported_value !== null &&
      a.of_reported_value !== undefined &&
      a.of_reported_value !== '' &&
      a.marketValue !== null &&
      a.marketValue !== undefined &&
      a.marketValue !== ''
    ) {
      const reported = new Decimal(a.of_reported_value);
      const localMv = new Decimal(a.marketValue);
      if (reported.gt(0)) {
        const diffRatio = localMv.minus(reported).abs().div(reported);
        if (diffRatio.gt('0.15')) {
          alerts.push({
            id: `mv-div-${a.id}`,
            kind: 'MARKET_VALUE_DIVERGENCE',
            severity: 'high',
            title: `${a.ticker}: valor local diverge da instituição`,
            detail: `Local R$ ${localMv.toFixed(2)} vs. instituição R$ ${reported.toFixed(2)}.`,
          });
        }
      }
    }

    if (a.rf_rate !== null && a.rf_rate !== undefined) {
      const idx = (a.rf_indexer || '').toUpperCase();
      const outOfRange =
        idx === 'CDI'
          ? a.rf_rate < 50 || a.rf_rate > 200
          : idx === 'PRE' || idx === 'IPCA'
          ? a.rf_rate < 0 || a.rf_rate > 30
          : false;
      if (outOfRange) {
        alerts.push({
          id: `rf-rate-${a.id}`,
          kind: 'RF_RATE_OUT_OF_RANGE',
          severity: 'high',
          title: `${a.ticker}: taxa ${idx} fora da faixa (${a.rf_rate})`,
          detail: `Taxa informada fora do intervalo plausível para ${idx}.`,
        });
      }
    }

    if (a.value_source === 'QUOTE' && !VALID_B3_TICKER_RE.test((a.ticker || '').trim().toUpperCase())) {
      alerts.push({
        id: `invalid-quote-ticker-${a.id}`,
        kind: 'INVALID_QUOTE_TICKER',
        severity: 'medium',
        title: `${a.ticker}: ticker não-B3 usando cotação`,
        detail: 'Ativo marcado com value_source QUOTE sem ticker B3 válido.',
      });
    }
  }

  for (const acc of input.accounts ?? []) {
    if (
      acc.source === 'OPEN_FINANCE' &&
      acc.reported_balance_cents !== null &&
      acc.reported_balance_cents !== undefined &&
      acc.calculated_balance_cents !== null &&
      acc.calculated_balance_cents !== undefined &&
      Math.abs(acc.reported_balance_cents - acc.calculated_balance_cents) > 100
    ) {
      alerts.push({
        id: `acc-div-${acc.id}`,
        kind: 'ACCOUNT_BALANCE_DIVERGENCE',
        severity: 'medium',
        title: `${acc.name}: divergência de saldo`,
        detail: `Diferença de ${Math.abs(acc.reported_balance_cents - acc.calculated_balance_cents)} centavos.`,
      });
    }
  }

  const activeOfEntries = (input.entries ?? []).filter(
    (e) => e.source === 'OPEN_FINANCE' && !e.of_removed_at
  );
  const seenPairs = new Set<string>();
  for (let i = 0; i < activeOfEntries.length; i += 1) {
    const a = activeOfEntries[i];
    for (let j = i + 1; j < activeOfEntries.length; j += 1) {
      const b = activeOfEntries[j];
      if (
        a.account_id === b.account_id &&
        a.kind === b.kind &&
        a.amount_cents === b.amount_cents &&
        a.external_id &&
        b.external_id &&
        a.external_id !== b.external_id &&
        daysBetweenIso(a.due_date, b.due_date) <= 1
      ) {
        const pairKey = [a.id, b.id].sort().join(':');
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          alerts.push({
            id: `dup-entry-${pairKey}`,
            kind: 'DUPLICATE_FIN_ENTRY',
            severity: 'medium',
            title: 'Possível lançamento duplicado',
            detail: `Dois lançamentos de R$ ${(a.amount_cents / 100).toFixed(2)} em ${a.due_date} / ${b.due_date}.`,
          });
        }
      }
    }
  }

  return alerts;
}

export interface DiagnosticRedactionContext {
  ownerNames?: Array<string | null | undefined>;
  categoryId?: string | null;
}

const OWNER_STOPWORDS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);

function stripDiagAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * R21: Remove PII de descrições de amostra no diagnóstico Pluggy:
 * - para categoryId 04* / 05*, mascara contraparte após "|", " para " ou " de "
 * - remove CPF/CNPJ formatados
 * - remove palavras do nome do titular (sem acento)
 * - substitui sequências de 4+ dígitos por "####", preservando datas e tickers
 */
export function redactDiagnosticDescription(
  desc: string | null | undefined,
  ctx?: DiagnosticRedactionContext
): string {
  let result = (desc || '').replace(/\s+/g, ' ').trim();
  if (!result) return '';

  // Contraparte: em Pix/TED/DOC/transferência de qualquer categoria (a Pluggy classifica Pix para pessoas como
  // compra) e em 04/05 que não sejam provento. Sprint 92.
  const catId = (ctx?.categoryId || '').trim();
  const normalized = stripDiagAccents(result).toLowerCase();
  const isTransferLike = /\b(pix|ted|doc|transf\w*)\b/.test(normalized);
  const isIncomeLike = /\b(rendimentos?|dividendos?|jcp|juros)\b/.test(normalized);
  if (isTransferLike || ((catId.startsWith('04') || catId.startsWith('05')) && !isIncomeLike)) {
    result = result.replace(/(\s*\|\s*|\s+para\s+|\s+de\s+).+$/i, '$1<contraparte>');
  }

  // Remove CPF e CNPJ formatados, inclusive o CNPJ parcial que identifica MEI ("62.985.265")
  result = result
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '')
    .replace(/\b\d{2,3}\.\d{3}\.\d{3}\b/g, '');

  // Remove palavras do nome do titular (comparação sem acento)
  const ownerWords = new Set<string>();
  for (const owner of ctx?.ownerNames ?? []) {
    if (!owner) continue;
    const words = stripDiagAccents(owner)
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !OWNER_STOPWORDS.has(w));
    for (const w of words) {
      ownerWords.add(w);
    }
  }
  if (ownerWords.size > 0) {
    result = result.replace(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g, (word) => {
      const norm = stripDiagAccents(word).toUpperCase();
      return ownerWords.has(norm) ? '' : word;
    });
  }

  // Troca 4+ dígitos por "####", preservando datas dd/mm/aaaa, yyyy-mm-dd e tickers [A-Z]{4}\d{1,2}
  result = result.replace(
    /\b\d{2}\/\d{2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b[A-Z]{4}\d{1,2}\b|\d{4,}/gi,
    (match) => (/^\d{4,}$/.test(match) ? '####' : match)
  );

  return result.replace(/\s+/g, ' ').trim();
}
