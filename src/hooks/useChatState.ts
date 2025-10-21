import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { InteractionManager } from "react-native";
import type {
  ChatMessage,
  MessageGroup,
  EntryMessage,
  BotMessage,
} from "../types/chat";
import { appendMessage, listJournals, type EntryType } from "../services/data";
import { createEntryFromChat } from "../lib/entries";
import type {
  EntryNotePayload,
  IntentMetadata,
  IntentPredictionResult,
  ProcessingStep,
  ProcessingStepId,
} from "../types/intent";
import type { MemoryKind } from "@/agent/memory";
import { answerAnalystQuery } from "../services/memory";
import { handleMessage } from "@/chat/handleMessage";
import { planAction } from "@/agent/planner";
import { handleToolCall } from "@/agent/actions";
import { generateMainChatReply } from "../services/mainChat";
import { buildPredictionFromNative, mapIntentToEntryType } from "../lib/intent";
import { Memory } from "@/agent/memory";
import { ContextWindow } from "@/agent/contextWindow";
import type { PlannerResponse } from "@/agent/types";
import { createGoal, listGoals } from "../services/goals";
import type { CreateGoalParams } from "../types/mvp";
import { generateUUID } from "../utils/id";
import { supabase } from "../lib/supabase";
import { isGoalsV2Enabled } from "../utils/flags";

const MAX_ACTIVE_GOALS = 3;

type PlannerGoalShape = {
  title: string | null;
  description: string | null;
  category: string | null;
  targetDate: string | null;
  microSteps: string[];
};

const normalizeGoalPayload = (
  raw: Record<string, any>,
  fallbackContent: string
): PlannerGoalShape => {
  const safeString = (value: unknown): string | null => {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  };

  const title =
    safeString(raw.title) ||
    safeString(raw.goalTitle) ||
    fallbackContent.slice(0, 120);

  const description =
    safeString(raw.description) ||
    safeString(raw.summary) ||
    null;

  const category = safeString(raw.category) || safeString(raw.area) || null;

  const targetDate = safeString(raw.targetDate || raw.deadline || raw.dueDate);

  const microStepsRaw = Array.isArray(raw.microSteps)
    ? raw.microSteps
    : Array.isArray(raw.milestones)
      ? raw.milestones
      : [];

  const microSteps = microStepsRaw
    .map((step: unknown) => safeString(step))
    .filter((step): step is string => Boolean(step));

  return {
    title,
    description,
    category,
    targetDate,
    microSteps,
  };
};

const buildMicroSteps = (steps: string[]): { id: string; description: string; completed: boolean }[] =>
  steps.map((step) => ({
    id: generateUUID(),
    description: step,
    completed: false,
  }));

const GOAL_RECALL_PATTERN = /(goal|focus|progress|motivation|stuck)/i;

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

interface UseChatStateOptions {
  onBotMessage?: (message: BotMessage) => void;
}

