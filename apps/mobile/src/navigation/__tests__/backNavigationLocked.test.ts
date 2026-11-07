import { resolveBackAction, BackState } from '../backNavigation';

describe('S43: backNavigation isLocked State', () => {
  const base: BackState = {
    activeTab: 'home',
    isSettingsOpen: false,
    isTransactionDetailOpen: false,
    isAllTransactionsOpen: false,
    isClassDetailOpen: false,
    isTransactionModalOpen: false,
    isPortfolioManagerOpen: false,
    isSimulatorOpen: false,
  };

  it('S43-T23: isLocked=true must return "minimize" with top priority over any modal or tab', () => {
    // Lock screen has top priority over everything
    expect(resolveBackAction({ ...base, isLocked: true })).toBe('minimize');

    // Even if other layers/modals were open
    expect(
      resolveBackAction({
        ...base,
        isLocked: true,
        isSettingsOpen: true,
        isTransactionModalOpen: true,
      })
    ).toBe('minimize');

    // When unlocked, normal back behavior applies
    expect(resolveBackAction({ ...base, isLocked: false })).toBe('exit');
  });
});
