import { useSyncExternalStore } from 'react';
import type { StackedWalletItem } from '../components/ui/StackedWalletDeck';
import { onDatabaseReset } from '../db/client';

/**
 * Fonte única da lista de carteiras (cards) usada pela Home e pela página de Carteiras.
 * Quem altera carteiras (criar, excluir, importar...) pede `requestRefresh()`; o App recarrega do
 * banco e publica aqui, então as duas telas mostram sempre a mesma lista, sem recarregar.
 */
export interface WalletsState {
  wallets: StackedWalletItem[];
  /** false até a primeira carga terminar (e de novo após `markLoading`): mostra skeleton nos cards. */
  loaded: boolean;
}

type Listener = () => void;

let state: WalletsState = { wallets: [], loaded: false };
let refresher: (() => void | Promise<void>) | null = null;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export const walletsStore = {
  getState(): WalletsState {
    return state;
  },
  setWallets(wallets: StackedWalletItem[]): void {
    state = { wallets, loaded: true };
    emit();
  },
  markLoading(): void {
    if (!state.loaded) return;
    state = { ...state, loaded: false };
    emit();
  },
  /** O App registra aqui a função que recarrega as carteiras do banco. Devolve o cancelamento. */
  registerRefresher(fn: () => void | Promise<void>): () => void {
    refresher = fn;
    return () => {
      if (refresher === fn) refresher = null;
    };
  },
  /** true quando há um App registrado para recarregar a lista (sem ele, as telas usam dados locais). */
  hasRefresher(): boolean {
    return refresher !== null;
  },
  /** Pede ao App para recarregar (após criar/excluir carteira em qualquer tela). */
  requestRefresh(): Promise<void> {
    return Promise.resolve(refresher ? refresher() : undefined);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    state = { wallets: [], loaded: false };
    emit();
  },
};

// Banco zerado (testes/restauração): descarta a lista em memória até a próxima carga.
onDatabaseReset(() => walletsStore.reset());

export function useWallets(): WalletsState {
  return useSyncExternalStore(walletsStore.subscribe, walletsStore.getState, walletsStore.getState);
}
