import React, { memo, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import type { ChatMessage } from "../../types/chat";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Loading Dots Component
 * Animated dots that indicate the bot is thinking
 */
const LoadingDots = ({ style }: { style: any }) => {
  const [dot1] = useState(new Animated.Value(0));
  const [dot2] = useState(new Animated.Value(0));
  const [dot3] = useState(new Animated.Value(0));

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = createAnimation(dot1, 0);
    const anim2 = createAnimation(dot2, 150);
    const anim3 = createAnimation(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const getDotStyle = (animValue: Animated.Value) => ({
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        translateY: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Animated.Text style={[style, getDotStyle(dot1)]}>●</Animated.Text>
      <Animated.Text style={[style, getDotStyle(dot2)]}>●</Animated.Text>
      <Animated.Text style={[style, getDotStyle(dot3)]}>●</Animated.Text>
    </View>
  );
};

/**
 * Typewriter Text Component
 * Displays text character by character for a typing effect
 * Shows streaming text immediately when message is being sent
 */
const TypewriterText = ({
  text,
  style,
  speed = 15, // ms per character
  isStreaming = false, // True when actively receiving tokens
}: {
  text: string;
  style: any;
  speed?: number;
  isStreaming?: boolean;
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [targetText, setTargetText] = useState("");
  const previousLength = React.useRef(0);

  useEffect(() => {
    // If streaming, show text immediately as it arrives (no typewriter during stream)
    if (isStreaming) {
      setDisplayedText(text);
      setTargetText(text);
      previousLength.current = text.length;
      return;
    }

    // If not streaming and text just arrived (changed from empty or stopped growing),
    // animate from current position to full text
    if (!isStreaming && text && text !== targetText) {
      setTargetText(text);

      // Start from where we left off
      let currentIndex = displayedText.length;

      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(interval);
        }
      }, speed);

      return () => clearInterval(interval);
    }
  }, [text, speed, isStreaming, targetText, displayedText.length]);

  return <Text style={style}>{displayedText || text}</Text>;
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
                  message.status === "sending" && !message.content ? (
                    <LoadingDots
                      style={[
                        styles.content,
                        styles.botContent,
                        styles.loadingDots,
                      ]}
                    />
                  ) : (
                    <TypewriterText
                      text={message.content}
                      style={[styles.content, styles.botContent]}
                      speed={15}
                      isStreaming={message.status === "sending"}
                    />
                  )
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
    loadingDots: {
      fontSize: 10,
      paddingVertical: spacing.xs,
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
