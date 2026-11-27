import type { PluggyClient } from '../pluggyClient';
import type { PluggyAccount, PluggyTransaction } from '../types';
import { makePluggyAccounts, makePluggyItem } from './pluggyFixtures';

/**
 * Sprint 116 — fixtures extraídas do export real anonimizado (docs/json.json, item 619d6e17 e 7ccce4de).
 * Valores e descrições iguais ao export; nenhum dado pessoal. Montadas sempre pelo caminho da sincronização
 * (pluggySyncService), nunca inseridas à mão em fin_accounts/fin_entries.
 */
export const SPRINT116_NOW = new Date('2026-11-17T12:00:00Z');
export const SPRINT116_TODAY_ISO = '2026-11-17';

export function s116Tx(
  accountId: string,
  id: string,
  date: string,
  amount: number,
  description: string,
  categoryId: string,
  category = 'Investments'
): PluggyTransaction {
  return {
    id,
    accountId,
    description,
    currencyCode: 'BRL',
    amount,
    date: `${date}T12:00:00.000Z`,
    type: amount < 0 ? 'DEBIT' : 'CREDIT',
    status: 'POSTED',
    category,
    categoryId,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

/** Conta da corretora (conta remunerada + custódia): lançamentos de 28/10 a 16/11 do export real. */
export function brokerExportTxs(accountId: string): PluggyTransaction[] {
  const t = (id: string, date: string, amount: number, desc: string, cat: string, catName = 'Investments') =>
    s116Tx(accountId, `s116-brk-${id}`, date, amount, desc, cat, catName);
  return [
    // Novembro
    t('n01', '2026-11-16', 2.52, 'RENDIMENTOS - À VISTA s/ FII VINCI SC...', '03060000', 'Proceeds interests and dividends'),
    t('n02', '2026-11-16', 2.46, 'RENDIMENTOS - À VISTA s/ FII XP LOG C...', '03060000', 'Proceeds interests and dividends'),
    t('n03', '2026-11-16', 2.34, 'RENDIMENTOS - À VISTA s/ FII CSHG LOG...', '03060000', 'Proceeds interests and dividends'),
    t('n04', '2026-11-16', 4.65, 'RENDIMENTOS - À VISTA s/ FII TRX REAL...', '03060000', 'Proceeds interests and dividends'),
    t('n05', '2026-11-11', 224.89, 'CONTA REMUNERADA - RESGATE APLICAÇÃO', '03000000'),
    t('n06', '2026-11-11', 0.01, 'CONTA REMUNERADA - RESGATE REMUNERAÇÃO', '03060000', 'Proceeds interests and dividends'),
    t('n07', '2026-11-11', 398.36, 'CONTA REMUNERADA - RESGATE APLICAÇÃO', '03000000'),
    t('n08', '2026-11-10', -0.03, 'LIQ BOLSA - VISTA TX EMOL B3 - PREGÃO: 06/11/2026', '03000000'),
    t('n09', '2026-11-10', -0.01, 'LIQ BOLSA - VISTA TX TTA B3 - PREGÃO: 06/11/2026', '03000000'),
    t('n10', '2026-11-10', -0.13, 'LIQ BOLSA - VISTA TX CCP B3 - PREGÃO: 06/11/2026', '03000000'),
    t('n11', '2026-11-10', -623.09, 'LIQ BOLSA - VISTA BRUTO - PREGÃO: 06/11/2026', '03000000'),
    t('n12', '2026-11-09', 0.01, 'CRÉDITO REMUNERAÇÃO', '03060000', 'Proceeds interests and dividends'),
    t('n13', '2026-11-07', -227.17, 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA', '03000000'),
    // Outubro
    t('o01', '2026-10-30', -398.36, 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA', '03000000'),
    t('o02', '2026-10-29', 2127, 'CONTA REMUNERADA - RESGATE APLICAÇÃO', '03000000'),
    t('o03', '2026-10-29', 0.41, 'CONTA REMUNERADA - RESGATE REMUNERAÇÃO', '03060000', 'Proceeds interests and dividends'),
    t('o04', '2026-10-29', 700, 'CONTA REMUNERADA - RESGATE APLICAÇÃO', '03000000'),
    t('o05', '2026-10-28', 0.01, 'CRÉDITO REMUNERAÇÃO', '03060000', 'Proceeds interests and dividends'),
  ];
}

/** Crédito do Pix vindo de fora da corretora (par com a saída da conta corrente de outro banco). */
export function brokerPixInTxs(accountId: string): PluggyTransaction[] {
  return [
    s116Tx(accountId, 's116-brk-pix-nov', '2026-11-06', 227.17, 'TRANSFERÊNCIA A CRÉDITO VIA PIX', '04000000', 'Same person transfer'),
    s116Tx(accountId, 's116-brk-pix-out', '2026-10-29', 398.85, 'TRANSFERÊNCIA A CRÉDITO VIA PIX', '04000000', 'Same person transfer'),
  ];
}

/** Saídas Pix da conta corrente (outro banco) que formam par com os créditos da corretora. */
export function bankPixOutTxs(accountId: string): PluggyTransaction[] {
  return [
    s116Tx(accountId, 's116-bank-pix-nov', '2026-11-06', -227.17, 'Pix enviado para <contraparte>', '04000000', 'Same person transfer'),
    s116Tx(accountId, 's116-bank-pix-out', '2026-10-29', -398.85, 'Pix enviado para <contraparte>', '04000000', 'Same person transfer'),
  ];
}

export interface S116ClientAccount {
  pgId: string;
  name?: string;
  balance?: number;
}

/** Cliente Pluggy falso com várias contas correntes do mesmo item e lançamentos por conta. */
export function makeSprint116Client(
  itemId: string,
  accounts: S116ClientAccount[],
  txs: PluggyTransaction[]
): PluggyClient {
  const base = makePluggyAccounts()[0];
  const pgAccounts: PluggyAccount[] = accounts.map((a) => ({
    ...base,
    id: a.pgId,
    itemId,
    name: a.name ?? 'Conta Corrente',
    balance: a.balance ?? 0,
  }));
  return {
    getItem: async () => makePluggyItem({ id: itemId }),
    listAccounts: async () => pgAccounts,
    listTransactions: async (accountId: string) => txs.filter((t) => t.accountId === accountId),
    listBills: async () => [],
  } as unknown as PluggyClient;
}
