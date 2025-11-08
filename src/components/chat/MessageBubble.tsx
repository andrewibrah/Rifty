import React, { memo, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { ChatMessage } from "../../types/chat";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Typewriter Text Component
 * Displays text character by character for a typing effect
 */
const TypewriterText = ({
  text,
  style,
  speed = 20, // ms per character
}: {
  text: string;
  style: any;
  speed?: number;
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // Reset on text change
    setDisplayedText("");
    setIsComplete(false);

    if (!text) {
      return;
    }

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <Text style={style}>{displayedText}</Text>;
};

interface MessageBubbleProps {
  message: ChatMessage;
  isPartOfGroup: boolean;
  showTimestamp: boolean;
  onRetry?: (messageId: string) => void;
  onLongPress?: (message: ChatMessage) => void;
}

const MessageBubble = memo(
  ({
    message,
    isPartOfGroup,
    showTimestamp,
    onRetry,
    onLongPress,
  }: MessageBubbleProps) => {
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

    return (
      <View
        style={[
          styles.container,
          isBot ? styles.botContainer : styles.userContainer,
          !isPartOfGroup && styles.firstInGroup,
        ]}
      >
        <TouchableOpacity
          style={[
            styles.bubbleWrapper,
            isBot ? styles.bubbleWrapperBot : styles.bubbleWrapperUser,
          ]}
          onLongPress={() => onLongPress?.(message)}
          activeOpacity={0.7}
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
                {isBot ? (
                  <TypewriterText
                    text={message.content}
                    style={[styles.content, styles.botContent]}
                    speed={15}
                  />
                ) : (
                  <Text style={[styles.content, styles.userContent]}>
                    {message.content}
                  </Text>
                )}
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
        </TouchableOpacity>
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
      marginVertical: spacing.sm,
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
      paddingVertical: spacing.sm,
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
