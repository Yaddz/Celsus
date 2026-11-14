import React from 'react';
import { View } from 'react-native';
import { XpMinimalHeader } from '../../components/ui';
import type { ThemeMode } from '../../theme/palettes';
import { getFinUiColors, sharedStyles } from './finTheme';

export type FinanceRoute = 'home' | 'entries' | 'recurrences' | 'subscriptions' | 'accounts' | 'categories';

export interface FinanceHomeScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  onNavigate?: (route: FinanceRoute) => void;
  referenceDateIso?: string;
  testID?: string;
}

export const FinanceHomeScreen: React.FC<FinanceHomeScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'finance-home-screen',
}) => {
  const c = getFinUiColors(themeMode);
  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Finanças"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
    </View>
  );
};
