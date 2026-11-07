import { appMetaRepository, AppMetaRepository } from './appMetaRepository';
import { deriveInitials } from '../domain/profile';

export interface UserProfile {
  name: string;
  initials: string;
  onboarded: boolean;
}

export const PROFILE_NAME_KEY = 'profile:name';
export const PROFILE_ONBOARDED_KEY = 'profile:onboarded:v1';

export class ProfileRepository {
  private metaRepo: AppMetaRepository;

  constructor(metaRepo: AppMetaRepository = appMetaRepository) {
    this.metaRepo = metaRepo;
  }

  async getProfileName(): Promise<string | null> {
    // Stub Fase A
    return null;
  }

  async setProfileName(name: string): Promise<void> {
    // Stub Fase A
  }

  async isOnboarded(): Promise<boolean> {
    // Stub Fase A
    return false;
  }

  async setOnboarded(value: boolean): Promise<void> {
    // Stub Fase A
  }

  async getProfile(): Promise<UserProfile> {
    const name = (await this.getProfileName()) ?? '';
    const onboarded = await this.isOnboarded();
    return {
      name,
      initials: deriveInitials(name),
      onboarded,
    };
  }
}

export const profileRepository = new ProfileRepository();
