const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Converte uma data/timestamp ISO da Pluggy para data local de Brasília (UTC-3 fixo, R35).
 * Datas puras (`YYYY-MM-DD` ou `T00:00:00(.000)Z`) são preservadas sem deslocamento.
 */
export function toBrtDate(iso: string): string {
  const trimmed = (iso ?? '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.\d+)?Z$/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed.slice(0, 10);
  }
  return new Date(parsed.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Retorna o mês `AAAA-MM` em horário de Brasília (UTC-3 fixo) para um ISO da Pluggy.
 */
export function toBrtMonth(iso: string): string {
  return toBrtDate(iso).slice(0, 7);
}
