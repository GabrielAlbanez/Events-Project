const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = ts.transpileModule(fs.readFileSync("lib/community/liveChanges.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", source)(require, mod, mod.exports);
const { diffCommunityEvent, diffCommunityRoom } = mod.exports;
const clone = value => JSON.parse(JSON.stringify(value));
const base = {
  event: { id: "event-one", name: "Event" }, permissions: { authenticated: true, manage: false, team: false },
  announcements: [{ id: "notice-one", title: "Entry", message: "At north", createdAt: "2026-01-01", archived: false }],
  questions: [{ id: "question-one", text: "Where?", answer: "Here", highlighted: false }],
  polls: [{ id: "poll-one", title: "Choose", options: ["A", "B"], counts: [1, 0], mine: null, closed: false }],
  program: [{ id: "program-one", title: "Opening", startsAt: "2030-01-01T12:00:00Z", status: "UPCOMING" }],
  queues: [{ id: "queue-one", title: "Workshop", state: "OPEN", waiting: 2, mine: { status: "WAITING", position: 1 } }],
  tasks: [], team: [], lostItems: [{ id: "lost-one", title: "Bag", description: "A bag", returned: false, claims: [{ id: "claim-one", userId: "private-user", message: "PRIVATE_SECRET", resolved: false }] }],
  feedback: { eligible: false, mine: null, average: null, count: 0, comments: [] },
};
assert.deepEqual(diffCommunityEvent(null, base), { sections: {}, notices: [] });
assert.deepEqual(diffCommunityEvent(base, clone(base)), { sections: {}, notices: [] });
let next = clone(base);
next.announcements[0].createdAt = "2030-01-01";
next.program[0].startsAt = "2030-01-01T09:00:00-03:00";
next.lostItems[0].claims[0].message = "OTHER_PRIVATE_SECRET";
assert.deepEqual(diffCommunityEvent(base, next), { sections: {}, notices: [] }, "timestamps, equivalent timezones and private identifying texts are ignored");
next = clone(base);
next.questions[0].answer = "Another entrance";
next.polls[0].counts = [2, 0];
next.program[0].status = "LIVE";
next.queues[0].mine.status = "CALLED";
next.lostItems[0].claims[0].resolved = true;
next.feedback.average = 4.5; next.feedback.count = 2;
let diff = diffCommunityEvent(base, next);
assert.deepEqual(diff.sections, { questions: 1, polls: 1, program: 1, queues: 1, lost: 1, feedback: 2 });
assert.deepEqual(diff.notices, [{ kind: "queue-called", id: "queue-one" }, { kind: "activity-live", id: "program-one" }]);
assert.equal(JSON.stringify(diff).includes("PRIVATE_SECRET"), false);
assert.equal(JSON.stringify(diff).includes("private-user"), false);
assert.deepEqual(diffCommunityEvent(next, next).notices, [], "a call/start is announced once per transition");
const closedQueue = clone(base);
closedQueue.queues[0].state = "CLOSED";
closedQueue.queues[0].mine.status = "CALLED";
const closedChanges = diffCommunityEvent(base, closedQueue);
assert.equal(closedChanges.sections.queues, 1);
assert.deepEqual(closedChanges.notices, [], "a queue closed in the same snapshot never asks the participant to approach the team");
next = clone(base);
next.questions = Array.from({ length: 12 }, (_, index) => ({ id: "new-" + index, text: "New", answer: "", highlighted: false }));
assert.equal(diffCommunityEvent(base, next).sections.questions, 9);
next = clone(base); next.questions = [];
assert.equal(diffCommunityEvent(base, next).sections.questions, 1, "removals count as a section change");
next = clone(base); next.permissions.team = true;
assert.deepEqual(diffCommunityEvent(base, next), { sections: {}, notices: [] }, "permission changes reset the baseline");
next = clone(base); next.event.id = "other-event";
assert.deepEqual(diffCommunityEvent(base, next), { sections: {}, notices: [] });
assert.deepEqual(diffCommunityEvent(null, { ...base, queues: [{ ...base.queues[0], mine: { status: "CALLED", position: 0 } }] }).notices, [], "reset account/initial called snapshot never announces previous account's transition");

const room = { id: "room-one", name: "Friends", owner: false, members: [{ id: "one", name: "One" }, { id: "two", name: "Two" }], suggestions: [{ id: "suggestion-one", event: { id: "event-one", name: "Event", date: "2030-01-01" }, authorName: "One", votes: 1, mine: false }], availableEvents: [] };
assert.deepEqual(diffCommunityRoom(null, room), { sections: {} });
next = clone(room); next.members.reverse();
assert.deepEqual(diffCommunityRoom(room, next), { sections: {} }, "ordering alone does not count");
next.members.pop(); next.suggestions[0].votes = 2;
assert.deepEqual(diffCommunityRoom(room, next), { sections: { members: 1, suggestions: 1 } });
next.id = "other-room";
assert.deepEqual(diffCommunityRoom(room, next), { sections: {} });
console.log("PASS community usability: meaningful section changes, capped counts, no order/timestamp noise, personal calls, activity starts, private-text exclusion and reset baselines.");
