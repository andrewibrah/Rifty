import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import type { ChatMessage } from "../../types/chat";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface MessageBubbleProps {
  message: ChatMessage;
  isPartOfGroup: boolean;
  showTimestamp: boolean;
  onRetry?: (messageId: string) => void;
  onLongPress?: (message: ChatMessage) => void;
}

const MessageBubble = memo(
  ({ message, isPartOfGroup, showTimestamp, onRetry, onLongPress }: MessageBubbleProps) => {
    const { themeMode } = useTheme();
    const colors = getColors(themeMode);
    const styles = useMemo(() => createStyles(colors), [colors]);
    const isBot = message.kind === "bot";
    const hasStatus = message.status && message.status !== "sent";

    const getStatusIcon = () => {
      switch (message.status) {
        case "failed":
          return "⚠️";
        default:
          return null;
      }
    };

    const getStatusColor = () => {
      switch (message.status) {
        case "failed":
          return colors.error;
        default:
          return colors.textPrimary;
      }
    };

    const handleLongPress =
      onLongPress && message.kind === "entry" && message.status === "sent"
        ? () => onLongPress(message)
        : undefined;

    return (
      <View
        style={[
          styles.container,
          isBot ? styles.botContainer : styles.userContainer,
          !isPartOfGroup && styles.firstInGroup,
        ]}
      >
        <Pressable
          style={[
            styles.bubbleWrapper,
            isBot ? styles.bubbleWrapperBot : styles.bubbleWrapperUser,
          ]}
          onLongPress={handleLongPress}
          delayLongPress={220}
        >
          <View style={styles.bubbleRow}>
            <View style={styles.bubbleShadow}>
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
                      onPress={() =>
                        message.status === "failed" && onRetry?.(message.id)
                      }
                      style={styles.statusContainer}
                    >
                      <Text
                        style={[styles.statusIcon, { color: getStatusColor() }]}
                      >
                        {getStatusIcon()}
                      </Text>
                      {message.status === "failed" && (
                        <Text
                          style={[
                            styles.retryText,
                            { color: getStatusColor() },
                          ]}
                        >
                          Tap to retry
                        </Text>
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
                {message.kind === "entry" && message.intentMeta && (
                  <View style={styles.intentContainer}>
                    <Text
                      style={styles.intentLabel}
                    >{`Intent: ${message.intentMeta.displayLabel}`}</Text>
                    <Text
                      style={styles.intentConfidence}
                    >{`${Math.round((message.intentMeta.confidence ?? 0) * 100)}%`}</Text>
                  </View>
                )}
                {message.kind === "entry" && (
                  <Text style={styles.typeLabel}>
                    {message.type.toUpperCase()}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </Pressable>
        {showTimestamp && (
          <Text style={styles.timestamp}>
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}
      </View>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginBottom: 10,
      marginHorizontal: spacing.sm,
      alignItems: "flex-end",
    },
    botContainer: {
      alignItems: "flex-start",
    },
    userContainer: {
      alignItems: "flex-end",
    },
    firstInGroup: {
      marginTop: spacing.md,
    },
    bubbleWrapper: {
      maxWidth: "80%",
    },
    bubbleWrapperBot: {
      alignSelf: "flex-start",
    },
    bubbleWrapperUser: {
      alignSelf: "flex-end",
    },
    bubbleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    bubbleShadow: {
      borderRadius: radii.md,
      backgroundColor: colors.background,
      ...shadows.glass,
    },
    bubble: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      borderRadius: radii.md,
      borderWidth: 1,
    },
    bubbleWithStatus: {
      paddingTop: spacing.xs,
    },
    botBubble: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.accent,
    },
    userBubble: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    statusContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    statusIcon: {
      fontSize: 14,
      marginRight: spacing.xs,
    },
    retryText: {
      ...typography.button,
      fontSize: 12,
      color: colors.textPrimary,
      textTransform: "uppercase",
    },
    content: {
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 15,
      lineHeight: 21,
      color: colors.textPrimary,
    },
    botContent: {
      color: colors.textPrimary,
    },
    userContent: {
      color: colors.textPrimary,
    },
    intentContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.xs,
    },
    intentLabel: {
      ...typography.caption,
      fontSize: 11,
      color: colors.accent,
      marginRight: spacing.xs,
    },
    intentConfidence: {
      ...typography.caption,
      fontSize: 11,
      color: colors.textSecondary,
    },
    typeLabel: {
      ...typography.caption,
      fontSize: 10,
      color: colors.accent,
      marginTop: spacing.xs,
      textAlign: "right",
    },
    timestamp: {
      ...typography.caption,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
  });

export default MessageBubble;
