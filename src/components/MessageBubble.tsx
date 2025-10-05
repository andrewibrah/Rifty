import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ChatMessage } from '../types/chat';
import { colors, radii, spacing } from '../theme';

interface MessageBubbleProps {
  message: ChatMessage;
  isPartOfGroup: boolean;
  showTimestamp: boolean;
  onRetry?: (messageId: string) => void;
}

const MessageBubble = memo(({ message, isPartOfGroup, showTimestamp, onRetry }: MessageBubbleProps) => {
  const isBot = message.kind === 'bot';
  const hasStatus = message.status && message.status !== 'sent';

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return '⏳';
      case 'failed':
        return '⚠️';
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (message.status) {
      case 'sending':
        return colors.emberOrange;
      case 'failed':
        return colors.primaryRed;
      default:
        return colors.ashWhite;
    }
  };

  return (
    <View
      style={[
        styles.container,
        isBot ? styles.botContainer : styles.userContainer,
        !isPartOfGroup && styles.firstInGroup,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isBot ? styles.botBubble : styles.userBubble,
          hasStatus && styles.bubbleWithStatus,
        ]}
      >
        {hasStatus && (
          <View style={styles.statusRow}>
            <TouchableOpacity
              onPress={() => message.status === 'failed' && onRetry?.(message.id)}
              style={styles.statusContainer}
            >
              <Text style={[styles.statusIcon, { color: getStatusColor() }]}>
                {getStatusIcon()}
              </Text>
              {message.status === 'failed' && (
                <Text style={[styles.retryText, { color: getStatusColor() }]}>Tap to retry</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        <Text
          style={[
            styles.content,
            isBot ? styles.botContent : styles.userContent,
          ]}
        >
          {message.content}
        </Text>
        {message.kind === 'entry' && (
          <Text style={styles.typeLabel}>{message.type.toUpperCase()}</Text>
        )}
      </View>
      {showTimestamp && (
        <Text style={styles.timestamp}>
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
    marginHorizontal: spacing.sm,
    alignItems: 'flex-end',
  },
  botContainer: {
    alignItems: 'flex-start',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  firstInGroup: {
    marginTop: spacing.md,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  bubbleWithStatus: {
    paddingTop: spacing.xs,
  },
  botBubble: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderBottomLeftRadius: radii.xs,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.45)',
  },
  userBubble: {
    backgroundColor: colors.smokeGrey,
    borderBottomRightRadius: radii.xs,
    borderWidth: 1,
    borderColor: 'rgba(244,244,244,0.08)',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  content: {
    fontSize: 16,
    lineHeight: 22,
  },
  botContent: {
    color: colors.ashWhite,
  },
  userContent: {
    color: colors.ashWhite,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.emberOrange,
    marginTop: spacing.xs,
    textAlign: 'right',
    letterSpacing: 1,
  },
  timestamp: {
    fontSize: 12,
    color: 'rgba(244,244,244,0.6)',
    marginTop: spacing.xs,
  },
});

export default MessageBubble;
