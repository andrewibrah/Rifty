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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Annotation } from "../../types/annotations";
import type { RemoteJournalEntry, EntryType } from "../../services/data";
import { appendMessage, updateJournalEntry } from "../../services/data";
import { supabase } from "../../lib/supabase";
import { generateAIResponse, formatAnnotationLabel } from "../../services/ai";
import { predictIntent, isEntryChatAllowed } from "../../lib/intent";
import type {
  IntentPredictionResult,
  ProcessingStep,
} from "../../types/intent";
import type { ProcessingStepId } from "../../types/intent";
import { getColors, radii, spacing, typography, shadows } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";
import {
  createAtomicMoment,
  type AtomicMomentRecord,
} from "../../services/atomicMoments";

interface MenuEntryChatProps {
  entry: RemoteJournalEntry;
  annotations: Annotation[];
  loading: boolean;
  error: string | null;
  summary?: string | null;
  emotion?: string | null;
  moments?: AtomicMomentRecord[];
  onAnnotationsUpdate: (annotations: Annotation[]) => void;
  onAnnotationCountUpdate: (entryId: string, delta: number) => void;
  onErrorUpdate: (error: string | null) => void;
  onModeChange?: (mode: "note" | "ai") => void;
  onRefreshAnnotations?: () => void;
  onClearAIChat?: () => void;
}

type ComposerMode = "note" | "ai";

const createProcessingTimeline = (): ProcessingStep[] => [
  { id: "ml_detection", label: "ML prediction", status: "pending" },
  { id: "knowledge_search", label: "Knowledge base", status: "pending" },
  { id: "openai_request", label: "OpenAI request", status: "pending" },
  { id: "openai_response", label: "OpenAI received", status: "pending" },
];

const MOOD_OPTIONS = [
  "Centered",
  "Calm",
  "Optimistic",
  "Grateful",
  "Productive",
  "Anxious",
  "Overwhelmed",
  "Drained",
  "Reflective",
];

const FEELING_OPTIONS = [
  "Inspired",
  "Stressed",
  "Curious",
  "Connected",
  "Lonely",
  "Proud",
  "Frustrated",
  "Hopeful",
  "Tired",
  "Motivated",
];

const updateTimelineStep = (
  timeline: ProcessingStep[],
  stepId: ProcessingStepId,
  status: ProcessingStep["status"],
  detail?: string
): ProcessingStep[] =>
  timeline.map((step) => {
    if (step.id !== stepId) {
      return step;
    }
    const next: ProcessingStep = {
      ...step,
      status,
      timestamp: new Date().toISOString(),
    };
    if (detail !== undefined) {
      next.detail = detail;
    } else {
      delete next.detail;
    }
    return next;
  });

