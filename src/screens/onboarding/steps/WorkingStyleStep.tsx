import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { getColors, spacing, radii, typography } from "../../../theme";
import { useTheme } from "../../../contexts/ThemeContext";
import type {
  PersonalizationMode,
  PersonalizationState,
} from "../../../types/personalization";

interface WorkingStyleStepProps {
  learningStyle: PersonalizationState["learning_style"];
  sessionLength: PersonalizationState["session_length_minutes"];
  mode: PersonalizationMode;
  onLearningStyleChange: (
    style: PersonalizationState["learning_style"]
  ) => void;
  onSessionLengthChange: (
    value: PersonalizationState["session_length_minutes"]
  ) => void;
}

const sessionOptions: PersonalizationState["session_length_minutes"][] = [
  10, 25, 45,
];

const WorkingStyleStep: React.FC<WorkingStyleStepProps> = ({
  learningStyle,
  sessionLength,
  mode,
  onLearningStyleChange,
  onSessionLengthChange,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = createStyles(colors);

  const CustomSlider: React.FC<{
    label: string;
    value: number;
    onValueChange: (value: number) => void;
  }> = ({ label, value, onValueChange }) => {
    const [isDragging, setIsDragging] = useState(false);
    const screenWidth = Dimensions.get("window").width;
    const sliderWidth = screenWidth - spacing.lg * 2 - spacing.md * 2; // Account for padding
    const thumbSize = 24;
    const trackHeight = 8;
    const stepWidth = sliderWidth / 10; // 0-10 = 11 steps, but we use 10 segments

    const handlePress = (event: any) => {
      const { locationX } = event.nativeEvent;
      const newValue = Math.round((locationX / sliderWidth) * 10);
      const clampedValue = Math.max(0, Math.min(10, newValue));
      onValueChange(clampedValue);
    };

    const thumbPosition = (value / 10) * (sliderWidth - thumbSize);

    return (
      <View style={styles.sliderBlock}>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>{label}</Text>
          <Text style={styles.sliderValue}>{value}</Text>
        </View>
        <View style={styles.sliderContainer}>
          <TouchableOpacity
            style={styles.sliderTrack}
            onPress={handlePress}
            activeOpacity={1}
          >
            <View style={styles.sliderTrackBackground} />
            <View
              style={[
                styles.sliderTrackFill,
                { width: `${(value / 10) * 100}%` },
              ]}
            />
            <View style={[styles.sliderThumb, { left: thumbPosition }]} />
          </TouchableOpacity>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderMinLabel}>0</Text>
            <Text style={styles.sliderMaxLabel}>10</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View>
      <Text style={styles.heading}>Working style</Text>
      <Text style={styles.body}>
        Gauge how you process information. Riflett blends prompts to match your
        sensory cues and focus span.
      </Text>

      <View style={styles.card}>
        <CustomSlider
          label="Visual cues"
          value={learningStyle.visual}
          onValueChange={(value) =>
            onLearningStyleChange({ ...learningStyle, visual: value })
          }
        />
        <CustomSlider
          label="Auditory cues"
          value={learningStyle.auditory}
          onValueChange={(value) =>
            onLearningStyleChange({ ...learningStyle, auditory: value })
          }
        />
        <CustomSlider
          label="Kinesthetic cues"
          value={learningStyle.kinesthetic}
          onValueChange={(value) =>
            onLearningStyleChange({ ...learningStyle, kinesthetic: value })
          }
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Preferred session length</Text>
        <View style={styles.sessionRow}>
          {sessionOptions.map((option) => {
            const active = sessionLength === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.sessionChip, active && styles.sessionChipActive]}
                onPress={() => onSessionLengthChange(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.sessionText,
                    active && styles.sessionTextActive,
                  ]}
                >{`${option} min`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {mode === "basic" && (
          <Text style={styles.helper}>
            Basic mode stores only your top slider values.
          </Text>
        )}
      </View>
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
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    sliderBlock: {
      marginBottom: spacing.lg,
    },
    sliderHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    sliderLabel: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    sliderValue: {
      fontFamily: typography.title.fontFamily,
      fontSize: 18,
      color: colors.accent,
      fontWeight: "700",
    },
    sliderContainer: {
      position: "relative",
    },
    sliderTrack: {
      height: 40,
      justifyContent: "center",
      position: "relative",
    },
    sliderTrackBackground: {
      height: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sliderTrackFill: {
      position: "absolute",
      height: 8,
      backgroundColor: colors.accent,
      borderRadius: 4,
      top: 16,
    },
    sliderThumb: {
      position: "absolute",
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent,
      borderWidth: 3,
      borderColor: colors.background,
      top: 4,
      shadowColor: colors.textPrimary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    sliderLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.xs,
    },
    sliderMinLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textTertiary,
    },
    sliderMaxLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textTertiary,
    },
    label: {
      fontFamily: typography.title.fontFamily,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    sessionRow: {
      flexDirection: "row",
    },
    sessionChip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginRight: spacing.sm,
    },
    sessionChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    sessionText: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
    },
    sessionTextActive: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    helper: {
      marginTop: spacing.sm,
      fontFamily: typography.caption.fontFamily,
      color: colors.textTertiary,
      fontSize: 12,
    },
  });

export default WorkingStyleStep;
