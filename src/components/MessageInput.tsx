import React, { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { getColors, radii, spacing, typography, shadows } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

interface MessageInputProps {
  content: string;
  onContentChange: (content: string) => void;
  onSend: () => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  content,
  onContentChange,
  onSend,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const disableSend = !content.trim();

  const scheduleTemplate = "Place | Time | Reason";

  type ScheduleSegment = "place" | "time" | "reason";

  const getSegmentRange = (text: string, segment: ScheduleSegment) => {
    const firstPipe = text.indexOf("|");
    const secondPipe = firstPipe >= 0 ? text.indexOf("|", firstPipe + 1) : -1;

    const clamp = (value: number) => Math.max(0, value);

    if (segment === "place") {
      const end = firstPipe > 0 ? firstPipe - 1 : text.length;
      return { start: 0, end: clamp(end) };
    }

    if (segment === "time") {
      const start = firstPipe >= 0 ? firstPipe + 2 : 0;
      const end = secondPipe > start ? secondPipe - 1 : text.length;
      return { start: clamp(start), end: clamp(end) };
    }

    const start = secondPipe >= 0 ? secondPipe + 2 : firstPipe >= 0 ? firstPipe + 2 : 0;
    return { start: clamp(start), end: text.length };
  };

  const focusSegment = (segment: ScheduleSegment, textOverride?: string) => {
    const targetText = textOverride ?? content;
    const range = getSegmentRange(targetText, segment);
    inputRef.current?.focus();
    requestAnimationFrame(() => {
      inputRef.current?.setNativeProps({ selection: range });
    });
  };

  const handleInsertScheduleTemplate = () => {
    onContentChange(scheduleTemplate);
    setTimeout(() => focusSegment("place", scheduleTemplate), 0);
  };

  const showScheduleShortcuts = content.includes("|");

  return (
    <View style={styles.wrapper}>
      <View style={styles.scheduleRow}>
        <TouchableOpacity
          onPress={handleInsertScheduleTemplate}
          style={styles.scheduleButton}
          accessibilityRole="button"
          accessibilityLabel="Insert schedule template"
        >
          <Text style={styles.scheduleButtonText}>+ Schedule</Text>
        </TouchableOpacity>
        {showScheduleShortcuts && (
          <View style={styles.segmentRow}>
            <TouchableOpacity
              onPress={() => focusSegment("place")}
              style={styles.segmentButton}
            >
              <Text style={styles.segmentButtonText}>Place</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => focusSegment("time")}
              style={[styles.segmentButton, styles.segmentButtonSpacing]}
            >
              <Text style={styles.segmentButtonText}>Time</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => focusSegment("reason")}
              style={[styles.segmentButton, styles.segmentButtonSpacing]}
            >
              <Text style={styles.segmentButtonText}>Reason</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text style={styles.helperText}>
        Entries are auto-classified into journals, goals, or schedules.
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={[styles.input, isFocused && styles.inputFocused]}
          value={content}
          onChangeText={onContentChange}
          placeholder="Type your reflection..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={500}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        <TouchableOpacity
          onPress={onSend}
          style={[styles.sendButton, disableSend && styles.sendButtonDisabled]}
          disabled={disableSend}
        >
          <Text
            style={[
              styles.sendButtonText,
              disableSend && styles.sendButtonTextDisabled,
            ]}
          >
            Send
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrapper: {
      padding: spacing.md,
      paddingBottom: spacing.lg,
      backgroundColor: colors.background,
    },
    scheduleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    scheduleButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scheduleButtonText: {
      fontFamily: typography.button.fontFamily,
      fontSize: 13,
      color: colors.accent,
      fontWeight: "600" as const,
    },
    segmentRow: {
      flexDirection: "row",
    },
    segmentButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    segmentButtonSpacing: {
      marginLeft: spacing.xs,
    },
    segmentButtonText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    helperText: {
      ...typography.caption,
      fontSize: 11,
      color: colors.textTertiary,
      marginBottom: spacing.sm,
      textAlign: "center",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginRight: spacing.sm,
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 15,
      lineHeight: 21,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputFocused: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceElevated,
      ...shadows.glow,
    },
    sendButton: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
      minHeight: 48,
      ...shadows.glow,
    },
    sendButtonDisabled: {
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    sendButtonText: {
      fontFamily: typography.button.fontFamily,
      letterSpacing: typography.button.letterSpacing,
      fontSize: 15,
      fontWeight: "700" as const,
      color: colors.textPrimary,
    },
    sendButtonTextDisabled: {
      color: colors.textTertiary,
    },
  });

export default MessageInput;
