import { useSyncExternalStore } from 'react';
import { onDatabaseReset } from '../db/client';

export interface PendingContributionPayload {
  amountCents: number;
  sourceAccountId: string;
  month: string;
}

let pending: PendingContributionPayload | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Store efêmero (consumido uma vez) para levar o aporte decidido em "Fechar o mês"
 * (Finanças) até o SimulatorScreen (Investimentos).
 */
export const pendingContributionStore = {
  getState(): PendingContributionPayload | null {
    return pending;
  },
  set(payload: PendingContributionPayload): void {
    pending = { ...payload };
    emit();
  },
  consume(): PendingContributionPayload | null {
    const current = pending;
    if (current !== null) {
      pending = null;
      emit();
    }
    return current;
  },
  clear(): void {
    if (pending !== null) {
      pending = null;
      emit();
    }
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

onDatabaseReset(() => pendingContributionStore.clear());

export function usePendingContributionStore(): PendingContributionPayload | null {
  return useSyncExternalStore(
    pendingContributionStore.subscribe,
    pendingContributionStore.getState,
    pendingContributionStore.getState
  );
}
