import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import {
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getJournalEntryById,
  listJournals,
  listMessages,
  type EntryType,
  type RemoteJournalEntry,
  type RemoteMessage,
} from "../services/data";
import { supabase } from "../lib/supabase";
import type { Annotation, AnnotationChannel } from "../types/annotations";
import { getColors, radii, spacing, typography } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import SettingsModal from "./SettingsModal";
import MenuCategories from "./menu/MenuCategories";
import MenuEntries from "./menu/MenuEntries";
import MenuEntryChat from "./menu/MenuEntryChat";
import type { Session } from "@supabase/supabase-js";

interface MenuModalProps {
  visible: boolean;
  onClose: () => void;
  session: Session;
}

type ViewMode = "categories" | "entries" | "entryChat";

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  goal: "Goals",
  journal: "Journals",
  schedule: "Schedules",
};

const MenuModal: React.FC<MenuModalProps> = ({ visible, onClose, session }) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<ViewMode>("categories");
  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [entries, setEntries] = useState<RemoteJournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<RemoteJournalEntry | null>(
    null
  );
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);
  const [annotationCounts, setAnnotationCounts] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (visible) {
      // Show modal and reset to start position immediately, then animate in
      setIsModalVisible(true);
      slideAnim.setValue(-300);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else if (isModalVisible) {
      // Animate out first, then hide modal
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Hide modal and reset state after animation completes
        setIsModalVisible(false);
        setMode("categories");
        setSelectedType(null);
        setEntries([]);
        setEntriesError(null);
        setSelectedEntryId(null);
        setSelectedEntry(null);
        setAnnotations([]);
        setAnnotationsError(null);
        setShowSettings(false);
      });
    }
  }, [visible, slideAnim, isModalVisible]);

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
        const items = await listJournals({ type: selectedType, limit: 100 });
        if (!isCancelled) {
          setEntries(items);

          // Stop-gap parallelization: count messages per entry via head count
          const results = await Promise.all(
            items.map((item) =>
              item.id
                ? Promise.resolve(
                    supabase
                      .from("messages")
                      .select("id", { head: true, count: "exact" })
                      .eq("conversation_id", item.id)
                  )
                    .then(({ count }) => count ?? 0)
                    .catch(() => 0)
                : Promise.resolve(0)
            )
          );

          const counts: Record<string, number> = {};
          items.forEach((item, idx) => {
            if (item.id) counts[item.id] = results[idx] ?? 0;
          });

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
        const [entry, messages] = await Promise.all([
          getJournalEntryById(selectedEntryId),
          listMessages(selectedEntryId, { limit: 200 }),
        ]);

        if (!isCancelled) {
          setSelectedEntry(entry);
          setAnnotations(
            messages.map(mapMessageToAnnotation).filter(isNotNull)
          );
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

  const handleSelectEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
    setMode("entryChat");
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
      return;
    }

    if (showEntries) {
      setMode("categories");
      setSelectedType(null);
      setEntries([]);
      setEntriesError(null);
    }
  }, [showEntries, showEntryChat]);

  return (
    <Modal
      visible={isModalVisible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} accessible={false}>
        <Animated.View
          style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}
        >
          <Pressable
            style={styles.sidebarPressable}
            onPress={(e) => e.stopPropagation()}
            accessible={false}
          >
            <SafeAreaView style={styles.sidebarContent}>
              <View style={styles.modalHeader}>
                {!showCategories ? (
                  <TouchableOpacity
                    onPress={handleBack}
                    style={styles.backButton}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={20}
                      color={colors.textPrimary}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerSpacer} />
                )}
                <Text style={styles.modalTitle}>
                  {showCategories && "Menu"}
                  {showEntries && selectedType
                    ? `${ENTRY_TYPE_LABELS[selectedType]}`
                    : null}
                  {showEntryChat && selectedEntry ? "Conversation" : null}
                </Text>
                <View style={styles.headerSpacer} />
              </View>

              {showCategories && (
                <MenuCategories onSelectType={handleSelectType} />
              )}

              {showEntries && selectedType && (
                <MenuEntries
                  entries={entries}
                  loading={entriesLoading}
                  error={entriesError}
                  annotationCounts={annotationCounts}
                  selectedType={selectedType}
                  onSelectEntry={handleSelectEntry}
                  onEntriesUpdate={setEntries}
                />
              )}

              {showEntryChat && selectedEntry && (
                <MenuEntryChat
                  entry={selectedEntry}
                  annotations={annotations}
                  loading={annotationsLoading}
                  error={annotationsError}
                  onAnnotationsUpdate={setAnnotations}
                  onAnnotationCountUpdate={(entryId, delta) =>
                    setAnnotationCounts((prev) => ({
                      ...prev,
                      [entryId]: (prev[entryId] || 0) + delta,
                    }))
                  }
                  onErrorUpdate={setAnnotationsError}
                />
              )}

              {/* Footer with Settings Button */}
              {showCategories && (
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.footerSettingsButton}
                    onPress={() => setShowSettings(true)}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </SafeAreaView>
          </Pressable>
        </Animated.View>
      </Pressable>

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        session={session}
      />
    </Modal>
  );
};

function mapMessageToAnnotation(message: RemoteMessage): Annotation | null {
  const metadata = message.metadata ?? undefined;
  const messageKind = metadata?.messageKind;

  if (messageKind === "entry" || messageKind === "autoReply") {
    return null;
  }

  const channel = metadata?.channel;
  const annotationChannel: AnnotationChannel =
    channel === "ai" || channel === "system" ? channel : "note";

  const kind: Annotation["kind"] =
    message.role === "assistant"
      ? "bot"
      : message.role === "system"
        ? "system"
        : "user";

  return {
    id: message.id,
    entryId: message.conversation_id,
    kind,
    channel: annotationChannel,
    content: message.content,
    created_at: message.created_at,
    metadata,
  };
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      flexDirection: "row",
    },
    sidebar: {
      width: 300,
      backgroundColor: colors.background,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 20,
    },
    sidebarPressable: {
      flex: 1,
    },
    sidebarContent: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
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
    backButton: {
      width: 36,
      height: 36,
      borderRadius: radii.sm,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.surface,
    },
    headerSpacer: {
      width: 36,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
    },
    footerSettingsButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
  });

export default MenuModal;
