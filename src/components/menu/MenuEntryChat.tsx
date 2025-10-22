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
import type { ProcessingStep } from "../../types/intent";
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
  const [isNoteSelectionMode, setIsNoteSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [emotionsScrollX, setEmotionsScrollX] = useState(0);
  const [emotionsScrollViewWidth, setEmotionsScrollViewWidth] = useState(0);
  const [emotionsContentWidth, setEmotionsContentWidth] = useState(0);

  // Notify parent component when mode changes
  useEffect(() => {
    onModeChange?.(composerMode);
    if (composerMode === "note") {
      setProcessingSteps([]);
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
        const next = exists
          ? prev.filter((item) => item !== feeling)
          : [...prev, feeling];
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

    // Clear input immediately
    setComposerText("");

    const entryId = entry.id;
    setIsWorkingWithAI(true);
    onErrorUpdate(null);

    let timeline = createProcessingTimeline();
    setProcessingSteps(timeline);
    let thinkingAnnotation: Annotation | null = null;

    const setTimeline = (
      stepId: ProcessingStepId,
      status: ProcessingStep["status"],
      detail?: string
    ) => {
      timeline = updateTimelineStep(timeline, stepId, status, detail);
      setProcessingSteps(timeline);
    };

    try {
      setTimeline("knowledge_search", "running", "Preparing entry context");
      setTimeline("knowledge_search", "done", "Entry context ready");

      const userMessage = await appendMessage(entryId, "user", trimmed, {
        channel: "ai",
        messageKind: "aiQuestion",
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
          processingTimeline: timeline,
        },
      };

      const updatedAnnotations = [...annotations, userAnnotation];
      onAnnotationsUpdate(updatedAnnotations);

      // Add thinking message
      thinkingAnnotation = {
        id: `thinking-${Date.now()}`,
        entryId: userAnnotation.entryId,
        kind: "bot",
        channel: "ai",
        content: "Riflett is thinking...",
        created_at: new Date().toISOString(),
        metadata: {
          isThinking: true,
        },
      };

      onAnnotationsUpdate([...updatedAnnotations, thinkingAnnotation]);

      setTimeline("openai_request", "running", "Sending prompt");

      const aiResult = await generateAIResponse({
        entryContent: entry.content,
        annotations: updatedAnnotations,
        userMessage: trimmed,
        entryType: entry.type,
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
        processingTimeline: timeline,
      },
    };

      // Remove thinking message and add actual response
      const finalAnnotations = updatedAnnotations.filter(
        (ann) => thinkingAnnotation && ann.id !== thinkingAnnotation.id
      );
      onAnnotationsUpdate([...finalAnnotations, botAnnotation]);
      onErrorUpdate(null);
    } catch (error) {
      console.error("Error requesting AI guidance", error);
      setTimeline(
        "openai_response",
        "error",
        error instanceof Error ? error.message : "Unable to contact AI"
      );

      // Remove thinking message on error
      if (thinkingAnnotation) {
        const finalAnnotations = annotations.filter(
          (ann: Annotation) => ann.id !== thinkingAnnotation!.id
        );
        onAnnotationsUpdate(finalAnnotations);
      }

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
          linked_moments: [...(entry.linked_moments ?? []), moment.id],
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

  const renderAnnotationItem = useCallback(
    ({ item }: { item: Annotation }) => {
      const isUser = item.kind === "user";
      const isNote = item.channel === "note";
      const label = formatAnnotationLabel(item.channel);

      // Render notes as elegant journal entries
      if (isNote) {
        const isSelected = item.id ? selectedNotes.has(item.id) : false;
        return (
          <Pressable
            style={({ pressed }) => [
              styles.noteEntryWrapper,
              isSelected && styles.selectedNoteItem,
              pressed && styles.noteEntryWrapperPressed,
            ]}
            onLongPress={() => {
              if (item.id) {
                if (isNoteSelectionMode) {
                  handleToggleNoteSelection(item.id);
                } else {
                  handleLongPressNote(item.id);
                }
              }
            }}
            onPress={() => {
              if (isNoteSelectionMode && item.id) {
                handleToggleNoteSelection(item.id);
              }
            }}
            delayLongPress={500}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.noteEntryInner,
                  isSelected && styles.selectedNoteItemInner,
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
      const isThinking = item.metadata?.isThinking;
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
                {isThinking ? "Riflett" : label}
              </Text>
              <Text
                style={[
                  styles.annotationText,
                  isUser
                    ? styles.annotationTextUser
                    : styles.annotationTextOther,
                  isThinking && styles.thinkingMessage,
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
                    <Text style={styles.atomicMomentButtonText}>
                      Save Moment
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      );
    },
    [colors.accent, handleSaveAtomicMoment, selectedNotes, isNoteSelectionMode]
  );

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

  const handleLongPressNote = useCallback((annotationId: string) => {
    setIsNoteSelectionMode(true);
    setSelectedNotes(new Set([annotationId]));
  }, []);

  const handleToggleNoteSelection = useCallback((annotationId: string) => {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(annotationId)) {
        next.delete(annotationId);
      } else {
        next.add(annotationId);
      }
      return next;
    });
  }, []);

  const handleCancelNoteSelection = useCallback(() => {
    setIsNoteSelectionMode(false);
    setSelectedNotes(new Set());
  }, []);

  const handleDeleteSelectedNotes = useCallback(async () => {
    if (!entry?.id || selectedNotes.size === 0) return;

    try {
      const noteIds = Array.from(selectedNotes);
      await Promise.all(
        noteIds.map((noteId) =>
          supabase.from("messages").delete().eq("id", noteId)
        )
      );

      onAnnotationCountUpdate(entry.id, -selectedNotes.size);

      if (onRefreshAnnotations) {
        onRefreshAnnotations();
      }

      setIsNoteSelectionMode(false);
      setSelectedNotes(new Set());
    } catch (error) {
      console.error("Failed to delete selected notes:", error);
      onErrorUpdate("Unable to delete notes right now.");
    }
  }, [
    entry?.id,
    selectedNotes,
    onAnnotationCountUpdate,
    onRefreshAnnotations,
    onErrorUpdate,
  ]);

  const handleEmotionsScroll = useCallback((event: any) => {
    setEmotionsScrollX(event.nativeEvent.contentOffset.x);
  }, []);

  const handleEmotionsLayout = useCallback((width: number, height: number) => {
    if (width && width > 0) {
      setEmotionsContentWidth(width);
    }
  }, []);

  const handleEmotionsScrollViewLayout = useCallback((event: any) => {
    setEmotionsScrollViewWidth(event.nativeEvent.layout.width);
  }, []);

  // Filter emotions based on similarity to the highlighted emotion
  const getSimilarEmotions = useCallback(() => {
    if (!emotion) return { moods: MOOD_OPTIONS, feelings: FEELING_OPTIONS };

    const emotionLower = emotion.toLowerCase();

    // Define emotion similarity groups
    const emotionGroups = {
      positive: [
        "centered",
        "calm",
        "optimistic",
        "grateful",
        "productive",
        "inspired",
        "connected",
        "proud",
        "hopeful",
        "motivated",
        "happy",
        "joyful",
        "content",
        "peaceful",
        "confident",
        "energetic",
        "excited",
        "cheerful",
        "satisfied",
        "fulfilled",
      ],
      negative: [
        "anxious",
        "overwhelmed",
        "drained",
        "stressed",
        "lonely",
        "frustrated",
        "tired",
        "angry",
        "anger",
        "mad",
        "irritated",
        "annoyed",
        "upset",
        "disappointed",
        "sad",
        "depressed",
        "miserable",
        "hopeless",
        "desperate",
        "worried",
        "nervous",
        "fearful",
        "scared",
        "terrified",
        "hurt",
        "betrayed",
        "rejected",
        "abandoned",
        "guilty",
        "ashamed",
        "embarrassed",
        "humiliated",
      ],
      reflective: [
        "reflective",
        "curious",
        "contemplative",
        "thoughtful",
        "introspective",
        "meditative",
      ],
    };

    // Find which group the highlighted emotion belongs to
    let targetGroup = "positive"; // default
    for (const [group, emotions] of Object.entries(emotionGroups)) {
      if (
        emotions.some((e) => {
          // More flexible matching
          const emotionWords = emotionLower.split(/\s+/);
          const emotionWordsInGroup = e.split(/\s+/);

          return (
            emotionWords.some((word) =>
              emotionWordsInGroup.some(
                (groupWord) =>
                  word.includes(groupWord) || groupWord.includes(word)
              )
            ) ||
            emotionLower.includes(e) ||
            e.includes(emotionLower)
          );
        })
      ) {
        targetGroup = group;
        break;
      }
    }

    // Debug logging
    console.log("Highlighted emotion:", emotion);
    console.log("Target group:", targetGroup);

    // Filter emotions to only show those from the same group
    const similarMoods = MOOD_OPTIONS.filter((mood) =>
      emotionGroups[targetGroup as keyof typeof emotionGroups].some((e) => {
        const moodLower = mood.toLowerCase();
        const moodWords = moodLower.split(/\s+/);
        const emotionWordsInGroup = e.split(/\s+/);

        return (
          moodWords.some((word) =>
            emotionWordsInGroup.some(
              (groupWord) =>
                word.includes(groupWord) || groupWord.includes(word)
            )
          ) ||
          moodLower.includes(e) ||
          e.includes(moodLower)
        );
      })
    );

    const similarFeelings = FEELING_OPTIONS.filter((feeling) =>
      emotionGroups[targetGroup as keyof typeof emotionGroups].some((e) => {
        const feelingLower = feeling.toLowerCase();
        const feelingWords = feelingLower.split(/\s+/);
        const emotionWordsInGroup = e.split(/\s+/);

        return (
          feelingWords.some((word) =>
            emotionWordsInGroup.some(
              (groupWord) =>
                word.includes(groupWord) || groupWord.includes(word)
            )
          ) ||
          feelingLower.includes(e) ||
          e.includes(feelingLower)
        );
      })
    );

    // Debug logging
    console.log("Similar moods:", similarMoods);
    console.log("Similar feelings:", similarFeelings);

    return { moods: similarMoods, feelings: similarFeelings };
  }, [emotion]);

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
                      <Text
                        style={styles.summaryFooter}
                      >{`Emotion: ${emotion.charAt(0).toUpperCase() + emotion.slice(1).toLowerCase()}`}</Text>
                    )}
                  </View>
                ) : null}
                {entry.type === "journal" && (
                  <View style={styles.emotionsContainer}>
                    <Text style={styles.sectionLabel}>
                      {emotion
                        ? `Feeling: ${emotion.charAt(0).toUpperCase() + emotion.slice(1).toLowerCase()}`
                        : "Emotions"}
                    </Text>
                    <View style={styles.emotionsCarouselWrapper}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.emotionsScroll}
                        onScroll={handleEmotionsScroll}
                        onContentSizeChange={handleEmotionsLayout}
                        onLayout={handleEmotionsScrollViewLayout}
                        scrollEventThrottle={16}
                        decelerationRate="fast"
                        snapToInterval={120}
                        snapToAlignment="start"
                        bounces={false}
                      >
                        {(() => {
                          const { moods, feelings } = getSimilarEmotions();
                          return (
                            <>
                              {moods.map((mood) => {
                                const active = selectedMood === mood;
                                return (
                                  <TouchableOpacity
                                    key={mood}
                                    style={[
                                      styles.emotionChip,
                                      active && styles.emotionChipActive,
                                    ]}
                                    onPress={() => handleMoodSelect(mood)}
                                  >
                                    <Text
                                      style={[
                                        styles.emotionChipText,
                                        active && styles.emotionChipTextActive,
                                      ]}
                                    >
                                      {mood}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                              {feelings.map((feeling) => {
                                const active =
                                  selectedFeelings.includes(feeling);
                                return (
                                  <TouchableOpacity
                                    key={feeling}
                                    style={[
                                      styles.emotionChip,
                                      active && styles.emotionChipActive,
                                    ]}
                                    onPress={() => handleToggleFeeling(feeling)}
                                  >
                                    <Text
                                      style={[
                                        styles.emotionChipText,
                                        active && styles.emotionChipTextActive,
                                      ]}
                                    >
                                      {feeling}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </>
                          );
                        })()}
                      </ScrollView>
                      {emotionsContentWidth > emotionsScrollViewWidth &&
                        emotionsScrollViewWidth > 0 && (
                          <View style={styles.carouselIndicators}>
                            {Array.from({
                              length: Math.ceil(
                                emotionsContentWidth / emotionsScrollViewWidth
                              ),
                            }).map((_, index) => {
                              const indicatorPosition =
                                index * emotionsScrollViewWidth;
                              const isActive =
                                emotionsScrollX >=
                                  indicatorPosition -
                                    emotionsScrollViewWidth / 2 &&
                                emotionsScrollX <
                                  indicatorPosition +
                                    emotionsScrollViewWidth / 2;
                              return (
                                <View
                                  key={index}
                                  style={[
                                    styles.carouselIndicator,
                                    isActive && styles.carouselIndicatorActive,
                                  ]}
                                />
                              );
                            })}
                          </View>
                        )}
                    </View>
                  </View>
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
                          <Text
                            style={styles.momentScore}
                          >{`Importance ${moment.importance_score}/10`}</Text>
                        </View>
                        <Text style={styles.momentContent}>
                          {moment.content}
                        </Text>
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
            {!loading && noteAnnotations.length === 0 && !error && (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyState}>
                  No notes yet. Add your first note below.
                </Text>
                <Text style={styles.emptyStateHint}>
                  Long-press any note to select multiple for deletion
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

      {isNoteSelectionMode ? (
        <View style={styles.noteSelectionFooter}>
          <TouchableOpacity
            style={styles.noteCancelButton}
            onPress={handleCancelNoteSelection}
          >
            <Text style={styles.noteCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.noteSelectionCounter}>
            {selectedNotes.size} selected
          </Text>
          <TouchableOpacity
            style={[
              styles.noteDeleteSelectedButton,
              selectedNotes.size === 0 &&
                styles.noteDeleteSelectedButtonDisabled,
            ]}
            onPress={handleDeleteSelectedNotes}
            disabled={selectedNotes.size === 0}
          >
            <Ionicons
              name="trash-outline"
              size={16}
              color={
                selectedNotes.size === 0
                  ? colors.textTertiary
                  : colors.background
              }
            />
          </TouchableOpacity>
        </View>
      ) : (
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
                        step.status === "skipped" &&
                          styles.processingDotSkipped,
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
        </View>
      )}
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
    selectedNoteItem: {
      borderWidth: 2,
      borderColor: colors.accent,
      borderRadius: radii.lg,
      marginHorizontal: spacing.xs,
      marginVertical: spacing.xs,
      backgroundColor: `${colors.accent}08`,
      transform: [{ scale: 1.02 }],
      ...shadows.glow,
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
    selectedNoteItemInner: {
      backgroundColor: `${colors.accent}12`,
      borderColor: colors.accent,
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
    emotionsContainer: {
      marginTop: spacing.lg,
    },
    emotionsCarouselWrapper: {
      position: "relative",
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
    emotionsScroll: {
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    emotionChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
      minWidth: 100,
      alignItems: "center",
    },
    emotionChipActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}1A`,
    },
    emotionChipText: {
      fontFamily: typography.body.fontFamily,
      fontSize: 14,
      color: colors.textSecondary,
    },
    emotionChipTextActive: {
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
      borderRadius: radii.lg,
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
    noteSelectionFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    noteCancelButton: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flex: 0,
    },
    noteCancelButtonText: {
      fontFamily: typography.button.fontFamily,
      fontWeight: typography.button.fontWeight,
      letterSpacing: typography.button.letterSpacing,
      fontSize: 12,
      color: colors.textSecondary,
    },
    noteSelectionCounter: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: "500",
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 11,
      color: colors.textTertiary,
      marginHorizontal: spacing.sm,
    },
    noteDeleteSelectedButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      flex: 0,
    },
    noteDeleteSelectedButtonDisabled: {
      backgroundColor: colors.border,
    },
    carouselIndicators: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    carouselIndicator: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    carouselIndicatorActive: {
      backgroundColor: colors.accent,
      width: 12,
    },
    thinkingMessage: {
      fontStyle: "italic",
      opacity: 0.7,
    },
  });

export default MenuEntryChat;
