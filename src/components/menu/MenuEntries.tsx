import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import type { RemoteJournalEntry, EntryType } from "../../services/data";
import { deleteJournalEntry, listJournals } from "../../services/data";
import { getColors, radii, spacing, typography } from "../../theme";
import { useTheme } from "../../contexts/ThemeContext";

interface MenuEntriesProps {
  entries: RemoteJournalEntry[];
  loading: boolean;
  error: string | null;
  annotationCounts: Record<string, number>;
  selectedType: EntryType;
  onSelectEntry: (entryId: string) => void;
  onEntriesUpdate: (entries: RemoteJournalEntry[]) => void;
}

const MenuEntries: React.FC<MenuEntriesProps> = ({
  entries,
  loading,
  error,
  annotationCounts,
  selectedType,
  onSelectEntry,
  onEntriesUpdate,
}) => {
  const { themeMode } = useTheme();
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors), [colors]);
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
                const updatedEntries = await listJournals({
                  type: selectedType,
                  limit: 100,
                });
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

  const renderItem = useCallback(
    ({ item }: { item: RemoteJournalEntry }) => {
      const updateCount = item.id ? annotationCounts[item.id] || 0 : 0;

      return (
        <TouchableOpacity
          style={styles.historyItem}
          onPress={() => item.id && onSelectEntry(item.id)}
          onLongPress={() => item.id && handleDeleteEntry(item.id)}
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
    [annotationCounts, onSelectEntry, handleDeleteEntry]
  );

  return (
    <View style={styles.container}>
      {loading && (
        <ActivityIndicator
          style={styles.loadingIndicator}
          color={colors.textPrimary}
        />
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {!loading && !error && entries.length === 0 && (
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
        renderItem={renderItem}
      />
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
  });

export default MenuEntries;
