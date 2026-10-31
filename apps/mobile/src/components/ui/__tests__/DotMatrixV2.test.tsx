import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { DotMatrixAllocationCard } from '../DotMatrixAllocationCard';
import { DotMatrixGrid, AttributeStatBar } from '../AttributeStatBar';

describe('S9-T02: TestRightToLeftColumnsRebalanceButtonAndInvestedValue', () => {
  const sampleAllocations = [
    { assetClass: 'FIXED_INCOME' as const, currentPercentage: 32.0, targetPercentage: 30.0, marketValue: '10.389,76' },
    { assetClass: 'FII' as const, currentPercentage: 24.5, targetPercentage: 25.0, marketValue: '7.954,66' },
    { assetClass: 'STOCK' as const, currentPercentage: 33.5, targetPercentage: 35.0, marketValue: '10.876,78' },
    { assetClass: 'CRYPTO' as const, currentPercentage: 10.0, targetPercentage: 10.0, marketValue: '3.246,80' },
  ];

  describe('DotMatrixGrid Columns Pre-filling: Right to Left', () => {
    it('should fill dots in columns starting from the rightmost column to the left', async () => {
      // 4 linhas x 10 colunas = 40 pontos no total. 10% = 4 pontos ativos.
      // Em modo right-to-left, os 4 pontos devem ocupar a coluna 9 (última coluna à direita).
      await render(
        <DotMatrixGrid
          currentPercentage={10.0}
          color="#2E4A44"
          rows={4}
          cols={10}
          fillDirection="right-to-left"
          testID="grid-rtl"
        />
      );

      const grid = screen.getByTestId('grid-rtl');
      expect(grid).toBeDefined();

      // Ponto na coluna mais à direita (coluna 9) deve estar preenchido com a cor #2E4A44
      const rightmostDot = screen.getByTestId('dot-3-9');
      const rightmostStyle = Array.isArray(rightmostDot.props.style)
        ? Object.assign({}, ...rightmostDot.props.style.filter(Boolean))
        : rightmostDot.props.style;
      expect(rightmostStyle.backgroundColor?.toUpperCase()).toBe('#2E4A44');

      // Ponto na coluna mais à esquerda (coluna 0) deve estar vazio/desativado (não preenchido)
      const leftmostDot = screen.getByTestId('dot-3-0');
      const leftmostStyle = Array.isArray(leftmostDot.props.style)
        ? Object.assign({}, ...leftmostDot.props.style.filter(Boolean))
        : leftmostDot.props.style;
      expect(leftmostStyle.backgroundColor?.toUpperCase()).not.toBe('#2E4A44');
    });
  });

  describe('DotMatrixAllocationCard v2 Header Changes', () => {
    it('should NOT render the subtitle "Matriz de Pontos • 4 Classes Reais" in v2 mode', async () => {
      await render(
        <DotMatrixAllocationCard
          allocations={sampleAllocations}
          variant="v2"
          testID="allocation-card-v2"
        />
      );

      expect(screen.getByText('ALOCAÇÃO POR CATEGORIA')).toBeDefined();
      expect(screen.queryByText(/Matriz de Pontos • 4 Classes Reais/i)).toBeNull();
    });

    it('should render the "Rebalancear" button in tertiary color #D5CAA8 at top of card', async () => {
      const onRebalancePress = jest.fn();

      await render(
        <DotMatrixAllocationCard
          allocations={sampleAllocations}
          variant="v2"
          onRebalancePress={onRebalancePress}
          testID="allocation-card-v2"
        />
      );

      const rebalanceBtn = screen.getByTestId('card-rebalance-button');
      expect(rebalanceBtn).toBeDefined();

      const btnStyle = Array.isArray(rebalanceBtn.props.style)
        ? Object.assign({}, ...rebalanceBtn.props.style.filter(Boolean))
        : rebalanceBtn.props.style;
      expect(btnStyle.backgroundColor?.toUpperCase()).toBe('#D5CAA8');

      fireEvent.press(rebalanceBtn);
      expect(onRebalancePress).toHaveBeenCalledTimes(1);

      // Não exibe o antigo valor total consolidado no header
      expect(screen.queryByTestId('card-header-total-balance')).toBeNull();
    });
  });

  describe('Invested Amount in R$ + Current Percentage (No / META in v2)', () => {
    it('should display invested value in R$ and current % without "/ META" in v2 mode', async () => {
      await render(
        <AttributeStatBar
          assetClass="FIXED_INCOME"
          currentPercentage={32.0}
          targetPercentage={30.0}
          marketValue="10.389,76"
          variant="v2"
          testID="stat-bar-v2-rf"
        />
      );

      expect(screen.getByTestId('stat-bar-v2-rf')).toBeDefined();
      expect(screen.getByText(/RENDA FIXA/i)).toBeDefined();
      // Exibe valor em R$ e porcentagem atual
      expect(screen.getByText(/R\$\s*10\.389,76\s*•\s*32(\.0|,\s*0)?%/)).toBeDefined();
      // Não exibe o rótulo de meta
      expect(screen.queryByText(/\/ META/i)).toBeNull();
    });

    it('should maintain backward compatibility with legacy meta format when variant is default', async () => {
      await render(
        <AttributeStatBar
          assetClass="STOCK"
          currentPercentage={33.5}
          targetPercentage={35.0}
          testID="stat-bar-legacy"
        />
      );

      expect(screen.getByTestId('stat-bar-legacy')).toBeDefined();
      expect(screen.getByText(/33\.5%/)).toBeDefined();
      expect(screen.getByText(/META 35(\.0)?%/)).toBeDefined();
    });
  });
});
