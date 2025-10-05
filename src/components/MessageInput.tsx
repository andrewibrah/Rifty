import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { EntryType } from '../db';
import { colors, radii, spacing } from '../theme';

interface MessageInputProps {
  type: EntryType;
  content: string;
  onTypeChange: (type: EntryType) => void;
  onContentChange: (content: string) => void;
  onSend: () => void;
}

const TYPES: EntryType[] = ['journal', 'goal', 'schedule'];

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
              <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            isFocused && styles.inputFocused,
          ]}
          value={content}
          onChangeText={onContentChange}
          placeholder="Type your reflection..."
          placeholderTextColor="rgba(244,244,244,0.6)"
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
          <Text style={[styles.sendButtonText, disableSend && styles.sendButtonTextDisabled]}>
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
    backgroundColor: colors.primaryRed,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  typeButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.carbonBlack,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(244,244,244,0.25)',
  },
  typeButtonActive: {
    borderColor: colors.emberOrange,
    shadowColor: colors.emberOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  typeText: {
    color: 'rgba(244,244,244,0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  typeTextActive: {
    color: colors.ashWhite,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.carbonBlack,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    fontSize: 16,
    color: colors.ashWhite,
    borderWidth: 1,
    borderColor: 'rgba(244,244,244,0.25)',
  },
  inputFocused: {
    borderColor: colors.emberOrange,
    shadowColor: colors.primaryRed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  sendButton: {
    backgroundColor: colors.carbonBlack,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.emberOrange,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    borderColor: 'rgba(244,244,244,0.2)',
    backgroundColor: colors.smokeGrey,
  },
  sendButtonText: {
    color: colors.ashWhite,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sendButtonTextDisabled: {
    color: 'rgba(244,244,244,0.6)',
  },
});

export default MessageInput;
