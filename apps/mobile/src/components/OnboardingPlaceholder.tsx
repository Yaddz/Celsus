import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const OnboardingPlaceholder: React.FC = () => {
  return (
    <View testID="onboarding-placeholder" style={styles.container}>
      <Text style={styles.text}>Onboarding (Sprint 44)</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111315',
  },
  text: {
    color: '#E6DECA',
    fontSize: 16,
  },
});
