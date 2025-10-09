import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getColors, radii, spacing, typography, shadows } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

interface ChatHeaderProps {
  onHistoryPress: () => void;
  onClearPress: () => void;
  onCalendarPress: () => void;
  onPersonalizationPress: () => void;
  hasContent: boolean;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  onHistoryPress,
  onClearPress,
  onCalendarPress,
  onPersonalizationPress,
  hasContent,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onHistoryPress}
        style={styles.menuButton}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Ionicons name="menu-outline" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>riflett</Text>
      </View>
      <View style={styles.rightActions}>
        <TouchableOpacity
          onPress={onCalendarPress}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Open schedule calendar"
        >
          <Ionicons
            name="calendar-outline"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onPersonalizationPress}
          style={[styles.iconButton, styles.iconButtonSpacing]}
          accessibilityRole="button"
          accessibilityLabel="Open personalization settings"
        >
          <Ionicons
            name="person-circle-outline"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClearPress}
          style={[styles.iconButton, styles.iconButtonSpacing]}
          accessibilityRole="button"
          accessibilityLabel="New chat"
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
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
      color: colors.textTertiary,
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
      minWidth: 36,
      minHeight: 36,
    },
    menuButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 36,
      minHeight: 36,
    },
    rightActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    },
    iconButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 36,
      minHeight: 36,
    },
    iconButtonSpacing: {
      marginLeft: spacing.sm,
    },
  });

export default ChatHeader;
