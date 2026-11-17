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

export function buildSyncDiagnostics(
  _raw: RawSyncSnapshot,
  _persisted: PersistedSyncSnapshot
): SyncDiagnosticsReport {
  throw new Error('Not implemented (Sprint 71 Phase A stub)');
}

export function formatDiagnosticsReportText(_report: SyncDiagnosticsReport): string {
  throw new Error('Not implemented (Sprint 71 Phase A stub)');
}
