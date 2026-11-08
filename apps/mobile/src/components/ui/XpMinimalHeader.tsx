import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PortfolioPalette, ThemeMode, PORTFOLIO_PALETTES, THEME_COLORS } from '../../theme/palettes';
import { typography } from '../../theme/tokens';
import { deriveInitials } from '../../domain/profile';

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
  /** Offset de rolagem do conteúdo; controla a opacidade do fade inferior. */
  scrollY?: Animated.Value;
  /** Botão extra à esquerda do olho (ex.: favoritar na ficha do ativo). */
  rightAccessory?: React.ReactNode;
  testID?: string;
  backTestID?: string;
}

/**
 * XpMinimalHeader: Header minimalista estilo XP para todas as telas.
 * - Esquerda: Botão Voltar (se onBack presente) OU Avatar com iniciais + Nome.
 * - Direita: Botão de Globo e Botão de Olho (Modo Privacidade).
 */
const XpMinimalHeaderBase: React.FC<XpMinimalHeaderProps> = ({
  userName = '',
  userInitials = '',
  isPrivacyModeEnabled = false,
  onAvatarPress,
  onGlobePress,
  onTogglePrivacy,
  onBack,
  title,
  subtitle,
  palette = PORTFOLIO_PALETTES.classic,
  themeMode = 'dark',
  scrollY,
  rightAccessory,
  testID = 'xp-minimal-header',
  backTestID = 'header-back-button',
}) => {
  const isLight = themeMode === 'light';
  const effectiveInitials =
    userInitials && userInitials !== 'U'
      ? userInitials
      : userName && userName !== 'Usuário'
      ? deriveInitials(userName)
      : userInitials || '';
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

  // Fade da borda inferior: 1 faixa por pixel na cor de fundo da tela, ancorado logo abaixo
  // da altura FIXA do header. Só aparece quando o conteúdo rola (scrollY > 0); em repouso fica
  // invisível e não cobre o topo da tela. Sem `scrollY` (telas que não rolam) permanece oculto.
  const fadeRgb = isLight ? '244,241,234' : '17,19,21';
  const fadeOpacity = scrollY
    ? scrollY.interpolate({ inputRange: [0, 16], outputRange: [0, 1], extrapolate: 'clamp' })
    : 0;

  return (
    <View testID={testID} style={styles.container}>
      <Animated.View
        testID="header-bottom-fade"
        pointerEvents="none"
        style={[styles.fadeStrip, { opacity: fadeOpacity }]}
      >
        {Array.from({ length: FADE_HEIGHT }).map((_, i) => {
          // 1 faixa por pixel, curva suave: sem degraus perceptíveis e sem dependência nativa extra.
          const t = (i + 0.5) / FADE_HEIGHT;
          return (
            <View
              key={i}
              style={{ height: 1, backgroundColor: `rgba(${fadeRgb},${Math.pow(1 - t, 2).toFixed(3)})` }}
            />
          );
        })}
      </Animated.View>
      {/* Canto Esquerdo: Botão Voltar OU Avatar do Usuário */}
      {onBack ? (
        <TouchableOpacity
          testID={backTestID}
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
          accessibilityRole="button"
          accessibilityLabel={`Abrir perfil de ${userName}`}
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
            {effectiveInitials ? (
              <Text
                style={[
                  styles.avatarText,
                  { color: isLight ? '#111315' : palette.accent },
                ]}
              >
                {effectiveInitials}
              </Text>
            ) : (
              <MaterialIcons name="person" size={20} color={isLight ? '#111315' : palette.accent} />
            )}
          </View>
          {/* Nome removido do header: fica só o avatar (o nome aparece no perfil). */}
        </TouchableOpacity>
      )}

      {/* Canto Direito: Ações (Olho à esquerda, Globo à direita) */}
      <View style={styles.actionsRight}>
        {rightAccessory}
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

/** Altura fixa do header: evita saltos de layout entre variantes (avatar, voltar+título+subtítulo). */
export const HEADER_HEIGHT = 64;
const FADE_HEIGHT = 10;

const styles = StyleSheet.create({
  fadeStrip: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    height: FADE_HEIGHT,
    zIndex: 5,
  },
  container: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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

/** Memoizado: só re-renderiza quando as props mudam (troca de carteira não refaz o resto da Home). */
export const XpMinimalHeader = React.memo(XpMinimalHeaderBase);
