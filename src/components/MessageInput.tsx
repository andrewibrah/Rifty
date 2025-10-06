import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { EntryType } from "../services/data";
import { colors, radii, spacing, typography, shadows } from "../theme";

interface MessageInputProps {
  type: EntryType;
  content: string;
  onTypeChange: (type: EntryType) => void;
  onContentChange: (content: string) => void;
  onSend: () => void;
}

const TYPES: EntryType[] = ["journal", "goal", "schedule"];

const MessageInput: React.FC<MessageInputProps> = ({
  type,
  content,
  onTypeChange,
  onContentChange,
  onSend,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const disableSend = !content.trim();

  return (
    <View style={styles.wrapper}>
      <View style={styles.typeSelector}>
        {TYPES.map((t) => {
          const isActive = type === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => onTypeChange(t)}
              style={[styles.typeButton, isActive && styles.typeButtonActive]}
            >
              <Text
                style={[styles.typeText, isActive && styles.typeTextActive]}
              >
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.inputRow}>
        <TextInput
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

const styles = StyleSheet.create({
  wrapper: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
  },
  typeSelector: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    ...shadows.glass,
  },
  typeButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
    ...shadows.glow,
  },
  typeText: {
    fontFamily: typography.button.fontFamily,
    fontWeight: typography.button.fontWeight,
    letterSpacing: typography.button.letterSpacing,
    fontSize: 13,
    color: colors.textSecondary,
  },
  typeTextActive: {
    color: colors.textPrimary,
    fontWeight: "700" as const,
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
