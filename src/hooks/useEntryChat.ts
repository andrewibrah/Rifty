import { useState, useCallback, useEffect } from "react";
import type { Annotation } from "../types/annotations";
import type { RemoteJournalEntry } from "../services/data";
import { listMessages, getJournalEntryById } from "../services/data";
import { getEntrySummary } from "../services/summarization";
import {
  listAtomicMomentsForEntry,
  type AtomicMomentRecord,
} from "../services/atomicMoments";
import { isUUID } from "../utils/uuid";

export const useEntryChat = (
  selectedEntryId: string | null,
  visible: boolean
) => {
  const [selectedEntry, setSelectedEntry] = useState<RemoteJournalEntry | null>(
    null
  );
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);
  const [entrySummary, setEntrySummary] = useState<string | null>(null);
  const [entryEmotion, setEntryEmotion] = useState<string | null>(null);
  const [entryMoments, setEntryMoments] = useState<AtomicMomentRecord[]>([]);

  // Load entry details and annotations
  useEffect(() => {
    let isCancelled = false;

    if (!visible || selectedEntryId == null) {
      return () => {
        isCancelled = true;
      };
    }

    if (!isUUID(selectedEntryId)) {
      setSelectedEntry(null);
      setAnnotations([]);
      setEntrySummary(null);
      setEntryEmotion(null);
      setEntryMoments([]);
      setAnnotationsError(
        "Entry details will appear once this entry finishes syncing."
      );
      setAnnotationsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    const loadEntryDetail = async () => {
      setAnnotationsLoading(true);
      setAnnotationsError(null);
      try {
        const [entry, messages, summary, moments] = await Promise.all([
          getJournalEntryById(selectedEntryId),
          listMessages(selectedEntryId, { limit: 200 }),
          getEntrySummary(selectedEntryId),
          listAtomicMomentsForEntry(selectedEntryId, { limit: 20 }),
        ]);

        if (!isCancelled) {
          setSelectedEntry(entry);
          setAnnotations(
            messages.map(mapMessageToAnnotation).filter(isNotNull)
          );
          setEntrySummary(summary?.summary ?? null);
          setEntryEmotion(summary?.emotion ?? null);
          setEntryMoments(moments);
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

  const handleAnnotationsUpdate = useCallback(
    (newAnnotations: Annotation[]) => {
      setAnnotations(newAnnotations);
    },
    []
  );

  const handleErrorUpdate = useCallback((error: string | null) => {
    setAnnotationsError(error);
  }, []);

  const refreshAnnotations = useCallback(async () => {
    if (!selectedEntryId) return;

    if (!isUUID(selectedEntryId)) {
      setAnnotations([]);
      setEntrySummary(null);
      setEntryEmotion(null);
      setEntryMoments([]);
      setAnnotationsError(
        "Entry details will appear once this entry finishes syncing."
      );
      setAnnotationsLoading(false);
      return;
    }

    setAnnotationsLoading(true);
    setAnnotationsError(null);
    try {
      const [entry, messages, summary, moments] = await Promise.all([
        getJournalEntryById(selectedEntryId),
        listMessages(selectedEntryId, { limit: 200 }),
        getEntrySummary(selectedEntryId),
        listAtomicMomentsForEntry(selectedEntryId, { limit: 20 }),
      ]);
      setSelectedEntry(entry);
      setAnnotations(messages.map(mapMessageToAnnotation).filter(isNotNull));
      setEntrySummary(summary?.summary ?? null);
      setEntryEmotion(summary?.emotion ?? null);
      setEntryMoments(moments);
    } catch (error) {
      console.error("Error refreshing annotations", error);
      setAnnotationsError("Unable to refresh annotations.");
    } finally {
      setAnnotationsLoading(false);
    }
  }, [selectedEntryId]);

  return {
    selectedEntry,
    annotations,
    annotationsLoading,
    annotationsError,
    entrySummary,
    entryEmotion,
    entryMoments,
    setAnnotations: handleAnnotationsUpdate,
    onErrorUpdate: handleErrorUpdate,
    refreshAnnotations,
  };
};

// Helper functions
function mapMessageToAnnotation(message: any): Annotation | null {
  const metadata = message.metadata ?? undefined;
  const messageKind = metadata?.messageKind;

  if (messageKind === "entry" || messageKind === "autoReply") {
    return null;
  }

  const channel = metadata?.channel;
  const annotationChannel: "note" | "ai" | "system" =
    channel === "ai" || channel === "system" ? channel : "note";

  const kind: "user" | "bot" | "system" =
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
