import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [isFocused, setIsFocused] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    const start =
      secondPipe >= 0 ? secondPipe + 2 : firstPipe >= 0 ? firstPipe + 2 : 0;
    return { start: clamp(start), end: text.length };
  };

  const focusSegment = (segment: ScheduleSegment, textOverride?: string) => {
    // Don't manipulate cursor if user is actively typing
    if (isUserTyping) return;

    const targetText = textOverride ?? content;
    const range = getSegmentRange(targetText, segment);
    inputRef.current?.focus();
    // Use a longer delay to ensure the input is focused before setting selection
    setTimeout(() => {
      if (inputRef.current && !isUserTyping) {
        inputRef.current.setNativeProps({ selection: range });
      }
    }, 100);
  };

  const handleInsertScheduleTemplate = () => {
    onContentChange(scheduleTemplate);
    // Only focus the segment if the input is currently focused
    if (inputRef.current?.isFocused()) {
      setTimeout(() => focusSegment("place", scheduleTemplate), 50);
    }
  };

  const handleTextChange = (text: string) => {
    setIsUserTyping(true);
    onContentChange(text);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Reset typing state after a short delay
    typingTimeoutRef.current = setTimeout(() => setIsUserTyping(false), 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

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
      <View style={styles.inputRow}>
        <View
          style={[
            styles.inputWrapper,
            isFocused && styles.inputWrapperFocused,
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[styles.input, isFocused && styles.inputFocused]}
            value={content}
            onChangeText={handleTextChange}
            placeholder="Type your reflection..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        </View>
        <View
          style={[
            styles.sendButtonWrapper,
            !disableSend && styles.sendButtonWrapperActive,
          ]}
        >
          <TouchableOpacity
            onPress={onSend}
            style={[styles.sendButton, disableSend && styles.sendButtonDisabled]}
            disabled={disableSend}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={disableSend ? colors.textTertiary : colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: any, insets: any) =>
  StyleSheet.create({
    wrapper: {
      padding: spacing.lg,
      paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md), // Use safe area bottom inset with more padding
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
    inputWrapper: {
      flex: 1,
      marginRight: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.background,
    },
    inputWrapperFocused: {
      ...shadows.glow,
    },
    input: {
      flex: 1,
      minHeight: 52,
      maxHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md + 2,
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
    },
    sendButtonWrapper: {
      borderRadius: radii.md,
      backgroundColor: colors.background,
      ...shadows.glass,
    },
    sendButtonWrapperActive: {
      ...shadows.glow,
    },
    sendButton: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      width: 52,
      height: 52,
      borderWidth: 1,
      borderColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    sendButtonDisabled: {
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
  });

export default MessageInput;
