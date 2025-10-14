import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MAIN_HISTORY_STORAGE_KEY } from "../../constants/storage";
import type { MainHistoryRecord } from "../../types/history";
import type { Session } from "@supabase/supabase-js";

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  session: Session;
}

const ChatHistoryModal: React.FC<HistoryModalProps> = ({
  visible,
  onClose,
  session,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [historyRecords, setHistoryRecords] = useState<MainHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<MainHistoryRecord | null>(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const raw = await AsyncStorage.getItem(MAIN_HISTORY_STORAGE_KEY);
      const records: MainHistoryRecord[] = raw ? JSON.parse(raw) : [];
      setHistoryRecords(records);
    } catch (error) {
      console.error("Failed to load history", error);
      setHistoryError("Unable to load history right now.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadHistory();
      setSelectedConversation(null);
    }
  }, [visible]);

  const handleBack = () => {
    if (selectedConversation) {
      setSelectedConversation(null);
    } else {
      onClose();
    }
  };

  const renderConversationList = () => (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Main History</Text>
        <TouchableOpacity onPress={loadHistory} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {historyLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : historyError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{historyError}</Text>
        </View>
      ) : historyRecords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No archived conversations yet. Clear the chat to archive it.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {historyRecords.map((record) => (
            <TouchableOpacity
              key={record.id}
              style={styles.conversationCard}
              onPress={() => setSelectedConversation(record)}
            >
              <View style={styles.conversationContent}>
                <View style={styles.conversationHeader}>
                  <Text style={styles.conversationDate}>
                    {new Date(record.timestamp).toLocaleString()}
                  </Text>
                  <Text style={styles.conversationMeta}>
                    {record.messages.length} messages
                  </Text>
                </View>
                <Text style={styles.conversationPreview} numberOfLines={2}>
                  {record.messages[0]?.content || "No messages"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
                style={styles.chevronIcon}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );

  const renderConversationView = () => {
    if (!selectedConversation) return null;

    return (
      <>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Conversation</Text>
          <View style={styles.refreshButton} />
        </View>

        <ScrollView
          style={styles.chatScrollView}
          contentContainerStyle={styles.chatScrollContent}
          showsVerticalScrollIndicator={true}
        >
          {selectedConversation.messages.map((message, index) => {
            const isBot = message.kind === "bot";
            return (
              <View
                key={`${selectedConversation.id}-${index}`}
                style={[
                  styles.messageBubbleContainer,
                  isBot
                    ? styles.messageBubbleContainerBot
                    : styles.messageBubbleContainerUser,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isBot ? styles.botBubble : styles.userBubble,
                  ]}
                >
                  {isBot && (
                    <Text style={styles.messageAuthorLabel}>Riflett</Text>
                  )}
                  <Text
                    style={[
                      styles.messageBubbleText,
                      isBot
                        ? styles.messageBubbleTextBot
                        : styles.messageBubbleTextUser,
                    ]}
                  >
                    {message.content}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleBack}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          {selectedConversation
            ? renderConversationView()
            : renderConversationList()}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
    },
    title: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      fontSize: 20,
      color: colors.textPrimary,
    },
    refreshButton: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
    },
    errorText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.error,
      textAlign: "center",
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
    },
    emptyText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
    },
    conversationCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    conversationContent: {
      flex: 1,
      marginRight: spacing.md,
    },
    conversationHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    conversationDate: {
      fontFamily: typography.body.fontFamily,
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    conversationMeta: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    conversationPreview: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    chevronIcon: {
      flexShrink: 0,
    },
    chatScrollView: {
      flex: 1,
    },
    chatScrollContent: {
      padding: spacing.lg,
    },
    messageBubbleContainer: {
      marginBottom: spacing.md,
      flexDirection: "row",
    },
    messageBubbleContainerBot: {
      justifyContent: "flex-start",
    },
    messageBubbleContainerUser: {
      justifyContent: "flex-end",
    },
    messageBubble: {
      maxWidth: "80%",
      borderRadius: radii.lg,
      padding: spacing.md,
      ...shadows.glass,
    },
    botBubble: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: "flex-start",
    },
    userBubble: {
      backgroundColor: colors.accent,
      alignSelf: "flex-end",
    },
    messageAuthorLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      fontWeight: "600",
      marginBottom: spacing.xs,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textSecondary,
    },
    messageBubbleText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      lineHeight: 22,
    },
    messageBubbleTextBot: {
      color: colors.textPrimary,
    },
    messageBubbleTextUser: {
      color: "#FFFFFF",
    },
  });

export default ChatHistoryModal;
