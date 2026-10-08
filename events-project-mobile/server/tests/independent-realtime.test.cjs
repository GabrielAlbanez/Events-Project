const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

const sourceRoot = path.resolve(__dirname, '../independent/src');
async function loadTypeScript(entry) {
  const filename = path.join(sourceRoot, entry);
  const result = await build({
    entryPoints: [filename],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

let realtime;
before(async () => { realtime = await loadTypeScript('realtime-transport.ts'); });

class FakeSocket {
  constructor(io, id, auth, connected = true) {
    this.io = io;
    this.id = id;
    this.handshake = { auth };
    this.connected = connected;
    this.listeners = new Map();
    this.sent = [];
    this.ioRooms = new Set();
  }
  join(room) {
    this.ioRooms.add(room);
    this.io.joinRoom(room, this);
  }
  leave(room) {
    this.ioRooms.delete(room);
    this.io.leaveRoom(room, this);
  }
  on(event, listener) {
    const entries = this.listeners.get(event) ?? [];
    entries.push(listener);
    this.listeners.set(event, entries);
  }
  emit(event, ...args) { this.sent.push({ event, args }); }
  to(room) {
    return { emit: (event, ...args) => this.io.emitRoom(room, event, args, this) };
  }
  disconnect() {
    this.connected = false;
    for (const listener of this.listeners.get('disconnect') ?? []) listener();
  }
  async receive(event, ...args) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
    await new Promise(resolve => setImmediate(resolve));
  }
  messages(event) { return this.sent.filter(message => message.event === event); }
}

class FakeServer {
  constructor() {
    this.rooms = new Map();
  }
  use(middleware) { this.middleware = middleware; }
  on(event, listener) { if (event === 'connection') this.connect = listener; }
  to(room) {
    return { emit: (event, ...args) => this.emitRoom(room, event, args) };
  }
  joinRoom(room, socket) {
    const members = this.rooms.get(room) ?? new Set();
    members.add(socket);
    this.rooms.set(room, members);
  }
  leaveRoom(room, socket) {
    const members = this.rooms.get(room);
    members?.delete(socket);
    if (members?.size === 0) this.rooms.delete(room);
  }
  emitRoom(room, event, args, except) {
    for (const socket of this.rooms.get(room) ?? []) {
      if (socket !== except) socket.emit(event, ...args);
    }
  }
  async connectSocket(socket) {
    const error = await new Promise(resolve => this.middleware(socket, resolve));
    if (error) return error;
    this.connect(socket);
    return null;
  }
}

test('socket auth requires a mobile token and room subscriptions are validated and authorized', async () => {
  const io = new FakeServer();
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate(token) {
      if (token !== 'mobile-jwt') throw new Error('invalid');
      return { id: 'user-1', role: 'BASIC' };
    },
    domainAccess: { async canSubscribe(_actor, subscription) { return subscription.eventId === 'event-1'; } },
  });
  const noToken = new FakeSocket(io, 'without-token', {});
  assert.match((await io.connectSocket(noToken)).message, /Unauthorized/);

  const socket = new FakeSocket(io, 'mobile', { token: 'mobile-jwt' });
  assert.equal(await io.connectSocket(socket), null);
  let accepted;
  await socket.receive('community-subscribe', { eventId: 'event-1' }, reply => { accepted = reply; });
  assert.deepEqual(accepted, { ok: true });

  transport.communityUpdated({ eventId: 'event-1' });
  assert.deepEqual(socket.messages('community-updated').at(-1).args[0], { room: 'event:event-1' });

  let rejected;
  await socket.receive('community-subscribe', { eventId: 'event-2' }, reply => { rejected = reply; });
  assert.deepEqual(rejected, { ok: false });
  assert.deepEqual(socket.messages('community-access-denied').at(-1).args[0], { room: 'event:event-2' });

  let malformed;
  await socket.receive('community-subscribe', { eventId: 'event-1', roomId: 'another-room' }, reply => { malformed = reply; });
  assert.deepEqual(malformed, { ok: false });
  await socket.receive('community-unsubscribe', { eventId: 'event-1' });
  assert.equal(io.rooms.get('event:event-1'), undefined);

  await socket.receive('community-subscribe', { eventId: 'event-1' });
  transport.communityAccessDenied('user-1', { eventId: 'event-1' });
  assert.deepEqual(socket.messages('community-access-denied').at(-1).args[0], { room: 'event:event-1' });
  assert.equal(io.rooms.get('event:event-1'), undefined);

  await socket.receive('community-subscribe', { user: true });
  transport.communityUpdated({ user: true }, 'user-1');
  assert.deepEqual(socket.messages('community-updated').at(-1).args[0], { room: 'user:user-1' });
  assert.throws(() => transport.communityUpdated({ user: true }), /user id is required/i);
  transport.close();
});

