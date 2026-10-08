const { test, before } = require('node:test');
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

let communityModule;
let chatPartyModule;
let legacyImageImportModule;
before(async () => {
  [communityModule, chatPartyModule, legacyImageImportModule] = await Promise.all([
    loadTypeScript('community-service.ts'),
    loadTypeScript('chat-party-service.ts'),
    loadTypeScript('legacy-chat-image-import.ts'),
  ]);
});

function member(overrides = {}) {
  return {
    id: 'member-1',
    name: 'Member',
    email: 'member@example.com',
    image: null,
    role: 'BASIC',
    emailVerified: true,
    suspendedAt: null,
    suspendedUntil: null,
    sessionVersion: 0,
    ...overrides,
  };
}

test('community manager actions persist mobile-compatible community entries', async () => {
  const statements = [];
  const pool = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('FROM events e') && sql.includes('WHERE e.id = $1')) {
        return { rows: [{ id: 'event-1', name: 'Event', status: 'PUBLISHED', ownerId: 'organizer-1', authenticated: true, team: false }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO "CommunityEntry"')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new communityModule.PostgresCommunityService(pool);
  assert.deepEqual(await service.action('event-1', member({ id: 'organizer-1', role: 'PROMOTER' }), {
    action: 'announcement.publish',
    title: 'Doors open',
    message: 'The venue opens at 7 PM.',
  }), { ok: true });
  const insert = statements.find(statement => statement.sql.includes('INSERT INTO "CommunityEntry"'));
  assert.ok(insert);
  assert.equal(insert.values[1], 'event-1');
  assert.equal(insert.values[2], 'ANNOUNCEMENT');
  assert.deepEqual(JSON.parse(insert.values[4]), {
    title: 'Doors open',
    message: 'The venue opens at 7 PM.',
    archived: false,
  });
});

test('community entry creation is denied to non-managers', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('FROM events e') && sql.includes('WHERE e.id = $1')) {
        return { rows: [{ id: 'event-1', name: 'Event', status: 'PUBLISHED', ownerId: 'other-user', authenticated: true, team: false }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new communityModule.PostgresCommunityService(pool);
  await assert.rejects(
    service.action('event-1', member(), { action: 'announcement.publish', title: 'No', message: 'No' }),
    error => error.status === 403,
  );
});

test('event chat requires a registration, team role or event ownership', async () => {
  const statements = [];
  const pool = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes('FROM events WHERE id = $1')) {
        return { rows: [{ id: 'event-1', name: 'Event', status: 'PUBLISHED', ownerId: 'organizer-1' }], rowCount: 1 };
      }
      if (sql.includes('SELECT 1') && sql.includes('EventRegistration')) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new chatPartyModule.PostgresChatPartyService(pool);
  await assert.rejects(
    service.chatSend('event-1', member(), { text: 'Hello', clientId: 'client-1' }),
    error => error.status === 403,
  );
  assert.equal(statements.some(sql => sql.includes('INSERT INTO "EventChatMessage"')), false);
});

test('party connections require event registration before reading profiles', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('EventRegistration') && sql.includes('FROM events e')) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new chatPartyModule.PostgresChatPartyService(pool);
  await assert.rejects(service.partySnapshot('event-1', member()), error => error.status === 403);
});

test('private chat PATCH typing and receipts persist only for the authorized match', async () => {
  const statements = [];
  const pool = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('FROM "PartyMatch" m') && sql.includes('partnerId')) {
        return { rows: [{ eventId: 'event-1', partnerId: 'peer-1', partnerName: 'Peer', partnerImage: null }], rowCount: 1 };
      }
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, "authorId" FROM "PartyMessage"')) {
        return { rows: [{ id: 45, authorId: 'peer-1' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO "PartyMessageReceipt"')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new chatPartyModule.PostgresChatPartyService(pool);
  assert.deepEqual(await service.privateControl('event-1', 'match-1', member(), { action: 'typing', active: true }), { ok: true });
  assert.deepEqual(await service.privateControl('event-1', 'match-1', member(), { action: 'receipt', messageId: 45, read: true }), { ok: true });
  const typing = statements.find(statement => statement.sql.includes('INSERT INTO "PartyMessageReceipt"') && statement.sql.includes('typingUntil'));
  const receipt = statements.find(statement => statement.sql.includes('INSERT INTO "PartyMessageReceipt"') && statement.sql.includes('deliveredThrough'));
  assert.deepEqual(typing.values, ['match-1', 'member-1', true]);
  assert.deepEqual(receipt.values, ['match-1', 'member-1', 45, true]);
});

test('private chat images require an authorized match and are returned as authenticated bytes', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff]);
  const statements = [];
  const pool = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('FROM "PartyMatch" m') && sql.includes('partnerId')) {
        return { rows: [{ eventId: 'event-1', partnerId: 'peer-1', partnerName: 'Peer', partnerImage: null }], rowCount: 1 };
      }
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO "PrivateChatMedia"')) return { rows: [], rowCount: 1 };
      if (sql.includes('JOIN "PartyMessageMedia" attachment')) {
        return { rows: [{ contentType: 'image/jpeg', bytes }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const service = new chatPartyModule.PostgresChatPartyService(pool);
  const upload = await service.uploadPrivateImage('event-1', 'match-1', member(), bytes, 'image/jpeg');
  assert.match(upload.url, /\/api\/party-connections\/event-1\/matches\/match-1\/images\//);
  const image = await service.privateImage('event-1', 'match-1', upload.id, member());
  assert.equal(image.contentType, 'image/jpeg');
  assert.deepEqual(image.bytes, bytes);
  assert.equal(statements.filter(statement => statement.sql.includes('FROM "PartyMatch" m')).length, 2);
});

test('realtime subscriptions restrict rooms and private presence to their authorized audience', async () => {
  const pool = {
    async query(sql, values) {
      if (sql.includes('FriendsRoomMember')) return { rows: [], rowCount: 0 };
      if (sql.includes('PartyMatch') && sql.includes('PartyProfile')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('EventRegistration') && sql.includes('FROM events e')) return { rows: [{ ok: true }], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql} ${values}`);
    },
  };
  const access = new communityModule.PostgresCommunityRealtimeAccess(pool);
  assert.equal(await access.canSubscribe(member(), { roomId: 'room-1' }), false);
  assert.equal(await access.canSubscribe(member(), { partyEventId: 'event-1' }), true);
  assert.equal(await access.canSubscribe(member(), { matchId: 'match-1' }), false);
  assert.equal(await access.canSubscribe(member(), { user: true }), true);
});

test('legacy chat image importer defaults to read-only dry-run and skips unattached/missing files', async () => {
  const statements = [];
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('FROM "CommunityEntry"')) {
        return {
          rows: [{
            id: '11111111-1111-4111-8111-111111111111',
            eventId: 'event-1',
            authorId: 'member-1',
            matchId: '22222222-2222-4222-8222-222222222222',
            filename: '11111111-1111-4111-8111-111111111111.jpg',
            messageId: '43',
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Dry-run must not query for writes: ${sql}`);
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  const imported = await legacyImageImportModule.importLegacyChatImages(pool, path.resolve(__dirname), false);
  assert.equal(imported.dryRun, true);
  assert.equal(imported.scanned, 1);
  assert.equal(imported.eligible, 0);
  assert.equal(imported.imported, 0);
  assert.equal(imported.skipped, 1);
  assert.match(imported.issues[0], /legacy file is missing/);
  assert.equal(statements.length, 1);
});
