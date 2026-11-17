import Decimal from 'decimal.js';

/**
 * Formata preços unitários e preços médios em BRL.
 * Cotas abaixo de R$ 1,00 são exibidas com 6 casas decimais; demais valores com 2 casas.
 * Valores ausentes retornam "—".
 */
export function formatUnitPriceBRL(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    return '—';
  }
  if (!dec.isFinite()) {
    return '—';
  }
  const absDec = dec.abs();
  const decimals = absDec.gt(0) && absDec.lt(1) ? 6 : 2;
  return `R$ ${dec.toNumber().toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
