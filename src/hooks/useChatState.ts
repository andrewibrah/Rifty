import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, MessageGroup, EntryMessage, BotMessage } from '../types/chat';
import { insertEntry, listEntries } from '../db';
import type { EntryType } from '../db';

const successMessages: Record<EntryType, string> = {
  goal: 'Saved. Keep up your hard work.',
  journal: 'Saved. The more you log the more data you have of yourself',
  schedule: 'saved. Your time is your power, use it widely'
};

export const useChatState = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadMessages = useCallback(async () => {
    try {
      const entries = await listEntries();
      const chatMessages: ChatMessage[] = [];

      entries.forEach((entry) => {
        if (entry.id != null) {
          const entryMessage: EntryMessage = {
            id: entry.id.toString(),
            kind: 'entry',
            type: entry.type,
            content: entry.content,
            created_at: entry.created_at || new Date().toISOString(),
            status: 'sent'
          };
          chatMessages.push(entryMessage);

          const botMessage: BotMessage = {
            id: `bot-${entry.id}`,
            kind: 'bot',
            afterId: entry.id.toString(),
            content: successMessages[entry.type],
            created_at: entry.created_at || new Date().toISOString(),
            status: 'sent'
          };
          chatMessages.push(botMessage);
        }
      });

      setMessages(chatMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const groupMessages = useCallback((msgs: ChatMessage[]): MessageGroup[] => {
    if (msgs.length === 0) return [];

    // Sort messages by timestamp
    const sortedMsgs = [...msgs].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    sortedMsgs.forEach((message) => {
      const messageTime = new Date(message.created_at).getTime();

      if (currentGroup &&
          messageTime - new Date(currentGroup.timestamp).getTime() < 300000) { // 5 minutes
        currentGroup.messages.push(message);
      } else {
        currentGroup = {
          id: message.id,
          messages: [message],
          timestamp: message.created_at,
          type: message.kind === 'entry' ? 'entry' : 'bot'
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
      kind: 'entry',
      type,
      content: trimmedContent,
      created_at: new Date().toISOString(),
      status: 'sending'
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);

    try {
      await insertEntry({ type, content: trimmedContent });
      const entries = await listEntries();
      const saved = entries[entries.length - 1];

      if (saved?.id != null) {
        setIsTyping(true);
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setMessages(prevMessages => 
          prevMessages.map(msg =>
            msg.id === tempId 
              ? { ...msg, id: saved.id!.toString(), status: 'sent' as const } 
              : msg
          )
        );

        timeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          
          const botMessage: BotMessage = {
            id: `bot-${saved.id}`,
            kind: 'bot',
            afterId: saved.id!.toString(),
            content: successMessages[type],
            created_at: new Date().toISOString(),
            status: 'sent'
          };
          
          setMessages(prevMessages => [...prevMessages, botMessage]);
        }, 1500);
      }
    } catch (error) {
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === tempId
            ? { ...msg, status: 'failed' as const }
            : msg
        )
      );
      console.error('Error sending message:', error);
    }
  }, []);

  const retryMessage = useCallback(async (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message || message.kind !== 'entry' || message.status !== 'failed') return;

    await sendMessage(message.content, message.type);
    setMessages(prevMessages =>
      prevMessages.filter(msg => msg.id !== messageId)
    );
  }, [messages, sendMessage]);

  return {
    messages,
    isTyping,
    groupMessages,
    sendMessage,
    retryMessage,
  };
};
