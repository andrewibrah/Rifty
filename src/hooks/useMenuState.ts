import { useState, useCallback, useEffect } from "react";
import type { EntryType, RemoteJournalEntry } from "../services/data";
import { listJournals } from "../services/data";
import { supabase } from "../lib/supabase";

type MenuMode = "categories" | "entries" | "entryChat";

export const useMenuState = () => {
  const [mode, setMode] = useState<MenuMode>("categories");
  const [selectedType, setSelectedType] = useState<EntryType | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<RemoteJournalEntry | null>(
    null
  );

  // Entries state
  const [entries, setEntries] = useState<RemoteJournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  // Annotation counts
  const [annotationCounts, setAnnotationCounts] = useState<
    Record<string, number>
  >({});

  // Entry counts by type
  const [entryCounts, setEntryCounts] = useState<Record<EntryType, number>>({
    goal: 0,
    journal: 0,
    schedule: 0,
  });

  const handleSelectType = useCallback((type: EntryType) => {
    setSelectedType(type);
    setMode("entries");
  }, []);

  const handleSelectEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
    setMode("entryChat");
  }, []);

  const handleBack = useCallback(() => {
    if (mode === "entryChat") {
      setMode("entries");
      setSelectedEntryId(null);
      setSelectedEntry(null);
      return;
    }
    if (mode === "entries") {
      setMode("categories");
      setSelectedType(null);
      setEntries([]);
      setEntriesError(null);
    }
  }, [mode]);

  // Load entry counts for all types
  const loadEntryCounts = useCallback(async () => {
    try {
      const [goals, journals, schedules] = await Promise.all([
        listJournals({ type: "goal", limit: 1000 }),
        listJournals({ type: "journal", limit: 1000 }),
        listJournals({ type: "schedule", limit: 1000 }),
      ]);

      setEntryCounts({
        goal: goals.length,
        journal: journals.length,
        schedule: schedules.length,
      });
    } catch (error) {
      console.error("Error loading entry counts:", error);
    }
  }, []);

  // Load entry counts on mount
  useEffect(() => {
    loadEntryCounts();
  }, [loadEntryCounts]);

  // Update entry counts when entries array changes
  useEffect(() => {
    if (selectedType && entries.length >= 0) {
      setEntryCounts((prev) => ({
        ...prev,
        [selectedType]: entries.length,
      }));
    }
  }, [entries, selectedType]);

  // Update all entry counts from Supabase when entries are created/deleted
  const refreshAllEntryCounts = useCallback(async () => {
    try {
      const [goals, journals, schedules] = await Promise.all([
        listJournals({ type: "goal", limit: 1000 }),
        listJournals({ type: "journal", limit: 1000 }),
        listJournals({ type: "schedule", limit: 1000 }),
      ]);

      setEntryCounts({
        goal: goals.length,
        journal: journals.length,
        schedule: schedules.length,
      });
    } catch (error) {
      console.error("Error refreshing all entry counts:", error);
    }
  }, []);

  // Refresh function to reload entries and counts
  const refreshMenu = useCallback(async () => {
    await loadEntryCounts();
    if (selectedType) {
      // Reload entries for current type
      try {
        const items = await listJournals({ type: selectedType, limit: 100 });
        setEntries(items);

        // Reload annotation counts
        const results = await Promise.all(
          items.map((item) =>
            item.id
              ? Promise.resolve(
                  supabase
                    .from("messages")
                    .select("id", { head: true, count: "exact" })
                    .eq("conversation_id", item.id)
                    .eq("metadata->>channel", "note")
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
      } catch (error) {
        console.error("Error refreshing menu:", error);
      }
    }
  }, [selectedType, loadEntryCounts]);

  // Load entries when type is selected
  useEffect(() => {
    let isCancelled = false;

    if (!selectedType) {
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

          // Load annotation counts
          const results = await Promise.all(
            items.map((item) =>
              item.id
                ? Promise.resolve(
                    supabase
                      .from("messages")
                      .select("id", { head: true, count: "exact" })
                      .eq("conversation_id", item.id)
                      .eq("metadata->>channel", "note")
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
  }, [selectedType]);

  return {
    // State
    mode,
    selectedType,
    selectedEntryId,
    selectedEntry,
    entries,
    entriesLoading,
    entriesError,
    annotationCounts,
    entryCounts,

    // Actions
    handleSelectType,
    handleSelectEntry,
    handleBack,
    setSelectedEntry,
    setAnnotationCounts,
    setEntries,
    loadEntryCounts,
    refreshAllEntryCounts,
    refreshMenu,
  };
};
