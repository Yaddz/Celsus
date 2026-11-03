import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme/tokens';

export interface ScreenContainerProps {
  children?: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  themeMode?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  hasBottomDock?: boolean;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  header,
  footer,
  scroll = true,
  themeMode = 'dark',
  style,
  contentContainerStyle,
  testID = 'screen-container',
  hasBottomDock = false,
}) => {
  const isLight = themeMode === 'light';
  const insets = useSafeAreaInsets();
  const backgroundColor = isLight ? '#F4F1EA' : colors.voidFloor;

  const defaultBottomPadding = hasBottomDock
    ? Math.max(insets.bottom, 16) + 96
    : spacing.lg;

  return (
    <SafeAreaView
      testID={testID}
      style={[
        styles.safeArea,
        { backgroundColor },
        style,
      ]}
    >
      {/* Header Slot (renderizado fora do scroll) */}
      {header && <View style={styles.headerSlot}>{header}</View>}

      {/* Conteúdo Principal */}
      {scroll ? (
        <ScrollView
          testID="screen-container-scroll"
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: defaultBottomPadding },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          testID="screen-container-static-content"
          style={[
            styles.staticContent,
            { paddingBottom: defaultBottomPadding },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}

      {/* Footer Slot (renderizado abaixo do scroll, ex: FloatingBottomDock ou CTAs fixos) */}
      {footer && <View style={styles.footerSlot}>{footer}</View>}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerSlot: {
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md, // 16dp padronizado (Decisão Q4)
    paddingTop: spacing.xs,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.md, // 16dp padronizado (Decisão Q4)
    paddingTop: spacing.xs,
  },
  footerSlot: {
    width: '100%',
  },
});

export default ScreenContainer;
