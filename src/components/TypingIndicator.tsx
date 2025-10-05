import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '../theme';

interface TypingIndicatorProps {
  isVisible: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <View style={styles.typingIndicator}>
      <View style={styles.indicatorDot}>
        <ActivityIndicator size="small" color={colors.emberOrange} />
      </View>
      <Text style={styles.typingText}>Bot is igniting a response...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginLeft: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
  },
  indicatorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.carbonBlack,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  typingText: {
    marginLeft: spacing.xs,
    color: colors.ashWhite,
    fontSize: 14,
    letterSpacing: 0.5,
  },
});

export default TypingIndicator;
