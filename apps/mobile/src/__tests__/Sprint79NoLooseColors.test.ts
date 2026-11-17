import fs from 'fs';
import path from 'path';

const TARGET_FILES = [
  'src/components/OpenFinanceInvestmentReconciliationSheet.tsx',
  'src/screens/OpenFinanceScreen.tsx',
  'src/components/StatementImportSheet.tsx',
  'src/screens/finance/ReceiptScannerSheet.tsx',
  'src/screens/finance/GoalsScreen.tsx',
  'src/screens/finance/CategoriesScreen.tsx',
  'src/screens/finance/AccountsScreen.tsx',
  'src/screens/finance/SubscriptionsScreen.tsx',
  'src/screens/finance/BudgetScreen.tsx',
  'src/screens/finance/CategoryRulesScreen.tsx',
  'src/screens/finance/FinanceHomeScreen.tsx',
];

/**
 * Exceções explícitas e documentadas:
 * - ReceiptScannerSheet.tsx: sobreposição da câmera permanece escura (#000 / #FFFFFF) sobre imagem ao vivo.
 */
const ALLOWED_EXCEPTIONS: Record<string, Set<string>> = {
  'src/screens/finance/ReceiptScannerSheet.tsx': new Set(['#000', '#FFFFFF']),
};

describe('Sprint 79 — Proibição de cores literais soltas fora dos temas', () => {
  it('S79-T06: arquivos-alvo não contêm hex literal fora das exceções documentadas', () => {
    const mobileRoot = path.resolve(__dirname, '../..');
    const violations: string[] = [];

    for (const rel of TARGET_FILES) {
      const fullPath = path.join(mobileRoot, rel);
      const content = fs.readFileSync(fullPath, 'utf8');
      const allowed = ALLOWED_EXCEPTIONS[rel] ?? new Set<string>();
      const matches = content.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
      for (const hex of matches) {
        if (!allowed.has(hex)) {
          violations.push(`${rel}: ${hex}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
