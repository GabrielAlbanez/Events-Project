const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

async function loadService() {
  const filename = path.resolve(__dirname, '../independent/src/event-media-service.ts');
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
  return compiled.exports.PostgresEventMediaService;
}

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('mobile profile upload persists an absolute public URL with its image in one transaction', async () => {
  const PostgresEventMediaService = await loadService();
  const statements = [];
  const pool = {
    async query(sql) {
      assert.match(sql, /SELECT id, role FROM "User"/);
      return { rows: [{ id: 'user-1', role: 'BASIC' }] };
    },
    async connect() {
      return {
        async query(sql, values) {
          statements.push({ sql, values });
          return { rowCount: sql.includes('UPDATE "User"') ? 1 : null };
        },
        release() {},
      };
    },
  };
  const service = new PostgresEventMediaService(pool, 'https://api.example.test');
  const saved = await service.saveProfileImage(
    { id: 'user-1', role: 'BASIC' },
    { bytes: png, mimeType: 'image/png', fileName: 'avatar.png' },
  );

  assert.match(saved.url, /^https:\/\/api\.example\.test\/v1\/media\/profile\/[0-9a-f-]+$/);
  assert.deepEqual(statements.map(item => item.sql), [
    'BEGIN',
    'INSERT INTO "MobileEventMedia" (id, "ownerId", "mimeType", size, content)\n         VALUES ($1, $2, $3, $4, $5)',
    'UPDATE "User" SET image = $2 WHERE id = $1',
    "SELECT pg_notify('eventmap_profile_image_updated', $1)",
    'COMMIT',
  ]);
  assert.equal(statements[2].values[1], saved.url);
  assert.equal(statements[3].values[0], 'user-1');
});

test('profile upload rolls back media if updating the shared user row fails', async () => {
  const PostgresEventMediaService = await loadService();
  const statements = [];
  const pool = {
    async query() { return { rows: [{ id: 'user-1', role: 'BASIC' }] }; },
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          return { rowCount: 0 };
        },
        release() {},
      };
    },
  };
  const service = new PostgresEventMediaService(pool, 'https://api.example.test');
  await assert.rejects(
    service.saveProfileImage({ id: 'user-1', role: 'BASIC' }, { bytes: png, mimeType: 'image/png' }),
    error => error.status === 404,
  );
  assert.equal(statements.at(-1), 'ROLLBACK');
});

test('profile media is readable only while its versioned path is referenced by a user', async () => {
  const PostgresEventMediaService = await loadService();
  let queryValues;
  const pool = {
    async query(_sql, values) {
      queryValues = values;
      return { rows: [{ mimeType: 'image/png', size: png.length, content: png }] };
    },
  };
  const service = new PostgresEventMediaService(pool);
  const media = await service.readProfileImage('a8a9b8c7-3b6d-4e63-8bc4-4ff1dc9f97a1');
  assert.equal(queryValues[1], '/v1/media/profile/a8a9b8c7-3b6d-4e63-8bc4-4ff1dc9f97a1');
  assert.equal(media.contentType, 'image/png');
  assert.equal(media.cacheControl, 'public, max-age=31536000, immutable');
  assert.deepEqual(media.body, png);

  pool.query = async () => ({ rows: [] });
  await assert.rejects(
    service.readProfileImage('a8a9b8c7-3b6d-4e63-8bc4-4ff1dc9f97a1'),
    error => error.status === 404,
  );
});

test('legacy Web proxy only requests the fixed public media route and validates image bytes', async () => {
  const PostgresEventMediaService = await loadService();
  const service = new PostgresEventMediaService({}, undefined, 'https://web.example.test');
  const originalFetch = global.fetch;
  let requested;
  global.fetch = async (url, options) => {
    requested = { url: String(url), options };
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(png.length) } });
  };
  try {
    const media = await service.readLegacyProfileImage('1234567890123-uploaded_image.png');
    assert.equal(requested.url, 'https://web.example.test/api/media/1234567890123-uploaded_image.png');
    assert.equal(requested.options.redirect, 'error');
    assert.equal(media.contentType, 'image/png');
    assert.deepEqual(media.body, png);
    await assert.rejects(service.readLegacyProfileImage('../private.png'), error => error.status === 404);
    assert.equal(requested.url, 'https://web.example.test/api/media/1234567890123-uploaded_image.png');
  } finally {
    global.fetch = originalFetch;
  }
});

test('legacy Web proxy refuses untrusted redirects and oversized images', async () => {
  const PostgresEventMediaService = await loadService();
  const service = new PostgresEventMediaService({}, undefined, 'https://web.example.test');
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new TypeError('redirect blocked'); };
    await assert.rejects(
      service.readLegacyProfileImage('1234567890123-uploaded_image.jpg'),
      error => error.status === 502,
    );
    global.fetch = async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(5 * 1024 * 1024 + 1) },
    });
    await assert.rejects(
      service.readLegacyProfileImage('1234567890123-uploaded_image.jpg'),
      error => error.status === 502,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
