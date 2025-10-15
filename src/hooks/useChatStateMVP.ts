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
import { createEntryMVP, type ProcessedEntryResult } from "../lib/entries";
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

export const useChatStateMVP = (onEntryCreated?: () => void) => {
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
            aiMeta: entry.ai_meta ?? null,
          };
          chatMessages.push(entryMessage);

          // Add bot response if exists
          // (We'll reconstruct from metadata later)
          const botMessage: BotMessage = {
            id: `bot-${entry.id}`,
            kind: "bot",
            afterId: entry.id,
            content: "Saved.",
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

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

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
              msg.id === tempId
                ? { ...msg, status: "sent" as const }
                : msg
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
              msg.id === tempId
                ? { ...msg, status: "failed" as const }
                : msg
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
          const result: ProcessedEntryResult = await createEntryMVP(trimmedContent);
          const saved = result.entry;
          const resolvedType = (saved.type ?? "journal") as EntryType;
          const aiIntent = saved.ai_intent ?? resolvedType;
          const aiConfidence =
            typeof saved.ai_confidence === "number" ? saved.ai_confidence : null;
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
    },
    [onEntryCreated]
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

  const dismissAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const dismissGoal = useCallback(() => {
    setPendingGoal(null);
  }, []);

  return {
    messages,
    isTyping,
    pendingAction,
    pendingGoal,
    groupMessages,
    sendMessage,
    retryMessage,
    clearMessages,
    dismissAction,
    dismissGoal,
  };
};
