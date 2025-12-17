declare module 'react-native-safe-area-context' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

  export type Edge = 'top' | 'bottom' | 'left' | 'right';

  export interface EdgeInsets {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }

  export interface SafeAreaViewProps extends ViewProps {
    edges?: Edge[];
  }

  export function useSafeAreaInsets(): EdgeInsets;

  export const SafeAreaProvider: React.FC<{ children?: React.ReactNode }>;
  export const SafeAreaView: React.ComponentType<SafeAreaViewProps>;
}
