import {
  calculateBuyOperation,
  calculateSellOperation,
  calculatePositionFromTransactions,
} from '../averagePrice';
import { PositionTransaction } from '../types';

describe('S3-T02: TestAveragePriceOnMultipleBuysWithFees', () => {
  it('should calculate initial average price with transaction fees included', () => {
    // Buy 100 PETR4 @ R$ 30.00 with fees R$ 5.00
    const result = calculateBuyOperation({
      currentQuantity: '0',
      currentAveragePrice: '0.00',
      buyQuantity: '100',
      buyPrice: '30.00',
      fees: '5.00',
    });

    expect(result.quantity).toBe('100');
    expect(result.totalCost).toBe('3005.00'); // 100 * 30 + 5
    expect(result.averagePrice).toBe('30.05'); // 3005 / 100
  });

  it('should update average price correctly over successive buy operations with brokerage fees', () => {
    // Buy 1: 100 @ R$ 30.00, fees R$ 5.00
    const step1 = calculateBuyOperation({
      currentQuantity: '0',
      currentAveragePrice: '0.00',
      buyQuantity: '100',
      buyPrice: '30.00',
      fees: '5.00',
    });
    expect(step1.quantity).toBe('100');
    expect(step1.averagePrice).toBe('30.05');

    // Buy 2: 100 @ R$ 36.00, fees R$ 5.00
    // Total cost = 3005 + (100 * 36 + 5) = 3005 + 3605 = 6610. Total qty = 200. PM = 6610 / 200 = 33.05
    const step2 = calculateBuyOperation({
      currentQuantity: step1.quantity,
      currentAveragePrice: step1.averagePrice,
      buyQuantity: '100',
      buyPrice: '36.00',
      fees: '5.00',
    });
    expect(step2.quantity).toBe('200');
    expect(step2.totalCost).toBe('6610.00');
    expect(step2.averagePrice).toBe('33.05');

    // Buy 3: 200 @ R$ 40.00, fees R$ 10.00
    // Total cost = 6610 + (200 * 40 + 10) = 6610 + 8010 = 14620. Total qty = 400. PM = 14620 / 400 = 36.55
    const step3 = calculateBuyOperation({
      currentQuantity: step2.quantity,
      currentAveragePrice: step2.averagePrice,
      buyQuantity: '200',
      buyPrice: '40.00',
      fees: '10.00',
    });
    expect(step3.quantity).toBe('400');
    expect(step3.totalCost).toBe('14620.00');
    expect(step3.averagePrice).toBe('36.55');
  });

  it('should correctly process position from an array of sequential buy transactions', () => {
    const transactions: PositionTransaction[] = [
      { type: 'BUY', quantity: '100', unitPrice: '30.00', fees: '5.00' },
      { type: 'BUY', quantity: '100', unitPrice: '36.00', fees: '5.00' },
      { type: 'BUY', quantity: '200', unitPrice: '40.00', fees: '10.00' },
    ];

    const position = calculatePositionFromTransactions(transactions);
    expect(position.quantity).toBe('400');
    expect(position.averagePrice).toBe('36.55');
    expect(position.totalInvested).toBe('14620.00');
    expect(position.realizedPnl).toBe('0.00');
  });
});