test('chat presence is visible only to authorized, registered match peers', async () => {
  const io = new FakeServer();
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate(token) {
      return { id: token, role: 'BASIC' };
    },
    domainAccess: { async canSubscribe(_actor, subscription) { return subscription.matchId === 'match-1'; } },
  });
  const peer = new FakeSocket(io, 'peer', { token: 'peer-user' });
  const viewer = new FakeSocket(io, 'viewer', { token: 'viewer-user' });
  await io.connectSocket(peer);
  await io.connectSocket(viewer);
  await peer.receive('register-user');
  await viewer.receive('community-subscribe', { matchId: 'match-1' });
  let reply;
  await viewer.receive('chat-presence', { matchId: 'match-1' }, value => { reply = value; });
  assert.deepEqual(reply, { ok: true, online: false });
  await peer.receive('community-subscribe', { matchId: 'match-1' });
  await peer.receive('register-user');
  await viewer.receive('chat-presence', { matchId: 'match-1' }, value => { reply = value; });
  assert.deepEqual(reply, { ok: true, online: true });
  transport.close();
});

test('profile image notifications reach only authenticated sockets for the affected user', async () => {
  const io = new FakeServer();
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate(token) { return { id: token, role: 'BASIC' }; },
    domainAccess: { async canSubscribe() { return false; } },
  });
  const owner = new FakeSocket(io, 'owner', { token: 'user-1' });
  const other = new FakeSocket(io, 'other', { token: 'user-2' });
  await io.connectSocket(owner);
  await io.connectSocket(other);

  transport.profileImageUpdated('user-1');
  assert.deepEqual(owner.messages('profile-image-updated').at(-1).args[0], { userId: 'user-1' });
  assert.equal(other.messages('profile-image-updated').length, 0);
  assert.throws(() => transport.profileImageUpdated('invalid/user'), /invalid realtime user id/i);
  transport.close();
});

test('role updates refresh connected sessions and revoke no-longer-authorized realtime rooms', async () => {
  const io = new FakeServer();
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate(token) { return { id: token, role: 'PROMOTER' }; },
    domainAccess: { async canSubscribe(actor, subscription) {
      return actor.role === 'PROMOTER' && subscription.matchId === 'match-1';
    } },
  });
  const socket = new FakeSocket(io, 'owner', { token: 'user-1' });
  await io.connectSocket(socket);
  let reply;
  await socket.receive('community-subscribe', { matchId: 'match-1' }, value => { reply = value; });
  assert.deepEqual(reply, { ok: true });

  transport.roleUpdated('user-1', 'BASIC');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(socket.messages('role-mudar').at(-1).args[0], { newRole: 'BASIC' });
  assert.deepEqual(socket.messages('community-access-denied').at(-1).args[0], { room: 'match:match-1' });
  assert.throws(() => transport.roleUpdated('user-1', 'OWNER'), /invalid realtime user role/i);
  transport.close();
});

test('active user snapshots include browser sessions from the shared database', async () => {
  const io = new FakeServer();
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate(token) { return { id: token, role: 'ADMIN' }; },
    domainAccess: { async canSubscribe() { return false; } },
    async readActiveUserIds() { return ['browser-user', 'mobile-user']; },
  });
  const admin = new FakeSocket(io, 'admin', { token: 'admin-user' });
  await io.connectSocket(admin);
  await admin.receive('request-active-users');
  assert.deepEqual(admin.messages('active-users').at(-1).args[0], [
    'admin-user',
    'browser-user',
    'mobile-user',
  ]);
  transport.close();
});

test('realtime authentication rejects revoked and suspended mobile sessions', async () => {
  const users = new Map([
    ['current', { id: 'current', role: 'BASIC', sessionVersion: 3, suspendedAt: null, suspendedUntil: null }],
    ['suspended', { id: 'suspended', role: 'ADMIN', sessionVersion: 0, suspendedAt: new Date(1), suspendedUntil: null }],
  ]);
  const authenticate = realtime.createRealtimeAuthenticator({
    repository: { async findUserById(id) { return users.get(id) ?? null; } },
    accessToken: {
      issue() { throw new Error('unused'); },
      verify(token) {
        if (token === 'revoked') return { subject: 'current', sessionVersion: 2, provider: 'credentials' };
        if (token === 'suspended') return { subject: 'suspended', sessionVersion: 0, provider: 'google' };
        return { subject: 'current', sessionVersion: 3, provider: 'credentials' };
      },
    },
  });
  assert.deepEqual(await authenticate('valid'), { id: 'current', role: 'BASIC' });
  await assert.rejects(authenticate('revoked'));
  await assert.rejects(authenticate('suspended'));
});

