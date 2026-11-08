import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export interface CircleIconButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  themeMode?: 'dark' | 'light';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Botão redondo de 40 dp com o mesmo visual dos botões do XpMinimalHeader (voltar, olho, globo).
 * Usado onde a tela não tem header, como o Perfil.
 */
export const CircleIconButton: React.FC<CircleIconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  themeMode = 'dark',
  testID,
  style,
}) => {
  const isLight = themeMode === 'light';
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={8}
      style={[
        styles.button,
        { backgroundColor: isLight ? '#FFFFFF' : '#191B1D', borderColor: isLight ? '#EAE4D7' : '#26292C' },
        style,
      ]}
    >
      <MaterialIcons name={icon} size={20} color={isLight ? '#111315' : '#D5CAA8'} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
