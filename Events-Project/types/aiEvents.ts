export type AiEventApprovalMode = "REVIEW";

export interface AiEventConfig {
  city: string;
  maxPerRun: number;
  approvalMode: AiEventApprovalMode;
  enabled: boolean;
  authorizedAt: string | null;
  nextRunAt: string | null;
}

export interface AiEventRun {
  id: string;
  status: string;
  createdCount: number;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AiEventCandidate {
  id: string;
  status: string;
  sourceUrl: string;
  name: string;
  startDate: string;
  address: string;
  eventId: string | null;
  createdAt: string;
}

export interface AiEventsSnapshot {
  configured: boolean;
  config: AiEventConfig | null;
  runs: AiEventRun[];
  candidates: AiEventCandidate[];
}

export type AiEventsAction =
  | { action: "settings"; city: string; maxPerRun: number; enabled: boolean; authorize: boolean }
  | { action: "run" }
  | { action: "inspect"; url: string }
  | { action: "approve"; id: string }
  | { action: "reject"; id: string };
