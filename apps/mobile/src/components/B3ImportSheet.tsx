import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedModalSheet } from './ui/AnimatedModalSheet';
import { B3ImportScreen, ImportStep } from '../screens/B3ImportScreen';

export interface B3ImportSheetProps {
  visible: boolean;
  onClose: () => void;
  isLight?: boolean;
  initialPortfolioId?: string;
  onNavigateToPortfolio?: (portfolioId: string, options?: { openMetas?: boolean }) => void;
}

export function B3ImportSheet({
  visible,
  onClose,
  isLight = false,
  initialPortfolioId,
  onNavigateToPortfolio,
}: B3ImportSheetProps) {
  const [step, setStep] = useState<ImportStep>('pick');

  const isExpanded = step !== 'pick';
  const isDismissible = step !== 'importing';

  return (
    <AnimatedModalSheet
      visible={visible}
      onClose={onClose}
      themeMode={isLight ? 'light' : 'dark'}
      expanded={isExpanded}
      collapsedHeight={0.52}
      expandedHeight={1.0}
      fill={isExpanded}
      scrollable={false}
      dismissible={isDismissible}
      showHandle={!isExpanded}
      contentStyle={styles.content}
    >
      <View style={styles.container}>
        <B3ImportScreen
          embedded={true}
          onBack={onClose}
          isLight={isLight}
          initialPortfolioId={initialPortfolioId}
          onNavigateToPortfolio={onNavigateToPortfolio}
          onStepChange={setStep}
        />
      </View>
    </AnimatedModalSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    flex: 1,
  },
  container: {
    flex: 1,
  },
});
