import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  type FeedbackLabel,
  type FeedbackStatus,
} from "@/state/feedbackReducer";
import { useTheme } from "@/contexts/ThemeContext";
import { getColors, spacing, radii, typography } from "@/theme";

interface FeedbackControlsProps {
  label: FeedbackLabel | null;
  correction: string;
  tags: string[];
  status: FeedbackStatus;
  availableTags: string[];
  copy: {
    headline: string;
    helpful: string;
    neutral: string;
    unhelpful: string;
    correctionPlaceholder: string;
    tagsLabel: string;
    submit: string;
    submitted: string;
    queued: string;
    retrying: string;
  };
  errorMessage?: string | null;
  onSelect: (label: FeedbackLabel) => void;
  onCorrectionChange: (value: string) => void;
  onToggleTag: (tag: string) => void;
  onSubmit: () => void;
}

export function FeedbackControls({
  label,
  correction,
  tags,
  status,
  availableTags,
  copy,
  errorMessage,
  onSelect,
  onCorrectionChange,
  onToggleTag,
  onSubmit,
}: FeedbackControlsProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isBusy = status === "submitting" || status === "queued";
  const canSubmit = Boolean(label) && !isBusy;

  const statusMessage = (() => {
    if (status === "submitted") return copy.submitted;
    if (status === "queued") return copy.queued;
    if (status === "submitting") return copy.retrying;
    if (status === "error" && errorMessage) return errorMessage;
    return null;
  })();

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>{copy.headline}</Text>
      <View style={styles.row}>
        <FeedbackPill
          label={copy.helpful}
          icon="thumbs-up-outline"
          active={label === "helpful"}
          onPress={() => onSelect("helpful")}
        />
        <FeedbackPill
          label={copy.neutral}
          icon="remove-circle-outline"
          active={label === "neutral"}
          onPress={() => onSelect("neutral")}
        />
        <FeedbackPill
          label={copy.unhelpful}
          icon="thumbs-down-outline"
          active={label === "unhelpful"}
          onPress={() => onSelect("unhelpful")}
        />
      </View>

      {label && (
        <View style={styles.formSection}>
          <TextInput
            value={correction}
            onChangeText={onCorrectionChange}
            placeholder={copy.correctionPlaceholder}
            placeholderTextColor={colors.textTertiary}
            multiline
            style={styles.correctionInput}
            editable={!isBusy}
          />
          <Text style={styles.tagsLabel}>{copy.tagsLabel}</Text>
          <View style={styles.tagsRow}>
            {availableTags.map((tag) => {
              const active = tags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => onToggleTag(tag)}
                  style={({ pressed }) => [
                    styles.tagChip,
                    active && styles.tagChipActive,
                    pressed && !active && styles.tagChipPressed,
                  ]}
                  disabled={isBusy}
                >
                  <Text
                    style={[
                      styles.tagText,
                      active && styles.tagTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              (!canSubmit || isBusy) && styles.submitButtonDisabled,
              pressed && canSubmit && styles.submitButtonPressed,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.submitText}>{copy.submit}</Text>
            )}
          </Pressable>
        </View>
      )}

      {statusMessage && (
        <Text
          style={[
            styles.statusText,
            status === "error" && { color: colors.error },
          ]}
        >
          {statusMessage}
        </Text>
      )}
    </View>
  );
}

interface FeedbackPillProps {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  active: boolean;
  onPress: () => void;
}

function FeedbackPill({ label, icon, active, onPress }: FeedbackPillProps) {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && !active && styles.pillPressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? colors.background : colors.textSecondary}
      />
      <Text
        style={[styles.pillText, active && styles.pillTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headline: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    pill: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    pillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pillPressed: {
      backgroundColor: colors.surfaceGlass,
    },
    pillText: {
      ...typography.small,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    pillTextActive: {
      color: colors.background,
    },
    formSection: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    correctionInput: {
      minHeight: 68,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      textAlignVertical: "top",
    },
    tagsLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: "uppercase",
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    tagChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tagChipActive: {
      backgroundColor: `${colors.accent}22`,
      borderColor: colors.accent,
    },
    tagChipPressed: {
      backgroundColor: colors.surfaceGlass,
    },
    tagText: {
      ...typography.small,
      color: colors.textSecondary,
    },
    tagTextActive: {
      color: colors.accent,
      fontWeight: "600",
    },
    submitButton: {
      borderRadius: radii.lg,
      paddingVertical: spacing.sm,
      alignItems: "center",
      backgroundColor: colors.accent,
    },
    submitButtonDisabled: {
      backgroundColor: colors.surfaceGlass,
      borderWidth: 1,
      borderColor: colors.border,
    },
    submitButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    submitText: {
      ...typography.button,
      color: colors.background,
    },
    statusText: {
      ...typography.small,
      marginTop: spacing.sm,
      color: colors.textSecondary,
    },
  });

export default FeedbackControls;
