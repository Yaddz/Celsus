import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PortfolioPalette, ThemeMode, PORTFOLIO_PALETTES, THEME_COLORS } from '../../theme/palettes';
import { typography } from '../../theme/tokens';

export interface XpMinimalHeaderProps {
  userName?: string;
  userInitials?: string;
  isPrivacyModeEnabled?: boolean;
  onAvatarPress?: () => void;
  onGlobePress?: () => void;
  onTogglePrivacy?: () => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  palette?: PortfolioPalette;
  themeMode?: ThemeMode;
  testID?: string;
}

/**
 * XpMinimalHeader: Header minimalista estilo XP para todas as telas.
 * - Esquerda: Botão Voltar (se onBack presente) OU Avatar com iniciais + Nome.
 * - Direita: Botão de Globo e Botão de Olho (Modo Privacidade).
 */
export const XpMinimalHeader: React.FC<XpMinimalHeaderProps> = ({
  userName = 'Pedro',
  userInitials = 'PL',
  isPrivacyModeEnabled = false,
  onAvatarPress,
  onGlobePress,
  onTogglePrivacy,
  onBack,
  title,
  subtitle,
  palette = PORTFOLIO_PALETTES.classic,
  themeMode = 'dark',
  testID = 'xp-minimal-header',
}) => {
  const isLight = themeMode === 'light';
  const theme = THEME_COLORS[themeMode] || THEME_COLORS.dark;

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

  return (
    <View testID={testID} style={styles.container}>
      {/* Canto Esquerdo: Botão Voltar OU Avatar do Usuário */}
      {onBack ? (
        <TouchableOpacity
          testID="header-back-button"
          onPress={onBack}
          activeOpacity={0.7}
          style={styles.backButtonContainer}
        >
          <View
            style={[
              styles.circularButton,
              { backgroundColor: buttonBg, borderColor: buttonBorder, borderWidth: 1 },
            ]}
          >
            <MaterialIcons name="arrow-back" size={20} color={iconColor} />
          </View>
          {title ? (
            <View style={styles.titleWrapper}>
              <Text style={[styles.userNameText, { color: textColor }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[styles.subtitleText, { color: isLight ? '#6E6A63' : '#A09D96' }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          testID="header-avatar-button"
          onPress={onAvatarPress}
          activeOpacity={0.8}
          style={styles.avatarButton}
        >
          <View
            style={[
              styles.avatarCircle,
              {
                backgroundColor: isLight ? '#EAE4D7' : '#202224',
                borderColor: isLight ? '#D96628' : palette.accent,
              },
            ]}
          >
            <Text
              style={[
                styles.avatarText,
                { color: isLight ? '#111315' : palette.accent },
              ]}
            >
              {userInitials}
            </Text>
          </View>
          <Text style={[styles.userNameText, { color: textColor }]}>
            {userName}
          </Text>
        </TouchableOpacity>
      )}

      {/* Canto Direito: Ações (Olho à esquerda, Globo à direita) */}
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  avatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleWrapper: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  subtitleText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  userNameText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '600',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circularButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
