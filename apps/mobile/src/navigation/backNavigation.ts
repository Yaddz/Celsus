/**
 * Regra única do botão/gesto "voltar" do Android.
 *
 * O app navega por estado (abas + camadas sobrepostas), não por Expo Router, então a
 * decisão fica aqui como função pura: dado o que está aberto, retorna qual ação executar.
 * Prioridade: a camada mais "por cima" fecha primeiro. Só devolve `exit` na Home sem
 * nenhuma camada aberta — em qualquer outro caso o app consome o evento.
 *
 * Observação: o menu "+" e os sheets (AnimatedModalSheet) tratam o voltar sozinhos
 * (BackHandler no dock / onRequestClose do Modal) e rodam antes deste handler.
 */
export type DockTabId = 'home' | 'stats' | 'search' | 'wallets';

export interface BackState {
  isLocked?: boolean;
  activeTab: DockTabId;
  isSettingsOpen: boolean;
  isTransactionDetailOpen: boolean;
  isAllTransactionsOpen: boolean;
  isClassDetailOpen: boolean;
  isAssetDetailOpen?: boolean;
  isTransactionModalOpen: boolean;
  isPortfolioManagerOpen: boolean;
  isSimulatorOpen: boolean;
}

export type BackAction =
  | 'minimize'
  | 'close-settings'
  | 'close-transaction-detail'
  | 'close-all-transactions'
  | 'close-class-detail'
  | 'close-asset-detail'
  | 'close-transaction-modal'
  | 'close-portfolio-manager'
  | 'close-simulator'
  | 'go-home'
  | 'exit';

export function resolveBackAction(state: BackState): BackAction {
  if (state.isLocked) return 'minimize';
  if (state.isTransactionModalOpen) return 'close-transaction-modal';
  if (state.isSimulatorOpen) return 'close-simulator';
  if (state.isPortfolioManagerOpen) return 'close-portfolio-manager';
  if (state.isSettingsOpen) return 'close-settings';
  if (state.isTransactionDetailOpen) return 'close-transaction-detail';
  if (state.isAssetDetailOpen) return 'close-asset-detail';
  if (state.isAllTransactionsOpen) return 'close-all-transactions';
  if (state.isClassDetailOpen) return 'close-class-detail';
  // Abas: Home é o destino padrão do voltar (recomendado); só a Home fecha o app.
  if (state.activeTab !== 'home') return 'go-home';
  return 'exit';
}
