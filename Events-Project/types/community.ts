export interface CommunityQuestion { id: string; text: string; answer: string; highlighted: boolean }
export interface CommunityPoll { id: string; title: string; options: string[]; counts: number[]; mine: number | null; closed: boolean }
export interface CommunityProgram { id: string; title: string; startsAt: string; status: "UPCOMING" | "LIVE" | "DONE" }
export type CommunityQueueState = "OPEN" | "PAUSED" | "CLOSED";
export interface CommunityQueue { id: string; title: string; state: CommunityQueueState; waiting: number; mine: { status: string; position: number } | null }
export interface CommunityAnnouncement { id: string; title: string; message: string; createdAt: string; archived: boolean }
export interface CommunityTask { id: string; title: string; assignedTo: string | null; status: "TODO" | "DONE" | "HELP" }
export interface CommunityLostItem { id: string; title: string; description: string; returned: boolean; claims: { id: string; message: string; resolved: boolean; userId: string }[] }
export interface CommunityEventSnapshot {
  event: { id: string; name: string };
  permissions: { authenticated: boolean; manage: boolean; team: boolean };
  questions: CommunityQuestion[];
  announcements: CommunityAnnouncement[];
  polls: CommunityPoll[];
  program: CommunityProgram[];
  queues: CommunityQueue[];
  tasks: CommunityTask[];
  lostItems: CommunityLostItem[];
  team: { userId: string; name: string }[];
  feedback: { eligible: boolean; mine: { rating: number; comment: string } | null; average: number | null; count: number; comments: { rating: number; comment: string }[] };
}
export interface CommunityRoomSummary { id: string; name: string; owner: boolean; members: number; suggestions: number }
export interface CommunityRoomSnapshot {
  id: string; name: string; owner: boolean;
  members: { id: string; name: string }[];
  suggestions: { id: string; event: { id: string; name: string; date: string }; authorName: string; votes: number; mine: boolean }[];
  availableEvents: { id: string; name: string; date: string }[];
}
