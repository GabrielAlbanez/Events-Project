const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transform } = require('esbuild');
async function window(capacity, now) {
  const code = await transform(fs.readFileSync(path.join(__dirname, '../src/engagement-window.ts'), 'utf8'), { loader: 'ts', format: 'cjs' });
  const module = { exports: {} }; vm.runInNewContext(code.code, { module, exports: module.exports, Response, Date });
  return new module.exports.EngagementWindow(capacity, now);
}
test('native engagement preserves separate one-hour views and one-minute ticket windows', async () => {
  let time = 0, calls = 0; const cache = await window(10, () => time);
  const execute = async () => { calls++; return Response.json({ success: true }); };
  await cache.run('user:a', 'event', 'view', execute); await cache.run('user:a', 'event', 'view', execute);
  await cache.run('user:a', 'event', 'ticket', execute); assert.equal(calls, 2);
  time = 60000; await cache.run('user:a', 'event', 'ticket', execute); assert.equal(calls, 3);
  await cache.run('user:a', 'event', 'view', execute); assert.equal(calls, 3);
  time = 3600000; await cache.run('user:a', 'event', 'view', execute); assert.equal(calls, 4);
  await cache.run('user:b', 'event', 'view', execute); assert.equal(calls, 5);
});
test('concurrent requests count once and each caller receives a readable response', async () => {
  const cache = await window(10, () => 0); let calls = 0, release;
  const promise = new Promise(resolve => { release = resolve; });
  const execute = async () => { calls++; await promise; return Response.json({ success: true }); };
  const first = cache.run('a', 'event', 'view', execute), second = cache.run('a', 'event', 'view', execute);
  release(); const responses = await Promise.all([first, second]);
  assert.equal(calls, 1); for (const response of responses) assert.deepEqual(await response.json(), { success: true });
});
test('failed responses and rejected requests do not suppress a successful retry', async () => {
  const cache = await window(10, () => 0); let calls = 0;
  const failed = await cache.run('a', 'event', 'view', async () => { calls++; return Response.json({}, { status: 503 }); });
  assert.equal(failed.status, 503); assert.equal(cache.size, 0);
  await assert.rejects(cache.run('a', 'event', 'view', async () => { calls++; throw Error('offline'); }));
  assert.equal(cache.size, 0);
  await cache.run('a', 'event', 'view', async () => { calls++; return Response.json({ success: true }); });
  assert.equal(calls, 3);
});
test('bounded cache evicts expired or oldest settled entries without unbounded growth', async () => {
  let time = 0; const cache = await window(2, () => time);
  const execute = async () => Response.json({ success: true });
  for (let index = 0; index < 8; index++) { await cache.run(String(index), 'event', 'view', execute); assert.ok(cache.size <= 2); }
  time = 3600000; await cache.run('latest', 'event', 'view', execute); assert.equal(cache.size, 1);
});
