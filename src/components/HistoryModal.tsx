import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Entry, EntryType, Annotation } from "../db";
import {
  getEntryById,
  listEntriesByType,
  listAnnotationsForEntry,
  insertAnnotation,
  insertLearning,
  insertEthicalRecord,
  deleteEntry,
} from "../db";
import { generateAIResponse, formatAnnotationLabel } from "../services/ai";
import { colors, radii, spacing, typography, shadows } from "../theme";

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

type ViewMode = "categories" | "entries" | "entryChat";
type ComposerMode = "note" | "ai";

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  goal: "Goals",
  journal: "Journals",
  schedule: "Schedules",
};

const HistoryModal: React.FC<HistoryModalProps> = ({ visible, onClose }) => {
  const [mode, setMode] = useState<ViewMode>("categories");
  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);

  const [composerMode, setComposerMode] = useState<ComposerMode>("note");
  const [composerText, setComposerText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isWorkingWithAI, setIsWorkingWithAI] = useState(false);
  const [annotationCounts, setAnnotationCounts] = useState<
    Record<number, number>
  >({});

  useEffect(() => {
    if (!visible) {
      setMode("categories");
      setSelectedType(null);
      setEntries([]);
      setEntriesError(null);
      setSelectedEntryId(null);
      setSelectedEntry(null);
      setAnnotations([]);
      setAnnotationsError(null);
      setComposerMode("note");
      setComposerText("");
      setIsSavingNote(false);
      setIsWorkingWithAI(false);
    }
  }, [visible]);

  useEffect(() => {
    let isCancelled = false;

    if (!visible || !selectedType) {
      return () => {
        isCancelled = true;
      };
    }

    const loadEntries = async () => {
      setEntriesLoading(true);
      setEntriesError(null);
      try {
        const items = await listEntriesByType(selectedType);
        if (!isCancelled) {
          setEntries(items);

          // Load annotation counts for each entry
          const counts: Record<number, number> = {};
          for (const item of items) {
            if (item.id != null) {
              const annotations = await listAnnotationsForEntry(item.id);
              counts[item.id] = annotations.length;
            }
          }
          setAnnotationCounts(counts);
        }
      } catch (error) {
        console.error("Error loading entries", error);
        if (!isCancelled) {
          setEntriesError("Unable to load entries right now.");
        }
      } finally {
        if (!isCancelled) {
          setEntriesLoading(false);
        }
      }
    };

    loadEntries();

    return () => {
      isCancelled = true;
    };
  }, [selectedType, visible]);

  useEffect(() => {
    let isCancelled = false;

    if (!visible || selectedEntryId == null) {
      return () => {
        isCancelled = true;
      };
    }

    const loadEntryDetail = async () => {
      setAnnotationsLoading(true);
      setAnnotationsError(null);
      try {
        const [entry, entryAnnotations] = await Promise.all([
          getEntryById(selectedEntryId),
          listAnnotationsForEntry(selectedEntryId),
        ]);

        if (!isCancelled) {
          setSelectedEntry(entry);
          setAnnotations(entryAnnotations);
        }
      } catch (error) {
        console.error("Error loading entry detail", error);
        if (!isCancelled) {
          setAnnotationsError("Unable to load entry conversation.");
        }
      } finally {
        if (!isCancelled) {
          setAnnotationsLoading(false);
        }
      }
    };

    loadEntryDetail();

    return () => {
      isCancelled = true;
    };
  }, [selectedEntryId, visible]);

  const handleSelectType = useCallback((type: EntryType) => {
    setSelectedType(type);
    setMode("entries");
  }, []);

  const handleSelectEntry = useCallback((entryId: number) => {
    setSelectedEntryId(entryId);
    setMode("entryChat");
    setComposerMode("note");
    setComposerText("");
  }, []);

  const handleAddNote = useCallback(async () => {
    if (!selectedEntry || selectedEntry.id == null) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    setIsSavingNote(true);
    try {
      const saved = await insertAnnotation({
        entry_id: selectedEntry.id,
        kind: "user",
        channel: "note",
        content: trimmed,
      });
      setAnnotationsError(null);
      setAnnotations((prev) => [...prev, saved]);
      setComposerText("");

      // Update annotation count for this entry
      setAnnotationCounts((prev) => ({
        ...prev,
        [selectedEntry.id!]: (prev[selectedEntry.id!] || 0) + 1,
      }));
    } catch (error) {
      console.error("Error saving note", error);
      setAnnotationsError("Unable to save note right now.");
    } finally {
      setIsSavingNote(false);
    }
  }, [composerText, selectedEntry]);

  const handleAskAI = useCallback(async () => {
    if (!selectedEntry || selectedEntry.id == null) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    const entryId = selectedEntry.id;
    setIsWorkingWithAI(true);
    setAnnotationsError(null);

    try {
      const userAnnotation = await insertAnnotation({
        entry_id: entryId,
        kind: "user",
        channel: "ai",
        content: trimmed,
      });

      setAnnotations((prev) => [...prev, userAnnotation]);

      const aiResult = await generateAIResponse({
        entryContent: selectedEntry.content,
        annotations: [...annotations, userAnnotation],
        userMessage: trimmed,
        entryType: selectedEntry.type,
      });

      const botAnnotation = await insertAnnotation({
        entry_id: entryId,
        kind: "bot",
        channel: "ai",
        content: aiResult.reply,
      });

      setAnnotations((prev) => [...prev, botAnnotation]);

      await insertLearning({ entry_id: entryId, insight: aiResult.learned });
      await insertEthicalRecord({
        entry_id: entryId,
        details: aiResult.ethical,
      });

      setComposerText("");

      // Update annotation count (user + bot = +2)
      setAnnotationCounts((prev) => ({
        ...prev,
        [entryId]: (prev[entryId] || 0) + 2,
      }));
    } catch (error) {
      console.error("Error requesting AI guidance", error);
      setAnnotationsError(
        error instanceof Error
          ? error.message
          : "Unable to contact AI right now."
      );
    } finally {
      setIsWorkingWithAI(false);
    }
  }, [annotations, composerText, selectedEntry]);

  const getIconForType = (type: EntryType) => {
    switch (type) {
      case "journal":
        return "book-outline";
      case "goal":
        return "flag-outline";
      case "schedule":
        return "calendar-outline";
    }
  };

  const categoryButtons = useMemo(
    () =>
      (["goal", "journal", "schedule"] as EntryType[]).map((type) => (
        <TouchableOpacity
          key={type}
          style={styles.categoryButton}
          onPress={() => handleSelectType(type)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons
              name={getIconForType(type)}
              size={28}
              color={colors.accent}
            />
          </View>
          <Text style={styles.categoryButtonText}>
            {ENTRY_TYPE_LABELS[type]}
          </Text>
        </TouchableOpacity>
      )),
    [handleSelectType]
  );

  const handleDeleteEntry = useCallback(
    async (id: number) => {
      Alert.alert(
        "Delete Entry",
        "Are you sure you want to delete this entry? This cannot be undone.",
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
                await deleteEntry(id);
                // Refresh the list
                const updatedEntries = await listEntriesByType(selectedType!);
                setEntries(updatedEntries);
              } catch (error) {
                console.error("Error deleting entry:", error);
              }
            },
          },
        ]
      );
    },
    [selectedType]
  );

  const renderEntryItem = useCallback(
    ({ item }: { item: Entry }) => {
      const updateCount = item.id != null ? annotationCounts[item.id] || 0 : 0;

      return (
        <TouchableOpacity
          style={styles.historyItem}
          onPress={() => item.id != null && handleSelectEntry(item.id)}
          onLongPress={() => item.id != null && handleDeleteEntry(item.id)}
        >
          <View style={styles.historyItemContent}>
            <Text style={styles.historyItemText}>{item.content}</Text>
            <View style={styles.historyItemFooter}>
              {item.created_at && (
                <Text style={styles.historyItemDate}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              )}
              {updateCount > 0 && (
                <Text style={styles.historyItemUpdates}>
                  {updateCount} {updateCount === 1 ? "note" : "notes"}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelectEntry, handleDeleteEntry, annotationCounts]
  );

  const renderAnnotationItem = useCallback(({ item }: { item: Annotation }) => {
    const isUser = item.kind === "user";
    const label = formatAnnotationLabel(item.channel);
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

  const showCategories = mode === "categories";
  const showEntries = mode === "entries";
  const showEntryChat = mode === "entryChat";

  const handleBack = useCallback(() => {
    if (showEntryChat) {
      setMode("entries");
      setSelectedEntryId(null);
      setSelectedEntry(null);
      setAnnotations([]);
      setAnnotationsError(null);
      setComposerMode("note");
      setComposerText("");
      return;
    }

    if (showEntries) {
      setMode("categories");
      setSelectedType(null);
      setEntries([]);
      setEntriesError(null);
    }
  }, [showEntries, showEntryChat]);

  const disableNoteSend = isSavingNote || !composerText.trim();
  const disableAISend = isWorkingWithAI || !composerText.trim();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.modalCard}>
          <View style={styles.modalHeader}>
            {!showCategories ? (
              <TouchableOpacity
                onPress={handleBack}
                style={styles.headerButton}
              >
                <Text style={styles.headerAction}>← Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerButtonPlaceholder} />
            )}
            <Text style={styles.modalTitle}>
              {showCategories && "History"}
              {showEntries && selectedType
                ? `${ENTRY_TYPE_LABELS[selectedType]} History`
                : null}
              {showEntryChat && selectedEntry ? "Conversation" : null}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Text style={styles.headerAction}>Close</Text>
            </TouchableOpacity>
          </View>

          {showCategories && (
            <View style={styles.categoryList}>
              <Text style={styles.sectionHint}>
                What would you like to review?
              </Text>
              {categoryButtons}
            </View>
          )}

          {showEntries && (
            <View style={styles.listContainer}>
              {entriesLoading && (
                <ActivityIndicator
                  style={styles.loadingIndicator}
                  color={colors.textPrimary}
                />
              )}
              {entriesError && (
                <Text style={styles.errorText}>{entriesError}</Text>
              )}
              {!entriesLoading && !entriesError && entries.length === 0 && (
                <Text style={styles.emptyState}>No entries saved yet.</Text>
              )}
              <FlatList
                style={styles.entriesList}
                data={entries}
                keyExtractor={(item) =>
                  item.id != null
                    ? item.id.toString()
                    : `${item.type}-${item.created_at ?? ""}`
                }
                renderItem={renderEntryItem}
              />
            </View>
          )}

          {showEntryChat && (
            <View style={styles.entryChatContainer}>
              {selectedEntry && (
                <View style={styles.entrySummary}>
                  <Text style={styles.entrySummaryContent}>
                    {selectedEntry.content}
                  </Text>
                  {selectedEntry.created_at && (
                    <Text style={styles.entrySummaryDate}>
                      {new Date(selectedEntry.created_at).toLocaleString()}
                    </Text>
                  )}
                </View>
              )}

              {annotationsLoading && (
                <ActivityIndicator
                  style={styles.loadingIndicator}
                  color={colors.textPrimary}
                />
              )}
              {annotationsError && (
                <Text style={styles.errorText}>{annotationsError}</Text>
              )}
              {!annotationsLoading &&
                annotations.length === 0 &&
                !annotationsError && (
                  <Text style={styles.emptyState}>
                    No updates yet. Add your first note below.
                  </Text>
                )}
              <FlatList
                style={styles.annotationListContainer}
                data={annotations}
                keyExtractor={(item) =>
                  item.id != null
                    ? item.id.toString()
                    : `${item.entry_id}-${item.created_at ?? ""}`
                }
                renderItem={renderAnnotationItem}
                contentContainerStyle={styles.annotationList}
              />

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
                  onPress={
                    composerMode === "note" ? handleAddNote : handleAskAI
                  }
                  disabled={
                    composerMode === "note" ? disableNoteSend : disableAISend
                  }
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
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,11,0.95)",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  modalTitle: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    letterSpacing: typography.heading.letterSpacing,
    fontSize: 20,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  headerButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 70,
    alignItems: "center",
    ...shadows.glass,
  },
  headerButtonPlaceholder: {
    width: 70,
  },
  headerAction: {
    fontFamily: typography.button.fontFamily,
    fontWeight: typography.button.fontWeight,
    letterSpacing: typography.button.letterSpacing,
    color: colors.accent,
    fontSize: 14,
  },
  categoryList: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  sectionHint: {
    fontFamily: typography.body.fontFamily,
    fontWeight: typography.body.fontWeight,
    letterSpacing: typography.body.letterSpacing,
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.glass,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  categoryButtonText: {
    flex: 1,
    fontFamily: typography.title.fontFamily,
    fontWeight: typography.title.fontWeight,
    fontSize: 18,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  listContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  entriesList: {
    flex: 1,
  },
  loadingIndicator: {
    marginTop: spacing.lg,
  },
  errorText: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: typography.body.fontFamily,
    fontWeight: typography.body.fontWeight,
    letterSpacing: typography.body.letterSpacing,
    fontSize: 16,
    color: colors.textSecondary,
  },
  historyItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemText: {
    fontFamily: typography.body.fontFamily,
    fontWeight: typography.body.fontWeight,
    letterSpacing: typography.body.letterSpacing,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  historyItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyItemDate: {
    fontFamily: typography.caption.fontFamily,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: typography.caption.letterSpacing,
    fontSize: 12,
    color: colors.textSecondary,
  },
  historyItemUpdates: {
    fontFamily: typography.caption.fontFamily,
    fontWeight: typography.caption.fontWeight,
    letterSpacing: typography.caption.letterSpacing,
    fontSize: 11,
    color: colors.accent,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 2,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.accent,
    overflow: "hidden",
  },
  entryChatContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
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
  annotationList: {
    paddingBottom: spacing.md,
  },
  annotationListContainer: {
    flex: 1,
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

export default HistoryModal;
