import type { ChatMessage } from "./chat";

export interface MainHistoryRecord {
  id: string;
  timestamp: string;
  title?: string | null;
  summary?: string | null;
  messageCount?: number;
  aiTitleConfidence?: number | null;
  messages: ChatMessage[];
}
