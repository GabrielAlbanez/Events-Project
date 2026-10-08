const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../scripts/run-android.cjs'), 'utf8');
for (const environment of [{ Path: 'C:\\tools;C:\\Windows\\System32' }, { PATH: 'C:\\tools;C:\\Windows\\System32' }, { Path: 'C:\\first', PATH: 'C:\\second' }]) {
  test('Android child preserves Node and inherited paths: ' + Object.keys(environment).join('/'), () => {
    let options;
    const loader = name => {
      if (name === 'node:fs') return { existsSync: () => true };
      if (name === 'node:path') return path.win32;
      if (name === 'node:child_process') return {
        spawnSync: () => ({ status: 0, stderr: 'openjdk version "21.0.6"', stdout: '' }),
        spawn: (_executable, _args, value) => { options = value; return { on() {} }; },
      };
      throw new Error(name);
    };
    loader.resolve = () => 'C:\\app\\node_modules\\expo\\bin\\cli';
    vm.runInNewContext(source, { require: loader, __dirname: 'C:\\app\\scripts', process: { env: environment, platform: 'win32', execPath: 'C:\\Program Files\\nodejs\\node.exe', argv: ['node', 'launcher', '--help'], exit() { throw new Error('Unexpected exit'); } }, console: { log() {}, error() {} } });
    assert.deepEqual(Object.keys(options.env).filter(key => key.toLowerCase() === 'path'), ['PATH']);
    assert.equal(options.env.PATH.split(';')[0], 'C:\\Program Files\\nodejs');
    for (const value of Object.values(environment)) assert.ok(options.env.PATH.includes(value));
    assert.ok(options.env.PATH.includes('Android Studio\\jbr\\bin'));
  });
}