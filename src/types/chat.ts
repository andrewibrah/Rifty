import type { EntryType } from "../services/data";
import type { IntentMetadata, ProcessingStep } from "./intent";

export interface Message {
  id: string;
  created_at: string;
  content: string;
  status?: "sending" | "sent" | "failed";
  processing?: ProcessingStep[];
}

export interface EntryMessage extends Message {
  kind: "entry";
  type: EntryType;
  aiIntent?: string | null;
  aiConfidence?: number | null;
  aiMeta?: Record<string, any> | null;
  intentMeta?: IntentMetadata;
}

export interface BotMessage extends Message {
  kind: "bot";
  afterId: string;
}

export type ChatMessage = EntryMessage | BotMessage;

export interface MessageGroup {
  id: string;
  messages: ChatMessage[];
  timestamp: string;
  type: "entry" | "bot";
}
