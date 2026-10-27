// Real Socket.IO transport and production gateway; isolated in-memory persistence.
// This deliberately does not write to the configured remote database.
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const { Server } = require("socket.io");
const { io: client } = require("socket.io-client");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(name) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../server/", name + ".mts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", source)(id => id === "../lib/auth/accountAccess.js" ? require("./load-account-access.cjs") : id === "../lib/auth/sessionCredential.js" ? require("./load-session-credential.cjs") : id === "../lib/auth/impersonation.js" ? require("./load-session-impersonation.cjs") : id.startsWith("./") ? load(id.slice(2).replace(/\.mjs$/, "")) : require(id), mod, mod.exports);
  return mod.exports;
}
function wait(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, done); reject(new Error(event + " timeout")); }, 5000);
    function done(value) { clearTimeout(timer); resolve(value); }
    socket.once(event, done);
  });
}
async function run() {
  const { registerCommunitySubscriptions, dispatchCommunitySignal } = load("communityGateway");
  let snapshot = { id: "transport-event", status: "PUBLISHED", userId: null, title: "Original" };
  const db = { events: { findUnique: async () => snapshot } };
  let http, io, a, b;
  const counts = [0, 0];
  const listeners = counts.map((_, index) => () => { counts[index]++; });
  async function start(port = 0) {
    http = createServer((_, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(snapshot)); });
    io = new Server(http);
    io.on("connection", socket => registerCommunitySubscriptions(db, socket));
    http.listen(port, "127.0.0.1"); await once(http, "listening");
    return http.address().port;
  }
  async function subscribe(socket) {
    const response = await socket.timeout(4000).emitWithAck("community-subscribe", { eventId: "transport-event" });
    assert.equal(response.ok, true);
  }
  async function signal() {
    const received = [wait(a, "community-updated"), wait(b, "community-updated")];
    await dispatchCommunitySignal(db, io, "event:transport-event");
    for (const payload of await Promise.all(received)) assert.deepEqual(payload, { room: "event:transport-event" });
  }
  try {
    const port = await start(), url = "http://127.0.0.1:" + port;
    a = client(url, { transports: ["websocket"], autoConnect: false, reconnectionDelay: 50, reconnectionDelayMax: 100 });
    b = client(url, { transports: ["websocket"], autoConnect: false, reconnectionDelay: 50, reconnectionDelayMax: 100 });
    const connected = [wait(a, "connect"), wait(b, "connect")]; a.connect(); b.connect(); await Promise.all(connected);
    a.on("community-updated", listeners[0]); b.on("community-updated", listeners[1]);
    await Promise.all([subscribe(a), subscribe(b)]);
    await signal(); assert.deepEqual(counts, [1, 1]);
    snapshot = { ...snapshot, title: "Edited" }; await signal();
    assert.equal((await (await fetch(url)).json()).title, "Edited");
    // Repeated subscription must not duplicate deliveries to a socket.
    await subscribe(b); await subscribe(b); await signal(); assert.deepEqual(counts, [3, 3]);
    // A dropped transport reconnects automatically; applications resubscribe on connect.
    const reconnect = wait(b, "connect"); io.sockets.sockets.get(b.id).conn.close(); await reconnect;
    await subscribe(b); await signal(); assert.deepEqual(counts, [4, 4]);
    // Actual server restart on the same port, preserving the isolated snapshot.
    const restart = [wait(a, "connect"), wait(b, "connect")];
    await new Promise(resolve => io.close(resolve));
    await start(port); await Promise.all(restart); await Promise.all([subscribe(a), subscribe(b)]);
    await signal(); assert.deepEqual(counts, [5, 5]);
    // Removal revokes access and sends a final invalidation; HTTP snapshot is authoritative.
    snapshot = null;
    const denied = [wait(a, "community-access-denied"), wait(b, "community-access-denied")];
    await signal(); await Promise.all(denied);
    assert.equal(await (await fetch(url)).json(), null);
    assert.equal(io.sockets.adapter.rooms.has("event:transport-event"), false);
    a.off("community-updated", listeners[0]); b.off("community-updated", listeners[1]);
    assert.equal(a.listeners("community-updated").length, 0); assert.equal(b.listeners("community-updated").length, 0);
    console.log("PASS real transport: two WebSocket clients, edit/removal invalidation, duplicate subscriptions, dropped transport, server restart, resubscription and listener cleanup (isolated persistence; not authenticated browser E2E).");
  } finally { a?.disconnect(); b?.disconnect(); if (io) await new Promise(resolve => io.close(resolve)); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
