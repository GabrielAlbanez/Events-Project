import type { CommunityQueueState } from "./community";

export type ActivitySnapshot = {
  generatedAt: string;
  queues: { id: string; eventId: string; eventName: string; title: string; state: CommunityQueueState; status: "WAITING" | "CALLED"; position: number }[];
  tasks: { id: string; eventId: string; eventName: string; title: string; status: "TODO" | "HELP" }[];
  registrations: { id: string; eventId: string; eventName: string; banner: string; startsAt: string; endsAt: string; status: "CONFIRMED" | "CHECKED_IN" }[];
  rooms: { id: string; name: string; members: number; suggestions: number }[];
  counts: { queues: number; called: number; tasks: number; registrations: number; rooms: number };
  truncated: { queues: boolean; tasks: boolean; registrations: boolean; rooms: boolean };
};
