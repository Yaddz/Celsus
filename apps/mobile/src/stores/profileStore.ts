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
    this.listeners.forEach((l) => l(this.state));
  }

  async load(): Promise<void> {
    const profile = await this.repo.getProfile();
    this.state = {
      name: profile.name,
      initials: profile.initials,
      onboarded: profile.onboarded,
      loaded: true,
    };
    this.notify();
  }

  async setName(name: string): Promise<void> {
    const clean = name.trim();
    await this.repo.setProfileName(clean);
    this.state = {
      ...this.state,
      name: clean,
      initials: deriveInitials(clean),
    };
    this.notify();
  }

  async setOnboarded(onboarded: boolean): Promise<void> {
    await this.repo.setOnboarded(onboarded);
    this.state = {
      ...this.state,
      onboarded,
    };
    this.notify();
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
