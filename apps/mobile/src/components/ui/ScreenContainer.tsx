import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';

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
  testID = 'screen-container',
}) => {
  return <View testID={testID}>{children}</View>;
};

export default ScreenContainer;
