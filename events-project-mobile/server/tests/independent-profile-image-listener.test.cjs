const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

class FakeClient extends EventEmitter {
  static instance;
  queries = [];
  ended = false;
  constructor(options) {
    super();
    this.options = options;
    FakeClient.instance = this;
  }
  async connect() {}
  async query(sql) { this.queries.push(sql); }
  async end() { this.ended = true; }
}

async function loadListener() {
  const filename = path.resolve(__dirname, '../independent/src/profile-image-notifications.ts');
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
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'pg') return { Client: FakeClient };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    compiled._compile(result.outputFiles[0].text, filename);
  } finally {
    Module._load = originalLoad;
  }
  return compiled.exports.listenForProfileImageChanges;
}

test('PostgreSQL profile notifications validate user ids and dispatch only the supported channel', async () => {
  const listen = await loadListener();
  const updates = [];
  const roleUpdates = [];
  const stop = listen(
    'postgresql://database.example/test',
    userId => updates.push(userId),
    userId => roleUpdates.push(userId),
  );
  await new Promise(resolve => setImmediate(resolve));
  const client = FakeClient.instance;
  assert.equal(client.options.connectionString, 'postgresql://database.example/test');
  assert.deepEqual(client.queries, [
    'LISTEN eventmap_profile_image_updated',
    'LISTEN eventmap_user_role_updated',
  ]);

  client.emit('notification', { channel: 'unrelated', payload: 'user-1' });
  client.emit('notification', { channel: 'eventmap_profile_image_updated', payload: '../other-user' });
  assert.deepEqual(updates, []);
  client.emit('notification', { channel: 'eventmap_profile_image_updated', payload: 'user-1' });
  assert.deepEqual(updates, ['user-1']);
  client.emit('notification', {
    channel: 'eventmap_user_role_updated',
    payload: 'user-1',
  });
  client.emit('notification', {
    channel: 'eventmap_user_role_updated',
    payload: '../other-user',
  });
  assert.deepEqual(roleUpdates, ['user-1']);

  await stop();
  assert.equal(client.ended, true);
});
