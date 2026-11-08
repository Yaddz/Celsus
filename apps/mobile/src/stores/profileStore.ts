import { useEffect, useSyncExternalStore } from 'react';
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

  private loading: Promise<void> | null = null;

  /**
   * Carrega o perfil uma vez, com novas tentativas: na abertura o banco ainda pode estar ocupado
   * (portão, semente, migrações) e uma falha silenciosa deixava os headers com "U".
   */
  ensureLoaded(): Promise<void> {
    if (this.state.loaded) return Promise.resolve();
    if (!this.loading) {
      this.loading = (async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await this.load();
            return;
          } catch (e) {
            if (attempt === 4) console.warn('[perfil] não foi possível carregar o nome', e);
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
      })().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
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
  // Qualquer tela que mostra o nome garante que o perfil foi lido (no Jest fica a cargo de cada teste).
  useEffect(() => {
    if (!state.loaded && process.env.NODE_ENV !== 'test') profileStore.ensureLoaded().catch(() => {});
  }, [state.loaded]);
  return {
    ...state,
    setName: (name) => profileStore.setName(name),
    setOnboarded: (val) => profileStore.setOnboarded(val),
    refresh: () => profileStore.load(),
  };
}
