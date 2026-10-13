const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function helper(updateProfile) {
  const source = fs.readFileSync(path.join(__dirname, '../profileUpdate.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require() { return { api: { updateProfile } }; } });
  return exports.saveProfileChanges;
}
test('password save succeeds with explicit logout and never refreshes a revoked bearer', async () => {
  const calls = [];
  const save = helper(async () => { calls.push('save'); });
  const result = await save({ email: 'person@example.com', password: 'current', newPassword: 'changed' }, {
    async refresh() { throw new Error('old session is revoked'); }, async signOut() { calls.push('logout'); },
  });
  assert.equal(result, 'signed-out'); assert.deepEqual(calls, ['save', 'logout']);
});
test('ordinary profile save refreshes the current session and a failed save never logs out', async () => {
  const calls = [];
  const session = { async refresh() { calls.push('refresh'); }, async signOut() { calls.push('logout'); } };
  assert.equal(await helper(async () => {} )({ email: 'person@example.com', name: 'Changed' }, session), 'updated');
  assert.deepEqual(calls, ['refresh']);
  await assert.rejects(helper(async () => { throw new Error('wrong password'); })({ email: 'person@example.com', newPassword: 'changed' }, session), /wrong password/);
  assert.deepEqual(calls, ['refresh']);
});
