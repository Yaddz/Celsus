import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import {
  recalculateUnlockedTargets,
  convertWeightsToPercentagesWithLocks,
  LockableAllocationItem,
} from '../../domain/finance/reactiveWeights';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

// Mock do marketApi
jest.mock('../../services/marketApi', () => ({
  marketApiService: {
    searchCatalog: jest.fn().mockImplementation(async (query: string) => {
      const q = query.toUpperCase();
      if (q.includes('PETR')) {
        return [{ ticker: 'PETR4', name: 'Petróleo Brasileiro S.A.', assetClass: 'STOCK', price: '38.50' }];
      }
      if (q.includes('VALE')) {
        return [{ ticker: 'VALE3', name: 'Vale S.A.', assetClass: 'STOCK', price: '60.00' }];
      }
      return [];
    }),
    getCachedQuote: jest.fn().mockResolvedValue(null),
    fetchQuotes: jest.fn().mockResolvedValue([]),
  },
}));

const S18_FIXTURE_ASSETS = [
  { id: 'a1', ticker: 'WEGE3', name: 'WEG S.A.', assetClass: 'STOCK' as const, targetInClass: 25, percentage: 25, weight: 1, isLocked: false, quantity: '100', price: '42.50' },
  { id: 'a2', ticker: 'VALE3', name: 'Vale S.A.', assetClass: 'STOCK' as const, targetInClass: 25, percentage: 25, weight: 1, isLocked: false, quantity: '80', price: '60.00' },
  { id: 'a3', ticker: 'ITUB4', name: 'Itaú Unibanco', assetClass: 'STOCK' as const, targetInClass: 50, percentage: 50, weight: 2, isLocked: false, quantity: '200', price: '34.00' },
];