export const useChatState = (
  onEntryCreated?: () => void,
  options?: UseChatStateOptions
): {
  messages: ChatMessage[];
  pendingAction: { entryId: string; action: string } | null;
  pendingGoal: { entryId: string; goalData: any } | null;
  messageGroups: MessageGroup[];
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

  const maybeRecallGoal = useCallback(
    async (utterance: string, afterId: string) => {
      if (!isGoalsV2Enabled()) {
        return;
      }
      if (!GOAL_RECALL_PATTERN.test(utterance)) {
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke<{
          result: {
            goal: {
              id: string;
              title: string;
              status: string;
              current_step: string | null;
              progress_pct: number;
              coherence_score: number;
              ghi_state: string;
            };
            similarity: number;
            rationale: string;
            suggested_action: string;
          } | null;
        }>("main_chat_goal_recall", { body: { utterance } });

        if (error) {
          console.warn("[Chat] goal recall invoke failed", error);
          return;
        }

        if (!data?.result) {
          return;
        }

        const { goal, similarity, rationale, suggested_action: suggested } = data.result;

        if (!goal || typeof similarity !== "number" || similarity < 0.6) {
          return;
        }

        const progressPct = Math.round((goal.progress_pct ?? 0) * 100);
        const coherencePct = Math.round((goal.coherence_score ?? 0) * 100);
        const heading = `Focus boost for "${goal.title}" (${progressPct}% · ${goal.ghi_state.toUpperCase()} · coherence ${coherencePct}%)`;
        const lines = [heading];
        if (rationale) {
          lines.push(rationale);
        }
        if (suggested) {
          lines.push(suggested);
        }

        const recallMessage: BotMessage = {
          id: `goal-recall-${generateUUID()}`,
          kind: "bot",
          afterId,
          content: lines.join("\n"),
          created_at: new Date().toISOString(),
          status: "sent",
        };

        setMessages((prev) => [...prev, recallMessage]);
        options?.onBotMessage?.(recallMessage);
      } catch (error) {
        console.warn("[Chat] goal recall failed", error);
      }
    },
    [options, setMessages]
  );

  useEffect(() => {
    loadMessages();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [loadMessages]);

  const messageGroups = useMemo(() => {
    if (messages.length === 0) return [] as MessageGroup[];

    const sortedMsgs = [...messages].sort(
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
  }, [messages]);

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
      ContextWindow.recordUserMessage(trimmedContent);
      let createdEntryId: string | null = null;

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
        }
      } else {
        // Entry mode: orchestrate agent pipeline with response-first strategy
        const optimisticType: EntryType = "journal";
        let processingSteps = processingTemplate();
        const createdAt = new Date().toISOString();

        const userMessage: EntryMessage = {
          id: tempId,
          kind: "entry",
          type: optimisticType,
          content: trimmedContent,
          created_at: createdAt,
          status: "sending",
          processing: processingSteps,
        };

        setMessages((prevMessages) => [...prevMessages, userMessage]);

        const advanceTimeline = (
          stepId: ProcessingStepId,
          status: ProcessingStep["status"],
          detail?: string
        ) => {
          processingSteps = updateTimeline(processingSteps, stepId, status, detail);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempId && msg.kind === "entry"
                ? { ...msg, processing: processingSteps }
                : msg
            )
          );
        };

        advanceTimeline("ml_detection", "running", "Analyzing intent");

        let createdEntryId: string | null = null;

        try {
          const intentPayload = await handleMessage(trimmedContent);
          const prediction = buildPredictionFromNative(intentPayload.nativeIntent);
          const intentMeta = buildIntentMeta(prediction);
          const resolvedType = mapIntentToEntryType(intentMeta.id);
          const classificationMeta = intentPayload.enriched.classification;
          const classificationId =
            (classificationMeta?.id ?? intentPayload.routedIntent.rawLabel)
              .toLowerCase()
              .replace(/\s+/g, '_');
          const shouldPersistEntry = classificationId === 'entry_create';
          const shouldAppendEntry = classificationId === 'entry_append';
          const shouldDiscussEntry = classificationId === 'entry_discuss';
          const targetEntryId = classificationMeta?.targetEntryId ?? null;
          const targetEntryType = (classificationMeta?.targetEntryType ?? null) as
            | EntryType
            | null;

          if (targetEntryId && (shouldAppendEntry || shouldDiscussEntry)) {
            ContextWindow.refreshEntry(targetEntryId, targetEntryType ?? 'unknown');
          }

          advanceTimeline(
            "ml_detection",
            "done",
            `${intentMeta.displayLabel} ${(intentMeta.confidence * 100).toFixed(
              1
            )}%`
          );

          const matchCount = intentPayload.memoryMatches.length;
          advanceTimeline(
            "knowledge_search",
            matchCount > 0 ? "done" : "skipped",
            matchCount > 0 ? `${matchCount} memory matches` : "No matches"
          );

          let planner: PlannerResponse | null = null;
          try {
            const plannerResult = await planAction({
              payload: intentPayload.enriched,
            });
            planner = plannerResult.response ?? null;
          } catch (plannerError) {
            console.warn("[Chat] planner failed", plannerError);
          }

          advanceTimeline("openai_request", "running", "Generating response");

          const botMessageId = `bot-${tempId}`;
          const botTimestamp = new Date().toISOString();
          let streamingReply = "";
          let finalBotMessage: BotMessage | null = null;

          const placeholderMessage: BotMessage = {
            id: botMessageId,
            kind: "bot",
            afterId: tempId,
            content: "",
            created_at: botTimestamp,
            status: "sending",
          };

          setMessages((prevMessages) => [...prevMessages, placeholderMessage]);

          const mainReply = await generateMainChatReply({
            userText: trimmedContent,
            intent: intentPayload,
            planner,
            onToken: (chunk) => {
              streamingReply += chunk;
              setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                  msg.id === botMessageId && msg.kind === "bot"
                    ? {
                        ...msg,
                        content: streamingReply,
                        status: "sending",
                      }
                    : msg
                )
              );
            },
          });

          advanceTimeline("openai_request", "done", "Prompt dispatched");
          advanceTimeline("openai_response", "done", "Response captured");

          let finalTimeline = processingSteps;
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === tempId && msg.kind === "entry"
                ? {
                    ...msg,
                    type: resolvedType,
                    status: "sent" as const,
                    aiIntent: intentMeta.id,
                    aiConfidence: intentMeta.confidence,
                    intentMeta,
                    aiMeta: {
                      ...(msg.aiMeta ?? {}),
                      intent: intentMeta,
                      plan: planner,
                      processingTimeline: finalTimeline,
                    },
                  }
                : msg
            )
          );

          finalBotMessage = {
            id: botMessageId,
            kind: "bot",
            afterId: tempId,
            content: mainReply.reply,
            created_at: botTimestamp,
            status: "sent",
          };

          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === botMessageId && msg.kind === "bot"
                ? {
                    ...msg,
                    content: mainReply.reply,
                    status: "sent",
                    created_at: botTimestamp,
                  }
                : msg
            )
          );

          options?.onBotMessage?.(finalBotMessage);

          const toolExecution = handleToolCall(planner, {
            originalText: trimmedContent,
          });

          const toolPayload = toolExecution
            ? (toolExecution.payload as Record<string, any> | undefined)
            : undefined;

          if (toolExecution?.action === "goal.create" && toolPayload) {
            setPendingGoal({
              entryId: tempId,
              goalData: toolPayload,
            });
          }

          if (
            toolExecution?.action === "journal.create" &&
            toolPayload &&
            typeof toolPayload.summary === "string"
          ) {
            setPendingAction({
              entryId: tempId,
              action: toolPayload.summary,
            });
          }

          const persist = async () => {
            if (!shouldPersistEntry) {
              return;
            }
            try {
              const note = buildLocalFallbackNote(
                intentMeta.displayLabel,
                trimmedContent
              );

              const savedEntry = await createEntryFromChat({
                content: trimmedContent,
                entryType: resolvedType,
                intent: prediction,
                note,
                processingTimeline: finalTimeline,
                nativeIntent: intentPayload.nativeIntent,
                enriched: intentPayload.enriched,
                decision: intentPayload.decision,
                redaction: intentPayload.redaction,
                memoryMatches: intentPayload.memoryMatches,
                plan: planner,
              });

              createdEntryId = savedEntry.id;
              ContextWindow.registerEntry(savedEntry.id, resolvedType ?? 'unknown');

              finalTimeline = finalTimeline.map((step) =>
                step.status === "running" ? { ...step, status: "done" } : step
              );

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === tempId && msg.kind === "entry") {
                    return {
                      ...msg,
                      id: savedEntry.id,
                      processing: finalTimeline,
                      aiMeta: {
                        ...(msg.aiMeta ?? {}),
                        intent: intentMeta,
                        plan: planner,
                        processingTimeline: finalTimeline,
                        learned: mainReply.learned,
                        ethical: mainReply.ethical,
                      },
                    };
                  }
                  if (msg.id === `bot-${tempId}` && msg.kind === "bot") {
                    return {
                      ...msg,
                      id: `bot-${savedEntry.id}`,
                      afterId: savedEntry.id,
                    };
                  }
                  return msg;
                })
              );

              setPendingGoal((prev) =>
                prev && prev.entryId === tempId
                  ? { entryId: savedEntry.id, goalData: prev.goalData }
                  : prev
              );
              setPendingAction((prev) =>
                prev && prev.entryId === tempId
                  ? { entryId: savedEntry.id, action: prev.action }
                  : prev
              );

              InteractionManager.runAfterInteractions(() => {
                void (async () => {
                  appendMessage(savedEntry.id, "user", trimmedContent, {
                    messageKind: "entry",
                    entryType: resolvedType,
                    aiIntent: intentMeta.id,
                    aiConfidence: intentMeta.confidence,
                    aiMeta: {
                      intent: intentMeta,
                      plan: planner,
                      processingTimeline: finalTimeline,
                      learned: mainReply.learned,
                      ethical: mainReply.ethical,
                    },
                  }).catch((error) => {
                    console.error("Unable to record entry message", error);
                  });

                  appendMessage(savedEntry.id, "assistant", mainReply.reply, {
                    messageKind: "autoReply",
                    entryType: resolvedType,
                    afterId: savedEntry.id,
                    aiIntent: intentMeta.id,
                    aiConfidence: intentMeta.confidence,
                    aiMeta: {
                      reply: mainReply.reply,
                      learned: mainReply.learned,
                      ethical: mainReply.ethical,
                      plan: planner,
                    },
                  }).catch((error) => {
                    console.error("Unable to record auto-reply", error);
                  });

                  const memoryKind = entryTypeToMemoryKind[resolvedType];
                  try {
                    await Memory.upsert({
                      id: savedEntry.id,
                      kind: memoryKind,
                      text: trimmedContent,
                      ts: Date.now(),
                    });
                  } catch (memoryError) {
                    console.warn("[Chat] memory upsert failed", memoryError);
                  }

                  void maybeRecallGoal(trimmedContent, savedEntry.id);

                  if (toolExecution?.action === "goal.create" && toolPayload) {
                    try {
                      const goalShape = normalizeGoalPayload(
                        toolPayload,
                        trimmedContent
                      );

                      if (goalShape.title) {
                        const activeGoals = await listGoals({
                          status: "active",
                          limit: MAX_ACTIVE_GOALS + 1,
                        });

                        const activeCount = activeGoals.filter(
                          (goal) => goal.status === "active"
                        ).length;

                        if (activeCount >= MAX_ACTIVE_GOALS) {
                          const limitMessage: BotMessage = {
                            id: `bot-${generateUUID()}`,
                            kind: "bot",
                            afterId: savedEntry.id,
                            content:
                              "You already have three active goals. Archive or complete one before starting another.",
                            created_at: new Date().toISOString(),
                            status: "sent",
                          };
                          setMessages((prev) => [...prev, limitMessage]);
                          options?.onBotMessage?.(limitMessage);
                        } else {
                          const goalPayload: CreateGoalParams = {
                            title: goalShape.title,
                            micro_steps: buildMicroSteps(goalShape.microSteps),
                            source_entry_id: savedEntry.id,
                            metadata: {
                              plannerPayload: toolPayload,
                            },
                          };
                          if (goalShape.description) {
                            goalPayload.description = goalShape.description;
                          }
                          if (goalShape.category) {
                            goalPayload.category = goalShape.category;
                          }
                          if (goalShape.targetDate) {
                            goalPayload.target_date = goalShape.targetDate;
                          }

                          const created = await createGoal(goalPayload);

                          const celebration: BotMessage = {
                            id: `bot-${generateUUID()}`,
                            kind: "bot",
                            afterId: savedEntry.id,
                            content: `Goal captured: ${created.title}`,
                            created_at: new Date().toISOString(),
                            status: "sent",
                          };
                          setMessages((prev) => [...prev, celebration]);
                          options?.onBotMessage?.(celebration);
                        }
                      }
                    } catch (goalError) {
                      console.warn("[Chat] goal creation failed", goalError);
                    }
                  }

                  if (onEntryCreated) {
                    onEntryCreated();
                  }
                })();
              });
            } catch (persistError) {
              console.error("[Chat] persist failed", persistError);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempId && msg.kind === "entry"
                    ? {
                        ...msg,
                        processing: updateTimeline(
                          processingSteps,
                          "openai_response",
                          "error",
                          persistError instanceof Error
                            ? persistError.message
                            : "Failed to save entry"
                        ),
                      }
                    : msg
                )
              );
            }
          };

          void persist();
        } catch (error) {
          console.error("Error sending message:", error);
          advanceTimeline(
            "openai_response",
            "error",
            error instanceof Error ? error.message : "Unable to process message"
          );
          const placeholderId = typeof tempId === "string" ? `bot-${tempId}` : null;
          if (placeholderId) {
            setMessages((prevMessages) =>
              prevMessages.filter((msg) => msg.id !== placeholderId)
            );
          }
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === tempId && msg.kind === "entry"
                ? { ...msg, status: "failed" as const }
                : msg
            )
          );
        }
      }

      ContextWindow.advanceTurn({ createdEntry: createdEntryId !== null });
      return null;
    },
    [onEntryCreated]
  );

  return {
    messages,
    pendingAction,
    pendingGoal,
    messageGroups,
    sendMessage,
    retryMessage,
    clearMessages,
    updateMessageIntent,
  };
};
