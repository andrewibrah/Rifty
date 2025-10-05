import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View
} from 'react-native';
import { colors, radii, spacing } from '../theme';

interface ChatHeaderProps {
  onHistoryPress: () => void;
}

const strokeOffsets = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
];

const OutlinedText: React.FC<{ text: string; style?: TextStyle }> = ({ text, style }) => (
  <View style={styles.outlineContainer}>
    {strokeOffsets.map(({ x, y }) => (
      <Text
        key={`${x}-${y}`}
        style={[styles.logoStroke, style, styles.strokeBase, { transform: [{ translateX: x }, { translateY: y }] }]}
      >
        {text}
      </Text>
    ))}
    <Text style={[styles.logoFill, style]}>{text}</Text>
  </View>
);

const ChatHeader: React.FC<ChatHeaderProps> = ({ onHistoryPress }) => {
  const flameTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flameTranslate, {
          toValue: -12,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(flameTranslate, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [flameTranslate]);

  const logo = useMemo(() => {
    const word = 'Reflectif';
    return (
      <OutlinedText
        text={word}
        style={styles.logoText}
      />
    );
  }, []);

  return (
    <View style={styles.header}>
      <View style={styles.logoRow}>
        {logo}
        <View style={styles.logoYWrapper}>
          <OutlinedText text="y" style={styles.logoText} />
          <Animated.View
            style={[
              styles.logoFlame,
              {
                transform: [{ translateX: flameTranslate }],
              },
            ]}
          />
        </View>
      </View>
      <TouchableOpacity
        onPress={onHistoryPress}
        style={styles.historyButton}
        accessibilityRole="button"
        accessibilityLabel="Open history"
      >
        <Text style={styles.historyIcon}>🔥</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.primaryRed,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    shadowColor: 'rgba(229,9,20,0.35)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  outlineContainer: {
    position: 'relative',
  },
  strokeBase: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  logoStroke: {
    color: colors.primaryRed,
  },
  logoFill: {
    color: colors.carbonBlack,
  },
  logoYWrapper: {
    marginLeft: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  logoFlame: {
    position: 'absolute',
    right: -24,
    top: -12,
    width: 42,
    height: 24,
    borderRadius: 24,
    backgroundColor: colors.emberOrange,
    opacity: 0.8,
    shadowColor: colors.emberOrange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  historyButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.carbonBlack,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.emberOrange,
  },
  historyIcon: {
    fontSize: 20,
    color: colors.ashWhite,
  },
});

export default ChatHeader;
