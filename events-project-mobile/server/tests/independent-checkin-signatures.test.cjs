const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const { build } = require('esbuild');
let Service;
before(async () => {
  const filename = path.resolve(__dirname, '../independent/src/interaction-service.ts');
  const result = await build({ entryPoints: [filename], bundle: true, format: 'cjs', platform: 'node', packages: 'external', write: false });
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  Service = compiled.exports.PostgresInteractionService;
});
const key = 'shared-checkin-test-key-'.repeat(3), legacy = 'legacy-mobile-session-key-'.repeat(3);
const now = new Date('2030-01-01T00:00:00Z');
function token(secret, overrides = {}) {
  const payload = Buffer.from(JSON.stringify({ registrationId: 'registration', eventId: 'event', qrVersion: 1, expiresAt: now.getTime() + 60000, ...overrides })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update('eventmap-checkin-v1:' + payload).digest('base64url');
}
function pool() {
  const query = async sql => {
    if (/SELECT status FROM events/.test(sql)) return { rowCount: 1, rows: [{ status: 'PUBLISHED' }] };
    if (/SELECT id, status, "qrVersion" FROM/.test(sql)) return { rows: [{ id: 'registration', status: 'CONFIRMED', qrVersion: 1 }] };
    if (/FROM events/.test(sql)) return { rows: [{ id: 'event', status: 'PUBLISHED', userId: 'owner' }] };
    if (/FROM "EventRegistration"/.test(sql)) return { rows: [{ id: 'registration', status: 'CONFIRMED', qrVersion: 1, userId: 'attendee', userName: 'Attendee' }] };
    if (/UPDATE "EventRegistration"/.test(sql)) return { rows: [{ id: 'registration', status: 'CHECKED_IN' }] };
    return { rows: [] };
  };
  return { query, connect: async () => ({ query, release() {} }) };
}
test('mobile check-in accepts its issued token, shared Web signatures and unexpired legacy tokens', async () => {
  const service = new Service(pool(), {}, key, () => now, legacy);
  const issued = await service.issueCheckInToken('event', 'attendee');
  for (const valid of [issued.token, token(key), token(legacy)]) assert.equal((await service.checkIn('event', { id: 'owner', role: 'PROMOTER' }, valid)).status, 'CHECKED_IN');
});
test('mobile check-in preserves authorization and rejects wrong signing keys, expiry, event and version', async () => {
  const service = new Service(pool(), {}, key, () => now, legacy);
  for (const invalid of [token('untrusted-key-'.repeat(4)), token(key, { expiresAt: now.getTime() - 1 }), token(key, { eventId: 'another' }), token(key, { qrVersion: 2 }), token(key) + '.extra']) await assert.rejects(service.checkIn('event', { id: 'owner', role: 'PROMOTER' }, invalid), error => error.status === 400);
  await assert.rejects(service.checkIn('event', { id: 'stranger', role: 'BASIC' }, token(key)), error => error.status === 403);
});
