import { resolveBackAction, type BackState } from '../backNavigation';

const baseState: BackState = {
  isLocked: false,
  activeTab: 'home',
  isSettingsOpen: false,
  isOpenFinanceOpen: false,
  isB3ImportOpen: false,
  isIncomeHistoryOpen: false,
  isFinanceOpen: false,
  isTransactionDetailOpen: false,
  isAllTransactionsOpen: false,
  isClassDetailOpen: false,
  isAssetDetailOpen: false,
  isTransactionModalOpen: false,
  isPortfolioManagerOpen: false,
  isSimulatorOpen: false,
};

describe('Sprint 76 — backNavigation com Perfil aberto sobre Finanças (Fase A)', () => {
  test('S76-T07: com Finanças aberto e Perfil aberto por cima, voltar fecha o Perfil antes de fechar Finanças', () => {
    expect(
      resolveBackAction({
        ...baseState,
        isFinanceOpen: true,
        isSettingsOpen: true,
      })
    ).toBe('close-settings');

    expect(
      resolveBackAction({
        ...baseState,
        isFinanceOpen: true,
        isSettingsOpen: false,
      })
    ).toBe('close-finance');
  });
});
