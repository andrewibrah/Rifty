import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ChatMessage,
  MessageGroup,
  EntryMessage,
  BotMessage,
} from "../types/chat";
import { appendMessage, listJournals, type EntryType } from "../services/data";
import {
  createEntryMVP,
  type ProcessedEntryResult,
} from "../lib/entries";
import type {
  EntryNotePayload,
  IntentMetadata,
  ProcessingStep,
  ProcessingStepId,
} from "../types/intent";
import type { MemoryKind } from "@/agent/memory";
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
      const trimmedContent = content.trim();
      if (!trimmedContent) return null;

      const tempId = Date.now().toString();

      // Determine if this is an analyst query or an entry
      const isQuery = isAnalystQuery(trimmedContent);

      if (isQuery) {
        // Analyst mode: answer the question
        const userMessage: BotMessage = {
          id: tempId,
          kind: "bot",
          afterId: tempId,
          content: trimmedContent,
          created_at: new Date().toISOString(),
          status: "sending",
        };

        setMessages((prevMessages) => [...prevMessages, userMessage]);
        setIsTyping(true);

        try {
          const result = await answerAnalystQuery(trimmedContent);

          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === tempId ? { ...msg, status: "sent" as const } : msg
            )
          );

          const botMessage: BotMessage = {
            id: `bot-${tempId}`,
            kind: "bot",
            afterId: tempId,
            content: result.answer,
            created_at: new Date().toISOString(),
            status: "sent",
          };

          setMessages((prevMessages) => [...prevMessages, botMessage]);
        } catch (error) {
          console.error("Error answering query:", error);
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === tempId ? { ...msg, status: "failed" as const } : msg
            )
          );
        } finally {
          setIsTyping(false);
        }
      } else {
        // Entry mode: create entry with MVP flow
        const optimisticType: EntryType = "journal";
        const userMessage: EntryMessage = {
          id: tempId,
          kind: "entry",
          type: optimisticType,
          content: trimmedContent,
          created_at: new Date().toISOString(),
          status: "sending",
        };

        setMessages((prevMessages) => [...prevMessages, userMessage]);

        try {
          const result: ProcessedEntryResult =
            await createEntryMVP(trimmedContent);
          const saved = result.entry;
          const resolvedType = (saved.type ?? "journal") as EntryType;
          const aiIntent = saved.ai_intent ?? resolvedType;
          const aiConfidence =
            typeof saved.ai_confidence === "number"
              ? saved.ai_confidence
              : null;
          const aiMeta = saved.ai_meta ?? null;

          if (saved?.id) {
            const entryId = saved.id;

            if (onEntryCreated) {
              onEntryCreated();
            }

            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }

            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === tempId
                  ? {
                      ...msg,
                      id: entryId,
                      status: "sent" as const,
                      type: resolvedType,
                      aiIntent,
                      aiConfidence,
                      aiMeta,
                    }
                  : msg
              )
            );

            appendMessage(entryId, "user", trimmedContent, {
              messageKind: "entry",
              entryType: resolvedType,
              aiIntent,
              aiConfidence,
              aiMeta,
            }).catch((error) => {
              console.error("Unable to record entry message", error);
            });

            setIsTyping(true);

            const reflection = result.reflection || "Saved. Keep going.";

            // If action was suggested, store it
            if (result.summary?.suggested_action) {
              setPendingAction({
                entryId,
                action: result.summary.suggested_action,
              });
            }

            // If goal was detected, store it
            if (result.goal_detected && result.goal) {
              setPendingGoal({
                entryId,
                goalData: result.goal,
              });
            }

            timeoutRef.current = setTimeout(() => {
              setIsTyping(false);

              const botMessage: BotMessage = {
                id: `bot-${entryId}`,
                kind: "bot",
                afterId: entryId,
                content: reflection,
                created_at: new Date().toISOString(),
                status: "sent",
              };

              setMessages((prevMessages) => [...prevMessages, botMessage]);

              appendMessage(entryId, "assistant", reflection, {
                messageKind: "autoReply",
                entryType: resolvedType,
                afterId: entryId,
                aiIntent,
                aiConfidence,
                aiMeta,
              }).catch((error) => {
                console.error("Unable to record auto-reply", error);
              });
            }, 1500);
          }
        } catch (error) {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === tempId ? { ...msg, status: "failed" as const } : msg
            )
          );
          console.error("Error sending message:", error);
        }
      }

      return null;
    },
    [onEntryCreated]
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
