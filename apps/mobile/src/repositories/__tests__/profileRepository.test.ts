import { resetDatabase } from '../../db/client';
import { profileRepository, ProfileRepository } from '../profileRepository';
import { appMetaRepository } from '../appMetaRepository';

describe('S42: ProfileRepository Tests', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('S42-T28: saves and retrieves profile name in app_meta (profile:name)', async () => {
    expect(await profileRepository.getProfileName()).toBeNull();

    await profileRepository.setProfileName('Pedro Lima');
    expect(await profileRepository.getProfileName()).toBe('Pedro Lima');

    // Verify stored under exact key in app_meta
    const raw = await appMetaRepository.get('profile:name');
    expect(raw).toBe('Pedro Lima');
  });

  it('S42-T29: saves and retrieves onboarded flag in app_meta (profile:onboarded:v1)', async () => {
    expect(await profileRepository.isOnboarded()).toBe(false);

    await profileRepository.setOnboarded(true);
    expect(await profileRepository.isOnboarded()).toBe(true);

    const raw = await appMetaRepository.get('profile:onboarded:v1');
    expect(raw).toBe('true');

    await profileRepository.setOnboarded(false);
    expect(await profileRepository.isOnboarded()).toBe(false);
  });
});
