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

  test('S48-T06: listFiltered com múltiplos parâmetros, getById e updateIncome', async () => {
    const p1 = await portfolioRepository.createPortfolio({ name: 'Carteira 1', docket_code: 'C-1' });
    const p2 = await portfolioRepository.createPortfolio({ name: 'Carteira 2', docket_code: 'C-2' });

    const i1 = await incomeRepository.addIncome({
      portfolioId: p1.id,
      ticker: 'MXRF11',
      payDate: '2026-05-15',
      amount: '60.60',
      kind: 'RENDIMENTO',
      quantity: '606',
      unitAmount: '0.10',
    });

    const i2 = await incomeRepository.addIncome({
      portfolioId: p2.id,
      ticker: 'PETR4',
      payDate: '2026-08-15',
      amount: '120.00',
      kind: 'DIVIDENDO',
      quantity: '100',
      unitAmount: '1.20',
    });

    // getById
    const fetched = await incomeRepository.getById(i1.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.ticker).toBe('MXRF11');
    expect(fetched?.quantity).toBe('606');

    // updateIncome
    const updated = await incomeRepository.updateIncome(i1.id, {
      amount: '65.00',
      notes: 'Ajuste manual',
      quantity: '650',
    });
    expect(updated.amount).toBe('65.00');
    expect(updated.notes).toBe('Ajuste manual');
    expect(updated.quantity).toBe('650');

    // listFiltered por carteiras
    const fPort = await incomeRepository.listFiltered({ portfolioIds: [p1.id] });
    expect(fPort).toHaveLength(1);
    expect(fPort[0].ticker).toBe('MXRF11');

    // listFiltered por ticker
    const fTicker = await incomeRepository.listFiltered({ ticker: 'PETR4' });
    expect(fTicker).toHaveLength(1);
    expect(fTicker[0].id).toBe(i2.id);

    // listFiltered por tipo
    const fKind = await incomeRepository.listFiltered({ kind: 'DIVIDENDO' });
    expect(fKind).toHaveLength(1);

    // listFiltered por data
    const fDate = await incomeRepository.listFiltered({ from: '2026-08-01', to: '2026-08-31' });
    expect(fDate).toHaveLength(1);
    expect(fDate[0].id).toBe(i2.id);
  });

  test('S48-T07: retrocompatibilidade — campos opcionais kind/quantity/unitAmount podem ser nulos', async () => {
    const p = await portfolioRepository.createPortfolio({ name: 'Carteira Retro', docket_code: 'R-1' });
    const legacy = await incomeRepository.addIncome({
      portfolioId: p.id,
      ticker: 'VALE3',
      payDate: '2026-04-10',
      amount: '80.00',
    });

    const found = await incomeRepository.getById(legacy.id);
    expect(found).not.toBeNull();
    expect(found?.kind).toBeNull();
    expect(found?.quantity).toBeNull();
    expect(found?.unit_amount).toBeNull();
    expect(found?.source).toBe('MANUAL');
  });
});
