import fs from 'fs';
import path from 'path';
import { bento, layout, space } from '../theme/tokens';
import { dockContentPaddingBottom } from '../theme/layoutMetrics';

/**
 * Sprint 80 — Espaçamentos de Finanças pelos tokens.
 * Regra: nos arquivos-alvo, nenhuma declaração de padding*, margin*, gap, rowGap ou columnGap usa número literal.
 * Exceções: o valor 0 e linhas com o comentário `// fora da escala: <motivo>` na MESMA linha.
 */
const ROOT = path.resolve(__dirname, '..');

const TARGET_FILES = [
  'screens/finance/finTheme.tsx',
  'screens/finance/FinanceHomeScreen.tsx',
  'screens/finance/EntriesListScreen.tsx',
  'screens/finance/EntryFormSheet.tsx',
  'screens/finance/AccountsScreen.tsx',
  'screens/finance/CardBillScreen.tsx',
  'screens/finance/FinanceMoreScreen.tsx',
  'screens/finance/BudgetScreen.tsx',
  'screens/finance/GoalsScreen.tsx',
  'screens/finance/NetWorthScreen.tsx',
  'screens/finance/SubscriptionsScreen.tsx',
  'screens/finance/RecurrencesScreen.tsx',
  'screens/finance/CategoriesScreen.tsx',
  'screens/finance/CategoryRulesScreen.tsx',
  'screens/finance/ReceiptScannerSheet.tsx',
  'components/StatementImportSheet.tsx',
  'screens/OpenFinanceScreen.tsx',
  'components/OpenFinanceInvestmentReconciliationSheet.tsx',
  'components/ui/FinListCard.tsx',
];

const EXCEPTION_MARK = '// fora da escala:';
const DECL_RE = /\b((?:padding|margin)[A-Za-z]*|gap|rowGap|columnGap)\s*:\s*([^,}\n]*)/g;

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findSpacingLiterals(relFile: string): Violation[] {
  const source = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  const violations: Violation[] = [];
  source.split('\n').forEach((lineText, index) => {
    if (lineText.includes(EXCEPTION_MARK)) return;
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    DECL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DECL_RE.exec(lineText)) !== null) {
      // Remove identificadores (space.md, bento.gap, insets.bottom) e sobra só o que for número solto.
      const withoutIdentifiers = match[2].replace(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g, '');
      const numbers = withoutIdentifiers.match(/\d+(?:\.\d+)?/g) ?? [];
      if (numbers.some((n) => Number(n) !== 0)) {
        violations.push({ file: relFile, line: index + 1, text: trimmed });
      }
    }
  });
  return violations;
}

describe('Sprint 80 — Espaçamentos de Finanças pelos tokens (Fase A)', () => {
  test('S80-T01: a escala e os tokens semânticos existentes não mudaram', () => {
    expect(space).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
    expect(layout.screenPadding).toBe(20);
    expect(layout.tabScreenPaddingX).toBe(16);
    expect(layout.tabScreenPaddingTop).toBe(4);
    expect(bento.gap).toBe(10);
    expect(bento.tilePadding).toBe(18);
  });

  test('S80-T02: tokens novos de layout existem (respiro da nav bar, do botão flutuante e gap de chips)', () => {
    const l = layout as unknown as Record<string, number>;
    expect(l.safeBottomMin).toBe(space.lg);
    expect(l.dockClearance).toBe(96);
    expect(l.fabClearance).toBe(72);
    expect(l.chipGap).toBe(space.sm);
  });

  test('S80-T03: dockContentPaddingBottom soma safe area (mínimo 16) + respiro da nav bar', () => {
    expect(dockContentPaddingBottom(0)).toBe(16 + 96);
    expect(dockContentPaddingBottom(10)).toBe(16 + 96);
    expect(dockContentPaddingBottom(34)).toBe(34 + 96);
    expect(dockContentPaddingBottom()).toBe(16 + 96);
  });

  test('S80-T04: com botão flutuante, o respiro inclui o botão', () => {
    expect(dockContentPaddingBottom(0, { withFab: true })).toBe(16 + 96 + 72);
    expect(dockContentPaddingBottom(34, { withFab: true })).toBe(34 + 96 + 72);
  });

  test.each(TARGET_FILES)('S80-T05: %s não tem padding/margin/gap com número solto', (relFile) => {
    const violations = findSpacingLiterals(relFile);
    const report = violations.map((v) => `${v.file}:${v.line}  ${v.text}`).join('\n');
    expect(report).toBe('');
  });

  test('S80-T06: toda exceção "fora da escala" tem motivo escrito e são poucas (no máximo 12 no total)', () => {
    let total = 0;
    for (const relFile of TARGET_FILES) {
      const source = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
      for (const lineText of source.split('\n')) {
        const at = lineText.indexOf(EXCEPTION_MARK);
        if (at < 0) continue;
        total += 1;
        const reason = lineText.slice(at + EXCEPTION_MARK.length).trim();
        expect(reason.length).toBeGreaterThanOrEqual(8);
      }
    }
    expect(total).toBeLessThanOrEqual(12);
  });

  test('S80-T07: nenhuma tela de Finanças guarda padding inferior fixo (130/170): todas usam o helper da nav bar', () => {
    const withDockPadding = [
      'screens/finance/FinanceHomeScreen.tsx',
      'screens/finance/EntriesListScreen.tsx',
      'screens/finance/AccountsScreen.tsx',
      'screens/finance/FinanceMoreScreen.tsx',
      'screens/finance/BudgetScreen.tsx',
      'screens/finance/GoalsScreen.tsx',
      'screens/finance/NetWorthScreen.tsx',
      'screens/finance/SubscriptionsScreen.tsx',
      'screens/finance/CategoriesScreen.tsx',
      'screens/finance/CategoryRulesScreen.tsx',
    ];
    for (const relFile of withDockPadding) {
      const source = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
      expect(source).not.toMatch(/paddingBottom:\s*(130|170)\b/);
      expect(source).not.toMatch(/dock\.pillHeight\s*\+\s*76/);
      expect(source).toContain('dockContentPaddingBottom(');
    }
  });

  test('S80-T08: a Home de Investimentos adota o mesmo helper no lugar do número idêntico', () => {
    const appSource = fs.readFileSync(path.resolve(ROOT, '..', 'App.tsx'), 'utf8');
    expect(appSource).toContain('dockContentPaddingBottom(');
    expect(appSource).not.toMatch(/Math\.max\(insets\.bottom,\s*16\)\s*\+\s*96/);
  });
});