after(() => {});


test('support acquisition revalidates existing target sockets and rejects new ordinary connections', async () => {
  const io = new FakeServer(); let blocked = false;
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate(token) {
      if (blocked && token === 'ordinary-token') throw Object.assign(new Error('Support active'), { status: 403, code: 'ACCOUNT_IMPERSONATED' });
      return { id: 'target-1', role: 'BASIC' };
    }, domainAccess: { async canSubscribe() { return true; } },
  });
  try {
    const ordinary = new FakeSocket(io, 'ordinary', { token: 'ordinary-token' });
    assert.equal(await io.connectSocket(ordinary), null);
    await ordinary.receive('community-subscribe', { matchId: 'match-1' }, () => {});
    blocked = true;
    await transport.revalidateUser('target-1');
    assert.equal(ordinary.connected, false);
    assert.equal(ordinary.messages('account-impersonated').length, 1);
    const denied = await io.connectSocket(new FakeSocket(io, 'blocked', { token: 'ordinary-token' }));
    assert.equal(denied.data.code, 'ACCOUNT_IMPERSONATED');
    const support = new FakeSocket(io, 'support', { token: 'support-token' });
    assert.equal(await io.connectSocket(support), null);
    await transport.revalidateUser('target-1'); assert.equal(support.connected, true);
    blocked = false;
    assert.equal(await io.connectSocket(new FakeSocket(io, 'released', { token: 'ordinary-token' })), null);
  } finally { transport.close(); }
});

test('a target cannot type through an existing socket after its validation cache expires', async () => {
  const io = new FakeServer(); let blocked = false; let timestamp = 0;
  const transport = realtime.attachIndependentRealtime(io, {
    now: () => timestamp,
    async authenticate() {
      if (blocked) throw Object.assign(new Error('Support active'), { status: 403, code: 'ACCOUNT_IMPERSONATED' });
      return { id: 'target-1', role: 'BASIC' };
    }, domainAccess: { async canSubscribe() { return true; } },
  });
  try {
    const socket = new FakeSocket(io, 'existing', { token: 'ordinary-token' });
    await io.connectSocket(socket); blocked = true; timestamp = 3001;
    await socket.receive('typing', { matchId: 'match-1', active: true });
    assert.equal(socket.connected, false);
    assert.equal(socket.messages('account-impersonated').length, 1);
  } finally { transport.close(); }
});



test('temporary authentication failures skip delivery without disconnecting or revoking saved sessions', async () => {
  const io = new FakeServer(); let unavailable = false;
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate() { if (unavailable) throw new Error('temporary database failure'); return { id: 'target-1', role: 'BASIC' }; },
    domainAccess: { async canSubscribe() { return true; } },
  });
  try {
    const socket = new FakeSocket(io, 'existing', { token: 'ordinary-token' });
    await io.connectSocket(socket);
    await socket.receive('community-subscribe', { matchId: 'match-1' }, () => {});
    unavailable = true;
    let failedReply;
    await socket.receive('community-subscribe', { matchId: 'match-1' }, reply => { failedReply = reply; });
    assert.equal(failedReply.ok, false);
    assert.equal(socket.messages('community-access-denied').length, 0);
    assert.equal(socket.ioRooms.has('match:match-1'), true);
    await transport.revalidateUser('target-1');
    assert.equal(socket.connected, true);
    assert.equal(socket.messages('session-expired').length, 0);
    assert.equal(socket.messages('account-impersonated').length, 0);
    unavailable = false;
    let accepted;
    await socket.receive('community-subscribe', { matchId: 'match-1' }, reply => { accepted = reply; });
    assert.equal(accepted.ok, true);
  } finally { transport.close(); }
});

test('active users require a fresh admin role and a role change during the database read prevents delivery', async () => {
  const io = new FakeServer(); let role = 'ADMIN'; let reads = 0;
  const transport = realtime.attachIndependentRealtime(io, {
    async authenticate() { return { id: 'admin-1', role }; },
    domainAccess: { async canSubscribe() { return true; } },
    async readActiveUserIds() { reads++; role = 'BASIC'; return ['private-online-user']; },
  });
  try {
    const socket = new FakeSocket(io, 'admin', { token: 'admin-token' });
    await io.connectSocket(socket);
    role = 'BASIC'; await socket.receive('request-active-users');
    assert.equal(reads, 0); assert.deepEqual(socket.messages('active-users').at(-1).args[0], []);
    role = 'ADMIN'; await socket.receive('request-active-users');
    assert.equal(reads, 1);
    assert.equal(socket.messages('active-users').some(message => message.args[0].includes('private-online-user')), false);
  } finally { transport.close(); }
});
