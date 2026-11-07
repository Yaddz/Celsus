import { useSyncExternalStore } from 'react';
import { profileRepository, ProfileRepository } from '../repositories/profileRepository';
import { deriveInitials } from '../domain/profile';

export interface ProfileState {
  name: string;
  initials: string;
  onboarded: boolean;
  loaded: boolean;
}

class ProfileStore {
  private repo: ProfileRepository;
  private state: ProfileState = {
    name: '',
    initials: '',
    onboarded: false,
    loaded: false,
  };

  private listeners = new Set<(state: ProfileState) => void>();

  constructor(repo: ProfileRepository = profileRepository) {
    this.repo = repo;
  }

  setRepository(repo: ProfileRepository) {
    this.repo = repo;
  }

  getState(): ProfileState {
    return this.state;
  }

  subscribe = (listener: (state: ProfileState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    const cur = this.getState();
    this.listeners.forEach((l) => l(cur));
  }

  async load(): Promise<void> {
    // Stub Fase A
  }

  async setName(name: string): Promise<void> {
    // Stub Fase A
  }

  async setOnboarded(onboarded: boolean): Promise<void> {
    // Stub Fase A
  }

  reset() {
    this.state = {
      name: '',
      initials: '',
      onboarded: false,
      loaded: false,
    };
    this.notify();
  }
}

export const profileStore = new ProfileStore();

export function useProfile(): ProfileState & {
  setName: (name: string) => Promise<void>;
  setOnboarded: (onboarded: boolean) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const state = useSyncExternalStore(profileStore.subscribe, () => profileStore.getState());
  return {
    ...state,
    setName: (name) => profileStore.setName(name),
    setOnboarded: (val) => profileStore.setOnboarded(val),
    refresh: () => profileStore.load(),
  };
}
