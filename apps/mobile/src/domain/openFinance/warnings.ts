export interface PluggyWarningInput {
  code?: string | null;
  message?: string | null;
  providerMessage?: string | null;
  product?: string | null;
}

export interface TranslatedPluggyWarning {
  product: string;
  code: string;
  text: string;
  detail?: string | null;
}

export function translatePluggyWarning(_warning: PluggyWarningInput): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function collectItemWarningsPtBr(
  _statusDetailJson?: string | null
): TranslatedPluggyWarning[] {
  throw new Error('NOT_IMPLEMENTED');
}
