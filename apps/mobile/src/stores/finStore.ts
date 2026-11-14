import { useSyncExternalStore } from 'react';
import { onDatabaseReset } from '../db/client';
import { addMonthsYearMonth, getTodayIsoLocal, type FinEntryStatus, type FinKind } from '../domain/financeFlow';

export interface FinFilters {
  kind: 'all' | FinKind;
  categoryId: string | null;
  accountId: string | null;
  status: 'all' | FinEntryStatus;
}

export interface FinStoreState {
  selectedMonth: string;
  filters: FinFilters;
}

const DEFAULT_FILTERS: FinFilters = {
  kind: 'all',
  categoryId: null,
  accountId: null,
  status: 'all',
};

function currentYearMonth(): string {
  return getTodayIsoLocal().slice(0, 7);
}

let state: FinStoreState = {
  selectedMonth: currentYearMonth(),
  filters: { ...DEFAULT_FILTERS },
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const finStore = {
  getState(): FinStoreState {
    return state;
  },
  setSelectedMonth(yearMonth: string): void {
    state = { ...state, selectedMonth: yearMonth };
    emit();
  },
  prevMonth(): void {
    state = { ...state, selectedMonth: addMonthsYearMonth(state.selectedMonth, -1) };
    emit();
  },
  nextMonth(): void {
    state = { ...state, selectedMonth: addMonthsYearMonth(state.selectedMonth, 1) };
    emit();
  },
  setFilters(patch: Partial<FinFilters>): void {
    state = { ...state, filters: { ...state.filters, ...patch } };
    emit();
  },
  resetFilters(): void {
    state = { ...state, filters: { ...DEFAULT_FILTERS } };
    emit();
  },
  /** Volta ao mês de hoje mantendo os filtros (usado ao abrir o módulo). */
  resetMonthToCurrent(): void {
    state = { ...state, selectedMonth: currentYearMonth() };
    emit();
  },
  reset(): void {
    state = {
      selectedMonth: currentYearMonth(),
      filters: { ...DEFAULT_FILTERS },
    };
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

onDatabaseReset(() => finStore.reset());

export function useFinStore(): FinStoreState {
  return useSyncExternalStore(finStore.subscribe, finStore.getState, finStore.getState);
}
