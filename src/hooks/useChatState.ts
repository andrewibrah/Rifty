import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ChatMessage,
  MessageGroup,
  EntryMessage,
  BotMessage,
} from "../types/chat";
import {
  appendMessage,
  listJournals,
  type EntryType,
} from "../services/data";
import {
  createEntryFromChat,
  type CreateEntryFromChatArgs,
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

const successMessages: Record<EntryType, string> = {
  goal: "Saved. Keep up your hard work.",
  journal: "Saved. The more you log, the more data you have of yourself.",
  schedule: "Saved. Your time is your power, use it wisely.",
};

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
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const formatDateTime = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
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
    case 'schedule': {
      const start = formatDateTime(slots.start);
      const endTime = formatDateTime(slots.end);
      const location = slots.location ? ` at ${slots.location}` : '';
      if (start && endTime) {
        return `Booked ${slots.title ?? 'your event'} → ${start} – ${endTime}${location}`;
      }
      if (start) {
        return `Booked ${slots.title ?? 'your event'} → ${start}${location}`;
      }
      break;
    }
    case 'goal': {
      const due = formatDate(slots.due);
      if (slots.title && due) {
        return `Locked it in: ${slots.title} • Target ${due}`;
      }
      if (slots.title) {
        return `Locked it in: ${slots.title}`;
      }
      break;
    }
    case 'journal': {
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

  const patchEntryMessage = useCallback(
    (id: string, patch: (message: EntryMessage) => EntryMessage) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id && msg.kind === "entry" ? patch(msg) : msg
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
      const createdAt = new Date().toISOString();
      let processingTimeline = processingTemplate();

      const provisional: EntryMessage = {
        id: tempId,
        kind: "entry",
        type: "journal",
        content: trimmedContent,
        created_at: createdAt,
        status: "sending",
        processing: processingTimeline,
      };

      setMessages((prev) => [...prev, provisional]);

      const applyProcessing = (
        stepId: ProcessingStepId,
        status: ProcessingStep["status"],
        detail?: string
      ) => {
        processingTimeline = updateTimeline(processingTimeline, stepId, status, detail);
        patchEntryMessage(tempId, (msg) => ({
          ...msg,
          processing: processingTimeline,
        }));
      };

      let prediction: IntentPredictionResult | null = null;
      let intentPayload: IntentPayload | null = null;
      let notePayload: EntryNotePayload | null = null;
      let entryType: EntryType = "journal";

      try {
        applyProcessing("ml_detection", "running", "Analyzing");
        intentPayload = await handleMessage(trimmedContent, {
          userTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        prediction = buildPredictionFromNative(intentPayload.nativeIntent);
        entryType = prediction.entryType ?? "journal";
        const intentMeta = buildIntentMeta(prediction);

        applyProcessing(
          "ml_detection",
          "done",
          `${prediction.rawLabel} ${(prediction.confidence * 100).toFixed(1)}%`
        );

        patchEntryMessage(tempId, (msg) => {
          const next: EntryMessage = {
            ...msg,
            type: entryType,
            aiIntent: prediction?.id ?? entryType,
            aiConfidence: prediction?.confidence ?? null,
          };
          if (intentMeta) {
            next.intentMeta = intentMeta;
          }
          return next;
        });

        const decision = intentPayload.decision;
        const memoryCount = intentPayload.memoryMatches.length;
        const contextDetail =
          memoryCount > 0
            ? `Attached ${memoryCount} context snippet${memoryCount === 1 ? '' : 's'}`
            : "No local context";

        applyProcessing("knowledge_search", "done", contextDetail);

        if (decision.kind === "fallback") {
          applyProcessing("openai_request", "skipped", "Confidence below 45%");
          applyProcessing("openai_response", "skipped", "Awaiting user choice");

          patchEntryMessage(tempId, (msg) => ({
            ...msg,
            status: "sent" as const,
            processing: processingTimeline,
          }));

          const fallbackText =
            "Got it. How do you want me to handle that—journal it, schedule it, or set it as a goal?";
          const botMessage: BotMessage = {
            id: `bot-${tempId}`,
            kind: "bot",
            afterId: tempId,
            content: fallbackText,
            created_at: new Date().toISOString(),
            status: "sent",
          };

          setMessages((prevState) => [...prevState, botMessage]);
          return null;
        }

        if (decision.kind === "clarify") {
          applyProcessing("openai_request", "skipped", "Awaiting clarification");
          applyProcessing("openai_response", "skipped", "Awaiting clarification");

          patchEntryMessage(tempId, (msg) => ({
            ...msg,
            status: "sent" as const,
            processing: processingTimeline,
          }));

          const question = decision.question ?? "Could you clarify that intent?";
          const botMessage: BotMessage = {
            id: `bot-${tempId}`,
            kind: "bot",
            afterId: tempId,
            content: question,
            created_at: new Date().toISOString(),
            status: "sent",
          };

          setMessages((prevState) => [...prevState, botMessage]);
          return null;
        }

        let plannerOutput: PlannerResponse | null = null;
        let toolExecution: ToolExecutionResult | null = null;
        let offlinePolishRequired = false;
        try {
          applyProcessing("openai_request", "running", "Planner routing");
          const plannerResult = await planAction({
            payload: intentPayload.enriched,
          });
          plannerOutput = plannerResult.response;
          toolExecution = handleToolCall(plannerOutput, {
            originalText: trimmedContent,
          });
          if (intentPayload.traceId) {
            Telemetry.update(intentPayload.traceId, {
              plan: plannerOutput ?? null,
            }).catch((error) => {
              console.warn('[telemetry] update failed', error);
            });
          }
          applyProcessing(
            "openai_request",
            "done",
            plannerOutput?.action ?? "noop"
          );

          applyProcessing("openai_response", "running", "Drafting note");
          notePayload = await composeEntryNote({
            userMessage: trimmedContent,
            intent: prediction,
            enriched: intentPayload.enriched,
            planner: plannerOutput,
          });
          applyProcessing(
            "openai_response",
            "done",
            notePayload.noteTitle
          );
        } catch (error: any) {
          console.warn("composeEntryNote fallback", error?.message ?? error);
          applyProcessing(
            "openai_request",
            "error",
            error?.message ?? "OpenAI unavailable"
          );
          applyProcessing(
            "openai_response",
            "skipped",
            "Fallback note"
          );
          const fallbackNote =
            (error?.fallbackNote as EntryNotePayload | undefined) ??
            buildLocalFallbackNote(prediction.label, trimmedContent);
          notePayload = fallbackNote;
          if (error?.offline) {
            offlinePolishRequired = true;
            Outbox.queue({
              kind: "polish",
              payload: {
                traceId: intentPayload.traceId,
                intent: intentPayload.routedIntent,
                enriched: intentPayload.enriched,
                content: trimmedContent,
              },
            }).catch((queueError) => {
              console.warn("[outbox] queue failed", queueError);
            });
          }
        }

        if (!prediction) {
          throw new Error("Intent prediction missing");
        }

        const confirmedPrediction = prediction;

        const createArgs: CreateEntryFromChatArgs = {
          content: trimmedContent,
          entryType,
          intent: confirmedPrediction,
          note: notePayload,
          processingTimeline,
          nativeIntent: intentPayload?.nativeIntent,
          enriched: intentPayload.enriched,
          decision: intentPayload.decision,
          redaction: intentPayload.redaction,
          memoryMatches: intentPayload.memoryMatches,
          plan: plannerOutput,
        };

        const saved = await createEntryFromChat(createArgs);

        if (onEntryCreated) {
          onEntryCreated();
        }

        const createdAtTs = saved.created_at
          ? new Date(saved.created_at).getTime()
          : Date.now();
        await Memory.upsert({
          id: saved.id,
          kind: entryTypeToMemoryKind[entryType],
          text: trimmedContent,
          ts: createdAtTs,
        });

        const confirmedIntentMeta = buildIntentMeta(confirmedPrediction);
        const aiMetaPayload = {
          intent: confirmedIntentMeta,
          routing: intentPayload.decision,
          slots: intentPayload.routedIntent.slots,
          memoryMatches: intentPayload.memoryMatches,
          contextSnippets: intentPayload.enriched.contextSnippets,
          redaction: intentPayload.redaction.replacementMap,
          payload: intentPayload.enriched,
          traceId: intentPayload.traceId,
          plannedExecution: toolExecution,
          plan: plannerOutput,
          note: notePayload,
          processingTimeline,
          nativeTop3: intentPayload?.nativeIntent.top3 ?? [],
          rawIntent: intentPayload,
        };

        patchEntryMessage(tempId, (msg) => ({
          ...msg,
          id: saved.id,
          status: "sent" as const,
          type: entryType,
          aiIntent: confirmedPrediction.id ?? entryType,
          aiConfidence: confirmedPrediction.confidence ?? null,
          aiMeta: aiMetaPayload,
          intentMeta: confirmedIntentMeta,
          processing: processingTimeline,
        }));

        appendMessage(saved.id, "user", trimmedContent, {
          messageKind: "entry",
          entryType,
          intent: aiMetaPayload.intent,
          note: notePayload,
          processingTimeline,
          rawIntent: intentPayload,
        }).catch((error) => {
          console.error("Unable to record entry message", error);
        });

        const baseAcknowledgement = offlinePolishRequired
          ? "Got it. I saved that. I’ll refine wording when we’re back online."
          : notePayload?.guidance ?? successMessages[entryType];
        const acknowledgement = buildConfirmationMessage(
          entryType,
          intentPayload.routedIntent.slots,
          baseAcknowledgement,
          offlinePolishRequired
        );

        setIsTyping(true);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setIsTyping(false);

          const botMessage: BotMessage = {
            id: `bot-${saved.id}`,
            kind: "bot",
            afterId: saved.id,
            content: acknowledgement,
            created_at: new Date().toISOString(),
            status: "sent",
          };

          setMessages((prevState) => [...prevState, botMessage]);

          appendMessage(saved.id, "assistant", acknowledgement, {
            messageKind: "autoReply",
            entryType,
            afterId: saved.id,
            intent: aiMetaPayload.intent,
            note: notePayload,
            rawIntent: intentPayload,
          }).catch((error) => {
            console.error("Unable to record auto-reply", error);
          });
        }, 1500);

        return {
          messageId: saved.id,
          content: trimmedContent,
          intent: confirmedPrediction,
          entryType,
        };
      } catch (error) {
        console.error("Error sending message:", error);
        applyProcessing(
          "openai_response",
          "error",
          error instanceof Error ? error.message : "Failed"
        );
        patchEntryMessage(tempId, (msg) => ({
          ...msg,
          status: "failed" as const,
        }));
        return null;
      }
    },
    [messages, onEntryCreated, patchEntryMessage]
  );

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
    [messages, sendMessage]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const updateMessageIntent = useCallback(
    (messageId: string, intentMeta: IntentMetadata, nextType?: EntryType) => {
      patchEntryMessage(messageId, (msg) => ({
        ...msg,
        type: nextType ?? msg.type,
        aiIntent: intentMeta.id,
        aiConfidence: intentMeta.confidence,
        intentMeta,
        aiMeta: {
          ...(msg.aiMeta ?? {}),
          intent: intentMeta,
        },
      }));
    },
    [patchEntryMessage]
  );

  return {
    messages,
    isTyping,
    groupMessages,
    sendMessage,
    retryMessage,
    clearMessages,
    updateMessageIntent,
  };
};