const MenuEntryChat: React.FC<MenuEntryChatProps> = ({
  entry,
  annotations,
  loading,
  error,
  summary,
  emotion,
  moments = [],
  onAnnotationsUpdate,
  onAnnotationCountUpdate,
  onErrorUpdate,
  onModeChange,
  onRefreshAnnotations,
  onClearAIChat,
}) => {
  const { themeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [composerMode, setComposerMode] = useState<ComposerMode>("note");
  const [composerText, setComposerText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isWorkingWithAI, setIsWorkingWithAI] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [predictedIntent, setPredictedIntent] =
    useState<IntentPredictionResult | null>(null);

  // Notify parent component when mode changes
  useEffect(() => {
    onModeChange?.(composerMode);
    if (composerMode === "note") {
      setProcessingSteps([]);
      setPredictedIntent(null);
    }
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

  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedFeelings, setSelectedFeelings] = useState<string[]>([]);

  useEffect(() => {
    setSelectedMood(entry.mood ?? null);
    setSelectedFeelings(entry.feeling_tags ?? []);
  }, [entry.id, entry.mood, entry.feeling_tags]);

  const handleMoodSelect = useCallback(
    async (nextMood: string) => {
      setSelectedMood(nextMood);
      try {
        await updateJournalEntry(entry.id, { mood: nextMood });
      } catch (error) {
        console.error("Failed to update mood", error);
        onErrorUpdate("Unable to update mood right now.");
      }
    },
    [entry.id, onErrorUpdate]
  );

  const handleToggleFeeling = useCallback(
    async (feeling: string) => {
      setSelectedFeelings((prev) => {
        const exists = prev.includes(feeling);
        const next = exists ? prev.filter((item) => item !== feeling) : [...prev, feeling];
        updateJournalEntry(entry.id, { feeling_tags: next }).catch((error) => {
          console.error("Failed to update feelings", error);
          onErrorUpdate("Unable to update feelings right now.");
        });
        return next;
      });
    },
    [entry.id, onErrorUpdate]
  );

  const handleAskAI = useCallback(async () => {
    if (!entry || !entry.id) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    const entryId = entry.id;
    setIsWorkingWithAI(true);
    onErrorUpdate(null);

    let timeline = createProcessingTimeline();
    setProcessingSteps(timeline);

    const setTimeline = (
      stepId: ProcessingStepId,
      status: ProcessingStep["status"],
      detail?: string
    ) => {
      timeline = updateTimelineStep(timeline, stepId, status, detail);
      setProcessingSteps(timeline);
    };

    try {
      setTimeline("ml_detection", "running", "Analyzing");
      const prediction = await predictIntent(trimmed);
      setPredictedIntent(prediction);

      setTimeline(
        "ml_detection",
        "done",
        `${prediction.rawLabel} ${(prediction.confidence * 100).toFixed(1)}%`
      );

      if (!isEntryChatAllowed(prediction.id)) {
        setTimeline("knowledge_search", "skipped", "Redirect required");
        setTimeline("openai_request", "skipped", "Use main chat");
        setTimeline("openai_response", "skipped", "Intent restricted");
        onErrorUpdate(
          "This intent is managed from Main Chat. Switch surfaces to continue."
        );
        Alert.alert(
          "Open Main Chat",
          "This type of request is routed through the main chat so Riflett can manage linked data."
        );
        return;
      }

      setTimeline("knowledge_search", "done", "Entry context ready");

      const userMessage = await appendMessage(entryId, "user", trimmed, {
        channel: "ai",
        messageKind: "aiQuestion",
        intent: {
          id: prediction.id,
          label: prediction.label,
          rawLabel: prediction.rawLabel,
          confidence: prediction.confidence,
          subsystem: prediction.subsystem,
        },
        processingTimeline: timeline,
      });

      const userAnnotation: Annotation = {
        id: userMessage.id,
        entryId: userMessage.conversation_id,
        kind: "user",
        channel: "ai",
        content: userMessage.content,
        created_at: userMessage.created_at,
        metadata: {
          intent: {
            id: prediction.id,
            label: prediction.label,
            confidence: prediction.confidence,
            subsystem: prediction.subsystem,
          },
          processingTimeline: timeline,
        },
      };

      const updatedAnnotations = [...annotations, userAnnotation];
      onAnnotationsUpdate(updatedAnnotations);

      setTimeline("openai_request", "running", "Sending prompt");

      const aiResult = await generateAIResponse({
        entryContent: entry.content,
        annotations: updatedAnnotations,
        userMessage: trimmed,
        entryType: entry.type,
        intentContext: {
          id: prediction.id,
          label: prediction.label,
          confidence: prediction.confidence,
          subsystem: prediction.subsystem,
        },
      });

      setTimeline("openai_request", "done", "Prompt dispatched");
      setTimeline("openai_response", "done", "Response captured");

      const botMessage = await appendMessage(
        entryId,
        "assistant",
        aiResult.reply,
        {
          channel: "ai",
          messageKind: "aiReply",
          learned: aiResult.learned,
          ethical: aiResult.ethical,
          intent: {
            id: prediction.id,
            label: prediction.label,
            rawLabel: prediction.rawLabel,
            confidence: prediction.confidence,
            subsystem: prediction.subsystem,
          },
          processingTimeline: timeline,
        }
      );

      const botAnnotation: Annotation = {
        id: botMessage.id,
        entryId: botMessage.conversation_id,
        kind: "bot",
        channel: "ai",
        content: botMessage.content,
        created_at: botMessage.created_at,
        metadata: {
          learned: aiResult.learned,
          ethical: aiResult.ethical,
          intent: {
            id: prediction.id,
            label: prediction.label,
            confidence: prediction.confidence,
          },
          processingTimeline: timeline,
        },
      };

      onAnnotationsUpdate([...updatedAnnotations, botAnnotation]);
      onErrorUpdate(null);
      setComposerText("");
    } catch (error) {
      console.error("Error requesting AI guidance", error);
      setTimeline(
        "openai_response",
        "error",
        error instanceof Error ? error.message : "Unable to contact AI"
      );
      onErrorUpdate(
        error instanceof Error
          ? error.message
          : "Unable to contact AI right now."
      );
    } finally {
      setIsWorkingWithAI(false);
    }
  }, [annotations, composerText, entry, onAnnotationsUpdate, onErrorUpdate]);

  const handleSaveAtomicMoment = useCallback(
    async (annotation: Annotation) => {
      if (!entry || !entry.id) return;
      try {
        const moment = await createAtomicMoment({
          entryId: entry.id,
          messageId: annotation.id ?? null,
          content: annotation.content,
          tags: ["manual"],
          importanceScore: 6,
        });

        await updateJournalEntry(entry.id, {
          linked_moments: [
            ...(entry.linked_moments ?? []),
            moment.id,
          ],
        });

        if (onRefreshAnnotations) {
          await onRefreshAnnotations();
        }
        Alert.alert("Saved", "Added to Atomic Moments.");
      } catch (error) {
        console.error("Failed to save atomic moment", error);
        Alert.alert("Error", "Unable to save atomic moment right now.");
      }
    },
    [entry, onRefreshAnnotations]
  );

  const renderAnnotationItem = useCallback(({ item }: { item: Annotation }) => {
    const isUser = item.kind === "user";
    const isNote = item.channel === "note";
    const label = formatAnnotationLabel(item.channel);

    // Render notes as elegant journal entries
    if (isNote) {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.noteEntryWrapper,
            pressed && styles.noteEntryWrapperPressed,
          ]}
          onLongPress={() => {
            if (item.id) {
              handleDeleteNote(item.id);
            }
          }}
          delayLongPress={500}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.noteEntryInner,
                pressed && styles.noteEntryInnerPressed,
              ]}
            >
              <View style={styles.noteContent}>
                <Text style={styles.noteText}>{item.content}</Text>
                {item.created_at && (
                  <Text style={styles.noteTimestamp}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          )}
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
            styles.annotationBubbleWrapper,
            isUser
              ? styles.annotationBubbleWrapperUser
              : styles.annotationBubbleWrapperOther,
          ]}
        >
          <View
            style={[
              styles.annotationBubble,
              isUser
                ? styles.annotationBubbleUser
                : styles.annotationBubbleOther,
            ]}
          >
            <Text
              style={[
                styles.annotationLabel,
                isUser
                  ? styles.annotationLabelUser
                  : styles.annotationLabelOther,
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
            {isUser && (
              <View style={styles.annotationActions}>
                <TouchableOpacity
                  onPress={() => handleSaveAtomicMoment(item)}
                  style={styles.atomicMomentButton}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color={colors.accent}
                  />
                  <Text style={styles.atomicMomentButtonText}>Save Moment</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }, [colors.accent, handleSaveAtomicMoment]);

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
          {summary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Highlights</Text>
              <Text style={styles.summaryBody}>{summary}</Text>
              {emotion && (
                <Text style={styles.summaryFooter}>{`Emotion: ${emotion}`}</Text>
              )}
            </View>
          ) : null}
          {entry.type === "journal" && (
            <>
              <View style={styles.moodContainer}>
                <Text style={styles.sectionLabel}>Mood</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.moodScroll}
                >
                  {MOOD_OPTIONS.map((mood) => {
                    const active = selectedMood === mood;
                    return (
                      <TouchableOpacity
                        key={mood}
                        style={[
                          styles.moodChip,
                          active && styles.moodChipActive,
                        ]}
                        onPress={() => handleMoodSelect(mood)}
                      >
                        <Text
                          style={[
                            styles.moodChipText,
                            active && styles.moodChipTextActive,
                          ]}
                        >
                          {mood}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.feelingsContainer}>
                <Text style={styles.sectionLabel}>Feelings</Text>
                <View style={styles.feelingsWrap}>
                  {FEELING_OPTIONS.map((feeling) => {
                    const active = selectedFeelings.includes(feeling);
                    return (
                      <TouchableOpacity
                        key={feeling}
                        style={[
                          styles.feelingChip,
                          active && styles.feelingChipActive,
                        ]}
                        onPress={() => handleToggleFeeling(feeling)}
                      >
                        <Text
                          style={[
                            styles.feelingChipText,
                            active && styles.feelingChipTextActive,
                          ]}
                        >
                          {feeling}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}
          {moments.length > 0 && (
            <View style={styles.momentsContainer}>
              <Text style={styles.sectionLabel}>Atomic Moments</Text>
              {moments.map((moment) => (
                <View key={moment.id} style={styles.momentCard}>
                  <View style={styles.momentHeader}>
                    <Ionicons
                      name="sparkles-outline"
                      size={16}
                      color={colors.accent}
                    />
                    <Text style={styles.momentScore}>{`Importance ${moment.importance_score}/10`}</Text>
                  </View>
                  <Text style={styles.momentContent}>{moment.content}</Text>
                  {moment.tags?.length ? (
                    <View style={styles.momentTags}>
                      {moment.tags.map((tag) => (
                        <View key={tag} style={styles.momentTagChip}>
                          <Text style={styles.momentTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
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
          <Pressable
            onPress={() => setComposerMode("note")}
            style={({ pressed }) => [
              styles.modeButtonWrapper,
              composerMode === "note" && styles.modeButtonWrapperActive,
              pressed && styles.modeButtonWrapperPressed,
            ]}
          >
            <View
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
            </View>
          </Pressable>
          <Pressable
            onPress={() => setComposerMode("ai")}
            style={({ pressed }) => [
              styles.modeButtonWrapper,
              composerMode === "ai" && styles.modeButtonWrapperActive,
              pressed && styles.modeButtonWrapperPressed,
            ]}
          >
            <View
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
            </View>
          </Pressable>
          {composerMode === "ai" && processingSteps.length > 0 && (
            <View style={styles.processingRow}>
              {processingSteps.map((step) => {
                let color = colors.border;
                if (step.status === "running") color = colors.accent;
                else if (step.status === "done") color = colors.success;
                else if (step.status === "error") color = colors.error;

                return (
                  <View
                    key={step.id}
                    style={[
                      styles.processingDot,
                      { backgroundColor: color },
                      step.status === "skipped" && styles.processingDotSkipped,
                    ]}
                  />
                );
              })}
            </View>
          )}
        </View>
        <View style={styles.inputRow}>
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
          <View
            style={[
              styles.noteSendWrapper,
              composerMode === "ai" && styles.noteSendWrapperAI,
            ]}
          >
            <TouchableOpacity
              style={[
                styles.noteSendButton,
                ((composerMode === "note" && disableNoteSend) ||
                  (composerMode === "ai" && disableAISend)) &&
                  styles.noteSendButtonDisabled,
              ]}
              onPress={composerMode === "note" ? handleAddNote : handleAskAI}
              disabled={
                composerMode === "note" ? disableNoteSend : disableAISend
              }
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={
                  (composerMode === "note" && disableNoteSend) ||
                  (composerMode === "ai" && disableAISend)
                    ? colors.textTertiary
                    : colors.textPrimary
                }
              />
            </TouchableOpacity>
          </View>
        </View>
        {composerMode === "ai" && predictedIntent && (
          <Text style={styles.intentSummary}>
            {`Intent: ${predictedIntent.label} (${Math.round(
              predictedIntent.confidence * 100
            )}% confidence)`}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any, insets: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
      paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md), // Use safe area bottom inset with more padding
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
    noteEntryWrapper: {
      borderRadius: radii.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.background,
      ...shadows.glass,
    },
    noteEntryWrapperPressed: {
      transform: [{ scale: 0.98 }],
    },
    noteEntryInner: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    noteEntryInnerPressed: {
      backgroundColor: colors.surfaceElevated,
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
      marginTop: spacing.lg,
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
    summaryCard: {
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryTitle: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: "600",
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 12,
      textTransform: "uppercase",
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    summaryBody: {
      fontFamily: typography.body.fontFamily,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
    },
    summaryFooter: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },
    moodContainer: {
      marginTop: spacing.lg,
    },
    sectionLabel: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: "600",
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: "uppercase",
      marginBottom: spacing.xs,
    },
    moodScroll: {
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    moodChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
    },
    moodChipActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}1A`,
    },
    moodChipText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
    },
    moodChipTextActive: {
      color: colors.accent,
      fontWeight: "600",
    },
    feelingsContainer: {
      marginTop: spacing.lg,
    },
    feelingsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    feelingChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    feelingChipActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}14`,
    },
    feelingChipText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    feelingChipTextActive: {
      color: colors.accent,
      fontWeight: "600",
    },
    momentsContainer: {
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    momentCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    momentHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    momentScore: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 12,
      color: colors.textSecondary,
    },
    momentContent: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    momentTags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    momentTagChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.xl,
      backgroundColor: colors.surfaceElevated,
    },
    momentTagText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
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
    annotationBubbleWrapper: {
      maxWidth: "80%",
      borderRadius: radii.md,
      backgroundColor: colors.background,
      ...shadows.glass,
    },
    annotationBubbleWrapperUser: {},
    annotationBubbleWrapperOther: {},
    annotationBubble: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
    },
    annotationBubbleUser: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    annotationBubbleOther: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
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
    annotationActions: {
      marginTop: spacing.sm,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    atomicMomentButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    atomicMomentButtonText: {
      fontFamily: typography.caption.fontFamily,
      fontSize: 11,
      color: colors.accent,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    noteInputRow: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.lg,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    modeSwitcher: {
      flexDirection: "row",
      marginBottom: spacing.sm,
    },
    modeButtonWrapper: {
      marginRight: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.background,
      ...shadows.glass,
    },
    modeButtonWrapperActive: {
      ...shadows.glow,
    },
    modeButtonWrapperPressed: {
      transform: [{ scale: 0.98 }],
    },
    modeButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    modeButtonActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceElevated,
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
      flex: 1,
      minHeight: 52,
      maxHeight: 120,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md + 2,
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 15,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
    },
    noteSendWrapper: {
      borderRadius: radii.md,
      backgroundColor: colors.background,
      ...shadows.glass,
    },
    noteSendWrapperAI: {
      ...shadows.glow,
    },
    noteSendButton: {
      backgroundColor: colors.accent,
      borderRadius: radii.md,
      width: 52,
      height: 52,
      borderWidth: 1,
      borderColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    noteSendButtonDisabled: {
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    intentSummary: {
      marginTop: spacing.sm,
      ...typography.caption,
      fontSize: 12,
      color: colors.textSecondary,
    },
    processingRow: {
      flexDirection: "row",
      gap: spacing.xs,
      alignItems: "center",
      marginLeft: spacing.sm,
    },
    processingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    processingDotSkipped: {
      opacity: 0.3,
    },
  });

export default MenuEntryChat;
