const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
let google;
before(async () => {
  const filename = path.resolve(__dirname, '../googleNative.ts');
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(result.outputText, filename);
  google = compiled.exports;
});
function sdk(response, failure) {
  const calls = [];
  return { calls, GoogleSignin: {
    hasPlayServices: async options => { calls.push(options); },
    signIn: async () => { if (failure) throw failure; return response; },
  }, isSuccessResponse: result => result.type === 'success' };
}
test('Android checks Play Services and returns the ID token for the existing API', async () => {
  const mock = sdk({ type: 'success', data: { idToken: 'test-token' } });
  assert.equal(await google.requestGoogleToken(mock, true), 'test-token');
  assert.deepEqual(mock.calls, [{ showPlayServicesUpdateDialog: true }]);
});
test('iOS does not check Android Play Services', async () => {
  const mock = sdk({ type: 'success', data: { idToken: 'test-token' } });
  await google.requestGoogleToken(mock, false);
  assert.equal(mock.calls.length, 0);
});
test('cancel returns null without authenticating the backend', async () => {
  assert.equal(await google.requestGoogleToken(sdk({ type: 'cancelled', data: null }), true), null);
});
test('missing ID token cannot create an application session', async () => {
  await assert.rejects(google.requestGoogleToken(sdk({ type: 'success', data: { idToken: null } }), true));
});
test('network errors propagate to the login feedback', async () => {
  const failure = Object.assign(new Error('Network unavailable'), { code: '7' });
  await assert.rejects(google.requestGoogleToken(sdk(null, failure), true), error => error === failure);
});
test('Play Services errors prevent sign-in', async () => {
  const mock = sdk({ type: 'success', data: { idToken: 'test-token' } });
  mock.GoogleSignin.hasPlayServices = async () => { throw new Error('PLAY_SERVICES_NOT_AVAILABLE'); };
  await assert.rejects(google.requestGoogleToken(mock, true), /PLAY_SERVICES/);
});

test('logout calls native signOut', async () => {
  let calls = 0;
  await google.signOutGoogle({ GoogleSignin: { signOut: async () => { calls++; } } });
  assert.equal(calls, 1);
});
test('native logout failure is observable for local-session cleanup', async () => {
  await assert.rejects(google.signOutGoogle({ GoogleSignin: { signOut: async () => { throw new Error('offline'); } } }), /offline/);
});

function loginHook(nativeSdk, authenticate = async () => {}) {
  const vm = require('node:vm');
  const filename = path.resolve(__dirname, '../../hooks/useGoogleSignIn.native.ts');
  const compiled = require('typescript').transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: require('typescript').ModuleKind.CommonJS, target: require('typescript').ScriptTarget.ES2022 }
  }).outputText;
  const states = []; const exports = {}; let successes = 0;
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react') return { useCallback: fn => fn, useEffect: fn => fn(), useRef: value => ({ current: value }), useState: value => { const index=states.length; states.push(value); return [value, next => { states[index]=next; }]; } };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo') return { isRunningInExpoGo: () => false };
    if (name.includes('SessionContext')) return { useSession: () => ({ googleSignIn: authenticate }) };
    if (name.includes('googleNative')) return { configureGoogle: async () => nativeSdk, requestGoogleToken: google.requestGoogleToken };
    throw new Error('Unexpected import '+name);
  }, process: { env: { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'test-web-client' } } });
  return { ...exports.useGoogleSignIn(() => { successes++; }), states, successes: () => successes };
}
function codedSdk(response, error) {
  return { ...sdk(response, error), isErrorWithCode: error => typeof error?.code === 'string',
    statusCodes: { SIGN_IN_CANCELLED: 'cancel', IN_PROGRESS: 'progress', PLAY_SERVICES_NOT_AVAILABLE: 'play' } };
}
test('native hook authenticates with the existing session and navigates only after success', async () => {
  const calls=[]; const hook=loginHook(codedSdk({type:'success',data:{idToken:'test-token'}}), async token => calls.push(token));
  await hook.signIn(); assert.deepEqual(calls,['test-token']); assert.equal(hook.successes(),1); assert.equal(hook.states[0],false);
});
test('native hook ignores repeated presses while authentication is pending', async () => {
  let release; let calls=0; const wait=new Promise(resolve=>{release=resolve;});
  const hook=loginHook(codedSdk({type:'success',data:{idToken:'test-token'}}), async ()=>{calls++;await wait;});
  const first=hook.signIn(); await hook.signIn(); release(); await first; assert.equal(calls,1);
});
test('cancel does not call application authentication or navigation', async () => {
  let calls=0; const hook=loginHook(codedSdk({type:'cancelled'}),async()=>{calls++;});
  await hook.signIn(); assert.equal(calls,0); assert.equal(hook.successes(),0); assert.equal(hook.states[1],null);
});
for (const code of ['7','progress','play','10']) {
  test('native hook shows feedback and clears loading for SDK error '+code, async () => {
    const hook=loginHook(codedSdk(null,Object.assign(new Error('SDK error'),{code})));
    await hook.signIn(); assert.equal(hook.states[0],false); assert.equal(typeof hook.states[1],'string'); assert.equal(hook.successes(),0);
  });
}