describe('S3-T03: TestSellDoesNotChangeAveragePrice', () => {
  const initialQty = '400';
  const initialPM = '36.55';

  it('should maintain exact average price intact on partial sell and calculate exact realized gain', () => {
    // Sell 150 @ R$ 42.00, fees R$ 8.00
    // Gross: 150 * 42 = 6300. Net: 6300 - 8 = 6292.
    // Cost basis: 150 * 36.55 = 5482.50.
    // Realized PnL: 6292.00 - 5482.50 = 809.50.
    const result = calculateSellOperation({
      currentQuantity: initialQty,
      currentAveragePrice: initialPM,
      sellQuantity: '150',
      sellPrice: '42.00',
      fees: '8.00',
    });

    expect(result.quantity).toBe('250');
    expect(result.averagePrice).toBe('36.55'); // UNCHANGED!
    expect(result.realizedPnl).toBe('809.50');
  });

  it('should maintain exact average price intact on sell with loss and calculate negative realized PnL', () => {
    // Sell 50 @ R$ 30.00, fees R$ 5.00 from remaining 250
    // Gross: 50 * 30 = 1500. Net: 1500 - 5 = 1495.
    // Cost basis: 50 * 36.55 = 1827.50.
    // Realized PnL: 1495.00 - 1827.50 = -332.50.
    const result = calculateSellOperation({
      currentQuantity: '250',
      currentAveragePrice: initialPM,
      sellQuantity: '50',
      sellPrice: '30.00',
      fees: '5.00',
    });

    expect(result.quantity).toBe('200');
    expect(result.averagePrice).toBe('36.55'); // UNCHANGED!
    expect(result.realizedPnl).toBe('-332.50');
  });

  it('should reset average price to 0.00 when position is fully liquidated', () => {
    // Sell remaining 200 @ R$ 38.00, fees R$ 0.00
    // Net: 200 * 38 = 7600. Cost basis: 200 * 36.55 = 7310.
    // Realized PnL: 7600 - 7310 = 290.00.
    const result = calculateSellOperation({
      currentQuantity: '200',
      currentAveragePrice: initialPM,
      sellQuantity: '200',
      sellPrice: '38.00',
      fees: '0.00',
    });

    expect(result.quantity).toBe('0');
    expect(result.averagePrice).toBe('0.00'); // RESET on complete exit!
    expect(result.realizedPnl).toBe('290.00');
  });

  it('should throw error when attempting to sell more than current position (no short selling)', () => {
    expect(() => {
      calculateSellOperation({
        currentQuantity: '100',
        currentAveragePrice: '25.00',
        sellQuantity: '150',
        sellPrice: '26.00',
      });
    }).toThrow(/saldo insuficiente|insufficient quantity/i);
  });

  it('should accumulate realized PnL across multiple buy and sell transactions', () => {
    const transactions: PositionTransaction[] = [
      { type: 'BUY', quantity: '400', unitPrice: '36.55', fees: '0.00' },
      { type: 'SELL', quantity: '150', unitPrice: '42.00', fees: '8.00' }, // +809.50
      { type: 'SELL', quantity: '50', unitPrice: '30.00', fees: '5.00' },  // -332.50
    ];

    const position = calculatePositionFromTransactions(transactions);
    expect(position.quantity).toBe('200');
    expect(position.averagePrice).toBe('36.55');
    // Total realized PnL = 809.50 - 332.50 = 477.00
    expect(position.realizedPnl).toBe('477.00');
  });
});

describe('S3-T04: TestCryptoEightDecimalPlacesPrecision', () => {
  it('should handle fractional crypto purchases with 8 decimal places without IEEE 754 precision errors', () => {
    // Buy 1: 0.00451234 BTC @ R$ 350,000.00, fees R$ 2.50
    // Cost = 0.00451234 * 350000 + 2.50 = 1579.319 + 2.50 = 1581.819
    const buy1 = calculateBuyOperation({
      currentQuantity: '0',
      currentAveragePrice: '0.00',
      buyQuantity: '0.00451234',
      buyPrice: '350000.00',
      fees: '2.50',
    });
    expect(buy1.quantity).toBe('0.00451234');
    expect(buy1.totalCost).toBe('1581.819');

    // Buy 2: 0.00548766 BTC @ R$ 380,000.00, fees R$ 3.10
    // Cost 2 = 0.00548766 * 380000 + 3.10 = 2085.3108 + 3.10 = 2088.4108
    // Total Qty = 0.00451234 + 0.00548766 = 0.01000000 BTC exactly
    // Total Cost = 1581.819 + 2088.4108 = 3670.2298
    // PM = 3670.2298 / 0.01 = 367022.98
    const buy2 = calculateBuyOperation({
      currentQuantity: buy1.quantity,
      currentAveragePrice: buy1.averagePrice,
      buyQuantity: '0.00548766',
      buyPrice: '380000.00',
      fees: '3.10',
    });

    expect(buy2.quantity).toBe('0.01000000');
    expect(buy2.totalCost).toBe('3670.2298');
    expect(buy2.averagePrice).toBe('367022.98');
  });

  it('should handle fractional crypto sale with 8 decimal places and compute exact realized PnL', () => {
    // Sell 0.00350000 BTC from 0.01000000 @ R$ 420,000.00, fees R$ 1.50
    // Remaining = 0.00650000 BTC
    // Gross = 0.0035 * 420000 = 1470.00. Net = 1470 - 1.50 = 1468.50.
    // Cost basis = 0.0035 * 367022.98 = 1284.58043.
    // Realized PnL = 1468.50 - 1284.58043 = 183.91957.
    const sellResult = calculateSellOperation({
      currentQuantity: '0.01000000',
      currentAveragePrice: '367022.98',
      sellQuantity: '0.00350000',
      sellPrice: '420000.00',
      fees: '1.50',
    });

    expect(sellResult.quantity).toBe('0.00650000');
    expect(sellResult.averagePrice).toBe('367022.98');
    expect(sellResult.realizedPnl).toBe('183.91957');
  });

  it('should fully liquidate crypto position to 0 with 8 decimals precision', () => {
    const sellAll = calculateSellOperation({
      currentQuantity: '0.00650000',
      currentAveragePrice: '367022.98',
      sellQuantity: '0.00650000',
      sellPrice: '400000.00',
      fees: '0.00',
    });

    expect(sellAll.quantity).toBe('0');
    expect(sellAll.averagePrice).toBe('0.00');
  });
});
