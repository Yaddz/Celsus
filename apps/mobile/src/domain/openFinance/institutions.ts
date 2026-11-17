/**
 * Sprint 96: nome real da instituição em conexões Meu Pluggy (o conector se chama sempre "MeuPluggy").
 * A conta traz o código COMPE em `bankData.transferNumber` ("<compe>/<agência>/<conta>") e o investimento
 * em `institution.number`.
 */
import type { PluggyAccount, PluggyInvestment } from '../../services/pluggy/types';

const COMPE_INSTITUTIONS: Record<string, string> = {
  '001': 'Banco do Brasil',
  '033': 'Santander',
  '041': 'Banrisul',
  '070': 'BRB',
  '077': 'Inter',
  '102': 'XP',
  '104': 'Caixa',
  '121': 'Agibank',
  '197': 'Stone',
  '208': 'BTG Pactual',
  '212': 'Original',
  '237': 'Bradesco',
  '260': 'Nubank',
  '280': 'Will Bank',
  '290': 'PagBank',
  '323': 'Mercado Pago',
  '336': 'C6 Bank',
  '341': 'Itaú',
  '348': 'XP',
  '380': 'PicPay',
  '403': 'Cora',
  '422': 'Safra',
  '623': 'Banco Pan',
  '633': 'Rendimento',
  '637': 'Sofisa',
  '655': 'Votorantim',
  '735': 'Neon',
  '746': 'Modal',
  '748': 'Sicredi',
  '756': 'Sicoob',
};

const GENERIC_NAMES = new Set(['meupluggy', 'meu pluggy', 'pluggy']);

export function isGenericInstitutionName(name: string | null | undefined): boolean {
  const n = (name || '').trim().toLowerCase();
  return !n || GENERIC_NAMES.has(n);
}

export function parseTransferNumberCompe(transferNumber: string | null | undefined): string | null {
  const raw = (transferNumber || '').trim();
  if (!raw) return null;
  const first = raw.split(/[/\-\s]/)[0].replace(/\D/g, '');
  if (!first || first.length > 3) return null;
  return first.padStart(3, '0');
}

export function institutionFromCompe(code: string | number | null | undefined): string | null {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (!digits || digits.length > 3) return null;
  return COMPE_INSTITUTIONS[digits.padStart(3, '0')] ?? null;
}

export function institutionFromAccount(
  account: Pick<PluggyAccount, 'bankData'> | null | undefined
): string | null {
  return institutionFromCompe(parseTransferNumberCompe(account?.bankData?.transferNumber));
}

export function resolveInstitutionName(params: {
  connectorName?: string | null;
  accounts?: Array<Pick<PluggyAccount, 'bankData'>>;
  investments?: Array<Pick<PluggyInvestment, 'institution'>>;
}): string | null {
  const connector = (params.connectorName || '').trim();
  if (connector && !isGenericInstitutionName(connector)) return connector;

  for (const inv of params.investments ?? []) {
    const byCode = institutionFromCompe(inv.institution?.number ?? null);
    if (byCode) return byCode;
  }
  for (const inv of params.investments ?? []) {
    const name = (inv.institution?.name || '').trim();
    if (name && !isGenericInstitutionName(name)) return name;
  }
  for (const acc of params.accounts ?? []) {
    const byAcc = institutionFromAccount(acc);
    if (byAcc) return byAcc;
  }
  return null;
}
