export interface EventChatMessage {
  id: number;
  clientId: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  own: boolean;
  image?: { url: string };
}
export interface EventChatHistory {
  event: { id: string; name: string; partnerId?: string; partnerImage?: string | null };
  messages: EventChatMessage[];
  nextBefore: number | null;
  hasMore: boolean;
  partnerReceipt?: { deliveredThrough: number; readThrough: number; typingUntil: number };
}
export interface EventChatSendResult { message: EventChatMessage; duplicate: boolean }
