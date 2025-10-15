import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ChatMessage,
  MessageGroup,
  EntryMessage,
  BotMessage,
} from "../types/chat";
import { appendMessage, listJournals, type EntryType } from "../services/data";
import {
  createEntryFromChat,
  type CreateEntryFromChatArgs,
  createEntryMVP,
  type ProcessedEntryResult,
} from "../lib/entries";
import { buildPredictionFromNative } from "../lib/intent";
import { composeEntryNote } from "../services/ai";
import type {
  EntryNotePayload,
  IntentMetadata,
  IntentPredictionResult,
  ProcessingStep,
  ProcessingStepId,
} from "../types/intent";
import { handleMessage } from "@/chat/handleMessage";
import type { IntentPayload } from "@/chat/handleMessage";
import { Memory } from "@/agent/memory";
import type { MemoryKind } from "@/agent/memory";
import { planAction } from "@/agent/planner";
import type { PlannerResponse } from "@/agent/types";
import { Telemetry } from "@/agent/telemetry";
import { Outbox } from "@/agent/outbox";
import { handleToolCall } from "@/agent/actions";
import type { ToolExecutionResult } from "@/agent/actions";
import { answerAnalystQuery } from "../services/memory";

/**
 * Detect if input is a question (analyst mode) or an entry
 */
function isAnalystQuery(content: string): boolean {
  const trimmed = content.trim().toLowerCase();

  // Question patterns
  const questionPatterns = [
    /^(what|when|where|who|why|how|which|can|could|should|would|will|is|are|am|do|does|did)\b/i,
    /\?$/,
    /^(show|tell|find|analyze|review|summarize|explain)\b/i,
  ];

  return questionPatterns.some((pattern) => pattern.test(trimmed));
}

const buildLocalFallbackNote = (
  label: string,
  message: string
): EntryNotePayload => ({
  noteTitle: `${label} draft`,
  noteBody: message.slice(0, 280).trim() || label,
  searchTag: label.toLowerCase().replace(/\s+/g, "-") || "journal-entry",
  guidance: "Fallback note generated locally while offline.",
});

const formatDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatDateTime = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
};

const buildConfirmationMessage = (
  entryType: EntryType,
  slots: Record<string, string>,
  fallback: string,
  offline: boolean
): string => {
  if (offline) return fallback;
  switch (entryType) {
    case "schedule": {
      const start = formatDateTime(slots.start);
      const endTime = formatDateTime(slots.end);
      const location = slots.location ? ` at ${slots.location}` : "";
      if (start && endTime) {
        return `Booked ${slots.title ?? "your event"} → ${start} – ${endTime}${location}`;
      }
      if (start) {
        return `Booked ${slots.title ?? "your event"} → ${start}${location}`;
      }
      break;
    }
    case "goal": {
      const due = formatDate(slots.due);
      if (slots.title && due) {
        return `Locked it in: ${slots.title} • Target ${due}`;
      }
      if (slots.title) {
        return `Locked it in: ${slots.title}`;
      }
      break;
    }
    case "journal": {
      if (slots.title) {
        return `Captured “${slots.title}” — saved to your journal.`;
      }
      break;
    }
    default:
      break;
  }
  return fallback;
};

const entryTypeToMemoryKind: Record<EntryType, MemoryKind> = {
  journal: "entry",
  goal: "goal",
  schedule: "event",
};

const successMessages: Record<EntryType, string> = {
  journal: "Saved to your journal.",
  goal: "Goal captured and tracked.",
  schedule: "Event scheduled successfully.",
};

const processingTemplate = (): ProcessingStep[] => [
  {
    id: "ml_detection",
    label: "ML prediction",
    status: "pending",
  },
  {
    id: "knowledge_search",
    label: "Knowledge base",
    status: "pending",
  },
  {
    id: "openai_request",
    label: "OpenAI request",
    status: "pending",
  },
  {
    id: "openai_response",
    label: "OpenAI received",
    status: "pending",
  },
];

