/**
 * Sprint 96: nome real da instituição em conexões Meu Pluggy (o conector se chama sempre "MeuPluggy").
 * Stub da Fase A — implementação na Fase B.
 */
import type { PluggyAccount, PluggyInvestment } from '../../services/pluggy/types';

export function parseTransferNumberCompe(_transferNumber: string | null | undefined): string | null {
  return null;
}

export function institutionFromCompe(_code: string | null | undefined): string | null {
  return null;
}

export function resolveInstitutionName(_params: {
  connectorName?: string | null;
  accounts?: Array<Pick<PluggyAccount, 'bankData'>>;
  investments?: Array<Pick<PluggyInvestment, 'institution'>>;
}): string | null {
  return null;
}
