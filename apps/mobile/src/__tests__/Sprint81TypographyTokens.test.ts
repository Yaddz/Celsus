import fs from 'fs';
import path from 'path';
import { typography } from '../theme/tokens';

/**
 * Sprint 81 — Tipografia de Finanças pelos tokens.
 * Regra: em src/screens/finance nenhum fontSize, fontWeight ou lineHeight é literal.
 * Exceção: linha com o comentário `// fora da escala: <motivo>`.
 */
const FINANCE_DIR = path.resolve(__dirname, '..', 'screens', 'finance');
const EXCEPTION_MARK = '// fora da escala:';

const FINANCE_FILES = fs
  .readdirSync(FINANCE_DIR)
  .filter((name: string) => name.endsWith('.tsx'))
  .sort();

function findLiterals(fileName: string, re: RegExp): string[] {
  const source = fs.readFileSync(path.join(FINANCE_DIR, fileName), 'utf8');
  const hits: string[] = [];
  source.split('\n').forEach((lineText: string, index: number) => {
    if (lineText.includes(EXCEPTION_MARK)) return;
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (re.test(lineText)) hits.push(`${fileName}:${index + 1}  ${trimmed}`);
  });
  return hits;
}

describe('Sprint 81 — Tipografia de Finanças pelos tokens (Fase A)', () => {
  test('S81-T01: as variantes de tipografia existentes não mudaram', () => {
    expect(typography.fontFamily).toBe('Space Mono');
    expect(typography.headlineLg.fontSize).toBe(32);
    expect(typography.headlineSm.fontSize).toBe(18);
    expect(typography.labelLg.fontSize).toBe(14);
    expect(typography.labelMd.fontSize).toBe(12);
    expect(typography.sizes).toMatchObject({ title: 15, subtitle: 11, body: 13, caption: 10 });
    expect(typography.weights).toMatchObject({ regular: '400', medium: '500', semibold: '600', bold: '700' });
  });

  test('S81-T02: tamanhos novos nomeados para os papéis que não tinham token (destaque 16, display 24, herói 28)', () => {
    expect(typography.sizes.lead).toBe(16);
    expect(typography.sizes.display).toBe(24);
    expect(typography.sizes.hero).toBe(28);
  });

  test('S81-T03: a pasta de Finanças tem as telas esperadas', () => {
    expect(FINANCE_FILES).toEqual(
      expect.arrayContaining([
        'AccountsScreen.tsx',
        'BudgetScreen.tsx',
        'CardBillScreen.tsx',
        'CategoriesScreen.tsx',
        'CategoryRulesScreen.tsx',
        'EntriesListScreen.tsx',
        'EntryFormSheet.tsx',
        'FinanceHomeScreen.tsx',
        'FinanceMoreScreen.tsx',
        'GoalsScreen.tsx',
        'NetWorthScreen.tsx',
        'ReceiptScannerSheet.tsx',
        'RecurrencesScreen.tsx',
        'SubscriptionsScreen.tsx',
        'finTheme.tsx',
      ])
    );
  });

  test.each(FINANCE_FILES)('S81-T04: %s não tem fontSize literal', (fileName) => {
    expect(findLiterals(fileName, /\bfontSize\s*:\s*\d/).join('\n')).toBe('');
  });

  test.each(FINANCE_FILES)('S81-T05: %s não tem fontWeight literal', (fileName) => {
    expect(findLiterals(fileName, /\bfontWeight\s*:\s*['"\d]/).join('\n')).toBe('');
  });

  test.each(FINANCE_FILES)('S81-T06: %s não tem lineHeight literal', (fileName) => {
    expect(findLiterals(fileName, /\blineHeight\s*:\s*\d/).join('\n')).toBe('');
  });

  test.each(FINANCE_FILES)('S81-T07: %s não declara máscara de privacidade própria', (fileName) => {
    const source = fs.readFileSync(path.join(FINANCE_DIR, fileName), 'utf8');
    expect(source).not.toMatch(/['"`]R\$ ••••••['"`]/);
  });

  test('S81-T08: Finanças não usa Modal próprio nem Alert.alert para confirmar', () => {
    for (const fileName of FINANCE_FILES) {
      const source = fs.readFileSync(path.join(FINANCE_DIR, fileName), 'utf8');
      expect(`${fileName}: ${/Alert\.alert\(/.test(source)}`).toBe(`${fileName}: false`);
      expect(`${fileName}: ${/<Modal\b/.test(source)}`).toBe(`${fileName}: false`);
    }
  });

  test('S81-T09: finTheme.tsx guarda só o que é específico de Finanças (estados e rótulo de seção saíram)', () => {
    const source = fs.readFileSync(path.join(FINANCE_DIR, 'finTheme.tsx'), 'utf8');
    expect(source).not.toMatch(/export const FinLoadingView/);
    expect(source).not.toMatch(/export const FinErrorView/);
    expect(source).not.toMatch(/export const FinEmptyState/);
    expect(source).not.toMatch(/sectionLabel\s*:/);
    expect(source).toMatch(/export function getFinUiColors/);
    expect(source).toMatch(/export function resolveCategoryVisual/);
    expect(source).toMatch(/export function formatSignedCentsBRL/);
  });

  test('S81-T10: DESIGN_SYSTEM.md documenta os componentes promovidos e a regra da biblioteca única', () => {
    const doc = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'DESIGN_SYSTEM.md'), 'utf8');
    expect(doc).toContain('FinHeroTile');
    expect(doc).toContain('SectionHeader');
    expect(doc).toContain('EmptyState');
    expect(doc).toMatch(/Finanças e Investimentos usam a mesma biblioteca/);
  });
});
