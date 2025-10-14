import React, { useState, useMemo, useRef } from "react";
import {
  Platform,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

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
  const fallbackBottomInset = insets.bottom || (Platform.OS === "ios" ? 20 : 0);
  const styles = useMemo(
    () => createStyles(colors, fallbackBottomInset),
    [colors, fallbackBottomInset]
  );

  const inputRef = useRef<TextInput>(null);
  const disableSend = !content.trim();
  const scheduleTemplate = "Place | Time | Reason";
  const showScheduleShortcuts = content.includes("|");

  const handleInsertScheduleTemplate = () => {
    onContentChange(scheduleTemplate);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleSendPress = () => {
    if (disableSend) return;
    onSend();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

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
          <Text style={styles.scheduleHint}>
            Fill in: Place | Time | Reason
          </Text>
        )}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={content}
          onChangeText={onContentChange}
          placeholder="Type your reflection..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          onPress={handleSendPress}
          style={[styles.sendButton, disableSend && styles.sendButtonDisabled]}
          disabled={disableSend}
          activeOpacity={0.7}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={disableSend ? colors.textTertiary : colors.textPrimary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any, bottomInset: number) =>
  StyleSheet.create({
    wrapper: {
      padding: spacing.lg,
      paddingBottom: Math.max(spacing.xl, bottomInset + spacing.md),
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
    scheduleHint: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      color: colors.textTertiary,
      fontStyle: "italic",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    input: {
      flex: 1,
      minHeight: 52,
      maxHeight: 120,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 16,
      lineHeight: 22,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
      textAlignVertical: "top",
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
