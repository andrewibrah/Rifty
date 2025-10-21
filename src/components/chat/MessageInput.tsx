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
  processingSteps?: Array<{
    id: string;
    status: "pending" | "running" | "done" | "error" | "skipped";
  }>;
}

const MessageInput: React.FC<MessageInputProps> = ({
  content,
  onContentChange,
  onSend,
  processingSteps,
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

  const handleSendPress = () => {
    if (disableSend) return;
    onSend();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

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
    <View style={styles.wrapper}>
      {processingSteps && processingSteps.length > 0 && (
        <View style={styles.processingRow}>
          <View style={styles.bubblesContainer}>
            {processingSteps.map((step, index) => (
              <View
                key={step.id}
                style={[
                  styles.processingBubble,
                  { backgroundColor: getBubbleColor(step.status) },
                ]}
              />
            ))}
          </View>
          <Text style={styles.processingLabel}>Processing...</Text>
        </View>
      )}
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
    processingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      marginBottom: spacing.sm,
      paddingVertical: spacing.xs,
    },
    bubblesContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginRight: spacing.sm,
    },
    processingBubble: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    processingLabel: {
      ...typography.caption,
      fontSize: 12,
      color: colors.textSecondary,
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
