import type { EntryType } from '../services/data';

export interface Message {
  id: string;
  created_at: string;
  content: string;
  status?: 'sending' | 'sent' | 'failed';
}

export interface EntryMessage extends Message {
  kind: 'entry';
  type: EntryType;
}

export interface BotMessage extends Message {
  kind: 'bot';
  afterId: string;
}

export type ChatMessage = EntryMessage | BotMessage;

export interface MessageGroup {
  id: string;
  messages: ChatMessage[];
  timestamp: string;
  type: 'entry' | 'bot';
}
