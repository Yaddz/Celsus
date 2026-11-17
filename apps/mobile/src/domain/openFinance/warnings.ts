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

const WARNING_CODES_PT_BR: Record<string, string> = {
  ACCT_001: 'Você não autorizou o compartilhamento de contas.',
  ACCT_002: 'Uma conta está aguardando autorização no banco.',
  ACCT_003: 'Uma conta está temporariamente indisponível no banco.',
  ACCT_004: 'Uma conta está indisponível no banco.',
  ACCT_005: 'Limites do cheque especial não autorizados.',
  ACCT_006: 'Mais de 260 contas; só as 260 primeiras foram lidas.',
  CC_001: 'Você não autorizou o compartilhamento de cartões.',
  CC_002: 'Um cartão está aguardando autorização no banco.',
  CC_003: 'Um cartão está temporariamente indisponível.',
  CC_004: 'Um cartão está indisponível.',
  CC_005: 'Faturas do cartão não autorizadas.',
  CC_006: 'Transações do cartão não autorizadas.',
  CC_007: 'O banco não informa o limite deste cartão.',
  TXN_001: 'Transações da conta não autorizadas.',
  TXN_002: 'Nenhuma conta disponível para ler transações.',
  TXN_003: 'Limite de consultas do banco atingido; transações podem estar incompletas.',
  TXN_004: 'Contas não autorizadas; transações não lidas.',
  TXN_005: 'Erro ao ler contas; transações não lidas.',
  TXN_006: 'Limite de consultas do banco atingido; transações podem estar incompletas.',
  INV_001: 'Investimentos não autorizados.',
  INV_002: 'Investimentos aguardando autorização.',
  INV_003: 'Investimentos não suportados para esta instituição.',
  INV_004: 'Limite mensal de consultas de investimentos atingido.',
  INV_005: 'Tipo de investimento não suportado.',
};

export function translatePluggyWarning(warning: PluggyWarningInput): string {
  const code = (warning.code ?? '').trim().toUpperCase();
  if (code && WARNING_CODES_PT_BR[code]) {
    return WARNING_CODES_PT_BR[code];
  }
  const provider = warning.providerMessage?.trim();
  if (provider) return provider;
  const msg = warning.message?.trim();
  if (msg) return msg;
  return code || 'Aviso da instituição';
}

export function collectItemWarningsPtBr(
  statusDetailJson?: string | null
): TranslatedPluggyWarning[] {
  if (!statusDetailJson) return [];
  try {
    const parsed = JSON.parse(statusDetailJson) as Record<
      string,
      {
        isUpdated?: boolean;
        warnings?: Array<{ code?: string; message?: string; providerMessage?: string | null }>;
      } | null
    >;
    if (!parsed || typeof parsed !== 'object') return [];
    const out: TranslatedPluggyWarning[] = [];
    for (const [product, detail] of Object.entries(parsed)) {
      if (!detail || !Array.isArray(detail.warnings)) continue;
      for (const w of detail.warnings) {
        const code = (w.code ?? '').trim();
        out.push({
          product,
          code,
          text: translatePluggyWarning({
            product,
            code,
            message: w.message,
            providerMessage: w.providerMessage,
          }),
          detail: w.providerMessage ?? null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
