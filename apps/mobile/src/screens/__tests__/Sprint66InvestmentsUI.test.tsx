import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { OpenFinanceInvestmentReconciliationSheet } from '../../components/OpenFinanceInvestmentReconciliationSheet';
import type { InvestmentReconciliationProposal } from '../../services/pluggy/pluggyInvestmentsSyncService';

describe('Sprint 66 — Tela de Conciliação e Cobertura Open Finance (Fase A)', () => {
  it('S66-U01: exibe lista lado a lado (Pluggy × existente), cobertura por classe e permite confirmar escolhas', () => {
    const proposals: InvestmentReconciliationProposal[] = [
      {
        pluggyInvestment: {
          id: 'pg-1',
          itemId: 'item-1',
          type: 'EQUITY',
          subtype: 'STOCK',
          code: 'PETR4',
          name: 'Petrobras PN',
          quantity: 100,
          balance: 3600,
          currencyCode: 'BRL',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-11-16T10:00:00Z',
        },
        suggestedAssetId: 'asset-1',
        matchStrategy: 'TICKER',
        suggestedPortfolioId: 'port-1',
      },
    ];

    const onConfirm = jest.fn();
    const { getByTestId, getByText } = render(
      <OpenFinanceInvestmentReconciliationSheet
        visible={true}
        institutionName="Itaú"
        proposals={proposals}
        existingAssets={[
          { id: 'asset-1', ticker: 'PETR4', name: 'Petrobras PN', assetClass: 'STOCK' },
        ]}
        portfolios={[
          { id: 'port-1', name: 'Carteira Principal' },
          { id: 'port-2', name: 'Aposentadoria' },
        ]}
        coverageByClass={[
          {
            assetClass: 'FIXED_INCOME',
            label: 'Renda Fixa',
            exposedByOpenFinance: true,
            sourceHint: 'Sincronizado via Open Finance',
          },
          {
            assetClass: 'FII',
            label: 'FIIs',
            exposedByOpenFinance: false,
            sourceHint: 'Não exposto pela instituição — continua vindo da B3 e do manual',
          },
        ]}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />
    );

    expect(getByText(/Itaú/i)).toBeTruthy();
    expect(getByText(/PETR4/)).toBeTruthy();
    expect(getByText(/continua vindo da B3 e do manual/i)).toBeTruthy();

    fireEvent.press(getByTestId('of-reconciliation-confirm-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          pluggyInvestmentId: 'pg-1',
          targetPortfolioId: 'port-1',
        }),
      ])
    );
  });
});
