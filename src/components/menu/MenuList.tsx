import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { EntryType, RemoteJournalEntry } from "../../services/data";
import {
  deleteJournalEntries,
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
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<
    Map<string, RemoteJournalEntry>
  >(() => new Map());

  const selectedIds = useMemo(
    () => Array.from(selectedEntries.keys()),
    [selectedEntries]
  );
  const selectedEntriesList = useMemo(
    () =>
      selectedIds
        .map((id) => selectedEntries.get(id))
        .filter(
          (entry): entry is RemoteJournalEntry =>
            entry != null && entry.id != null
        ),
    [selectedEntries, selectedIds]
  );
  const selectedCount = selectedIds.length;
  const selectionKey = useMemo(
    () => `${selectionMode ? "on" : "off"}-${selectedIds.join(",")}`,
    [selectedIds, selectionMode]
  );

  useEffect(() => {
    if (mode !== "entries" && selectionMode) {
      setSelectedEntries(new Map());
      setSelectionMode(false);
    }
  }, [mode, selectionMode]);

  useEffect(() => {
    if (!selectionMode) {
      return;
    }

    setSelectedEntries((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const allowedIds = new Set(
        entries
          .map((entry) => entry.id)
          .filter((id): id is string => typeof id === "string")
      );

      let changed = false;
      const next = new Map<string, RemoteJournalEntry>();
      previous.forEach((value, key) => {
        if (allowedIds.has(key)) {
          next.set(key, value);
        } else {
          changed = true;
        }
      });

      if (!changed && next.size === previous.size) {
        return previous;
      }

      return next;
    });
  }, [entries, selectionMode]);

  useEffect(() => {
    if (selectionMode && selectedEntries.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedEntries]);

  const handleCancelSelection = useCallback(() => {
    setSelectedEntries(new Map());
    setSelectionMode(false);
  }, []);

  const handleToggleSelection = useCallback(
    (entry: RemoteJournalEntry) => {
      if (!entry.id) {
        return;
      }

      setSelectedEntries((previous) => {
        const next = new Map(previous);
        if (next.has(entry.id!)) {
          next.delete(entry.id!);
        } else {
          next.set(entry.id!, entry);
        }
        return next;
      });
    },
    []
  );

  const handleEntryLongPress = useCallback(
    (entry: RemoteJournalEntry) => {
      if (!entry.id) {
        return;
      }

      if (!selectionMode) {
        setSelectionMode(true);
        setSelectedEntries(new Map([[entry.id, entry]]));
        return;
      }

      handleToggleSelection(entry);
    },
    [handleToggleSelection, selectionMode]
  );

  const handleEntryPress = useCallback(
    (entry: RemoteJournalEntry) => {
      if (!entry.id) {
        return;
      }

      if (selectionMode) {
        handleToggleSelection(entry);
        return;
      }

      onSelectEntry(entry.id);
    },
    [handleToggleSelection, onSelectEntry, selectionMode]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      return;
    }

    const previewEntry = selectedEntriesList[0];
    const normalizedPreview =
      previewEntry?.content?.trim().replace(/\s+/g, " ") ?? "";
    const truncatedPreview =
      normalizedPreview.length > 60
        ? `${normalizedPreview.slice(0, 60)}...`
        : normalizedPreview;
    const previewText =
      selectedIds.length === 1 && truncatedPreview.length > 0
        ? `"${truncatedPreview}"`
        : `${selectedIds.length} entries`;
    const deleteLabel = `Delete ${previewText}? This cannot be undone.`;

    Alert.alert(
      selectedIds.length === 1 ? "Delete Entry" : "Delete Entries",
      deleteLabel,
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
              await deleteJournalEntries(selectedIds);
              setSelectedEntries(new Map());
              const updatedEntries = await listJournals(
                selectedType
                  ? { type: selectedType, limit: 100 }
                  : { limit: 100 }
              );
              onEntriesUpdate(updatedEntries);
            } catch (error) {
              console.error("Error deleting entries:", error);
              Alert.alert(
                "Error",
                "Unable to delete selected entries. Please try again."
              );
            }
          },
        },
      ]
    );
  }, [onEntriesUpdate, selectedEntriesList, selectedIds, selectedType]);

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
      const isSelected =
        selectionMode && item.id != null && selectedEntries.has(item.id);

      return (
        <TouchableOpacity
          style={[
            styles.historyItem,
            selectionMode && styles.historyItemInSelectionMode,
            selectionMode && styles.historyItemSelectable,
            isSelected && styles.historyItemSelected,
          ]}
          onPress={() => handleEntryPress(item)}
          onLongPress={() => handleEntryLongPress(item)}
          delayLongPress={180}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.historyItemContent,
              selectionMode && styles.historyItemContentIndented,
            ]}
          >
            <Text
              style={[
                styles.historyItemText,
                isSelected && styles.historyItemTextSelected,
              ]}
              numberOfLines={3}
            >
              {item.content}
            </Text>
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
      colors.background,
      handleEntryLongPress,
      handleEntryPress,
      selectedEntries,
      selectionMode,
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
          keyExtractor={(item) =>
            item.id != null
              ? item.id.toString()
              : `${item.type}-${item.created_at ?? ""}`
          }
          renderItem={renderEntryItem}
          extraData={selectionKey}
          contentContainerStyle={
            selectionMode ? styles.selectionModeContent : undefined
          }
        />
      </View>
      {!entriesLoading && !entriesError && entries.length > 0 && (
        <View
          style={[
            styles.fixedFooter,
            selectionMode && styles.fixedFooterSelection,
          ]}
        >
          {selectionMode ? (
            <>
              <TouchableOpacity
                onPress={handleCancelSelection}
                style={styles.selectionFooterCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.selectionFooterCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.selectionFooterCount}>
                {selectedCount} selected
              </Text>
              <TouchableOpacity
                onPress={handleDeleteSelected}
                disabled={selectedCount === 0}
                style={[
                  styles.selectionFooterDelete,
                  selectedCount === 0 && styles.selectionFooterDeleteDisabled,
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={
                    selectedCount === 0
                      ? colors.textSecondary
                      : colors.background
                  }
                />
              </TouchableOpacity>
            </>
          ) : selectedType ? (
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
          ) : null}
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
    selectionModeContent: {
      paddingBottom: spacing.xl,
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
      marginBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      alignItems: "flex-end",
    },
    fixedFooterSelection: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    selectionFooterCancel: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
    },
    selectionFooterCancelText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 14,
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },
    selectionFooterCount: {
      flex: 1,
      textAlign: "center" as const,
      fontFamily: typography.body.fontFamily,
      fontWeight: "600" as const,
      fontSize: 12,
      color: colors.textSecondary,
      letterSpacing: 0.2,
      backgroundColor: colors.surface,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      marginHorizontal: spacing.sm,
    },
    selectionFooterDelete: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      backgroundColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
    },
    selectionFooterDeleteDisabled: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
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
      flexDirection: "row",
      alignItems: "flex-start",
    },
    historyItemInSelectionMode: {
      paddingLeft: spacing.sm,
      paddingRight: spacing.sm,
      marginBottom: spacing.sm,
      borderBottomWidth: 0,
    },
    historyItemSelectable: {
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.textPrimary,
      shadowOpacity: Platform.OS === "ios" ? 0.08 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: Platform.OS === "android" ? 1 : 0,
    },
    historyItemSelected: {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.accent,
      shadowColor: colors.accent,
      shadowOpacity: Platform.OS === "ios" ? 0.12 : 0,
      shadowRadius: 12,
      elevation: Platform.OS === "android" ? 2 : 0,
    },
    historyItemContent: {
      flex: 1,
    },
    historyItemContentIndented: {
      marginLeft: spacing.sm,
    },
    historyItemText: {
      fontFamily: typography.body.fontFamily,
      fontWeight: typography.body.fontWeight,
      letterSpacing: typography.body.letterSpacing,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    historyItemTextSelected: {
      color: colors.textPrimary,
      opacity: 0.9,
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
  });

export default MenuList;
