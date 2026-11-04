const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, dependency) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(dependency, loaded, loaded.exports);
  return loaded.exports;
}
const roles = compile('roles.ts', require);
const policy = compile('lib/authPolicy.ts', name => name === '@/roles' ? roles : require(name));
const returns = compile('lib/authReturn.ts', require);
let session = null, unavailable = false, tokenReads = 0;
const auth = compile('lib/auth/authPage.ts', name => ({
  'next-auth': { getServerSession: async () => { if (unavailable) throw new Error('Unavailable'); return session; } },
  'next/navigation': { redirect: destination => { throw { destination }; } },
  '@/lib/authPolicy': policy, '@/lib/authReturn': returns, './options': { authOptions: {} },
}[name] ?? require(name)));
const { NextRequest } = require('next/server');
const middleware = compile('middleware.ts', name => ({
  'next-auth/jwt': { getToken: async () => { tokenReads++; return { id: 'old-account', role: 'BASIC' }; } },
  '@/lib/authPolicy': policy, '@/lib/authReturn': returns,
}[name] ?? require(name))).middleware;
async function unit() {
  for (session of [null, { user: { id: '', role: 'BASIC' } }, { error: 'SessionRevoked', user: { id: 'old', role: 'BASIC' } }, { user: { id: 'old', role: 'ADMIN', provider: 'dev-admin' } }]) {
    assert.equal(await auth.redirectAuthenticatedAccount('/salvos'), undefined);
  }
  unavailable = true;
  assert.equal(await auth.redirectAuthenticatedAccount('/salvos'), undefined);
  unavailable = false;
  session = { user: { id: 'live', role: 'BASIC' } };
  await assert.rejects(auth.redirectAuthenticatedAccount('/salvos'), e => e.destination === '/salvos');
  for (const destination of ['https://external.invalid', '//external.invalid', '/login', ['/salvos'], undefined]) {
    await assert.rejects(auth.redirectAuthenticatedAccount(destination), e => e.destination === '/');
  }
  for (const page of ['/login', '/register']) {
    const response = await middleware(new NextRequest('http://localhost' + page));
    assert.equal(response.headers.get('x-middleware-next'), '1');
  }
  assert.equal(tokenReads, 0, 'Auth pages must not redirect based on a stale JWT');
  await middleware(new NextRequest('http://localhost/admin'));
  assert.equal(tokenReads, 1, 'Protected routes still inspect authentication');
  console.log('PASS auth pages: invalid/revoked/unavailable sessions can sign in; live sessions redirect safely; middleware defers auth-page checks only.');
}
async function http() {
  if (process.env.AUTH_PAGE_DB_TEST !== 'isolated-fixtures') return;
  const base = new URL(process.env.AUTH_PAGE_HTTP_URL || 'http://localhost:3100');
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname) && base.protocol === 'http:');
  const { PrismaClient } = require('@prisma/client');
  const { randomUUID } = require('node:crypto');
  const db = new PrismaClient(), id = randomUUID(), password = randomUUID() + randomUUID();
  const jar = new Map();
  async function request(route, init = {}) {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set('cookie', [...jar].map(([k,v]) => k + '=' + v).join('; '));
    const response = await fetch(new URL(route, base), { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0], split = pair.indexOf('=');
      jar.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return response;
  }
  try {
    // A correctly signed cookie for a removed account must not cause a redirect loop.
    const stale = await require('next-auth/jwt').encode({ secret: process.env.NEXTAUTH_SECRET, token: { id: randomUUID(), role: 'BASIC', provider: 'credentials' } });
    for (const page of ['/login', '/register']) {
      jar.set('next-auth.session-token', stale);
      const response = await request(page);
      assert.equal(response.status, 200, 'Stale-cookie auth page must render');
      assert.match(await response.text(), page === '/login' ? /Bom ter você de volta/ : /Criar/);
    }
    jar.clear();
    await db.user.create({ data: { id, email: id + '@auth-page-fixture.invalid', name: 'Auth page fixture', emailVerified: true, password: await require('bcrypt').hash(password, 10) } });
    const csrf = await (await request('/api/auth/csrf')).json();
    await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base.origin }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: id + '@auth-page-fixture.invalid', password, json: 'true', callbackUrl: base.origin }) });
    assert.equal((await (await request('/api/auth/session')).json()).user?.id, id);
    for (const page of ['/login', '/register']) {
      const valid = await request(page + '?callbackUrl=%2Fsalvos');
      assert.equal(valid.status, 307);
      assert.equal(new URL(valid.headers.get('location'), base).pathname, '/salvos');
    }
    console.log('PASS real HTTP: removed-account cookie opens login/register; valid Credentials session retains safe redirect.');
  } finally {
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
}
unit().then(http).catch(error => { console.error('FAIL auth page regression:', JSON.stringify({ code: error.code || error.name, ...(typeof error.actual === 'number' ? { actual: error.actual, expected: error.expected } : {}) })); process.exitCode = 1; });
