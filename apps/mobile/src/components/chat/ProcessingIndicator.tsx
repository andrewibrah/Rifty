import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { getColors, spacing, typography } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface ProcessingStep {
  id: string;
  status: "pending" | "running" | "done" | "error";
}

interface ProcessingIndicatorProps {
  processingSteps?: ProcessingStep[];
  isVisible?: boolean;
}

const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({
  processingSteps,
  isVisible = false,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);

  if (!isVisible || !processingSteps?.length) {
    return null;
  }

  const getBubbleColor = (status: string) => {
    switch (status) {
      case "running":
        return colors.accent;
      case "done":
        return colors.success;
      case "error":
        return colors.error;
      default:
        return colors.border;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bubblesContainer}>
        {processingSteps.map((step, index) => (
          <View
            key={step.id}
            style={[
              styles.bubble,
              { backgroundColor: getBubbleColor(step.status) },
            ]}
          />
        ))}
      </View>
      <Text style={styles.label}>Processing...</Text>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    bubblesContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginRight: spacing.sm,
    },
    bubble: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    label: {
      ...typography.caption,
      fontSize: 12,
      color: colors.textSecondary,
    },
  });

export default ProcessingIndicator;
