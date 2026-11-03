import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from './XpMinimalHeader';
import { typography } from '../../theme/tokens';
import { PortfolioPalette, ThemeMode, PORTFOLIO_PALETTES, THEME_COLORS } from '../../theme/palettes';

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
  palette?: PortfolioPalette;
  themeMode?: ThemeMode;
  testID?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  variant = 'home',
  title,
  subtitle,
  userName = 'Pedro',
  userInitials = 'PL',
  isPrivacyModeEnabled = false,
  onAvatarPress,
  onGlobePress,
  onTogglePrivacy,
  onBack,
  palette = PORTFOLIO_PALETTES.classic,
  themeMode = 'dark',
  testID = 'app-header',
}) => {
  const isLight = themeMode === 'light';
  const textColor = isLight ? '#111315' : '#E6DECA';
  const buttonBg = isLight ? '#FFFFFF' : '#191B1D';
  const buttonBorder = isLight ? '#EAE4D7' : '#26292C';
  const iconColor = isLight ? '#111315' : '#D5CAA8';

  const handleGlobePress = () => {
    if (onGlobePress) {
      onGlobePress();
    } else {
      Alert.alert('Funcionalidade em desenvolvimento');
    }
  };

  if (variant === 'home') {
    return (
      <XpMinimalHeader
        testID={testID}
        userName={userName}
        userInitials={userInitials}
        isPrivacyModeEnabled={isPrivacyModeEnabled}
        onAvatarPress={onAvatarPress}
        onTogglePrivacy={onTogglePrivacy}
        onGlobePress={onGlobePress}
        palette={palette}
        themeMode={themeMode}
      />
    );
  }

  if (variant === 'back') {
    return (
      <XpMinimalHeader
        testID={testID}
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyModeEnabled}
        onTogglePrivacy={onTogglePrivacy}
        onGlobePress={onGlobePress}
        palette={palette}
        themeMode={themeMode}
      />
    );
  }

  // variant === 'title': título na esquerda (sem voltar, sem avatar) e ações na direita
  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.titleWrapper}>
        <Text style={[styles.titleText, { color: textColor }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitleText, { color: isLight ? '#6E6A63' : '#A09D96' }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.actionsRight}>
        {/* Botão de Olho (Privacidade) */}
        <TouchableOpacity
          testID="header-privacy-button"
          onPress={onTogglePrivacy}
          activeOpacity={0.7}
          style={[
            styles.circularButton,
            { backgroundColor: buttonBg, borderColor: buttonBorder, borderWidth: 1 },
          ]}
        >
          {isPrivacyModeEnabled ? (
            <MaterialIcons
              testID="privacy-icon-visibility-off"
              name="visibility-off"
              size={20}
              color={palette.cardBg}
            />
          ) : (
            <MaterialIcons
              testID="privacy-icon-visibility"
              name="visibility"
              size={20}
              color={iconColor}
            />
          )}
        </TouchableOpacity>

        {/* Botão Globo Placeholder */}
        <TouchableOpacity
          testID="header-globe-button"
          onPress={handleGlobePress}
          activeOpacity={0.7}
          style={[
            styles.circularButton,
            { backgroundColor: buttonBg, borderColor: buttonBorder, borderWidth: 1 },
          ]}
        >
          <MaterialIcons name="language" size={20} color={iconColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  titleWrapper: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  titleText: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitleText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  circularButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppHeader;
