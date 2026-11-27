import React from 'react';
import { View } from 'react-native';

export interface PaperPortfolioScreenProps {
  onBack?: () => void;
  initialPortfolioId?: string;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onSwitchModule?: () => void;
  onPortfolioConverted?: (portfolioId: string) => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const PaperPortfolioScreen: React.FC<PaperPortfolioScreenProps> = ({
  testID = 'paper-portfolio-screen',
}) => {
  return <View testID={testID} />;
};

export default PaperPortfolioScreen;