describe('Sprint 18 — Módulo 4 & 5: Rebalanceamento Reativo 100% com Cadeado e Modal com Autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. TESTES DE DOMÍNIO (reactiveWeights.ts)
  // =========================================================================
  describe('Domain: reactiveWeights (Rebalanceamento Reativo e Cadeado)', () => {
    it('S18-T01: deve recalcular proporcionalmente os itens destravados fechando rigorosamente em 100%', () => {
      const items: LockableAllocationItem[] = [
        { id: 'STOCK', percentage: 40, isLocked: false },
        { id: 'FII', percentage: 20, isLocked: false },
        { id: 'FIXED_INCOME', percentage: 30, isLocked: false },
        { id: 'CRYPTO', percentage: 10, isLocked: false },
      ];

      // Usuário altera STOCK de 40% para 55%
      const result = recalculateUnlockedTargets(items, 'STOCK', 55);

      const stock = result.find((i) => i.id === 'STOCK')!;
      const fii = result.find((i) => i.id === 'FII')!;
      const fixed = result.find((i) => i.id === 'FIXED_INCOME')!;
      const crypto = result.find((i) => i.id === 'CRYPTO')!;

      expect(stock.percentage).toBe(55);
      // Espaço restante = 45%. Proporção prévia de FII:FIXED:CRYPTO = 20:30:10 (soma 60)
      // FII = (20/60) * 45 = 15%
      // FIXED = (30/60) * 45 = 22.5%
      // CRYPTO = (10/60) * 45 = 7.5%
      expect(fii.percentage).toBe(15);
      expect(fixed.percentage).toBe(22.5);
      expect(crypto.percentage).toBe(7.5);

      const totalSum = result.reduce((acc, curr) => acc + curr.percentage, 0);
      expect(totalSum).toBe(100);
    });

    it('S18-T02: deve manter itens com cadeado fechado (isLocked = true) estritamente inalterados', () => {
      const items: LockableAllocationItem[] = [
        { id: 'FIXED_INCOME', percentage: 30, isLocked: true },
        { id: 'STOCK', percentage: 40, isLocked: false },
        { id: 'FII', percentage: 20, isLocked: false },
        { id: 'CRYPTO', percentage: 10, isLocked: false },
      ];

      // Usuário altera STOCK para 55% com FIXED_INCOME travado em 30%
      const result = recalculateUnlockedTargets(items, 'STOCK', 55);

      const fixed = result.find((i) => i.id === 'FIXED_INCOME')!;
      const stock = result.find((i) => i.id === 'STOCK')!;
      const fii = result.find((i) => i.id === 'FII')!;
      const crypto = result.find((i) => i.id === 'CRYPTO')!;

      // FIXED_INCOME travado NÃO deve mudar
      expect(fixed.percentage).toBe(30);
      expect(fixed.isLocked).toBe(true);

      // STOCK alterado para 55%
      expect(stock.percentage).toBe(55);

      // Restante para FII e CRYPTO = 100 - 30 (travado) - 55 = 15%
      // Proporção prévia FII:CRYPTO = 20:10 (soma 30) -> FII = 10%, CRYPTO = 5%
      expect(fii.percentage).toBe(10);
      expect(crypto.percentage).toBe(5);

      const totalSum = result.reduce((acc, curr) => acc + curr.percentage, 0);
      expect(totalSum).toBe(100);
    });

    it('S18-T03: deve impedir que um item destravado ultrapasse 100% - SomaTravados (teto disponível)', () => {
      const items: LockableAllocationItem[] = [
        { id: 'FIXED_INCOME', percentage: 40, isLocked: true },
        { id: 'CRYPTO', percentage: 20, isLocked: true },
        { id: 'STOCK', percentage: 25, isLocked: false },
        { id: 'FII', percentage: 15, isLocked: false },
      ];

      // Soma dos travados = 60%. Máximo disponível para qualquer destravado = 40%.
      // Usuário tenta colocar STOCK em 50%
      const result = recalculateUnlockedTargets(items, 'STOCK', 50);

      const stock = result.find((i) => i.id === 'STOCK')!;
      const fii = result.find((i) => i.id === 'FII')!;
      const fixed = result.find((i) => i.id === 'FIXED_INCOME')!;
      const crypto = result.find((i) => i.id === 'CRYPTO')!;

      // STOCK deve ser limitado ao teto de 40%
      expect(stock.percentage).toBe(40);
      // FII fica com 0% (espaço esgotado)
      expect(fii.percentage).toBe(0);
      expect(fixed.percentage).toBe(40);
      expect(crypto.percentage).toBe(20);

      const totalSum = result.reduce((acc, curr) => acc + curr.percentage, 0);
      expect(totalSum).toBe(100);
    });

    it('S18-T04: deve dividir igualmente o restante se todos os demais destravados estiverem em 0%', () => {
      const items: LockableAllocationItem[] = [
        { id: 'A', percentage: 60, isLocked: false },
        { id: 'B', percentage: 0, isLocked: false },
        { id: 'C', percentage: 0, isLocked: false },
        { id: 'D', percentage: 40, isLocked: true },
      ];

      // Usuário reduz A de 60% para 30%
      const result = recalculateUnlockedTargets(items, 'A', 30);

      const a = result.find((i) => i.id === 'A')!;
      const b = result.find((i) => i.id === 'B')!;
      const c = result.find((i) => i.id === 'C')!;
      const d = result.find((i) => i.id === 'D')!;

      expect(a.percentage).toBe(30);
      expect(d.percentage).toBe(40);
      // Restante = 100 - 40 - 30 = 30%. Como B e C eram 0, divide igualmente: 15% e 15%
      expect(b.percentage).toBe(15);
      expect(c.percentage).toBe(15);

      const totalSum = result.reduce((acc, curr) => acc + curr.percentage, 0);
      expect(totalSum).toBe(100);
    });

    it('S18-T05: deve converter pesos livres em porcentagens proporcionais respeitando itens com cadeado', () => {
      // Cenário com item travado e outros 3 em modo Peso
      const items: LockableAllocationItem[] = [
        { id: 'FIXED_INCOME', percentage: 40, isLocked: true },
        { id: 'STOCK', percentage: 0, weight: 2, isLocked: false },
        { id: 'FII', percentage: 0, weight: 1, isLocked: false },
        { id: 'CRYPTO', percentage: 0, weight: 1, isLocked: false },
      ];

      const result = convertWeightsToPercentagesWithLocks(items);

      const fixed = result.find((i) => i.id === 'FIXED_INCOME')!;
      const stock = result.find((i) => i.id === 'STOCK')!;
      const fii = result.find((i) => i.id === 'FII')!;
      const crypto = result.find((i) => i.id === 'CRYPTO')!;

      // FIXED_INCOME permanece em 40%
      expect(fixed.percentage).toBe(40);

      // Espaço disponível = 60%. Pesos destravados = 2 + 1 + 1 = 4
      // STOCK = (2/4) * 60 = 30%
      // FII = (1/4) * 60 = 15%
      // CRYPTO = (1/4) * 60 = 15%
      expect(stock.percentage).toBe(30);
      expect(fii.percentage).toBe(15);
      expect(crypto.percentage).toBe(15);

      const totalSum = result.reduce((acc, curr) => acc + curr.percentage, 0);
      expect(totalSum).toBe(100);
    });
  });

  // =========================================================================
  // 2. TESTES DE UI — MÓDULO 4: PortfolioManagementScreen
  // =========================================================================
  describe('UI: PortfolioManagementScreen (Módulo 4)', () => {
    it('S18-T06: deve remover completamente todos os botões -5% / +5% e badges "100% OK" / "AJUSTE"', async () => {
      await render(<PortfolioManagementScreen />);

      // Verifica ausência absoluta de botões de incremento -5% e +5%
      expect(screen.queryByText('-5%')).toBeNull();
      expect(screen.queryByText('+5%')).toBeNull();

      // Verifica ausência absoluta de badges de validação redundantes
      expect(screen.queryByText(/100% OK/i)).toBeNull();
      expect(screen.queryByText(/AJUSTE P\/ 100%/i)).toBeNull();
      expect(screen.queryByText(/AJUSTE/i)).toBeNull();
    });

    it('S18-T07: deve renderizar inputs numéricos editáveis e botões de cadeado para as 4 classes macro', async () => {
      await render(<PortfolioManagementScreen />);

      // Abre o modal de metas por categoria
      const openMetasBtn = screen.getByTestId('open-metas-modal-btn');
      fireEvent.press(openMetasBtn);

      // Inputs de cada classe macro
      expect(screen.getByTestId('input-class-STOCK')).toBeDefined();
      expect(screen.getByTestId('input-class-FIXED_INCOME')).toBeDefined();
      expect(screen.getByTestId('input-class-FII')).toBeDefined();
      expect(screen.getByTestId('input-class-CRYPTO')).toBeDefined();

      // Botões de cadeado (lock/unlock) de cada classe macro
      expect(screen.getByTestId('lock-class-STOCK')).toBeDefined();
      expect(screen.getByTestId('lock-class-FIXED_INCOME')).toBeDefined();
      expect(screen.getByTestId('lock-class-FII')).toBeDefined();
      expect(screen.getByTestId('lock-class-CRYPTO')).toBeDefined();

      // Ao clicar no cadeado de FIXED_INCOME, o estado de travamento deve alternar
      const lockFixed = screen.getByTestId('lock-class-FIXED_INCOME');
      fireEvent.press(lockFixed);
    });

    it('S18-T08: deve exibir inputs numéricos e cadeado diretamente na listagem de ativos da carteira (Edição Rápida inline)', async () => {
      await render(<PortfolioManagementScreen initialAssets={S18_FIXTURE_ASSETS} />);

      // Aba STOCK ativa por padrão: ativos a1 (WEGE3), a2 (VALE3), a3 (ITUB4)
      expect(screen.getByTestId('input-asset-a1')).toBeDefined();
      expect(screen.getByTestId('lock-asset-a1')).toBeDefined();
      expect(screen.getByTestId('input-asset-a2')).toBeDefined();
      expect(screen.getByTestId('lock-asset-a2')).toBeDefined();

      // Clicar no cadeado do ativo a1 alterna seu estado
      fireEvent.press(screen.getByTestId('lock-asset-a1'));
    });

    it('S18-T09: deve renderizar toggle entre Porcentagem (%) e Peso (Pts) na tela da carteira', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.getByTestId('portfolio-mode-percent')).toBeDefined();
      expect(screen.getByTestId('portfolio-mode-weight')).toBeDefined();

      // Alternar para modo Peso
      fireEvent.press(screen.getByTestId('portfolio-mode-weight'));
    });
  });

  // =========================================================================
  // 3. TESTES DE UI — MÓDULO 5: Modal de Adicionar Ativo
  // =========================================================================
  describe('UI: Modal Adicionar Ativo (Módulo 5)', () => {
    it('S18-T10: deve exibir campo com autocomplete (asset-autocomplete-input), listar sugestões ao digitar e preencher ativo ao clicar', async () => {
      await render(<PortfolioManagementScreen />);

      // Abre o modal de adicionar ativo
      const openBtn = screen.getByTestId('open-add-asset-modal-btn');
      fireEvent.press(openBtn);

      // Campo de autocomplete
      const autocompleteInput = screen.getByTestId('asset-autocomplete-input');
      expect(autocompleteInput).toBeDefined();

      // Digita 'PETR' no input
      fireEvent.changeText(autocompleteInput, 'PETR');

      // Deve exibir sugestão de PETR4
      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-option-PETR4')).toBeDefined();
      });

      // Toca na opção de PETR4 sugerida
      fireEvent.press(screen.getByTestId('autocomplete-option-PETR4'));
    });

    it('S18-T11: deve renderizar weight-helper-card explicando o conceito amigável de Peso relativo', async () => {
      await render(<PortfolioManagementScreen />);

      // Abre o modal
      fireEvent.press(screen.getByTestId('open-add-asset-modal-btn'));

      // Card explicativo sobre Peso
      const helperCard = screen.getByTestId('weight-helper-card');
      expect(helperCard).toBeDefined();
      expect(screen.getByText(/peso/i)).toBeDefined();
    });

    it('S18-T12: deve permitir alternar entre Peso e Porcentagem (%) no modal com recálculo e cadeados', async () => {
      await render(<PortfolioManagementScreen />);

      // Abre o modal
      fireEvent.press(screen.getByTestId('open-add-asset-modal-btn'));

      // Toggles de modo no modal
      expect(screen.getByTestId('add-asset-mode-percent')).toBeDefined();
      expect(screen.getByTestId('add-asset-mode-weight')).toBeDefined();

      // Alternar para modo Peso no modal
      fireEvent.press(screen.getByTestId('add-asset-mode-weight'));
    });
  });
});
