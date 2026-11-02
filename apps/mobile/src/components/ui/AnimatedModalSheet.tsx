import React from 'react';
import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';

export interface AnimatedModalSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

export const AnimatedModalSheet: React.FC<AnimatedModalSheetProps> = ({
  visible,
  onClose,
  children,
  testID = 'animated-modal-sheet',
}) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <View testID={testID} style={styles.overlay}>
        <TouchableOpacity
          testID="animated-sheet-backdrop"
          activeOpacity={1}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View testID="animated-sheet-container" style={styles.sheetContainer}>
          {children}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
});
