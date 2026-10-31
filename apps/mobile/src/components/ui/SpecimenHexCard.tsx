import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';

export interface SpecimenHexCardProps {
  title?: string;
  callout?: string;
  code?: string;
  value?: string;
  allocationText?: string;
  badge?: string;
  variant?: 'parchment' | 'dark';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const SpecimenHexCard: React.FC<SpecimenHexCardProps> = ({
  title,
  callout,
  code,
  value,
  allocationText,
  badge = 'INSIGHT',
  variant = 'parchment',
  onPress,
  style,
  testID,
}) => {
  const isParchment = variant === 'parchment';
  const bgColor = isParchment ? colors.tertiary : '#222528';
  const textColor = isParchment ? colors.neutral : colors.parchmentPale;
  const subtextColor = isParchment ? '#4C4635' : '#8A8A8E';
  const badgeBg = isParchment ? 'rgba(25, 27, 29, 0.12)' : colors.oxidizedSlag;
  const badgeTextColor = isParchment ? colors.neutral : colors.tertiary;

  const mainText = callout || title || 'Rebalanceie sua carteira com um novo aporte inteligente →';
  const secondaryText = allocationText || code || value;

  const content = (
    <View
      style={[
        styles.banner,
        { backgroundColor: bgColor },
        !isParchment && styles.darkBorder,
        style,
      ]}
      testID={testID}
    >
      <View style={styles.textContainer}>
        <Text style={[styles.mainText, { color: textColor }]}>
          {mainText}
        </Text>
        {secondaryText ? (
          <Text style={[styles.subText, { color: subtextColor }]}>
            {secondaryText}
          </Text>
        ) : null}
      </View>

      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.badgeText, { color: badgeTextColor }]}>
          {badge.toUpperCase()}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  darkBorder: {
    borderWidth: borders.hairline,
    borderColor: '#2D3033',
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  mainText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize + 1,
    fontWeight: '700',
    lineHeight: 18,
  },
  subText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borders.radiusSm,
    alignSelf: 'center',
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default SpecimenHexCard;
