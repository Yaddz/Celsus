/**
 * @jest-environment node
 */
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawnSync } = require('child_process') as { spawnSync: (...args: unknown[]) => { stdout: string } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as { resolve: (...parts: string[]) => string };

const MOBILE_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('Sprint 116 — lint (W6)', () => {
  test('S116-T33 (W6): TransactionScreen sem erros react-hooks/set-state-in-effect novos (Sprint 104/114) nem react-hooks/immutability', () => {
    const eslintBin = path.resolve(MOBILE_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
    const run = spawnSync(
      process.execPath,
      [eslintBin, '--format', 'json', 'src/screens/TransactionScreen.tsx'],
      { cwd: MOBILE_ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
    );
    const report = JSON.parse(run.stdout) as Array<{
      messages: Array<{ ruleId: string | null; severity: number; line: number }>;
    }>;
    const errors = report[0].messages.filter((m) => m.severity === 2);
    // Resta no máximo o erro antigo do efeito de cotação (linha ~395, anterior à Sprint 104).
    const setStateInEffect = errors.filter((m) => m.ruleId === 'react-hooks/set-state-in-effect');
    const immutability = errors.filter((m) => m.ruleId === 'react-hooks/immutability');
    expect(setStateInEffect.length).toBeLessThanOrEqual(1);
    expect(immutability).toHaveLength(0);
  }, 120_000);
});
