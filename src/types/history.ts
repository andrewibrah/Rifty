import type { ChatMessage } from "./chat";

export interface MainHistoryRecord {
  id: string;
  timestamp: string;
  messages: ChatMessage[];
}
