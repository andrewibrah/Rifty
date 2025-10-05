import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors, spacing, radii, typography, shadows } from "../theme";

interface TypingIndicatorProps {
  isVisible: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.typingIndicator}>
        <ActivityIndicator
          size="small"
          color={colors.accent}
          style={styles.spinner}
        />
        <Text style={styles.typingText}>Rifty is responding...</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: "flex-start",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.glass,
    maxWidth: "85%",
  },
  spinner: {
    marginRight: spacing.md,
  },
  typingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: typography.body.fontFamily,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
});

export default TypingIndicator;
