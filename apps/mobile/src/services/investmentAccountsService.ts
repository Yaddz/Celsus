import { finRepository } from '../repositories/finRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';

/**
 * Fonte única de IDs de contas de investimento para R43 (V2):
 * contas do tipo `'broker'` + contas vinculadas a carteiras não arquivadas (`portfolios.fin_account_id`).
 */
export async function getInvestmentAccountIds(): Promise<string[]> {
  const [accounts, portfolios] = await Promise.all([
    finRepository.listAccounts(true),
    portfolioRepository.listPortfolios(false),
  ]);

  const ids = new Set<string>();
  for (const acc of accounts) {
    if (acc.type === 'broker') {
      ids.add(acc.id);
    }
  }
  for (const p of portfolios) {
    if (p.is_archived === 0 && p.fin_account_id) {
      ids.add(p.fin_account_id);
    }
  }
  return Array.from(ids);
}
