const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const asset = '12345678-1234-1234-1234-123456789012';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2uoAAAAASUVORK5CYII=', 'base64');
let state;
class CommunityError extends Error { constructor(status, message) { super(message); this.status = status; } }
const tx = {
  $queryRaw: async (sql, ...values) => {
    const query = sql.join('?');
    state.queries.push({ query, values });
    if (state.databaseError) throw new Error('database unavailable');
    if (query.includes('"PartyProfile"')) return state.references;
    assert.match(query, /FROM "MobileEventMedia"/);
    return state.media;
  },
};
const prisma = {
  $transaction: async (callback, options) => {
    state.transactions++;
    assert.equal(options.timeout, 15000);
    return callback(tx);
  },
};
function load(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/lib/community/common') return { CommunityError };
    if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
    if (name === '@/lib/adminAuth') return { getAuthenticatedUser: async () => { state.authCalls++; return state.actor; } };
    if (name === '@/lib/partyConnections/access') return { pairAccess: async (...args) => {
      state.accessCalls.push(args);
      if (state.accessError) throw state.accessError;
      return {};
    } };
    if (name === '@/lib/storage/profileImages') return load('lib/storage/profileImages.ts');
    return require(name);
  }, module, module.exports);
  return module.exports;
}
function reset(overrides = {}) {
  state = { actor: { id: 'viewer' }, references: [{ eventId: 'event', userId: 'viewer' }],
    media: [{ mimeType: 'image/png', size: png.length, content: png }],
    queries: [], authCalls: 0, transactions: 0, accessCalls: [], ...overrides };
}
const { GET } = load('app/api/party-profile-media/[assetId]/route.ts');
async function read(expected, assetId = asset) {
  const response = await GET(new Request('https://site.invalid'), { params: { assetId } });
  assert.equal(response.status, expected);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  if (expected !== 200) assert.equal((await response.arrayBuffer()).byteLength, 0);
  return response;
}
function noByteQuery() { assert.ok(state.queries.every(({ query }) => !query.includes('"MobileEventMedia"'))); }

(async () => {
  reset(); await read(404, '../private');
  assert.equal(state.authCalls, 0); assert.equal(state.transactions, 0); assert.equal(state.queries.length, 0);

  reset({ actor: null }); await read(401);
  assert.equal(state.authCalls, 1); assert.equal(state.transactions, 0); noByteQuery();

  reset(); const own = await read(200);
  assert.equal(own.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await own.arrayBuffer()), png);
  assert.equal(state.accessCalls.length, 0); assert.equal(state.queries.length, 2);
  assert.match(state.queries[0].query, /RIGHT\(p\."photoUrl", LENGTH\(\?\)\) = \?/);
  assert.deepEqual(state.queries[0].values, ['/v1/media/events/' + asset, '/v1/media/events/' + asset]);
  assert.match(state.queries[1].query, /m\.id = \? AND m\.size > 0 AND m\.size <= \?/);
  assert.deepEqual(state.queries[1].values, [asset, 5 * 1024 * 1024]);

  reset({ references: [{ eventId: 'event', userId: 'owner' }] }); await read(200);
  assert.deepEqual(state.accessCalls, [[tx, 'event', 'viewer', 'owner']]);
  assert.equal(state.queries.length, 2);

  for (const reason of ['blocked', 'inactive']) {
    reset({ references: [{ eventId: 'event', userId: 'owner' }], accessError: new CommunityError(403, reason) });
    await read(404); assert.equal(state.accessCalls.length, 1); noByteQuery();
  }
  reset({ references: [] }); await read(404); assert.equal(state.accessCalls.length, 0); noByteQuery();
  reset({ media: [] }); await read(404);

  for (const media of [
    { mimeType: 'text/html', size: png.length, content: png },
    { mimeType: 'image/jpeg', size: png.length, content: png },
    { mimeType: 'image/png', size: png.length + 1, content: png },
    { mimeType: 'image/png', size: 0, content: Buffer.alloc(0) },
    { mimeType: 'image/png', size: 5 * 1024 * 1024 + 1, content: Buffer.alloc(5 * 1024 * 1024 + 1) },
    { mimeType: 'image/png', size: 1, content: Buffer.from('x') },
  ]) { reset({ media: [media] }); await read(404); }

  reset({ databaseError: true }); await read(404); noByteQuery();
  reset({ references: [{ eventId: 'event', userId: 'owner' }], accessError: new Error('unexpected authorization failure') });
  await read(404); noByteQuery();
  console.log('PASS: party media authentication, ownership, pair authorization, denial before byte reads, parameterized queries, image validation, private caching and fail-closed errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
