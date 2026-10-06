const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript");
const slots = [], effects = [], timers = new Map(), intervals = new Map(), handlers = new Map(), replies = [];
let cursor = 0, timerId = 0, session = { status: "authenticated", data: { user: { id: "a" } } };
const react = {
  useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; },
  useEffect(callback, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) { const slot = slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); }); } },
};
const socket = {
  connected: true,
  on(name, callback) { const listeners = handlers.get(name) ?? new Set(); listeners.add(callback); handlers.set(name, listeners); },
  off(name, callback) { handlers.get(name)?.delete(callback); },
  emit(name, payload, callback) { assert.equal(name, "chat-presence"); replies.push({ payload, callback }); },
};
const visibility = new Set();
const document = { visibilityState: "visible", addEventListener(name, callback) { visibility.add(callback); }, removeEventListener(name, callback) { visibility.delete(callback); } };
const mod = { exports: {} };
const output = ts.transpileModule(fs.readFileSync("hooks/useMatchPresence.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function("require", "module", "exports", "document", "setTimeout", "clearTimeout", "setInterval", "clearInterval", output)(
  name => name === "react" ? react : name === "next-auth/react" ? { useSession: () => session } : { useSocket: () => socket }, mod, mod.exports, document,
  callback => { const id = ++timerId; timers.set(id, callback); return id; }, id => timers.delete(id),
  callback => { const id = ++timerId; intervals.set(id, callback); return id; }, id => intervals.delete(id),
);
function render(id = "pair", enabled = true) { cursor = 0; const value = mod.exports.useMatchPresence(id, enabled); while (effects.length) effects.shift()(); return value; }
function emit(name) { for (const callback of handlers.get(name) ?? []) callback(); }
render(); replies.at(-1).callback({ ok: true, online: true }); assert.equal(render(), true);
document.visibilityState = "hidden"; const count = replies.length; for (const tick of intervals.values()) tick(); assert.equal(replies.length, count);
document.visibilityState = "visible"; for (const callback of visibility) callback(); const stale = replies.at(-1);
socket.connected = false; emit("disconnect"); assert.equal(render(), null);
socket.connected = true; emit("connect"); const current = replies.at(-1);
stale.callback({ ok: true, online: true }); assert.equal(render(), null, "late ACK cannot cross a reconnect");
current.callback({ ok: true, online: false }); assert.equal(render(), false);
for (const tick of intervals.values()) tick(); const oldAccount = replies.at(-1);
session = { status: "authenticated", data: { user: { id: "other" } } }; assert.equal(render(), null);
oldAccount.callback({ ok: true, online: true }); assert.equal(render(), null, "late presence cannot leak across accounts");
replies.at(-1).callback({ ok: false }); assert.equal(render(), null, "denial never fabricates online/offline");
for (const tick of intervals.values()) tick(); for (const callback of [...timers.values()]) callback(); assert.equal(render(), null, "timeout clears presence");
render("pair", false); assert.equal(timers.size, 0); assert.equal(intervals.size, 0); assert.equal(visibility.size, 0);
for (const listeners of handlers.values()) assert.equal(listeners.size, 0);
console.log("PASS private presence hook: scoped query, visibility pause, timeout, reconnect and account isolation, denial and cleanup.");
