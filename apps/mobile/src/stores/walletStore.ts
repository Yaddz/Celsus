// Stub para compilação da Fase A
export interface WalletStoreState {
  activeWalletIndex: number;
  activePortfolioId: string | null;
}

type Listener = () => void;

let currentState: WalletStoreState = {
  activeWalletIndex: 0,
  activePortfolioId: null,
};

const listeners = new Set<Listener>();

export const walletStore = {
  getState(): WalletStoreState {
    return currentState;
  },
  setActiveIndex(index: number, id?: string): void {
    currentState = {
      activeWalletIndex: index,
      activePortfolioId: id ?? null,
    };
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    currentState = {
      activeWalletIndex: 0,
      activePortfolioId: null,
    };
    listeners.clear();
  },
};

export function useActiveWalletIndex(): number {
  return currentState.activeWalletIndex;
}
