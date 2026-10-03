export interface EventChatMessage {
  id: number;
  clientId: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  own: boolean;
}
export interface EventChatHistory {
  event: { id: string; name: string; partnerId?: string };
  messages: EventChatMessage[];
  nextBefore: number | null;
  hasMore: boolean;
}
export interface EventChatSendResult { message: EventChatMessage; duplicate: boolean }
