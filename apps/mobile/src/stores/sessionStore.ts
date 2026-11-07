import { useSyncExternalStore } from 'react';

export type SessionStatus = 'loading' | 'onboarding' | 'locked' | 'unlocked';

export interface SessionState {
  status: SessionStatus;
  backgroundedAt: number | null;
}

class SessionStore {
  private state: SessionState = {
    status: 'loading',
    backgroundedAt: null,
  };

  private listeners = new Set<(state: SessionState) => void>();

  getState(): SessionState {
    return this.state;
  }

  subscribe = (listener: (state: SessionState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    const cur = this.getState();
    this.listeners.forEach((l) => l(cur));
  }

  setStatus(status: SessionStatus) {
    this.state.status = status;
    this.notify();
  }

  lock() {
    this.setStatus('locked');
  }

  unlock() {
    this.setStatus('unlocked');
  }

  markBackgrounded(at: number) {
    this.state.backgroundedAt = at;
    this.notify();
  }

  shouldLockOnResume(now: number, autoLockSeconds: number, hasPin: boolean): boolean {
    // Stub Fase A
    return false;
  }
}

export const sessionStore = new SessionStore();

export function useSession(): SessionState & {
  lock: () => void;
  unlock: () => void;
  setStatus: (status: SessionStatus) => void;
  markBackgrounded: (at: number) => void;
  shouldLockOnResume: (now: number, autoLockSeconds: number, hasPin: boolean) => boolean;
} {
  const state = useSyncExternalStore(sessionStore.subscribe, () => sessionStore.getState());
  return {
    ...state,
    lock: () => sessionStore.lock(),
    unlock: () => sessionStore.unlock(),
    setStatus: (status) => sessionStore.setStatus(status),
    markBackgrounded: (at) => sessionStore.markBackgrounded(at),
    shouldLockOnResume: (now, autoLockSeconds, hasPin) => sessionStore.shouldLockOnResume(now, autoLockSeconds, hasPin),
  };
}
