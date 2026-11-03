import React from 'react';
import { View } from 'react-native';

export type AppHeaderVariant = 'home' | 'title' | 'back';

export interface AppHeaderProps {
  variant?: AppHeaderVariant;
  title?: string;
  subtitle?: string;
  userName?: string;
  userInitials?: string;
  isPrivacyModeEnabled?: boolean;
  onAvatarPress?: () => void;
  onGlobePress?: () => void;
  onTogglePrivacy?: () => void;
  onBack?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ testID = 'app-header' }) => {
  return <View testID={testID} />;
};

export default AppHeader;
