const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
let create;
before(async () => {
  const filename = path.resolve(__dirname, '../independent/src/google-token-verifier.ts');
  const result = await build({ entryPoints: [filename], bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false });
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputFiles[0].text, filename);
  create = compiled.exports.createGoogleTokenVerifier;
});
const claims = () => ({ sub: 'google-subject', email: 'person@example.com', email_verified: true,
  aud: 'web-client', iss: 'https://accounts.google.com', exp: Math.floor(Date.now()/1000)+60 });
function verifier(payload, failure) {
  return create({ verifyIdToken: async options => {
    assert.deepEqual(options, { idToken: 'test-token', audience: ['web-client'] });
    if (failure) throw failure;
    return { getPayload: () => payload };
  } }, ['web-client']);
}
test('verified Google subject returns the existing profile contract', async () => {
  const profile = await verifier(claims())('test-token');
  assert.equal(profile.subject, 'google-subject'); assert.equal(profile.emailVerified, true);
});
for (const [label, patch] of [ ['audience', { aud: 'another-app' }], ['issuer', { iss: 'https://attacker.example' }],
  ['expiry', { exp: 0 }], ['unverified email', { email_verified: false }], ['missing subject', { sub: '' }] ]) {
  test('rejects invalid '+label, async () => {
    await assert.rejects(verifier({ ...claims(), ...patch })('test-token'), error => error.status === 401);
  });
}
test('invalid signatures and verifier/network failures never establish a session', async () => {
  await assert.rejects(verifier(claims(), new Error('invalid signature'))('test-token'), error => error.status === 401);
});
test('missing server audience returns service unavailable', async () => {
  await assert.rejects(create({}, [])('test-token'), error => error.status === 503);
});
