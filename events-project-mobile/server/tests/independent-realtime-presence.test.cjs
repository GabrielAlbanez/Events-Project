const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

async function loadPresence() {
  const filename = path.resolve(__dirname, '../independent/src/realtime-presence.ts');
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
  return compiled.exports.PostgresRealtimePresence;
}

test('presence stores each server instance heartbeat and reads users from both frontends', async () => {
  const PostgresRealtimePresence = await loadPresence();
  const statements = [];
  const pool = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT DISTINCT presence_user.user_id')) {
        return { rows: [{ userId: 'browser-user' }, { userId: 'mobile-user' }, { userId: '../invalid' }] };
      }
      return { rows: [] };
    },
  };
  const presence = new PostgresRealtimePresence(pool, 'mobile');
  presence.updateUsers(['mobile-user', 'mobile-user']);
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.match(statements[0].sql, /INSERT INTO "RealtimePresenceSnapshot"/);
  assert.equal(statements[0].values[1], 'mobile');
  assert.deepEqual(statements[0].values[2], ['mobile-user']);
  assert.deepEqual(await presence.readActiveUserIds(), ['browser-user', 'mobile-user']);

  await presence.close();
  assert.match(statements.at(-1).sql, /DELETE FROM "RealtimePresenceSnapshot"/);
});
