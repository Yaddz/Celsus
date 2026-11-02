import Decimal from 'decimal.js';
import {
  calculateSplitAdjustment,
  reconcileCorporateEvents,
  CorporateEventItem,
} from '../corporateEvents';
import { calculatePositionFromTransactions } from '../averagePrice';
import { PositionTransaction } from '../types';

describe('Sprint 24: Corporate Events (Stock Splits & Inplits) Specification', () => {
  describe('S24-T01: Desdobramento / Stock Split (Proporção > 1)', () => {
    it('deve ajustar quantidade e preço médio em desdobramento 4:1 preservando custo total de aquisição', () => {
      // Cenário: 100 ações a R$ 80,00 (Custo = R$ 8.000,00)
      // Desdobramento 4:1 (cada 1 ação vira 4)
      const result = calculateSplitAdjustment({
        currentQuantity: '100',
        currentAveragePrice: '80.00',
        splitRatio: {
          numerator: 4,
          denominator: 1,
        },
      });

      expect(result.quantity).toBe('400');
      expect(result.averagePrice).toBe('20.00');
      expect(result.totalCost).toBe('8000.00');

      // Invariante fiscal: Custo anterior == Custo novo
      const prevTotalCost = new Decimal('100').mul(new Decimal('80.00'));
      const newTotalCost = new Decimal(result.quantity).mul(new Decimal(result.averagePrice));
      expect(newTotalCost.toFixed(2)).toBe(prevTotalCost.toFixed(2));
    });

    it('deve processar desdobramentos fracionários mantendo precisão decimal sem resíduos', () => {
      // Cenário: 150 ações a R$ 33,33 (Custo = R$ 4.999,50)
      // Desdobramento 3:2 (cada 2 ações viram 3)
      const result = calculateSplitAdjustment({
        currentQuantity: 150,
        currentAveragePrice: 33.33,
        splitRatio: {
          numerator: 3,
          denominator: 2,
        },
      });

      expect(result.quantity).toBe('225');
      expect(result.averagePrice).toBe('22.22');
      expect(result.totalCost).toBe('4999.50');
    });
  });

  describe('S24-T02: Grupamento / Reverse Stock Split - Inplit (Proporção < 1)', () => {
    it('deve ajustar quantidade e preço médio em grupamento 10:1 preservando custo total de aquisição', () => {
      // Cenário: 1000 ações a R$ 1,50 (Custo = R$ 1.500,00)
      // Grupamento 1:10 (cada 10 ações viram 1)
      const result = calculateSplitAdjustment({
        currentQuantity: '1000',
        currentAveragePrice: '1.50',
        splitRatio: {
          numerator: 1,
          denominator: 10,
        },
      });

      expect(result.quantity).toBe('100');
      expect(result.averagePrice).toBe('15.00');
      expect(result.totalCost).toBe('1500.00');

      // Invariante fiscal: Custo anterior == Custo novo
      const prevTotalCost = new Decimal('1000').mul(new Decimal('1.50'));
      const newTotalCost = new Decimal(result.quantity).mul(new Decimal(result.averagePrice));
      expect(newTotalCost.toFixed(2)).toBe(prevTotalCost.toFixed(2));
    });

    it('deve rejeitar proporções inválidas (numerador ou denominador <= 0)', () => {
      expect(() =>
        calculateSplitAdjustment({
          currentQuantity: 100,
          currentAveragePrice: 20,
          splitRatio: { numerator: 0, denominator: 1 },
        })
      ).toThrow();

      expect(() =>
        calculateSplitAdjustment({
          currentQuantity: 100,
          currentAveragePrice: 20,
          splitRatio: { numerator: 2, denominator: -1 },
        })
      ).toThrow();
    });
  });

  describe('S24-T03: Ordem Cronológica Mista com calculatePositionFromTransactions', () => {
    it('deve reconstruir posição com Compra Pré-Split, Split, Compra Pós-Split e Venda Parcial', () => {
      // Cronologia:
      // 1. 2024-01-10: Compra 100 a R$ 40,00 -> Q = 100, PM = 40.00, Custo = 4000.00
      // 2. 2024-06-15: Split 2:1 -> Q = 200, PM = 20.00, Custo = 4000.00
      // 3. 2024-06-20: Compra 100 a R$ 23,00 -> Custo = 4000 + 2300 = 6300.00, Q = 300, PM = 21.00
      // 4. 2024-08-01: Venda 100 a R$ 25,00 -> Q = 200, PM = 21.00, Custo = 4200.00, Realized PnL = (25 - 21) * 100 = 400.00
      const transactions: PositionTransaction[] = [
        {
          type: 'BUY',
          quantity: 100,
          unitPrice: 40,
          tradeDate: '2024-01-10',
        },
        {
          type: 'SPLIT',
          quantity: 0,
          splitRatio: { numerator: 2, denominator: 1 },
          tradeDate: '2024-06-15',
        },
        {
          type: 'BUY',
          quantity: 100,
          unitPrice: 23,
          tradeDate: '2024-06-20',
        },
        {
          type: 'SELL',
          quantity: 100,
          unitPrice: 25,
          tradeDate: '2024-08-01',
        },
      ];

      const position = calculatePositionFromTransactions(transactions);

      expect(position.quantity).toBe('200');
      expect(position.averagePrice).toBe('21.00');
      expect(position.totalInvested).toBe('4200.00');
      expect(position.realizedPnl).toBe('400.00');
    });

    it('deve aplicar múltiplos desdobramentos e grupamentos consecutivos na ordem cronológica correta', () => {
      // 1. Compra 500 a R$ 10,00 -> Q=500, PM=10.00, Custo=5000.00
      // 2. Split 2:1 -> Q=1000, PM=5.00, Custo=5000.00
      // 3. Inplit 1:5 -> Q=200, PM=25.00, Custo=5000.00
      const transactions: PositionTransaction[] = [
        {
          type: 'BUY',
          quantity: 500,
          unitPrice: 10,
          tradeDate: '2024-01-01',
        },
        {
          type: 'SPLIT',
          quantity: 0,
          splitRatio: { numerator: 2, denominator: 1 },
          tradeDate: '2024-03-01',
        },
        {
          type: 'INPLIT',
          quantity: 0,
          splitRatio: { numerator: 1, denominator: 5 },
          tradeDate: '2024-05-01',
        },
      ];

      const position = calculatePositionFromTransactions(transactions);

      expect(position.quantity).toBe('200');
      expect(position.averagePrice).toBe('25.00');
      expect(position.totalInvested).toBe('5000.00');
    });
  });

  describe('S24-T04: Idempotência na Reconciliação de Eventos Corporativos', () => {
    it('deve aplicar split novo gerando external_id determinístico e ignorar quando já aplicado', () => {
      const splitEvent: CorporateEventItem = {
        ticker: 'WEGE3',
        type: 'SPLIT',
        eventDate: '2024-06-15',
        numerator: 2,
        denominator: 1,
      };

      // 1ª Execução: Evento ainda não aplicado
      const firstRun = reconcileCorporateEvents({
        ticker: 'WEGE3',
        currentQuantity: '100',
        currentAveragePrice: '40.00',
        events: [splitEvent],
        existingTransactionExternalIds: [],
      });

      expect(firstRun.appliedEvents).toHaveLength(1);
      expect(firstRun.appliedEvents[0].externalId).toBe('YAHOO_SPLIT_WEGE3_2024-06-15_2:1');
      expect(firstRun.finalQuantity).toBe('200');
      expect(firstRun.finalAveragePrice).toBe('20.00');

      // 2ª Execução: Mesmo evento enviado com o external_id já registrado na carteira
      const secondRun = reconcileCorporateEvents({
        ticker: 'WEGE3',
        currentQuantity: firstRun.finalQuantity,
        currentAveragePrice: firstRun.finalAveragePrice,
        events: [splitEvent],
        existingTransactionExternalIds: ['YAHOO_SPLIT_WEGE3_2024-06-15_2:1'],
      });

      // Não deve reaplicar
      expect(secondRun.appliedEvents).toHaveLength(0);
      expect(secondRun.finalQuantity).toBe('200');
      expect(secondRun.finalAveragePrice).toBe('20.00');
    });

    it('deve ignorar eventos de dividendos em dinheiro sem alterar posição acionária', () => {
      const dividendEvent: CorporateEventItem = {
        ticker: 'PETR4',
        type: 'DIVIDEND',
        eventDate: '2024-05-20',
        numerator: 0,
        denominator: 0,
        cashAmount: 1.45,
      };

      const result = reconcileCorporateEvents({
        ticker: 'PETR4',
        currentQuantity: '500',
        currentAveragePrice: '35.00',
        events: [dividendEvent],
        existingTransactionExternalIds: [],
      });

      expect(result.appliedEvents).toHaveLength(0);
      expect(result.finalQuantity).toBe('500');
      expect(result.finalAveragePrice).toBe('35.00');
    });
  });
});
