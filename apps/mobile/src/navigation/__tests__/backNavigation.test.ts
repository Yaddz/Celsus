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
    ['Busca (aba)', { activeTab: 'search' }, 'go-home'],
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
    ['Importação B3 aberta pelo Perfil: volta para o Perfil', { isSettingsOpen: true, isB3ImportOpen: true }, 'close-b3-import'],
    ['Importação B3 aberta pelo Histórico de proventos: volta para o Histórico', { activeTab: 'stats', isIncomeHistoryOpen: true, isB3ImportOpen: true }, 'close-b3-import'],
    ['Perfil aberto sobre um sheet: o Perfil cobre o sheet e fecha primeiro', { activeTab: 'wallets', isPortfolioManagerOpen: true, isSettingsOpen: true }, 'close-settings'],
    ['Detalhe da operação aberto pelo extrato completo: volta para o extrato', { isAllTransactionsOpen: true, isTransactionDetailOpen: true }, 'close-transaction-detail'],
    ['Modal de movimentação sobre qualquer coisa', { activeTab: 'wallets', isClassDetailOpen: true, isTransactionModalOpen: true }, 'close-transaction-modal'],
  ];

  it.each(rows)('%s', (_name, partial, expected) => {
    expect(resolveBackAction({ ...base, ...partial })).toBe(expected);
  });

  it('só devolve exit na Home sem camadas abertas', () => {
    const tabs: BackState['activeTab'][] = ['home', 'stats', 'search', 'wallets'];
    const exits = tabs.filter((t) => resolveBackAction({ ...base, activeTab: t }) === 'exit');
    expect(exits).toEqual(['home']);
  });
});
