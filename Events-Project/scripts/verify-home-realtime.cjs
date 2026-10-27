// Execute the actual home subscription effect with controlled, out-of-order HTTP replies.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("app/page.tsx", "utf8");
const parsed = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === "useEffect" && node.arguments[0]?.getText(parsed).includes('socket.on("update-events"')) effect = node.arguments[0].getText(parsed);
  ts.forEachChild(node, visit);
}
visit(parsed); assert.ok(effect, "Home realtime effect must exist");
const code = ts.transpileModule("exports.setup = " + effect, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const handlers = new Map(), requests = [], states = [];
let error = false, loading = true;
const socket = {
  on(name, handler) { const set = handlers.get(name) ?? new Set(); set.add(handler); handlers.set(name, set); },
  off(name, handler) { handlers.get(name)?.delete(handler); },
};
const result = {};
new Function("exports", "socket", "fetch", "setEvents", "setLoadError", "setLoading", code)(
  result, socket,
  (_, options) => new Promise((resolve, reject) => requests.push({ resolve, reject, signal: options.signal })),
  value => states.push(value), value => { error = value; }, value => { loading = value; },
);
function emit(name) { for (const handler of handlers.get(name) ?? []) handler(); }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function reply(index, value) { requests[index].resolve({ ok: true, json: async () => value }); }
async function run() {
  const cleanup = result.setup();
  assert.equal(requests.length, 1);
  emit("update-events"); emit("update-events");
  reply(2, [{ id: "latest", validate: true }, { id: "cancelled", validate: true, status: "CANCELLED" }, { id: "draft", validate: false }]);
  await flush(); assert.deepEqual(states.at(-1), [{ id: "latest", validate: true }]);
  reply(0, [{ id: "old", validate: true }]); requests[1].reject(new Error("late failure"));
  await flush(); assert.equal(states.length, 1); assert.equal(error, false); assert.equal(loading, false);
  emit("connect"); reply(3, []); await flush(); assert.deepEqual(states.at(-1), [], "Reconnect reconciles removals");
  emit("update-events"); reply(4, { invalid: true }); await flush(); assert.equal(error, true);
  emit("update-events"); reply(5, [{ id: "recovered", validate: true }]); await flush(); assert.equal(error, false);
  emit("update-events"); const previous = states.length;
  cleanup(); assert.ok(requests.every(request => request.signal.aborted));
  reply(6, [{ id: "after-unmount", validate: true }]); await flush(); assert.equal(states.length, previous);
  assert.equal(handlers.get("update-events").size, 0); assert.equal(handlers.get("connect").size, 0);
  console.log("PASS actual home effect: repeated signals, out-of-order replies, stale failures, reconnect/removal, invalid response/recovery, request abort and unmount cleanup.");
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
