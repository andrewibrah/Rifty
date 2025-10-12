import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Dimensions,
} from "react-native";
import { getColors, spacing, radii, typography } from "../../../theme";
import { useTheme } from "../../../contexts/ThemeContext";
import type {
  LanguageIntensity,
  PersonalizationMode,
  PersonalizationState,
} from "../../../types/personalization";

interface ToneStepProps {
  bluntness: number;
  languageIntensity: LanguageIntensity;
  loggingFormat: PersonalizationState["logging_format"];
  spiritualPrompts: boolean;
  mode: PersonalizationMode;
  onUpdate: (patch: Partial<PersonalizationState>) => void;
}

const intensityOptions: LanguageIntensity[] = ["soft", "neutral", "direct"];
const loggingOptions: PersonalizationState["logging_format"][] = [
  "freeform",
  "structured",
  "mixed",
];

const ToneStep: React.FC<ToneStepProps> = ({
  bluntness,
  languageIntensity,
  loggingFormat,
  spiritualPrompts,
  mode,
  onUpdate,
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

    const handlePress = (event: any) => {
      const { locationX } = event.nativeEvent;
      const newValue = Math.round((locationX / sliderWidth) * 10);
      const clampedValue = Math.max(1, Math.min(10, newValue));
      onValueChange(clampedValue);
    };

    const thumbPosition = ((value - 1) / 9) * (sliderWidth - thumbSize);

    const labelParts = label.split("\n");
    const mainLabel = labelParts[0];
    const subLabel = labelParts[1];

    return (
      <View style={styles.sliderBlock}>
        <View style={styles.sliderHeader}>
          <View style={styles.sliderLabelContainer}>
            <Text style={styles.sliderLabel}>{mainLabel}</Text>
            {subLabel && <Text style={styles.sliderSubLabel}>{subLabel}</Text>}
          </View>
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
                { width: `${((value - 1) / 9) * 100}%` },
              ]}
            />
            <View style={[styles.sliderThumb, { left: thumbPosition }]} />
          </TouchableOpacity>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderMinLabel}>1</Text>
            <Text style={styles.sliderMaxLabel}>10</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View>
      <Text style={styles.heading}>Tone & boundaries</Text>
      <Text style={styles.body}>
        Calibrate how warm, direct, or structured Riflett should be when it
        responds to your reflections.
      </Text>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.label}>Spiritual prompts</Text>
            <Text style={styles.helper}>
              Enable references to gratitude, meaning, or faith.
            </Text>
          </View>
          <Switch
            value={spiritualPrompts}
            onValueChange={(value) => onUpdate({ spiritual_prompts: value })}
          />
        </View>
      </View>

      <View style={styles.card}>
        <CustomSlider
          label="Bluntness level"
          value={bluntness}
          onValueChange={(value) => onUpdate({ bluntness: value })}
        />
        <Text style={styles.label}>(1 gentle – 10 straight to the point) </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Language intensity</Text>
        <View style={styles.rowWrap}>
          {intensityOptions.map((option) => {
            const active = option === languageIntensity;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onUpdate({ language_intensity: option })}
              >
                <Text
                  style={[styles.chipLabel, active && styles.chipLabelActive]}
                >
                  {option === "soft"
                    ? "Soft"
                    : option === "neutral"
                      ? "Neutral"
                      : "Direct"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Logging format</Text>
        <View style={styles.rowWrap}>
          {loggingOptions.map((option) => {
            const active = option === loggingFormat;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onUpdate({ logging_format: option })}
              >
                <Text
                  style={[styles.chipLabel, active && styles.chipLabelActive]}
                >
                  {option === "freeform"
                    ? "Freeform"
                    : option === "structured"
                      ? "Structured"
                      : "Mixed"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {mode === "basic" && (
          <Text style={styles.helper}>
            Basic mode keeps tone simpler but still honors these preferences.
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
      padding: spacing.md,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    toggleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    toggleCopy: {
      flex: 1,
      marginRight: spacing.sm,
    },
    label: {
      fontFamily: typography.title.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    helper: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: spacing.sm,
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
    sliderLabelContainer: {
      flex: 1,
    },
    sliderLabel: {
      fontFamily: typography.title.fontFamily,
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    sliderSubLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
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
    rowWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    chip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
    },
    chipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    chipLabel: {
      fontFamily: typography.body.fontFamily,
      color: colors.textSecondary,
    },
    chipLabelActive: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
  });

export default ToneStep;
