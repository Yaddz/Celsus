import { resolveBackAction, BackState } from '../backNavigation';

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

describe('Matriz tela × voltar (resolveBackAction)', () => {
  const rows: Array<[string, Partial<BackState>, string]> = [
    ['Home sem nada aberto', {}, 'exit'],
    ['Análises', { activeTab: 'stats' }, 'go-home'],
    ['Carteiras', { activeTab: 'wallets' }, 'go-home'],
    ['Extrato (aba)', { activeTab: 'history' }, 'go-home'],
    ['Home + Configurações', { isSettingsOpen: true }, 'close-settings'],
    ['Home + Extrato completo', { isAllTransactionsOpen: true }, 'close-all-transactions'],
    ['Home + Detalhe da operação', { isTransactionDetailOpen: true }, 'close-transaction-detail'],
    ['Home + Detalhe da classe', { isClassDetailOpen: true }, 'close-class-detail'],
    ['Home + Nova movimentação', { isTransactionModalOpen: true }, 'close-transaction-modal'],
    ['Home + Simulador', { isSimulatorOpen: true }, 'close-simulator'],
    ['Home + Gerenciar carteiras', { isPortfolioManagerOpen: true }, 'close-portfolio-manager'],
    ['Análises + Detalhe da classe (fecha antes de trocar de aba)', { activeTab: 'stats', isClassDetailOpen: true }, 'close-class-detail'],
    ['Carteiras + Configurações', { activeTab: 'wallets', isSettingsOpen: true }, 'close-settings'],
    ['Detalhe + Configurações: a camada superior (config) fecha primeiro', { isTransactionDetailOpen: true, isSettingsOpen: true }, 'close-settings'],
    ['Modal de movimentação sobre qualquer coisa', { activeTab: 'wallets', isClassDetailOpen: true, isTransactionModalOpen: true }, 'close-transaction-modal'],
  ];

  it.each(rows)('%s', (_name, partial, expected) => {
    expect(resolveBackAction({ ...base, ...partial })).toBe(expected);
  });

  it('só devolve exit na Home sem camadas abertas', () => {
    const tabs: BackState['activeTab'][] = ['home', 'stats', 'history', 'wallets'];
    const exits = tabs.filter((t) => resolveBackAction({ ...base, activeTab: t }) === 'exit');
    expect(exits).toEqual(['home']);
  });
});
