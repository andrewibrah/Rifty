import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { getColors, spacing, radii, typography } from "@/theme";
import { useTheme } from "@/contexts/ThemeContext";
import type {
  GoalKey,
  PersonalizationMode,
} from "@/types/personalization";

interface GoalsStepProps {
  selectedGoals: GoalKey[];
  goalOptions: GoalKey[];
  extraGoal: string;
  // customGoals: string[];
  mode: PersonalizationMode;
  onGoalsChange: (goals: GoalKey[]) => void;
  onExtraGoalChange: (value: string) => void;
  // onCustomGoalsChange: (goals: string[]) => void;
}

const prettyGoal = (goal: GoalKey) => {
  // Handle custom goals (strings that aren't predefined)
  if (
    typeof goal === "string" &&
    ![
      "execution",
      "performance",
      "mindfulness",
      "learning",
      "relationships",
      "career",
      "creativity",
      "health",
    ].includes(goal)
  ) {
    return goal; // Return custom goal as-is
  }

  switch (goal) {
    case "execution":
      return "Execution";
    case "performance":
      return "Performance";
    case "mindfulness":
      return "Mindfulness";
    case "learning":
      return "Learning";
    case "relationships":
      return "Relationships";
    case "career":
      return "Career Growth";
    case "creativity":
      return "Creativity";
    case "health":
    default:
      return "Health & Energy";
  }
};

const GoalsStep: React.FC<GoalsStepProps> = ({
  selectedGoals,
  goalOptions,
  extraGoal,
  // customGoals,
  mode,
  onGoalsChange,
  onExtraGoalChange,
  // onCustomGoalsChange,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);
  const goalOptionsSet = useMemo(() => new Set(goalOptions), [goalOptions]);

  const toggleGoal = (goal: GoalKey) => {
    if (selectedGoals.includes(goal)) {
      onGoalsChange(selectedGoals.filter((item) => item !== goal));
    } else {
      if (selectedGoals.length >= 3) return;
      onGoalsChange([...selectedGoals, goal]);
    }
  };

  const addCustomGoal = () => {
    if (extraGoal.trim() && !selectedGoals.includes(extraGoal.trim())) {
      onGoalsChange([...selectedGoals, extraGoal.trim()]);
      onExtraGoalChange("");
    }
  };

  const removeCustomGoal = (goalToRemove: string) => {
    onGoalsChange(selectedGoals.filter((goal) => goal !== goalToRemove));
  };

  return (
    <View>
      <Text style={styles.heading}>Goals snapshot</Text>
      <Text style={styles.body}>
        Tag what success looks like right now. Riflett spots patterns across
        these themes.
      </Text>

      <View style={styles.chipGroup}>
        {goalOptions.map((goal) => {
          const active = selectedGoals.includes(goal);
          return (
            <TouchableOpacity
              key={goal}
              style={[
                styles.chip,
                active && styles.chipActive,
                selectedGoals.length >= 3 && !active && styles.chipDisabled,
              ]}
              onPress={() => toggleGoal(goal)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityHint="Select up to three goals"
              disabled={!active && selectedGoals.length >= 3}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {prettyGoal(goal)}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Display custom goals */}
        {selectedGoals
          .filter((goal) => !goalOptionsSet.has(goal))
          .map((goal, index) => (
            <View key={`custom-${goal}-${index}`} style={styles.customGoalChip}>
              <Text style={styles.customGoalText}>{prettyGoal(goal)}</Text>
              <TouchableOpacity
                onPress={() => removeCustomGoal(goal)}
                style={styles.removeButton}
                accessibilityLabel={`Remove ${goal}`}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
      </View>

      <View style={styles.extraCard}>
        <Text style={styles.label}>Add your own</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Optional focus (e.g. launch, parenting)"
            placeholderTextColor={colors.textTertiary}
            value={extraGoal}
            onChangeText={onExtraGoalChange}
            onSubmitEditing={addCustomGoal}
          />
          <TouchableOpacity
            style={[
              styles.addButton,
              !extraGoal.trim() && styles.addButtonDisabled,
            ]}
            onPress={addCustomGoal}
            disabled={!extraGoal.trim()}
          >
            <Text
              style={[
                styles.addButtonText,
                !extraGoal.trim() && styles.addButtonTextDisabled,
              ]}
            >
              Add
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode === "basic" && (
        <Text style={styles.helper}>
          In Basic mode, we only track these high-level tags. Switch to Full
          anytime in Settings → Personalization.
        </Text>
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    heading: {
      fontFamily: typography.title.fontFamily,
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    body: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    chipGroup: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: spacing.md,
      justifyContent: "space-between",
    },
    chip: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.background,
      width: "48%",
      alignItems: "center",
    },
    chipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceElevated,
    },
    chipDisabled: {
      opacity: 0.4,
    },
    chipLabel: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
    },
    chipLabelActive: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    extraCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      backgroundColor: colors.surface,
      marginTop: spacing.sm,
    },
    label: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: spacing.xs,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontFamily: typography.body.fontFamily,
      color: colors.textPrimary,
      fontSize: 15,
      backgroundColor: colors.background,
    },
    addButton: {
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minWidth: 60,
      alignItems: "center",
    },
    addButtonDisabled: {
      backgroundColor: colors.surface,
      opacity: 0.5,
    },
    addButtonText: {
      color: "#fff",
      fontFamily: typography.button.fontFamily,
      fontWeight: "600",
      fontSize: 14,
    },
    addButtonTextDisabled: {
      color: colors.textTertiary,
    },
    customGoalChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginRight: spacing.xs,
      marginBottom: spacing.xs,
    },
    customGoalText: {
      fontFamily: typography.body.fontFamily,
      color: "#fff",
      fontSize: 13,
      marginRight: spacing.xs,
      fontWeight: "500",
    },
    removeButton: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "rgba(255, 255, 255, 0.3)",
      alignItems: "center",
      justifyContent: "center",
    },
    removeButtonText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 14,
    },
    helper: {
      marginTop: spacing.md,
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
    },
  });

export default GoalsStep;
