import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { EntryType, RemoteJournalEntry } from "../../services/data";
import {
  deleteJournalEntry,
  listJournals,
  deleteAllEntriesByType,
} from "../../services/data";
import { getColors, radii, spacing, typography } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface MenuListProps {
  mode: "categories" | "entries" | "entryChat";
  selectedType: EntryType | null;
  entries: RemoteJournalEntry[];
  entriesLoading: boolean;
  entriesError: string | null;
  annotationCounts: Record<string, number>;
  entryCounts: Record<EntryType, number>;
  onSelectType: (type: EntryType) => void;
  onSelectEntry: (entryId: string) => void;
  onEntriesUpdate: (entries: RemoteJournalEntry[]) => void;
  onShowHistory?: () => void;
  onSelectMoments?: () => void;
  onSelectGoalsDashboard?: () => void;
  onSelectReview?: () => void;
}

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  goal: "Goals",
  journal: "Journals",
  schedule: "Schedules",
};

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

const MenuList: React.FC<MenuListProps> = ({
  mode,
  selectedType,
  entries,
  entriesLoading,
  entriesError,
  annotationCounts,
  entryCounts,
  onSelectType,
  onSelectEntry,
  onEntriesUpdate,
  onShowHistory,
  onSelectMoments,
  onSelectGoalsDashboard,
  onSelectReview,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    new Set()
  );

  const handleDeleteEntry = useCallback(
    async (id: string) => {
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
                await deleteJournalEntry(id);
                const updatedEntries = await listJournals(
                  selectedType
                    ? { type: selectedType, limit: 100 }
                    : { limit: 100 }
                );
                onEntriesUpdate(updatedEntries);
              } catch (error) {
                console.error("Error deleting entry:", error);
              }
            },
          },
        ]
      );
    },
    [selectedType, onEntriesUpdate]
  );

  // Selection mode handlers
  const handleLongPressEntry = useCallback(
    (id: string) => {
      if (!isSelectionMode) {
        setIsSelectionMode(true);
        setSelectedEntries(new Set([id]));
      }
    },
    [isSelectionMode]
  );

  const handleToggleSelection = useCallback(
    (id: string) => {
      if (isSelectionMode) {
        setSelectedEntries((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
          }
          return newSet;
        });
      } else {
        onSelectEntry(id);
      }
    },
    [isSelectionMode, onSelectEntry]
  );

  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedEntries(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedEntries.size === 0) return;

    const entryCount = selectedEntries.size;
    Alert.alert(
      "Delete Selected Entries",
      `Are you sure you want to delete ${entryCount} ${
        entryCount === 1 ? "entry" : "entries"
      }? This cannot be undone.`,
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
              // Delete all selected entries
              await Promise.all(
                Array.from(selectedEntries).map((id) => deleteJournalEntry(id))
              );

              // Refresh entries
              const updatedEntries = await listJournals(
                selectedType
                  ? { type: selectedType, limit: 100 }
                  : { limit: 100 }
              );
              onEntriesUpdate(updatedEntries);

              // Exit selection mode
              setIsSelectionMode(false);
              setSelectedEntries(new Set());
            } catch (error) {
              console.error("Error deleting selected entries:", error);
              Alert.alert(
                "Error",
                "Failed to delete some entries. Please try again."
              );
            }
          },
        },
      ]
    );
  }, [selectedEntries, selectedType, onEntriesUpdate]);

  const handleClearAllEntries = useCallback(
    async (type: EntryType) => {
      const typeLabel =
        type === "goal"
          ? "Goals"
          : type === "journal"
          ? "Journals"
          : "Schedules";

      Alert.alert(
        `Clear All ${typeLabel}`,
        `Are you sure you want to delete ALL ${typeLabel.toLowerCase()}? This will permanently remove all ${typeLabel.toLowerCase()} from your database and cannot be undone.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete All",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteAllEntriesByType(type);
                const updatedEntries = await listJournals({
                  type,
                  limit: 100,
                });
                onEntriesUpdate(updatedEntries);
              } catch (error) {
                console.error("Error clearing all entries:", error);
                Alert.alert(
                  "Error",
                  "Unable to clear all entries. Please try again."
                );
              }
            },
          },
        ]
      );
    },
    [selectedType, onEntriesUpdate]
  );

  const renderCategoryItem = useCallback(
    (type: EntryType) => {
      const count = entryCounts[type];
      return (
        <TouchableOpacity
          key={type}
          style={styles.categoryButton}
          onPress={() => onSelectType(type)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons
              name={getIconForType(type)}
              size={18}
              color={colors.accent}
            />
          </View>
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryButtonText}>
              {ENTRY_TYPE_LABELS[type]}
            </Text>
            <Text style={styles.categoryCountText}>
              {count} {count === 1 ? "entry" : "entries"}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [onSelectType, colors, styles, entryCounts]
  );

  const renderEntryItem = useCallback(
    ({ item }: { item: RemoteJournalEntry }) => {
      const updateCount = item.id ? annotationCounts[item.id] || 0 : 0;
      const isSelected = item.id ? selectedEntries.has(item.id) : false;

      return (
        <TouchableOpacity
          style={[
            styles.historyItem,
            isSelectionMode && isSelected && styles.selectedItem,
          ]}
          onPress={() => item.id && handleToggleSelection(item.id)}
          onLongPress={() => item.id && handleLongPressEntry(item.id)}
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
    [
      annotationCounts,
      selectedEntries,
      isSelectionMode,
      handleToggleSelection,
      handleLongPressEntry,
      colors,
      styles,
    ]
  );

  if (mode === "categories") {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionHint}>What would you like to review?</Text>
        {(["goal", "journal", "schedule"] as EntryType[]).map(
          renderCategoryItem
        )}
        <TouchableOpacity
          style={[styles.categoryButton, styles.dashboardButton]}
          onPress={onSelectGoalsDashboard ?? (() => undefined)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons name="flag-outline" size={18} color={colors.accent} />
          </View>
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryButtonText}>Goals Dashboard</Text>
            <Text style={styles.categoryCountText}>
              Track milestones and progress
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryButton, styles.momentsButton]}
          onPress={onSelectMoments ?? (() => undefined)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
          </View>
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryButtonText}>Atomic Moments</Text>
            <Text style={styles.categoryCountText}>
              Browse saved breakthroughs
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryButton, styles.reviewButton]}
          onPress={onSelectReview ?? (() => undefined)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons
              name="trending-up-outline"
              size={18}
              color={colors.accent}
            />
          </View>
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryButtonText}>Weekly Review</Text>
            <Text style={styles.categoryCountText}>
              Highlights, patterns, next steps
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.categoryButton, styles.historyButton]}
          onPress={onShowHistory ?? (() => undefined)}
        >
          <View style={styles.categoryIconContainer}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
          </View>
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryButtonText}>Main History</Text>
            <Text style={styles.categoryCountText}>
              View archived conversations
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        {entriesLoading && (
          <ActivityIndicator
            style={styles.loadingIndicator}
            color={colors.textPrimary}
          />
        )}
        {entriesError && <Text style={styles.errorText}>{entriesError}</Text>}
        {!entriesLoading && !entriesError && entries.length === 0 && (
          <Text style={styles.emptyState}>No entries saved yet.</Text>
        )}
        <FlatList
          style={styles.list}
          data={entries}
          keyExtractor={(item, index) => {
            if (item.id == null) {
              console.warn(
                "[MenuList] Entry missing id, falling back to composite key",
                item
              );
            }

            return item.id != null
              ? item.id.toString()
              : `${item.type}-${item.created_at ?? "unknown"}-${index}`;
          }}
          renderItem={renderEntryItem}
        />
      </View>
      {!entriesLoading &&
        !entriesError &&
        entries.length > 0 &&
        selectedType && (
          <View style={styles.fixedFooter}>
            {isSelectionMode ? (
              <View style={styles.selectionFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelSelection}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.selectionCounter}>
                  {selectedEntries.size} selected
                </Text>
                <TouchableOpacity
                  style={[
                    styles.deleteSelectedButton,
                    selectedEntries.size === 0 &&
                      styles.deleteSelectedButtonDisabled,
                  ]}
                  onPress={handleDeleteSelected}
                  disabled={selectedEntries.size === 0}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={
                      selectedEntries.size === 0
                        ? colors.textTertiary
                        : colors.background
                    }
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.deleteAllButton}
                onPress={() => handleClearAllEntries(selectedType)}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentContainer: {
      flex: 1,
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
      paddingVertical: spacing.md + spacing.xs,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderLeftWidth: 2,
      borderLeftColor: "transparent",
    },
    dashboardButton: {
      borderLeftColor: colors.accent,
    },
    reviewButton: {
      borderLeftColor: colors.accent,
    },
    momentsButton: {
      borderLeftColor: colors.accent,
    },
    historyButton: {
      marginTop: spacing.lg,
      borderLeftColor: colors.accent,
    },
    categoryIconContainer: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: "rgba(99, 102, 241, 0.1)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.xs,
    },
    categoryTextContainer: {
      flex: 1,
    },
    categoryButtonText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 16,
      color: colors.textPrimary,
      letterSpacing: 0.3,
    },
    categoryCountText: {
      fontFamily: typography.caption.fontFamily,
      fontWeight: typography.caption.fontWeight,
      letterSpacing: typography.caption.letterSpacing,
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    list: {
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
    fixedFooter: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      alignItems: "flex-end",
    },
    deleteAllButton: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xs,
      borderRadius: radii.sm,
      backgroundColor: "transparent",
    },
    historyItem: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginHorizontal: spacing.xs,
      marginVertical: spacing.xs / 2,
      borderRadius: radii.md,
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
    // Selection mode styles
    selectedItem: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      borderRightWidth: 3,
      borderRightColor: colors.accent,
      borderTopWidth: 3,
      borderTopColor: colors.accent,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radii.md,
      marginHorizontal: spacing.xs,
      marginVertical: spacing.xs / 2,
    },
    selectionFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cancelButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flex: 0,
    },
    cancelButtonText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "500",
      fontSize: 14,
      color: colors.textPrimary,
    },
    selectionCounter: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "500",
      fontSize: 14,
      color: colors.textSecondary,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      flex: 0,
      marginHorizontal: spacing.sm,
    },
    deleteSelectedButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      backgroundColor: colors.error,
      flex: 0,
      minWidth: 50,
    },
    deleteSelectedButtonDisabled: {
      opacity: 0.3,
      backgroundColor: colors.surface,
    },
  });

export default MenuList;
