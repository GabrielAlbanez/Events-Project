const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(name) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../server", name + ".mts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", output)(id => id === "../lib/auth/sessionCredential.js" ? require("./load-session-credential.cjs") : id.startsWith("./") ? load(id.slice(2).replace(/\.mjs$/, "")) : require(id), mod, mod.exports);
  return mod.exports;
}
function socket(id, userId, io) {
  const client = { id, data: { userId }, connected: true, events: [], rooms: new Set([id, "admins", "chat:event"]),
    emit(event) { this.events.push(event); },
    disconnect(force) { assert.equal(force, true); this.connected = false; this.rooms.clear(); io.sockets.sockets.delete(id); },
  };
  io.sockets.sockets.set(id, client);
  return client;
}
async function main() {
  const { revokeRemovedAccount, createAccountRevocationPoller } = load("accountRevocation");
  const { dispatchCommunitySignal } = load("communityGateway");
  const io = { sockets: { sockets: new Map(), adapter: { rooms: new Map() } } };
  let existing = new Set(["other"]), failed = false;
  const prisma = { user: {
    findUnique: async ({ where }) => { if (failed) throw Error("unavailable"); return existing.has(where.id) ? { id: where.id } : null; },
    findMany: async ({ where }) => { if (failed) throw Error("unavailable"); return where.id.in.filter(id => existing.has(id)).map(id => ({ id })); },
  } };
  const a = socket("a", "removed", io), b = socket("b", "removed", io), other = socket("c", "other", io), guest = socket("d", undefined, io);
  await dispatchCommunitySignal(prisma, io, "user:removed");
  for (const removed of [a, b]) {
    assert.deepEqual(removed.events, ["account-removed"], "notify before disconnect, once per socket");
    assert.equal(removed.connected, false); assert.equal(removed.rooms.size, 0);
  }
  assert.equal(other.connected, true); assert.equal(guest.connected, true);
  assert.equal(await revokeRemovedAccount(prisma, io, "other"), false);
  assert.deepEqual(other.events, []);
  const orphan = socket("orphan", "orphan-user", io);
  const poller = createAccountRevocationPoller(prisma, io);
  failed = true; await poller.poll(); assert.equal(orphan.connected, true, "DB outage must not ban users");
  failed = false; await poller.poll(); assert.deepEqual(orphan.events, ["account-removed"]);
  assert.equal(other.connected, true);
  existing.clear(); await poller.poll(); assert.equal(other.connected, false);
  const stopped = socket("stopped", "missing", io); poller.stop(); await poller.poll(); assert.equal(stopped.connected, true);
  const source = fs.readFileSync(path.join(__dirname, "../server.mts"), "utf8");
  assert.match(source, /error\.data = \{ code: "ACCOUNT_REMOVED" \}/, "valid JWT with missing DB account rejects handshake explicitly");
  console.log("Account revocation socket checks passed: all sessions, private identity targeting, absent room, outage, cleanup and stopped worker.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
