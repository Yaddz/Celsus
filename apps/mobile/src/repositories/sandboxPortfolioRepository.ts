import type { PaperPortfolioItemInput, PaperRebalanceMode } from '../domain/sandbox/paperPortfolio';

export interface SandboxPortfolioWithItems {
  id: string;
  name: string;
  start_date: string;
  initial_cents: number;
  monthly_cents: number;
  rebalance: string;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: string;
    sandbox_portfolio_id: string;
    ticker: string;
    asset_class: string;
    weight: number;
    created_at: string;
  }>;
}

export const sandboxPortfolioRepository = {
  async listPortfolios(): Promise<SandboxPortfolioWithItems[]> {
    return [];
  },
  async getPortfolioWithItems(_id: string): Promise<SandboxPortfolioWithItems | null> {
    return null;
  },
  async savePortfolio(_input: {
    id?: string;
    name: string;
    startDate: string;
    initialCents: number;
    monthlyCents: number;
    rebalance: PaperRebalanceMode;
    items: PaperPortfolioItemInput[];
  }): Promise<SandboxPortfolioWithItems> {
    throw new Error('Not implemented');
  },
  async deletePortfolio(_id: string): Promise<void> {},
  async copyFromRealPortfolio(_portfolioId: string): Promise<PaperPortfolioItemInput[]> {
    return [];
  },
  async convertToRealPortfolio(_input: {
    name: string;
    items: PaperPortfolioItemInput[];
  }): Promise<{ portfolioId: string }> {
    throw new Error('Not implemented');
  },
};
