const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const slots = [], effects = [], handlers = new Map(), notices = [], redirects = [], outs = [];
let cursor = 0, connects = 0, disconnects = 0;
let recover;
const update = () => new Promise(resolve => { recover = resolve; });
let session = { status: "authenticated", data: { user: { id: "one", role: "BASIC" } }, update };
const react = {
  createContext: () => ({ Provider: "provider" }), useContext: () => null,
  useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
  useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, next => { slots[i].value = next; }]; },
  useEffect(callback, dependencies) {
    const i = cursor++, old = slots[i];
    if (!old || old.dependencies.some((value, index) => value !== dependencies[index])) {
      const slot = slots[i] = { dependencies, cleanup: old?.cleanup };
      effects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
    }
  },
};
const socket = {
  connected: true,
  on(name, callback) { const set = handlers.get(name) ?? new Set(); set.add(callback); handlers.set(name, set); },
  off(name, callback) { handlers.get(name)?.delete(callback); },
  connect() { connects++; this.connected = true; }, disconnect() { disconnects++; this.connected = false; }, emit() {},
};
const moduleValue = { exports: {} };
const source = ts.transpileModule(fs.readFileSync("context/SocketContext.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function("require", "module", "exports", "window", source)(name => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx: (...args) => args, jsxs: (...args) => args };
  if (name === "next-auth/react") return { useSession: () => session, signOut(options) { return new Promise((resolve, reject) => outs.push({ options, resolve, reject })); } };
  if (name === "react-toastify") return { toast: { error: text => notices.push(text), success() {} } };
  return { socket };
}, moduleValue, moduleValue.exports, { location: { assign: path => redirects.push(path) } });
function render() { cursor = 0; moduleValue.exports.SocketProvider({ children: null }); while (effects.length) effects.shift()(); }
function emit(name, payload) { for (const handler of handlers.get(name) ?? []) handler(payload); }
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
async function run() {
  render(); const stale = [...handlers.get("account-removed")][0];
  session = { ...session, data: { user: { id: "two", role: "BASIC" } } }; render();
  stale(); assert.equal(outs.length, 0, "old socket identity cannot sign out current account");
  emit("session-expired");
  emit("account-removed"); emit("account-removed");
  assert.equal(outs.length, 1); assert.equal(socket.connected, false); assert.equal(notices.length, 1);
  assert.equal(outs[0].options.redirect, false);
  const count = connects; recover(); await flush(); assert.equal(connects, count, "late session recovery cannot reconnect removed account");
  session = { ...session, data: { error: "AccountRemoved", user: { id: "", role: "BASIC" } } }; render();
  assert.equal(outs.length, 1, "JWT identity cleanup cannot duplicate sign out");
  session = { ...session, status: "unauthenticated", data: null }; render();
  outs[0].resolve(); await flush(); assert.deepEqual(redirects, ["/login?notice=account-removed"]);
  session = { ...session, status: "authenticated", data: { user: { id: "three", role: "BASIC" } } }; render();
  session = { ...session, data: { error: "SessionUnavailable", user: { id: "", role: "BASIC" } } }; render();
  assert.equal(outs.length, 1); assert.equal(socket.connected, false, "DB unavailable disconnects without ban notice");
  session = { ...session, data: { error: "AccountRemoved", user: { id: "", role: "BASIC" } } }; render();
  assert.equal(outs.length, 2, "removed session works without a connected socket");
  session = { ...session, data: { user: { id: "four", role: "BASIC" } } }; render();
  outs[1].reject(new Error("network")); await flush(); assert.equal(redirects.length, 1, "old failed sign-out cannot redirect new identity");
  emit("connect_error", { data: { code: "ACCOUNT_REMOVED" } });
  assert.equal(outs.length, 3); outs[2].reject(new Error("network")); await flush();
  assert.equal(redirects.length, 2, "failed sign out still navigates to server-revalidated login");
  assert.ok(disconnects > 0);
  session = { ...session, data: { user: { id: "five", role: "BASIC" } } }; render();
  emit("session-expired");
  // The earlier recovery throttling can defer this refresh; a JWT signal must still revoke immediately.
  session = { ...session, data: { error: "SessionRevoked", user: { id: "", role: null } } }; render();
  assert.equal(outs.length, 4);
  assert.equal(socket.connected, false);
  assert.equal(outs[3].options.callbackUrl, "/login?notice=credentials-changed");
  assert.match(notices.at(-1), /sessão foi encerrada por segurança/);
  assert.doesNotMatch(notices.at(-1), /banida/);
  emit("connect_error", { data: { code: "SESSION_REVOKED" } });
  assert.equal(outs.length, 4, "JWT and socket revocation deduplicate logout");
  outs[3].resolve(); await flush(); assert.equal(redirects.at(-1), "/login?notice=credentials-changed");
  session = { ...session, data: { user: { id: "six", role: "BASIC" } } }; render();
  emit("connect_error", { data: { code: "SESSION_REVOKED" } });
  assert.equal(outs.length, 5, "revoked handshake also closes session");
  const connectedBeforeRevocation = connects;
  emit("session-expired");
  assert.equal(connects, connectedBeforeRevocation);
  outs[4].resolve(); await flush();
  session = { ...session, data: { user: { id: "seven", role: "BASIC" } } }; render();
  const originalNow = Date.now;
  Date.now = () => originalNow() + 60000;
  try {
    emit("session-expired");
    const beforeRefresh = connects;
    recover({ error: "SessionRevoked", user: { id: "" } }); await flush();
    assert.equal(outs.length, 6, "expired socket refresh consumes password revocation");
    assert.equal(connects, beforeRefresh, "revoked refresh must never reconnect even before React rerenders");
    assert.equal(socket.connected, false);
    outs[5].resolve(); await flush();
  } finally { Date.now = originalNow; }
  console.log("PASS account removal frontend: current identity, duplicate guard, session signals, failed logout, recovery and stale responses.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
