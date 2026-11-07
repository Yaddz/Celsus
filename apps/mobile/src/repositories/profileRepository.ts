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
    return this.metaRepo.get(PROFILE_NAME_KEY);
  }

  async setProfileName(name: string): Promise<void> {
    await this.metaRepo.set(PROFILE_NAME_KEY, name.trim());
  }

  async isOnboarded(): Promise<boolean> {
    const raw = await this.metaRepo.get(PROFILE_ONBOARDED_KEY);
    return raw === 'true';
  }

  async setOnboarded(value: boolean): Promise<void> {
    await this.metaRepo.set(PROFILE_ONBOARDED_KEY, value ? 'true' : 'false');
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
