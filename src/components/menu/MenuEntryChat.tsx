import React, { useCallback, useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import type { Annotation } from "../../types/annotations";
import type { RemoteJournalEntry, EntryType } from "../../services/data";
import { appendMessage } from "../../services/data";
import { supabase } from "../../lib/supabase";
import { generateAIResponse, formatAnnotationLabel } from "../../services/ai";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface MenuEntryChatProps {
  entry: RemoteJournalEntry;
  annotations: Annotation[];
  loading: boolean;
  error: string | null;
  onAnnotationsUpdate: (annotations: Annotation[]) => void;
  onAnnotationCountUpdate: (entryId: string, delta: number) => void;
  onErrorUpdate: (error: string | null) => void;
  onModeChange?: (mode: "note" | "ai") => void;
  onRefreshAnnotations?: () => void;
  onClearAIChat?: () => void;
}

type ComposerMode = "note" | "ai";

const MenuEntryChat: React.FC<MenuEntryChatProps> = ({
  entry,
  annotations,
  loading,
  error,
  onAnnotationsUpdate,
  onAnnotationCountUpdate,
  onErrorUpdate,
  onModeChange,
  onRefreshAnnotations,
  onClearAIChat,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [composerMode, setComposerMode] = useState<ComposerMode>("note");
  const [composerText, setComposerText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isWorkingWithAI, setIsWorkingWithAI] = useState(false);

  // Notify parent component when mode changes
  useEffect(() => {
    onModeChange?.(composerMode);
  }, [composerMode, onModeChange]);

  const handleAddNote = useCallback(async () => {
    if (!entry || !entry.id) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    setIsSavingNote(true);
    try {
      const saved = await appendMessage(entry.id, "user", trimmed, {
        channel: "note",
        messageKind: "note",
      });
      // Create annotation from saved message (simplified)
      const annotation: Annotation = {
        id: saved.id,
        entryId: saved.conversation_id,
        kind: "user",
        channel: "note",
        content: saved.content,
        created_at: saved.created_at,
      };

      onErrorUpdate(null);
      onAnnotationsUpdate([...annotations, annotation]);
      onAnnotationCountUpdate(entry.id, 1);
      setComposerText("");
    } catch (error) {
      console.error("Error saving note", error);
      onErrorUpdate("Unable to save note right now.");
    } finally {
      setIsSavingNote(false);
    }
  }, [
    composerText,
    entry,
    annotations,
    onAnnotationsUpdate,
    onAnnotationCountUpdate,
    onErrorUpdate,
  ]);

  const handleAskAI = useCallback(async () => {
    if (!entry || !entry.id) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    const entryId = entry.id;
    setIsWorkingWithAI(true);
    onErrorUpdate(null);

    try {
      const userMessage = await appendMessage(entryId, "user", trimmed, {
        channel: "ai",
        messageKind: "aiQuestion",
      });

      const userAnnotation: Annotation = {
        id: userMessage.id,
        entryId: userMessage.conversation_id,
        kind: "user",
        channel: "ai",
        content: userMessage.content,
        created_at: userMessage.created_at,
      };

      const updatedAnnotations = [...annotations, userAnnotation];
      onAnnotationsUpdate(updatedAnnotations);

      const aiResult = await generateAIResponse({
        entryContent: entry.content,
        annotations: updatedAnnotations,
        userMessage: trimmed,
        entryType: entry.type,
      });

      const botMessage = await appendMessage(
        entryId,
        "assistant",
        aiResult.reply,
        {
          channel: "ai",
          messageKind: "aiReply",
          learned: aiResult.learned,
          ethical: aiResult.ethical,
        }
      );

      const botAnnotation: Annotation = {
        id: botMessage.id,
        entryId: botMessage.conversation_id,
        kind: "bot",
        channel: "ai",
        content: botMessage.content,
        created_at: botMessage.created_at,
      };

      onAnnotationsUpdate([...updatedAnnotations, botAnnotation]);
      onErrorUpdate(null);
      setComposerText("");
    } catch (error) {
      console.error("Error requesting AI guidance", error);
      onErrorUpdate(
        error instanceof Error
          ? error.message
          : "Unable to contact AI right now."
      );
    } finally {
      setIsWorkingWithAI(false);
    }
  }, [
    annotations,
    composerText,
    entry,
    onAnnotationsUpdate,
    onAnnotationCountUpdate,
    onErrorUpdate,
  ]);

  const renderAnnotationItem = useCallback(({ item }: { item: Annotation }) => {
    const isUser = item.kind === "user";
    const isNote = item.channel === "note";
    const label = formatAnnotationLabel(item.channel);

    // Render notes as elegant journal entries
    if (isNote) {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.noteEntry,
            pressed && styles.noteEntryPressed,
          ]}
          onLongPress={() => {
            if (item.id) {
              handleDeleteNote(item.id);
            }
          }}
          delayLongPress={500}
        >
          <View style={styles.noteContent}>
            <Text style={styles.noteText}>{item.content}</Text>
            {item.created_at && (
              <Text style={styles.noteTimestamp}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        </Pressable>
      );
    }

    // Render AI chat as bubbles
    return (
      <View
        style={[
          styles.annotationBubbleRow,
          isUser ? styles.annotationRowUser : styles.annotationRowOther,
        ]}
      >
        <View
          style={[
            styles.annotationBubble,
            isUser ? styles.annotationBubbleUser : styles.annotationBubbleOther,
          ]}
        >
          <Text
            style={[
              styles.annotationLabel,
              isUser ? styles.annotationLabelUser : styles.annotationLabelOther,
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.annotationText,
              isUser ? styles.annotationTextUser : styles.annotationTextOther,
            ]}
          >
            {item.content}
          </Text>
          {item.created_at && (
            <Text
              style={[
                styles.annotationTimestamp,
                isUser
                  ? styles.annotationTimestampUser
                  : styles.annotationTimestampOther,
              ]}
            >
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          )}
        </View>
      </View>
    );
  }, []);

  const disableNoteSend = isSavingNote || !composerText.trim();
  const disableAISend = isWorkingWithAI || !composerText.trim();

  const handleDeleteNote = useCallback(
    async (annotationId: string) => {
      Alert.alert(
        "Delete Note",
        "This note will be permanently deleted. This action cannot be undone.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                // Delete from Supabase only - no local state manipulation
                const { error } = await supabase
                  .from("messages")
                  .delete()
                  .eq("id", annotationId);

                if (error) {
                  throw error;
                }

                // Update the note counter for deletion
                onAnnotationCountUpdate(entry.id, -1);

                // Refresh annotations from Supabase to get the updated state
                if (onRefreshAnnotations) {
                  onRefreshAnnotations();
                }
              } catch (error) {
                console.error("Error deleting note", error);
                onErrorUpdate("Unable to delete note right now.");
              }
            },
          },
        ]
      );
    },
    [
      annotations,
      entry.id,
      onAnnotationsUpdate,
      onAnnotationCountUpdate,
      onErrorUpdate,
      onRefreshAnnotations,
    ]
  );

  // Separate annotations by channel
  const noteAnnotations = annotations.filter(
    (annotation) => annotation.channel === "note"
  );
  const aiAnnotations = annotations.filter(
    (annotation) => annotation.channel === "ai"
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      enabled={true}
    >
      {/* Static Header - Entry Summary */}
      {entry && (
        <View style={styles.entrySummary}>
          <Text style={styles.entrySummaryContent}>{entry.content}</Text>
          {entry.created_at && (
            <Text style={styles.entrySummaryDate}>
              {new Date(entry.created_at).toLocaleString()}
            </Text>
          )}
        </View>
      )}

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={true}
        bounces={false}
        alwaysBounceVertical={false}
        scrollEnabled={true}
        removeClippedSubviews={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        maximumZoomScale={1}
        minimumZoomScale={1}
      >
        {loading && (
          <ActivityIndicator
            style={styles.loadingIndicator}
            color={colors.textPrimary}
          />
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Notes Section */}
        {composerMode === "note" && (
          <View style={styles.sectionContainer}>
            {!loading && noteAnnotations.length === 0 && !error && (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyState}>
                  No notes yet. Add your first note below.
                </Text>
                <Text style={styles.emptyStateHint}>
                  Long-press any note to delete it
                </Text>
              </View>
            )}
            {noteAnnotations.map((annotation) => (
              <View
                key={
                  annotation.id ||
                  `${annotation.entryId}-${annotation.created_at ?? ""}`
                }
              >
                {renderAnnotationItem({ item: annotation })}
              </View>
            ))}
          </View>
        )}

        {/* AI Chat Section */}
        {composerMode === "ai" && (
          <View style={styles.sectionContainer}>
            {!loading && aiAnnotations.length === 0 && !error && (
              <Text style={styles.emptyState}>
                No AI conversation yet. Ask a question below.
              </Text>
            )}
            {aiAnnotations.map((annotation) => (
              <View
                key={
                  annotation.id ||
                  `${annotation.entryId}-${annotation.created_at ?? ""}`
                }
              >
                {renderAnnotationItem({ item: annotation })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.noteInputRow}>
        <View style={styles.modeSwitcher}>
          <TouchableOpacity
            onPress={() => setComposerMode("note")}
            style={[
              styles.modeButton,
              composerMode === "note" && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                composerMode === "note" && styles.modeButtonTextActive,
              ]}
            >
              Note
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setComposerMode("ai")}
            style={[
              styles.modeButton,
              composerMode === "ai" && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                composerMode === "ai" && styles.modeButtonTextActive,
              ]}
            >
              AI
            </Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.noteInput}
          value={composerText}
          onChangeText={setComposerText}
          placeholder={
            composerMode === "ai"
              ? "Ask Riflett for insight..."
              : "Add an update..."
          }
          placeholderTextColor="rgba(244,244,244,0.6)"
          multiline
        />
        <TouchableOpacity
          style={[
            styles.noteSendButton,
            ((composerMode === "note" && disableNoteSend) ||
              (composerMode === "ai" && disableAISend)) &&
              styles.noteSendButtonDisabled,
          ]}
          onPress={composerMode === "note" ? handleAddNote : handleAskAI}
          disabled={composerMode === "note" ? disableNoteSend : disableAISend}
        >
          <Text
            style={[
              styles.noteSendButtonText,
              ((composerMode === "note" && disableNoteSend) ||
                (composerMode === "ai" && disableAISend)) &&
                styles.noteSendButtonTextDisabled,
            ]}
          >
            {composerMode === "ai"
              ? isWorkingWithAI
                ? "Contacting..."
                : "Ask AI"
              : isSavingNote
                ? "Saving"
                : "Send"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.md,
      flexGrow: 1,
    },
    sectionContainer: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      fontSize: 18,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    noteEntry: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      ...shadows.glass,
    },
    noteEntryPressed: {
      backgroundColor: colors.surfaceElevated,
      transform: [{ scale: 0.98 }],
    },
    noteContent: {
      padding: spacing.md,
    },
    noteText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    noteTimestamp: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "left",
    },
    deleteButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 10,
    },
    deleteButtonText: {
      fontFamily: typography.heading.fontFamily,
      fontWeight: typography.heading.fontWeight,
      fontSize: 18,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    entrySummary: {
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: spacing.md,
    },
    entrySummaryContent: {
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 18,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    entrySummaryDate: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 12,
      color: colors.textSecondary,
    },
    loadingIndicator: {
      marginTop: spacing.lg,
    },
    errorText: {
      paddingVertical: spacing.sm,
      color: colors.textPrimary,
    },
    emptyState: {
      paddingVertical: spacing.sm,
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 16,
      color: colors.textSecondary,
    },
    emptyStateContainer: {
      alignItems: "center",
    },
    emptyStateHint: {
      paddingVertical: spacing.xs,
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 12,
      color: colors.textTertiary,
      fontStyle: "italic",
    },
    annotationBubbleRow: {
      flexDirection: "row",
      marginBottom: spacing.md,
    },
    annotationRowUser: {
      justifyContent: "flex-end",
    },
    annotationRowOther: {
      justifyContent: "flex-start",
    },
    annotationBubble: {
      maxWidth: "80%",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
    },
    annotationBubbleUser: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.accent,
      ...shadows.glass,
    },
    annotationBubbleOther: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.glass,
    },
    annotationLabel: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 11,
      marginBottom: spacing.xs,
    },
    annotationLabelUser: {
      color: colors.textPrimary,
    },
    annotationLabelOther: {
      color: colors.textSecondary,
    },
    annotationText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 15,
    },
    annotationTextUser: {
      color: colors.textPrimary,
    },
    annotationTextOther: {
      color: colors.textPrimary,
    },
    annotationTimestamp: {
      marginTop: spacing.xs,
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 11,
      textAlign: "right",
    },
    annotationTimestampUser: {
      color: colors.textSecondary,
    },
    annotationTimestampOther: {
      color: colors.textSecondary,
    },
    noteInputRow: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
    },
    modeSwitcher: {
      flexDirection: "row",
      marginBottom: spacing.sm,
    },
    modeButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
      backgroundColor: colors.surface,
      ...shadows.glass,
    },
    modeButtonActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceElevated,
      ...shadows.glow,
    },
    modeButtonText: {
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      letterSpacing: typography.button.letterSpacing,
      fontSize: 12,
      color: colors.textSecondary,
    },
    modeButtonTextActive: {
      color: colors.textPrimary,
      fontWeight: "700" as const,
    },
    noteInput: {
      minHeight: 44,
      maxHeight: 120,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 15,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    noteSendButton: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: colors.accent,
      alignSelf: "flex-end",
      minHeight: 44,
      justifyContent: "center",
      ...shadows.glass,
    },
    noteSendButtonDisabled: {
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    noteSendButtonText: {
      fontFamily: typography.button.fontFamily,
      letterSpacing: typography.button.letterSpacing,
      fontSize: 15,
      fontWeight: "700" as const,
      color: colors.textPrimary,
    },
    noteSendButtonTextDisabled: {
      color: colors.textTertiary,
    },
  });

export default MenuEntryChat;
