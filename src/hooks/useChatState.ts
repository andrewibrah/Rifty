import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ChatMessage,
  MessageGroup,
  EntryMessage,
  BotMessage,
} from "../types/chat";
import {
  appendMessage,
  createJournalEntry,
  deleteAllJournalEntries,
  listJournals,
  type EntryType,
} from "../services/data";

const successMessages: Record<EntryType, string> = {
  goal: "Saved. Keep up your hard work.",
  journal: "Saved. The more you log, the more data you have of yourself.",
  schedule: "Saved. Your time is your power, use it wisely.",
};

export const useChatState = () => {
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
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
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
          };
          chatMessages.push(entryMessage);

          const botMessage: BotMessage = {
            id: `bot-${entry.id}`,
            kind: "bot",
            afterId: entry.id,
            content: successMessages[entry.type],
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

    // Sort messages by timestamp
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
        // 5 minutes
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

  const sendMessage = useCallback(async (content: string, type: EntryType) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const tempId = Date.now().toString();
    const userMessage: EntryMessage = {
      id: tempId,
      kind: "entry",
      type,
      content: trimmedContent,
      created_at: new Date().toISOString(),
      status: "sending",
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);

    try {
      const saved = await createJournalEntry({
        type,
        content: trimmedContent,
      });

      if (saved?.id) {
        const entryId = saved.id;
        setIsTyping(true);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === tempId
              ? { ...msg, id: entryId, status: "sent" as const }
              : msg
          )
        );

        appendMessage(entryId, "user", trimmedContent, {
          messageKind: "entry",
          entryType: type,
        }).catch((error) => {
          console.error("Unable to record entry message", error);
        });

        timeoutRef.current = setTimeout(() => {
          setIsTyping(false);

          const botMessage: BotMessage = {
            id: `bot-${entryId}`,
            kind: "bot",
            afterId: entryId,
            content: successMessages[type],
            created_at: new Date().toISOString(),
            status: "sent",
          };

          setMessages((prevMessages) => [...prevMessages, botMessage]);

          appendMessage(entryId, "assistant", successMessages[type], {
            messageKind: "autoReply",
            entryType: type,
            afterId: entryId,
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
  }, []);

  const retryMessage = useCallback(
    async (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.kind !== "entry" || message.status !== "failed")
        return;

      await sendMessage(message.content, message.type);
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== messageId)
      );
    },
    [messages, sendMessage]
  );

  const clearMessages = useCallback(async () => {
    try {
      await deleteAllJournalEntries();
      setMessages([]);
    } catch (error) {
      console.error("Error clearing messages:", error);
    }
  }, []);

  return {
    messages,
    isTyping,
    groupMessages,
    sendMessage,
    retryMessage,
    clearMessages,
  };
};
