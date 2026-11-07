import { incomeRepository } from '../incomeRepository';
import { portfolioRepository } from '../portfolioRepository';
import { resetDatabase } from '../../db/client';

describe('incomeRepository', () => {
  beforeEach(() => resetDatabase());

  it('registra, lista por carteira e remove proventos', async () => {
    const p = await portfolioRepository.createPortfolio({ name: 'Teste', docket_code: 'T-1' });
    const other = await portfolioRepository.createPortfolio({ name: 'Outra', docket_code: 'T-2' });
    const a = await incomeRepository.addIncome({ portfolioId: p.id, ticker: 'mxrf11', payDate: '2026-05-20', amount: '60.60' });
    await incomeRepository.addIncome({ portfolioId: other.id, ticker: 'HGLG11', payDate: '2026-05-21', amount: '10.00' });
    const list = await incomeRepository.listByPortfolio(p.id);
    expect(list).toHaveLength(1);
    expect(list[0].ticker).toBe('MXRF11');
    await incomeRepository.deleteIncome(a.id);
    expect(await incomeRepository.listByPortfolio(p.id)).toHaveLength(0);
  });
});
