import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import type { Entry, EntryType, Annotation } from '../db';
import {
  getEntryById,
  listEntriesByType,
  listAnnotationsForEntry,
  insertAnnotation,
  insertLearning,
  insertEthicalRecord
} from '../db';
import { generateAIResponse, formatAnnotationLabel } from '../services/ai';
import { colors, radii, spacing } from '../theme';

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

type ViewMode = 'categories' | 'entries' | 'entryChat';
type ComposerMode = 'note' | 'ai';

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  goal: 'Goals',
  journal: 'Journals',
  schedule: 'Schedules'
};

const HistoryModal: React.FC<HistoryModalProps> = ({ visible, onClose }) => {
  const [mode, setMode] = useState<ViewMode>('categories');
  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);

  const [composerMode, setComposerMode] = useState<ComposerMode>('note');
  const [composerText, setComposerText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isWorkingWithAI, setIsWorkingWithAI] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMode('categories');
      setSelectedType(null);
      setEntries([]);
      setEntriesError(null);
      setSelectedEntryId(null);
      setSelectedEntry(null);
      setAnnotations([]);
      setAnnotationsError(null);
      setComposerMode('note');
      setComposerText('');
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
        }
      } catch (error) {
        console.error('Error loading entries', error);
        if (!isCancelled) {
          setEntriesError('Unable to load entries right now.');
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
          listAnnotationsForEntry(selectedEntryId)
        ]);

        if (!isCancelled) {
          setSelectedEntry(entry);
          setAnnotations(entryAnnotations);
        }
      } catch (error) {
        console.error('Error loading entry detail', error);
        if (!isCancelled) {
          setAnnotationsError('Unable to load entry conversation.');
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
    setMode('entries');
  }, []);

  const handleSelectEntry = useCallback((entryId: number) => {
    setSelectedEntryId(entryId);
    setMode('entryChat');
    setComposerMode('note');
    setComposerText('');
  }, []);

  const handleAddNote = useCallback(async () => {
    if (!selectedEntry || selectedEntry.id == null) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    setIsSavingNote(true);
    try {
      const saved = await insertAnnotation({
        entry_id: selectedEntry.id,
        kind: 'user',
        channel: 'note',
        content: trimmed,
      });
      setAnnotationsError(null);
      setAnnotations(prev => [...prev, saved]);
      setComposerText('');
    } catch (error) {
      console.error('Error saving note', error);
      setAnnotationsError('Unable to save note right now.');
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
        kind: 'user',
        channel: 'ai',
        content: trimmed,
      });

      setAnnotations(prev => [...prev, userAnnotation]);

      const aiResult = await generateAIResponse({
        entryContent: selectedEntry.content,
        annotations: [...annotations, userAnnotation],
        userMessage: trimmed,
        entryType: selectedEntry.type,
      });

      const botAnnotation = await insertAnnotation({
        entry_id: entryId,
        kind: 'bot',
        channel: 'ai',
        content: aiResult.reply,
      });

      setAnnotations(prev => [...prev, botAnnotation]);

      await insertLearning({ entry_id: entryId, insight: aiResult.learned });
      await insertEthicalRecord({ entry_id: entryId, details: aiResult.ethical });

      setComposerText('');
    } catch (error) {
      console.error('Error requesting AI guidance', error);
      setAnnotationsError(error instanceof Error ? error.message : 'Unable to contact AI right now.');
    } finally {
      setIsWorkingWithAI(false);
    }
  }, [annotations, composerText, selectedEntry]);

  const categoryButtons = useMemo(() => (
    (['goal', 'journal', 'schedule'] as EntryType[]).map(type => (
      <TouchableOpacity
        key={type}
        style={styles.categoryButton}
        onPress={() => handleSelectType(type)}
      >
        <Text style={styles.categoryButtonText}>{ENTRY_TYPE_LABELS[type]}</Text>
      </TouchableOpacity>
    ))
  ), [handleSelectType]);

  const renderEntryItem = useCallback(({ item }: { item: Entry }) => (
    <TouchableOpacity
      style={styles.historyItem}
      onPress={() => item.id != null && handleSelectEntry(item.id)}
    >
      <View style={styles.historyItemHeader}>
        <Text style={styles.historyItemType}>{ENTRY_TYPE_LABELS[item.type]}</Text>
        {item.created_at && (
          <Text style={styles.historyItemDate}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        )}
      </View>
      <Text style={styles.historyItemContent}>{item.content}</Text>
    </TouchableOpacity>
  ), [handleSelectEntry]);

  const renderAnnotationItem = useCallback(({ item }: { item: Annotation }) => {
    const isUser = item.kind === 'user';
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
                isUser ? styles.annotationTimestampUser : styles.annotationTimestampOther,
              ]}
            >
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
      </View>
    );
  }, []);

  const showCategories = mode === 'categories';
  const showEntries = mode === 'entries';
  const showEntryChat = mode === 'entryChat';

  const handleBack = useCallback(() => {
    if (showEntryChat) {
      setMode('entries');
      setSelectedEntryId(null);
      setSelectedEntry(null);
      setAnnotations([]);
      setAnnotationsError(null);
      setComposerMode('note');
      setComposerText('');
      return;
    }

    if (showEntries) {
      setMode('categories');
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
            {(!showCategories) && (
              <Pressable onPress={handleBack}>
                <Text style={styles.headerAction}>Back</Text>
              </Pressable>
            )}
            <Text style={styles.modalTitle}>
              {showCategories && 'History'}
              {showEntries && selectedType ? `${ENTRY_TYPE_LABELS[selectedType]} History` : null}
              {showEntryChat && selectedEntry ? 'Conversation' : null}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={styles.headerAction}>Close</Text>
            </Pressable>
          </View>

          {showCategories && (
            <View style={styles.categoryList}>
              <Text style={styles.sectionHint}>What would you like to review?</Text>
              {categoryButtons}
            </View>
          )}

          {showEntries && (
            <View style={styles.listContainer}>
              {entriesLoading && (
                <ActivityIndicator style={styles.loadingIndicator} color={colors.ashWhite} />
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
                keyExtractor={item =>
                  item.id != null ? item.id.toString() : `${item.type}-${item.created_at ?? ''}`
                }
                renderItem={renderEntryItem}
              />
            </View>
          )}

          {showEntryChat && (
            <View style={styles.entryChatContainer}>
              {selectedEntry && (
                <View style={styles.entrySummary}>
                  <Text style={styles.entrySummaryType}>{ENTRY_TYPE_LABELS[selectedEntry.type]}</Text>
                  <Text style={styles.entrySummaryContent}>{selectedEntry.content}</Text>
                  {selectedEntry.created_at && (
                    <Text style={styles.entrySummaryDate}>
                      Logged {new Date(selectedEntry.created_at).toLocaleString()}
                    </Text>
                  )}
                </View>
              )}

              {annotationsLoading && (
                <ActivityIndicator style={styles.loadingIndicator} color={colors.ashWhite} />
              )}
              {annotationsError && (
                <Text style={styles.errorText}>{annotationsError}</Text>
              )}
              {!annotationsLoading && annotations.length === 0 && !annotationsError && (
                <Text style={styles.emptyState}>No updates yet. Add your first note below.</Text>
              )}
              <FlatList
                style={styles.annotationListContainer}
                data={annotations}
                keyExtractor={item =>
                  item.id != null ? item.id.toString() : `${item.entry_id}-${item.created_at ?? ''}`
                }
                renderItem={renderAnnotationItem}
                contentContainerStyle={styles.annotationList}
              />

              <View style={styles.noteInputRow}>
                <View style={styles.modeSwitcher}>
                  <TouchableOpacity
                    onPress={() => setComposerMode('note')}
                    style={[styles.modeButton, composerMode === 'note' && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeButtonText, composerMode === 'note' && styles.modeButtonTextActive]}>Note</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setComposerMode('ai')}
                    style={[styles.modeButton, composerMode === 'ai' && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeButtonText, composerMode === 'ai' && styles.modeButtonTextActive]}>AI</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.noteInput}
                  value={composerText}
                  onChangeText={setComposerText}
                  placeholder={composerMode === 'ai' ? 'Ask Reflectify for insight...' : 'Add an update...'}
                  placeholderTextColor="rgba(244,244,244,0.6)"
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.noteSendButton,
                    ((composerMode === 'note' && disableNoteSend) || (composerMode === 'ai' && disableAISend)) && styles.noteSendButtonDisabled,
                  ]}
                  onPress={composerMode === 'note' ? handleAddNote : handleAskAI}
                  disabled={composerMode === 'note' ? disableNoteSend : disableAISend}
                >
                  <Text
                    style={[
                      styles.noteSendButtonText,
                      ((composerMode === 'note' && disableNoteSend) || (composerMode === 'ai' && disableAISend)) && styles.noteSendButtonTextDisabled,
                    ]}
                  >
                    {composerMode === 'ai' ? (isWorkingWithAI ? 'Contacting...' : 'Ask AI') : isSavingNote ? 'Saving' : 'Send'}
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
    backgroundColor: 'rgba(5,6,8,0.85)',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    flex: 1,
    backgroundColor: colors.primaryRed,
    borderRadius: radii.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.primaryRed,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.carbonBlack,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerAction: {
    color: colors.ashWhite,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  categoryList: {
    flex: 1,
    backgroundColor: colors.carbonBlack,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
  },
  sectionHint: {
    fontSize: 16,
    color: 'rgba(244,244,244,0.8)',
    marginBottom: spacing.lg,
  },
  categoryButton: {
    backgroundColor: colors.primaryRed,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.emberOrange,
    shadowColor: colors.emberOrange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  categoryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.carbonBlack,
    letterSpacing: 1,
  },
  listContainer: {
    flex: 1,
    backgroundColor: colors.carbonBlack,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
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
    color: colors.ashWhite,
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    color: 'rgba(244,244,244,0.7)',
    fontSize: 16,
  },
  historyItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,244,244,0.1)',
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  historyItemType: {
    fontSize: 12,
    color: colors.emberOrange,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  historyItemContent: {
    fontSize: 16,
    color: colors.ashWhite,
  },
  historyItemDate: {
    fontSize: 12,
    color: 'rgba(244,244,244,0.6)',
  },
  entryChatContainer: {
    flex: 1,
    backgroundColor: colors.carbonBlack,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  entrySummary: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,244,244,0.15)',
    marginBottom: spacing.md,
  },
  entrySummaryType: {
    fontSize: 12,
    color: colors.emberOrange,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  entrySummaryContent: {
    fontSize: 18,
    color: colors.ashWhite,
    marginBottom: spacing.xs,
  },
  entrySummaryDate: {
    fontSize: 12,
    color: 'rgba(244,244,244,0.6)',
  },
  annotationList: {
    paddingBottom: spacing.md,
  },
  annotationListContainer: {
    flex: 1,
  },
  annotationBubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  annotationRowUser: {
    justifyContent: 'flex-end',
  },
  annotationRowOther: {
    justifyContent: 'flex-start',
  },
  annotationBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  annotationBubbleUser: {
    backgroundColor: colors.primaryRed,
    borderBottomRightRadius: radii.xs,
  },
  annotationBubbleOther: {
    backgroundColor: colors.smokeGrey,
    borderBottomLeftRadius: radii.xs,
  },
  annotationLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: spacing.xs,
    letterSpacing: 0.8,
  },
  annotationLabelUser: {
    color: colors.carbonBlack,
  },
  annotationLabelOther: {
    color: colors.ashWhite,
  },
  annotationText: {
    fontSize: 15,
  },
  annotationTextUser: {
    color: colors.carbonBlack,
  },
  annotationTextOther: {
    color: colors.ashWhite,
  },
  annotationTimestamp: {
    marginTop: spacing.xs,
    fontSize: 11,
    textAlign: 'right',
  },
  annotationTimestampUser: {
    color: colors.carbonBlack,
  },
  annotationTimestampOther: {
    color: 'rgba(244,244,244,0.6)',
  },
  noteInputRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(244,244,244,0.12)',
    paddingTop: spacing.md,
  },
  modeSwitcher: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  modeButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,244,244,0.2)',
    marginRight: spacing.sm,
  },
  modeButtonActive: {
    borderColor: colors.emberOrange,
    backgroundColor: 'rgba(229,9,20,0.2)',
  },
  modeButtonText: {
    color: 'rgba(244,244,244,0.7)',
    fontSize: 12,
    letterSpacing: 1,
  },
  modeButtonTextActive: {
    color: colors.ashWhite,
  },
  noteInput: {
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radii.md,
    backgroundColor: colors.carbonBlack,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.ashWhite,
    borderWidth: 1,
    borderColor: 'rgba(244,244,244,0.25)',
    marginBottom: spacing.sm,
  },
  noteSendButton: {
    backgroundColor: colors.carbonBlack,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.emberOrange,
    alignSelf: 'flex-end',
  },
  noteSendButtonDisabled: {
    borderColor: 'rgba(244,244,244,0.2)',
    backgroundColor: colors.smokeGrey,
  },
  noteSendButtonText: {
    color: colors.ashWhite,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  noteSendButtonTextDisabled: {
    color: 'rgba(244,244,244,0.6)',
  },
});

export default HistoryModal;
