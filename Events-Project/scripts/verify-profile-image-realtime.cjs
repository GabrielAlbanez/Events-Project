const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

class FakeClient extends EventEmitter {
  static current;
  statements = [];
  queries = [];
  ended = false;
  constructor(options) { super(); this.options = options; FakeClient.current = this; }
  async connect() {}
  async query(sql, values) {
    this.statements.push(sql);
    this.queries.push({ sql, values });
    if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: "BASIC" }] };
    return { rows: [] };
  }
  async end() { this.ended = true; }
}

async function loadListener() {
  const filename = path.resolve(__dirname, "../server/profileImageRealtime.mts");
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "pg") return { Client: FakeClient };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { instance._compile(compiled, filename); }
  finally { Module._load = originalLoad; }
  return instance.exports.startProfileImageRealtime;
}

async function loadDatabasePresence() {
  const filename = path.resolve(__dirname, "../server/databasePresence.mts");
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance._compile(compiled, filename);
  return instance.exports.createDatabasePresence;
}

async function main() {
  const socketSource = fs.readFileSync(path.resolve(__dirname, "../server.mts"), "utf8");
  const clientSource = fs.readFileSync(path.resolve(__dirname, "../context/SocketContext.tsx"), "utf8");
  const uploadSource = fs.readFileSync(path.resolve(__dirname, "../app/api/upload/route.ts"), "utf8");
  const adminServiceSource = fs.readFileSync(path.resolve(__dirname, "../../events-project-mobile/server/independent/src/admin-service.ts"), "utf8");
  assert.match(socketSource, /startProfileImageRealtime/);
  assert.match(clientSource, /socket\.on\("profile-image-updated", handleProfileImageUpdate\)/);
  assert.match(clientSource, /notice\.userId !== userId\) return;\s*void update\(\)/);
  assert.match(uploadSource, /transaction\.\$queryRaw`SELECT pg_notify\('eventmap_profile_image_updated', \$\{actor\.id\}\)`/);
  assert.match(adminServiceSource, /pg_notify\('eventmap_user_role_updated'/);
  assert.doesNotMatch(adminServiceSource.slice(adminServiceSource.indexOf("async updateUserRole"), adminServiceSource.indexOf("async deleteUser")), /sessionVersion/);

  const start = await loadListener();
  const emitted = [];
  const roleSocket = {
    data: { userId: "user-2", effectiveRole: "PROMOTER" },
    joined: [],
    left: [],
    events: [],
    join(room) { this.joined.push(room); },
    leave(room) { this.left.push(room); },
    emit(event, payload) { this.events.push({ event, payload }); },
  };
  const io = {
    sockets: { sockets: new Map([["role-socket", roleSocket]]) },
    to(room) { return { emit(event, payload) { emitted.push({ room, event, payload }); } }; },
  };
  const stop = start("postgresql://database.example/web", () => io);
  await new Promise(resolve => setImmediate(resolve));
  const client = FakeClient.current;
  assert.deepEqual(client.statements, [
    "LISTEN eventmap_profile_image_updated",
    "LISTEN eventmap_user_role_updated",
  ]);
  client.emit("notification", { channel: "unrelated", payload: "user-1" });
  client.emit("notification", { channel: "eventmap_profile_image_updated", payload: "bad/user" });
  client.emit("notification", { channel: "eventmap_profile_image_updated", payload: "user-1" });
  assert.deepEqual(emitted, [{
    room: "user:user-1",
    event: "profile-image-updated",
    payload: { userId: "user-1" },
  }]);
  client.emit("notification", { channel: "eventmap_user_role_updated", payload: "user-2" });
  client.emit("notification", { channel: "eventmap_user_role_updated", payload: "invalid/user" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(roleSocket.data.effectiveRole, "BASIC");
  assert.deepEqual(roleSocket.left, ["admins"]);
  assert.deepEqual(roleSocket.events, [{ event: "role-mudar", payload: { newRole: "BASIC" } }]);
  assert.ok(client.queries.some(query => query.sql.includes('SELECT role FROM "User"') && query.values[0] === "user-2"));
  stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.ended, true);

  const createPresence = await loadDatabasePresence();
  const presenceStatements = [];
  const presence = createPresence({
    prisma: {
      async $executeRaw(strings, ...values) {
        presenceStatements.push({ sql: strings.join("?"), values });
      },
      async $queryRaw() {
        return [{ userId: "browser-user" }, { userId: "mobile-user" }];
      },
    },
    getLocalUserIds: () => ["browser-user"],
    onChange: userIds => emitted.push({ event: "active-users", userIds }),
  });
  await presence.poll();
  assert.ok(presenceStatements.some(statement => statement.sql.includes('INSERT INTO "RealtimePresenceSnapshot"')));
  assert.deepEqual(presence.getSnapshot(), ["browser-user", "mobile-user"]);
  await presence.stop();
  console.log("PASS: PostgreSQL updates notify only the authenticated user's socket room.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