const updateTimeline = (
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

const buildIntentMeta = (
  prediction: IntentPredictionResult
): IntentMetadata => ({
  id: prediction.id,
  rawLabel: prediction.rawLabel,
  displayLabel: prediction.label,
  confidence: prediction.confidence,
  subsystem: prediction.subsystem,
  probabilities: prediction.probabilities,
});

export interface IntentReviewTicket {
  messageId: string;
  content: string;
  intent: IntentPredictionResult;
  entryType: EntryType;
}

export const useChatState = (
  onEntryCreated?: () => void
): {
  messages: ChatMessage[];
  isTyping: boolean;
  pendingAction: { entryId: string; action: string } | null;
  pendingGoal: { entryId: string; goalData: any } | null;
  groupMessages: (msgs: ChatMessage[]) => MessageGroup[];
  sendMessage: (content: string) => Promise<IntentReviewTicket | null>;
  retryMessage: (messageId: string) => Promise<void>;
  clearMessages: () => void;
  updateMessageIntent: (
    messageId: string,
    intent: IntentMetadata,
    nextType?: EntryType
  ) => void;
} => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    entryId: string;
    action: string;
  } | null>(null);
  const [pendingGoal, setPendingGoal] = useState<{
    entryId: string;
    goalData: any;
  } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const entries = await listJournals({ limit: 200 });
      const chatMessages: ChatMessage[] = [];

      entries
        .slice()
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .forEach((entry) => {
          if (!entry.id) {
            return;
          }

          const createdAt = entry.created_at || new Date().toISOString();
          const baseMeta = (entry.ai_meta ?? {}) as Record<string, any>;
          const intentMeta = baseMeta?.intent as IntentMetadata | undefined;
          const processing = Array.isArray(baseMeta?.processingTimeline)
            ? (baseMeta.processingTimeline as ProcessingStep[])
            : undefined;

          const entryMessage: EntryMessage = {
            id: entry.id,
            kind: "entry",
            type: entry.type,
            content: entry.content,
            created_at: createdAt,
            status: "sent",
            aiIntent: entry.ai_intent ?? entry.type,
            aiConfidence:
              typeof entry.ai_confidence === "number"
                ? entry.ai_confidence
                : null,
            aiMeta: baseMeta ?? null,
          };
          if (intentMeta) {
            entryMessage.intentMeta = intentMeta;
          }
          if (processing) {
            entryMessage.processing = processing;
          }
          chatMessages.push(entryMessage);

          // Add bot response if exists
          // (We'll reconstruct from metadata later)
          const botMessage: BotMessage = {
            id: `bot-${entry.id}`,
            kind: "bot",
            afterId: entry.id,
            content:
              (baseMeta?.note?.guidance as string | undefined) ??
              successMessages[entry.type],
            created_at: createdAt,
            status: "sent",
          };
          chatMessages.push(botMessage);
        });

      setMessages(chatMessages);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [loadMessages]);

  const groupMessages = useCallback((msgs: ChatMessage[]): MessageGroup[] => {
    if (msgs.length === 0) return [];

    const sortedMsgs = [...msgs].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    sortedMsgs.forEach((message) => {
      const messageTime = new Date(message.created_at).getTime();

      if (
        currentGroup &&
        messageTime - new Date(currentGroup.timestamp).getTime() < 300000
      ) {
        currentGroup.messages.push(message);
      } else {
        currentGroup = {
          id: message.id,
          messages: [message],
          timestamp: message.created_at,
          type: message.kind === "entry" ? "entry" : "bot",
        };
        groups.push(currentGroup);
      }
    });

    return groups;
  }, []);

  const retryMessage = useCallback(
    async (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.kind !== "entry" || message.status !== "failed")
        return;

      await sendMessage(message.content);
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== messageId)
      );
    },
    [messages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const updateMessageIntent = useCallback(
    (messageId: string, intentMeta: IntentMetadata, nextType?: EntryType) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId && msg.kind === "entry"
            ? {
                ...msg,
                type: nextType ?? msg.type,
                aiIntent: intentMeta.id,
                aiConfidence: intentMeta.confidence,
                intentMeta,
                aiMeta: {
                  ...(msg.aiMeta ?? {}),
                  intent: intentMeta,
                },
              }
            : msg
        )
      );
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string): Promise<IntentReviewTicket | null> => {
      // Placeholder implementation
      return null;
    },
    []
  );

  return {
    messages,
    isTyping,
    pendingAction,
    pendingGoal,
    groupMessages,
    sendMessage,
    retryMessage,
    clearMessages,
    updateMessageIntent,
  };
};
