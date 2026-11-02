import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity, Animated } from 'react-native';

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
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useRef(new Animated.Value(visible ? 0 : 400)).current;
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      translateY.setValue(400);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 160,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 400,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShouldRender(false);
      });
    }
  }, [visible]);

  const handleBackdropPress = () => {
    onClose();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 400,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShouldRender(false);
    });
  };

  if (!visible && !shouldRender) return null;

  return (
    <Modal visible={shouldRender} transparent animationType="none">
      <View testID={testID} style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity
            testID="animated-sheet-backdrop"
            activeOpacity={1}
            onPress={handleBackdropPress}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
        <Animated.View
          testID="animated-sheet-container"
          style={[styles.sheetContainer, { transform: [{ translateY }] }]}
        >
          {children}
        </Animated.View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
});
