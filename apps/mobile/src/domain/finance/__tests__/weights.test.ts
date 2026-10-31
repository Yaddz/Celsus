import {
  calculateGlobalTarget,
  validateClassTargets,
  validateAssetTargetsInClass,
  calculatePortfolioGlobalTargets,
} from '../weights';
import { ClassTarget, AssetTarget } from '../types';

describe('S3-T01: TestTwoLevelGlobalTargetCalculation', () => {
  describe('Global Target Formula: Ti = (Wc * wi,c) / 100', () => {
    it('should calculate exact global target for stocks with 40% class target and 25% asset target (SPEC 5.1 example)', () => {
      const globalTarget = calculateGlobalTarget(40, 25);
      expect(globalTarget).toBe(10);
    });

    it('should calculate exact global target for stock with 50% target within 40% class target', () => {
      const globalTarget = calculateGlobalTarget(40, 50);
      expect(globalTarget).toBe(20);
    });

    it('should calculate exact global target for fixed income with 30% class target and 60% asset target', () => {
      const globalTarget = calculateGlobalTarget(30, 60);
      expect(globalTarget).toBe(18);
    });

    it('should calculate exact global target for crypto with 10% class target and 70% asset target', () => {
      const globalTarget = calculateGlobalTarget(10, 70);
      expect(globalTarget).toBe(7);
    });

    it('should return 0 when class target or asset target in class is 0', () => {
      expect(calculateGlobalTarget(0, 50)).toBe(0);
      expect(calculateGlobalTarget(40, 0)).toBe(0);
    });
  });

  describe('Validation of Macro Class Targets (Sum = 100%)', () => {
    it('should validate successfully when macro class targets sum exactly to 100%', () => {
      const classTargets: ClassTarget[] = [
        { assetClass: 'FIXED_INCOME', targetPercentage: 30 },
        { assetClass: 'FII', targetPercentage: 20 },
        { assetClass: 'STOCK', targetPercentage: 40 },
        { assetClass: 'CRYPTO', targetPercentage: 10 },
      ];

      const result = validateClassTargets(classTargets);
      expect(result.isValid).toBe(true);
      expect(result.sum).toBe(100);
      expect(result.error).toBeUndefined();
    });

    it('should reject class targets when sum is less than 100%', () => {
      const classTargets: ClassTarget[] = [
        { assetClass: 'FIXED_INCOME', targetPercentage: 30 },
        { assetClass: 'FII', targetPercentage: 20 },
        { assetClass: 'STOCK', targetPercentage: 40 },
      ]; // Sum = 90%

      const result = validateClassTargets(classTargets);
      expect(result.isValid).toBe(false);
      expect(result.sum).toBe(90);
      expect(result.error).toBeDefined();
    });

    it('should reject class targets when sum exceeds 100%', () => {
      const classTargets: ClassTarget[] = [
        { assetClass: 'FIXED_INCOME', targetPercentage: 35 },
        { assetClass: 'FII', targetPercentage: 25 },
        { assetClass: 'STOCK', targetPercentage: 40 },
        { assetClass: 'CRYPTO', targetPercentage: 10 },
      ]; // Sum = 110%

      const result = validateClassTargets(classTargets);
      expect(result.isValid).toBe(false);
      expect(result.sum).toBe(110);
      expect(result.error).toBeDefined();
    });
  });

  describe('Validation of Micro Asset Targets within Class (Sum = 100%)', () => {
    it('should validate successfully when micro asset targets sum to 100%', () => {
      const stockAssets = [
        { targetPercentageInClass: 25 },
        { targetPercentageInClass: 25 },
        { targetPercentageInClass: 50 },
      ];

      const result = validateAssetTargetsInClass(stockAssets);
      expect(result.isValid).toBe(true);
      expect(result.sum).toBe(100);
      expect(result.error).toBeUndefined();
    });

    it('should reject micro asset targets when sum does not reach 100%', () => {
      const fiiAssets = [
        { targetPercentageInClass: 50 },
        { targetPercentageInClass: 30 },
      ]; // Sum = 80%

      const result = validateAssetTargetsInClass(fiiAssets);
      expect(result.isValid).toBe(false);
      expect(result.sum).toBe(80);
      expect(result.error).toBeDefined();
    });

    it('should reject micro asset targets when sum exceeds 100%', () => {
      const cryptoAssets = [
        { targetPercentageInClass: 70 },
        { targetPercentageInClass: 40 },
      ]; // Sum = 110%

      const result = validateAssetTargetsInClass(cryptoAssets);
      expect(result.isValid).toBe(false);
      expect(result.sum).toBe(110);
      expect(result.error).toBeDefined();
    });
  });

  describe('Portfolio Global Targets Calculation Across All Classes', () => {
    it('should compute exact global targets and ensure portfolio sum equals 100%', () => {
      const classTargets: ClassTarget[] = [
        { assetClass: 'FIXED_INCOME', targetPercentage: 30 },
        { assetClass: 'FII', targetPercentage: 20 },
        { assetClass: 'STOCK', targetPercentage: 40 },
        { assetClass: 'CRYPTO', targetPercentage: 10 },
      ];

      const assets: AssetTarget[] = [
        { ticker: 'CDB_DI', assetClass: 'FIXED_INCOME', targetPercentageInClass: 60 },
        { ticker: 'NTNB_IPCA', assetClass: 'FIXED_INCOME', targetPercentageInClass: 40 },
        { ticker: 'HGLG11', assetClass: 'FII', targetPercentageInClass: 50 },
        { ticker: 'KNCR11', assetClass: 'FII', targetPercentageInClass: 50 },
        { ticker: 'WEGE3', assetClass: 'STOCK', targetPercentageInClass: 25 },
        { ticker: 'VALE3', assetClass: 'STOCK', targetPercentageInClass: 25 },
        { ticker: 'ITUB4', assetClass: 'STOCK', targetPercentageInClass: 50 },
        { ticker: 'BTC', assetClass: 'CRYPTO', targetPercentageInClass: 70 },
        { ticker: 'ETH', assetClass: 'CRYPTO', targetPercentageInClass: 30 },
      ];

      const globalTargets = calculatePortfolioGlobalTargets(classTargets, assets);

      expect(globalTargets).toHaveLength(9);

      const map = new Map(globalTargets.map((g) => [g.ticker, g.globalTargetPercentage]));
      expect(map.get('CDB_DI')).toBe(18); // 30 * 60% = 18%
      expect(map.get('NTNB_IPCA')).toBe(12); // 30 * 40% = 12%
      expect(map.get('HGLG11')).toBe(10); // 20 * 50% = 10%
      expect(map.get('KNCR11')).toBe(10); // 20 * 50% = 10%
      expect(map.get('WEGE3')).toBe(10); // 40 * 25% = 10%
      expect(map.get('VALE3')).toBe(10); // 40 * 25% = 10%
      expect(map.get('ITUB4')).toBe(20); // 40 * 50% = 20%
      expect(map.get('BTC')).toBe(7); // 10 * 70% = 7%
      expect(map.get('ETH')).toBe(3); // 10 * 30% = 3%

      const totalGlobalSum = globalTargets.reduce(
        (acc, item) => acc + item.globalTargetPercentage,
        0
      );
      expect(totalGlobalSum).toBe(100);
    });
  });
});
