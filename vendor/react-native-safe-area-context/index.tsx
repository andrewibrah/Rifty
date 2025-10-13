import React, { createContext, useContext, useMemo } from 'react';
import {
  Dimensions,
  View,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export type EdgeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeAreaFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface SafeAreaViewProps extends ViewProps {
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}

export interface SafeAreaProviderProps {
  children?: React.ReactNode;
  initialMetrics?: {
    insets: EdgeInsets;
    frame?: SafeAreaFrame;
  };
}

const defaultInsets: EdgeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const defaultFrame: SafeAreaFrame = {
  x: 0,
  y: 0,
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height,
};

const SafeAreaInsetsContext = createContext<EdgeInsets>(defaultInsets);
const SafeAreaFrameContext = createContext<SafeAreaFrame>(defaultFrame);

export const SafeAreaConsumer = SafeAreaInsetsContext.Consumer;
export const SafeAreaFrameConsumer = SafeAreaFrameContext.Consumer;

export const initialWindowMetrics = {
  insets: defaultInsets,
  frame: defaultFrame,
};

export const SafeAreaProvider: React.FC<SafeAreaProviderProps> = ({
  children,
  initialMetrics,
}) => {
  const insets = initialMetrics?.insets ?? defaultInsets;
  const frame = initialMetrics?.frame ?? defaultFrame;

  return (
    <SafeAreaInsetsContext.Provider value={insets}>
      <SafeAreaFrameContext.Provider value={frame}>
        {children}
      </SafeAreaFrameContext.Provider>
    </SafeAreaInsetsContext.Provider>
  );
};

const EDGE_LIST: Edge[] = ['top', 'bottom', 'left', 'right'];

const SafeAreaBaseView: React.FC<SafeAreaViewProps> = ({
  children,
  edges = EDGE_LIST,
  style,
  ...rest
}) => {
  const insets = useSafeAreaInsets();

  const paddingStyle = useMemo(() => {
    return {
      paddingTop: edges.includes('top') ? insets.top : 0,
      paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
      paddingLeft: edges.includes('left') ? insets.left : 0,
      paddingRight: edges.includes('right') ? insets.right : 0,
    };
  }, [edges, insets.bottom, insets.left, insets.right, insets.top]);

  return (
    <View {...rest} style={[paddingStyle, style]}>
      {children}
    </View>
  );
};

export const SafeAreaView = SafeAreaBaseView;
export const SafeAreaProviderCompat = SafeAreaProvider;

export const SafeAreaInsetsContextProvider = SafeAreaInsetsContext.Provider;
export const SafeAreaFrameContextProvider = SafeAreaFrameContext.Provider;

export const useSafeAreaInsets = (): EdgeInsets => {
  return useContext(SafeAreaInsetsContext);
};

export const useSafeAreaFrame = (): SafeAreaFrame => {
  return useContext(SafeAreaFrameContext);
};

export const withSafeAreaInsets = <P extends object>(
  WrappedComponent: React.ComponentType<P & { insets: EdgeInsets }>,
) => {
  const WithInsets: React.FC<P> = (props) => {
    const insets = useSafeAreaInsets();
    return <WrappedComponent {...props} insets={insets} />;
  };
  WithInsets.displayName = `withSafeAreaInsets(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  return WithInsets;
};

export default {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
  SafeAreaConsumer,
};
