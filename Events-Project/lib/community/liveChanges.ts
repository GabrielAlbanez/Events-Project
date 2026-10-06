import type { CommunityEventSnapshot, CommunityRoomSnapshot } from "@/types/community";

export type CommunitySection = "announcements" | "questions" | "polls" | "program" | "queues" | "team" | "lost" | "feedback";
export type RoomLiveSection = "members" | "suggestions";
export interface EventLiveChanges {
  sections: Partial<Record<CommunitySection, number>>;
  notices: { kind: "queue-called" | "activity-live"; id: string }[];
}
export interface RoomLiveChanges { sections: Partial<Record<RoomLiveSection, number>> }

type Item = { id: string; value: unknown };
const cap = (count: number): number => Math.min(9, count);

/** Compare meaningful values by identity; sorting/transport timestamps do not count. */
function changes(previous: Item[], next: Item[]): number {
  const before = new Map(previous.map(item => [item.id, JSON.stringify(item.value)]));
  const after = new Map(next.map(item => [item.id, JSON.stringify(item.value)]));
  let count = 0;
  for (const [id, value] of Array.from(after)) if (!before.has(id) || before.get(id) !== value) count++;
  for (const id of Array.from(before.keys())) if (!after.has(id)) count++;
  return cap(count);
}

function eventItems(snapshot: CommunityEventSnapshot): Record<Exclude<CommunitySection, "feedback">, Item[]> {
  return {
    announcements: snapshot.announcements.map(item => ({ id: item.id, value: [item.title, item.message, item.archived] })),
    questions: snapshot.questions.map(item => ({ id: item.id, value: [item.text, item.answer, item.highlighted] })),
    polls: snapshot.polls.map(item => ({ id: item.id, value: [item.title, item.options, item.counts, item.mine, item.closed] })),
    program: snapshot.program.map(item => ({ id: item.id, value: [item.title, new Date(item.startsAt).getTime(), item.status] })),
    queues: snapshot.queues.map(item => ({ id: item.id, value: [item.title, item.state, item.waiting, item.mine?.status ?? null, item.mine?.position ?? null] })),
    team: [
      ...snapshot.team.map(item => ({ id: `member:${item.userId}`, value: [item.name] })),
      ...snapshot.tasks.map(item => ({ id: `task:${item.id}`, value: [item.title, item.assignedTo, item.status] })),
    ],
    // Private identifying text and user IDs are never part of a change notice.
    lost: snapshot.lostItems.map(item => ({ id: item.id, value: [item.title, item.description, item.returned,
      item.claims.map(claim => [claim.id, claim.resolved]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ] })),
  };
}

/** The caller must reset previous to null on account changes and suppress own actions. */
export function diffCommunityEvent(previous: CommunityEventSnapshot | null, next: CommunityEventSnapshot): EventLiveChanges {
  const result: EventLiveChanges = { sections: {}, notices: [] };
  if (!previous || previous.event.id !== next.event.id ||
      previous.permissions.authenticated !== next.permissions.authenticated ||
      previous.permissions.manage !== next.permissions.manage || previous.permissions.team !== next.permissions.team) return result;
  const before = eventItems(previous), after = eventItems(next);
  for (const section of Object.keys(after) as (Exclude<CommunitySection, "feedback">)[]) {
    const count = changes(before[section], after[section]);
    if (count) result.sections[section] = count;
  }
  // Aggregates indicate feedback updates without carrying private comments.
  const feedbackCount = Math.abs(next.feedback.count - previous.feedback.count);
  if (feedbackCount || next.feedback.average !== previous.feedback.average) result.sections.feedback = cap(Math.max(1, feedbackCount));
  const queues = new Map(previous.queues.map(item => [item.id, item]));
  for (const queue of next.queues) {
    if (queue.state !== "CLOSED" && queues.get(queue.id)?.mine?.status === "WAITING" && queue.mine?.status === "CALLED") result.notices.push({ kind: "queue-called", id: queue.id });
  }
  const activities = new Map(previous.program.map(item => [item.id, item]));
  for (const activity of next.program) {
    if (activities.get(activity.id)?.status === "UPCOMING" && activity.status === "LIVE") result.notices.push({ kind: "activity-live", id: activity.id });
  }
  return result;
}

export function diffCommunityRoom(previous: CommunityRoomSnapshot | null, next: CommunityRoomSnapshot): RoomLiveChanges {
  const result: RoomLiveChanges = { sections: {} };
  if (!previous || previous.id !== next.id || previous.owner !== next.owner) return result;
  const members = changes(previous.members.map(item => ({ id: item.id, value: item.name })), next.members.map(item => ({ id: item.id, value: item.name })));
  const suggestions = (snapshot: CommunityRoomSnapshot): Item[] => snapshot.suggestions.map(item => ({ id: item.id, value: [item.event.id, item.event.name, item.event.date, item.authorName, item.votes, item.mine] }));
  const votes = changes(suggestions(previous), suggestions(next));
  if (members) result.sections.members = members;
  if (votes) result.sections.suggestions = votes;
  return result;
}
