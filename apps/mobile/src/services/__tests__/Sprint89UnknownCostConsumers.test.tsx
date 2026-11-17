import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finGoalsService } from '../finGoalsService';
import { PortfolioManagementScreen } from '../../screens/PortfolioManagementScreen';

describe('Sprint 89 — Custo desconhecido e saldos nos consumidores (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('S89-T06: meta com ativo de custo desconhecido (balance 10.000) e outro com custo 1.000/valor 1.100 => annual_return_percent = 10% e patrimônio 11.100', async () => {
    const port = await portfolioRepository.createPortfolio({
      name: 'Carteira Meta',
      docket_code: 'MT01',
    });

    await assetRepository.createAsset({
      portfolio_id: port.id,
      ticker: 'CDB-UNK',
      name: 'CDB Sem Custo',
      asset_class: 'FIXED_INCOME',
      quantity: '1',
      average_price: '',
      cost_basis_source: 'UNKNOWN',
      manual_position_value: '10000.00',
      of_reported_value: '10000.00',
      value_source: 'INSTITUTION',
      source: 'OPEN_FINANCE',
    });

    await assetRepository.createAsset({
      portfolio_id: port.id,
      ticker: 'PETR4',
      name: 'Petrobras PN',
      asset_class: 'STOCK',
      quantity: '100',
      average_price: '10.00000000',
      cost_basis_source: 'TRANSACTIONS',
      manual_position_value: '1100.00',
      of_reported_value: '1100.00',
      value_source: 'INSTITUTION',
      source: 'OPEN_FINANCE',
    });

    const ctx = await finGoalsService.loadNetWorthContext();
    const goalPort = ctx.portfolios.find((p) => p.id === port.id);
    expect(goalPort).toBeDefined();
    expect(goalPort!.total_cents).toBe(1110000);
    expect(goalPort!.annual_return_percent).toBeCloseTo(10, 4);
    expect(ctx.netWorth.totalNetWorthCents).toBe(1110000);
  });

  it('S89-T07: saldo da carteira na PortfolioManagementScreen usa of_reported_value para ativo INSTITUTION', async () => {
    const port = await portfolioRepository.createPortfolio({
      name: 'Carteira Instituição',
      docket_code: 'IN01',
    });

    await assetRepository.createAsset({
      portfolio_id: port.id,
      ticker: 'VALE3',
      name: 'Vale ON',
      asset_class: 'STOCK',
      quantity: '100',
      average_price: '',
      cost_basis_source: 'UNKNOWN',
      manual_position_value: null,
      of_reported_value: '6250.00',
      value_source: 'INSTITUTION',
      source: 'OPEN_FINANCE',
    });

    const { getByTestId } = await render(<PortfolioManagementScreen />);

    await waitFor(() => {
      const chip = getByTestId(`portfolio-chip-${port.id}`);
      expect(chip).toBeTruthy();
      expect(JSON.stringify(chip.props) + chip.findAll(() => true).map((n) => n.props.children).join(' ')).toMatch(
        /6\.250,00/
      );
    });
  });

  it('S89-T08: quantidade 0,5 de título com valor 600 => preço exibido 1.200 (sem Math.max(1, quantity))', async () => {
    const port = await portfolioRepository.createPortfolio({
      name: 'Carteira Fração',
      docket_code: 'FR01',
    });

    await assetRepository.createAsset({
      portfolio_id: port.id,
      ticker: 'TESOURO-IPCA',
      name: 'Tesouro IPCA+',
      asset_class: 'FIXED_INCOME',
      quantity: '0.5',
      average_price: '',
      cost_basis_source: 'UNKNOWN',
      manual_position_value: '600.00',
      of_reported_value: '600.00',
      value_source: 'INSTITUTION',
      source: 'OPEN_FINANCE',
    });

    const { getByTestId, findByText } = await render(<PortfolioManagementScreen />);

    await waitFor(() => {
      expect(getByTestId(`portfolio-chip-${port.id}`)).toBeTruthy();
    });

    expect(await findByText(/1\.200,00/)).toBeTruthy();
  });
});
