import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { EntryType } from "../../services/data";
import { getColors, radii, spacing, typography } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface MenuCategoriesProps {
  onSelectType: (type: EntryType) => void;
}

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  goal: "Goals",
  journal: "Journals",
  schedule: "Schedules",
};

const getIconForType = (type: EntryType) => {
  switch (type) {
    case "journal":
      return "book-outline";
    case "goal":
      return "flag-outline";
    case "schedule":
      return "calendar-outline";
  }
};

const MenuCategories: React.FC<MenuCategoriesProps> = ({ onSelectType }) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const categoryButtons = useMemo(
    () =>
      (["goal", "journal", "schedule"] as EntryType[]).map((type) => (
        <TouchableOpacity
          key={type}
          style={styles.categoryButton}
          onPress={() => onSelectType(type)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons
              name={getIconForType(type)}
              size={22}
              color={colors.accent}
            />
          </View>
          <Text style={styles.categoryButtonText}>
            {ENTRY_TYPE_LABELS[type]}
          </Text>
        </TouchableOpacity>
      )),
    [onSelectType, colors, styles]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHint}>What would you like to review?</Text>
      {categoryButtons}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.lg,
    },
    sectionHint: {
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    categoryButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md + spacing.xs,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderLeftWidth: 2,
      borderLeftColor: "transparent",
    },
    categoryIconContainer: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      backgroundColor: "rgba(99, 102, 241, 0.1)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    categoryButtonText: {
      flex: 1,
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 16,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
  });

export default MenuCategories;
