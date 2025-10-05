import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography, shadows } from "../theme";

interface ChatHeaderProps {
  onHistoryPress: () => void;
  onClearPress: () => void;
  hasContent: boolean;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  onHistoryPress,
  onClearPress,
  hasContent,
}) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onHistoryPress}
        style={styles.menuButton}
        accessibilityRole="button"
        accessibilityLabel="Open history"
      >
        <Ionicons name="list-outline" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Riflett</Text>
      </View>
      <TouchableOpacity
        onPress={onClearPress}
        style={[styles.clearButton, !hasContent && styles.clearButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        disabled={!hasContent}
      >
        <Ionicons
          name="create-outline"
          size={20}
          color={hasContent ? colors.textPrimary : colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: typography.heading.fontFamily,
    fontSize: 28,
    color: "rgba(255, 255, 255, 0.2)",
    letterSpacing: 3,
    fontWeight: "bold" as const,
    textAlign: "center",
  },
  buttonPlaceholder: {
    minWidth: 36,
    minHeight: 36,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    minWidth: 36,
    minHeight: 36,
    ...shadows.glass,
  },
  clearButtonDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    opacity: 0.5,
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 36,
    minHeight: 36,
    ...shadows.glass,
  },
});

export default ChatHeader;
