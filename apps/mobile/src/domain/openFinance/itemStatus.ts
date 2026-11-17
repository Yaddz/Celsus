const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

const ITEM_STATUS_PT_BR: Record<string, string> = {
  UPDATED: 'Atualizado',
  UPDATING: 'Atualizando no Meu Pluggy',
  LOGIN_ERROR: 'Erro de acesso no banco',
  OUTDATED: 'Desatualizado',
  WAITING_USER_INPUT: 'Aguardando ação do usuário',
};

const EXECUTION_STATUS_PT_BR: Record<string, string> = {
  SUCCESS: 'Sincronização concluída',
  PARTIAL_SUCCESS: 'Atualização parcial',
  ERROR: 'Erro na coleta',
  MERGE_ERROR: 'Erro ao consolidar dados',
  INVALID_CREDENTIALS: 'Credenciais inválidas',
  ALREADY_LOGGED_IN: 'Sessão já aberta no banco',
  SITE_NOT_AVAILABLE: 'Banco temporariamente indisponível',
  INVALID_CREDENTIALS_MFA: 'Código de verificação inválido',
  USER_INPUT_TIMEOUT: 'Tempo esgotado aguardando resposta',
  ACCOUNT_LOCKED: 'Conta bloqueada no banco',
  ACCOUNT_NEEDS_ACTION: 'Ação necessária no app do banco',
  USER_NOT_SUPPORTED: 'Tipo de conta não suportado',
  ACCOUNT_CREDENTIALS_RESET: 'Senha precisa ser redefinida no banco',
  CONNECTION_ERROR: 'Falha de conexão com o banco',
  USER_AUTHORIZATION_NOT_GRANTED: 'Autorização não concedida',
  USER_AUTHORIZATION_REVOKED: 'Autorização revogada',
  USER_AUTHORIZATION_EXPIRED: 'Autorização expirada',
  WAITING_USER_INPUT: 'Aguardando entrada do usuário',
  USER_AUTHORIZATION_PENDING: 'Aguardando autorização no banco',
  CREATED: 'Conexão criada',
  LOGIN_IN_PROGRESS: 'Entrando no banco',
  MERGING: 'Consolidando dados',
};

export function formatPluggyExecutionStatus(executionStatus?: string | null): string {
  const code = (executionStatus ?? '').trim().toUpperCase();
  if (!code) return 'Status desconhecido';
  if (EXECUTION_STATUS_PT_BR[code]) return EXECUTION_STATUS_PT_BR[code];
  if (code.endsWith('_IN_PROGRESS')) return 'Coleta em andamento';
  return code;
}

export function formatPluggyItemStatus(
  status?: string | null,
  executionStatus?: string | null
): string {
  const st = (status ?? '').trim().toUpperCase();
  const ex = (executionStatus ?? '').trim().toUpperCase();
  const statusText = ITEM_STATUS_PT_BR[st] ?? (st || 'Desconhecido');
  if (!ex || ex === 'SUCCESS') return statusText;
  return `${statusText} · ${formatPluggyExecutionStatus(ex)}`;
}

export function formatPluggyLastUpdatedBrt(iso?: string | null): string {
  if (!iso) return 'Sem data de atualização do Meu Pluggy';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Sem data de atualização do Meu Pluggy';
  const brt = new Date(ms - BRT_OFFSET_MS);
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(brt.getUTCHours()).padStart(2, '0');
  const min = String(brt.getUTCMinutes()).padStart(2, '0');
  return `Dados do Meu Pluggy de ${dd}/${mm} às ${hh}:${min}`;
}
