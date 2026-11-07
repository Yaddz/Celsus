import React from 'react';
import { View, Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { profileStore, useProfile } from '../profileStore';
import { ProfileRepository } from '../../repositories/profileRepository';

describe('S42: ProfileStore Tests', () => {
  let mockRepo: jest.Mocked<ProfileRepository>;

  beforeEach(() => {
    mockRepo = {
      getProfileName: jest.fn().mockResolvedValue('Pedro Lima'),
      setProfileName: jest.fn().mockResolvedValue(undefined),
      isOnboarded: jest.fn().mockResolvedValue(true),
      setOnboarded: jest.fn().mockResolvedValue(undefined),
      getProfile: jest.fn().mockResolvedValue({
        name: 'Pedro Lima',
        initials: 'PL',
        onboarded: true,
      }),
    } as any;

    profileStore.setRepository(mockRepo);
    profileStore.reset();
  });

  it('S42-T30: should load profile and reactively update name and initials', async () => {
    let hookApi: any = null;

    const TestComponent = () => {
      const profile = useProfile();
      hookApi = profile;
      return (
        <View>
          <Text testID="loaded">{String(profile.loaded)}</Text>
          <Text testID="name">{profile.name}</Text>
          <Text testID="initials">{profile.initials}</Text>
          <Text testID="onboarded">{String(profile.onboarded)}</Text>
        </View>
      );
    };

    const { getByTestId } = await render(<TestComponent />);

    expect(getByTestId('loaded').props.children).toBe('false');

    await act(async () => {
      await profileStore.load();
    });

    expect(getByTestId('loaded').props.children).toBe('true');
    expect(getByTestId('name').props.children).toBe('Pedro Lima');
    expect(getByTestId('initials').props.children).toBe('PL');
    expect(getByTestId('onboarded').props.children).toBe('true');

    // Update name
    await act(async () => {
      await hookApi.setName('Ana Maria');
    });

    expect(mockRepo.setProfileName).toHaveBeenCalledWith('Ana Maria');
    expect(getByTestId('name').props.children).toBe('Ana Maria');
    expect(getByTestId('initials').props.children).toBe('AM');
  });
});
