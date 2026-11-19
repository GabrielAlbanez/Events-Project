// Offline checks for package C-security-platform: auth rate limits, anti-enumeration,
// login error whitelist, mail transport/templates, security headers, health route and
// safe admin user deletion. No database, SMTP or HTTP server is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

/** Transpiles a TS module; `deps` overrides imports, other `@/` imports load recursively. */
function loader(deps) {
  const cache = new Map();
  function load(file) {
    const filename = path.join(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const dir = path.dirname(file);
    const localRequire = name => {
      if (Object.hasOwn(deps, name)) return deps[name];
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith("./")) {
        const key = `@/${path.posix.join(dir.replace(/\\/g, "/"), name.slice(2))}`;
        if (Object.hasOwn(deps, key)) return deps[key];
        return load(`${key.slice(2)}.ts`);
      }
      return require(name);
    };
    new Function("require", "module", "exports", source)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}

/** In-memory stand-in for the VerificationToken rows used by the limiter. */
function tokenStore() {
  const rows = [];
  const matches = (row, where = {}) => {
    if (where.token?.in) return where.token.in.includes(row.token);
    if (where.identifier === undefined) return true;
    if (typeof where.identifier === "string") return row.identifier === where.identifier;
    if (where.identifier.in) return where.identifier.in.includes(row.identifier);
    if (where.identifier.startsWith) return row.identifier.startsWith(where.identifier.startsWith) && (!where.expires || row.expires < where.expires.lt);
    return false;
  };
  return {
    rows,
    verificationToken: {
      count: async ({ where }) => rows.filter(row => matches(row, where)).length,
      create: async ({ data }) => { rows.push(data); return data; },
      deleteMany: async ({ where }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
        return { count: before - rows.length };
      },
    },
    $executeRaw: async () => 1,
  };
}

async function checkRateLimit() {
  const rate = loader({})("lib/rateLimit.ts");
  assert.equal(rate.normalizeEmail("  Ana.Silva@Example.COM "), "ana.silva@example.com");

  delete process.env.TRUST_PROXY_IP;
  assert.equal(rate.clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" })), rate.GLOBAL_CLIENT_KEY, "proxy headers ignored unless trusted");
  process.env.TRUST_PROXY_IP = "true";
  assert.equal(rate.clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(rate.clientKeyFromHeaders({ "x-real-ip": "198.51.100.4" }), "198.51.100.4", "NextAuth plain header objects are supported");
  assert.equal(rate.clientKeyFromHeaders(undefined), rate.GLOBAL_CLIENT_KEY);
  delete process.env.TRUST_PROXY_IP;

  const now = new Date("2026-11-19T12:00:00Z");
  const loginGlobal = rate.rateLimitBuckets("login", "User@Example.com", rate.GLOBAL_CLIENT_KEY, now);
  assert.equal(loginGlobal.length, 1, "login has no shared global bucket (no site-wide lockout)");
  assert.deepEqual(rate.rateLimitBuckets("login", " user@example.com ", "global", now), loginGlobal, "e-mail buckets ignore case and spaces");
  assert.equal(loginGlobal.some(bucket => bucket.identifier.includes("example.com")), false, "only hashes are stored");
  assert.equal(rate.rateLimitBuckets("login", "a@b.co", "203.0.113.9", now).length, 2);
  const registerGlobal = rate.rateLimitBuckets("register", "a@b.co", rate.GLOBAL_CLIENT_KEY, now);
  assert.equal(registerGlobal.length, 2);
  assert.ok(registerGlobal.some(bucket => bucket.identifier.includes(":client:global:") && bucket.limit === rate.RATE_LIMIT_POLICIES.register.global));

  const db = tokenStore();
  const buckets = rate.rateLimitBuckets("register", "a@b.co", "203.0.113.9", now);
  for (let i = 0; i < rate.RATE_LIMIT_POLICIES.register.email; i++) assert.equal(await rate.consumeRateLimit(db, "register", buckets, now), true);
  const rowsAtLimit = db.rows.length;
  assert.equal(await rate.consumeRateLimit(db, "register", buckets, now), false, "e-mail bucket exhausts");
  assert.equal(db.rows.length, rowsAtLimit, "refused attempts record nothing");
  const next = new Date(now.getTime() + rate.RATE_LIMIT_POLICIES.register.windowMs);
  assert.equal(await rate.consumeRateLimit(db, "register", rate.rateLimitBuckets("register", "a@b.co", "203.0.113.9", next), next), true, "new window resets");

  const loginDb = tokenStore();
  const loginBuckets = rate.rateLimitBuckets("login", "a@b.co", "global", now);
  for (let i = 0; i < rate.RATE_LIMIT_POLICIES.login.email; i++) await rate.recordRateLimitHit(loginDb, "login", loginBuckets, now);
  assert.equal(await rate.isRateLimited(loginDb, loginBuckets), true);
  await rate.clearRateLimit(loginDb, loginBuckets);
  assert.equal(await rate.isRateLimited(loginDb, loginBuckets), false, "successful login clears e-mail failures");

  // Reservation happens before the password check: a parallel burst cannot exceed the limit.
  const burstDb = tokenStore();
  const burstBuckets = rate.rateLimitBuckets("login", "burst@example.com", "global", now);
  const burst = await Promise.all(Array.from({ length: 40 }, () => rate.reserveRateLimitHit(burstDb, "login", burstBuckets, now)));
  const admitted = burst.filter(Boolean);
  assert.ok(admitted.length <= rate.RATE_LIMIT_POLICIES.login.email, "parallel burst never exceeds the limit");
  assert.equal(burstDb.rows.length, admitted.length, "refused reservations leave no rows");
  const sequential = [];
  for (let i = 0; i < 15; i++) sequential.push(await rate.reserveRateLimitHit(burstDb, "login", burstBuckets, now));
  assert.equal(admitted.length + sequential.filter(Boolean).length, rate.RATE_LIMIT_POLICIES.login.email, "the window still admits exactly the limit overall");
  const before = burstDb.rows.length;
  await rate.releaseRateLimitHit(burstDb, sequential.find(Boolean));
  assert.equal(burstDb.rows.length, before - 1, "release drops only that attempt");
}

async function checkCredentials() {
  const messages = loader({})("lib/auth/errorMessages.ts");
  assert.equal(messages.loginErrorMessage(null), null);
  assert.equal(messages.loginErrorMessage("CredentialsSignin"), messages.credentialsErrorMessages.CredentialsSignin);
  assert.notEqual(messages.loginErrorMessage("CredentialsSignin"), "CredentialsSignin");
  assert.match(messages.loginErrorMessage("OAuthAccountNotLinked"), /outra forma de acesso/);
  assert.equal(messages.loginErrorMessage("PrismaClientKnownRequestError: db.internal:5432"), messages.GENERIC_LOGIN_ERROR, "unknown codes never leak");
  assert.equal(messages.loginErrorMessage("<script>alert(1)</script>"), messages.GENERIC_LOGIN_ERROR);
  assert.equal(messages.isCredentialsErrorCode("toString"), false, "prototype keys are not codes");

  const store = tokenStore();
  let users = [], compares = 0, failDb = false;
  const prisma = {
    ...store,
    user: {
      findMany: async ({ where }) => {
        if (failDb) throw new Error("connection to db.internal refused");
        assert.equal(where.email.mode, "insensitive");
        return users.filter(user => user.email.toLowerCase() === where.email.equals);
      },
    },
  };
  const bcrypt = { __esModule: true, default: { compare: async (password, hash) => { compares++; return hash === `hash:${password}`; } } };
  const load = loader({ "@/lib/prisma": { __esModule: true, default: prisma }, bcrypt, "@/lib/auth/accountAccess": { isAccountSuspended: user => Boolean(user.suspendedAt) } });
  const { authenticateCredentials, findUserByLoginEmail, validateUser } = load("lib/services/credentials.ts");

  // Unknown e-mail still runs one bcrypt comparison (timing) and returns the generic code.
  let result = await authenticateCredentials({ email: "ghost@example.com", password: "secret1" }, "global");
  assert.deepEqual(result, { status: "error", code: "CredentialsSignin" });
  assert.equal(compares, 1);
  assert.equal((await authenticateCredentials({ email: "a@b.co", password: "x".repeat(73) }, "global")).code, "CredentialsSignin", "oversized bcrypt input rejected");
  assert.equal(compares, 1);

  users = [{ id: "legacy", email: "Maria@Example.com", password: "hash:secret1", emailVerified: true }];
  result = await authenticateCredentials({ email: " maria@example.COM ", password: "secret1" }, "global");
  assert.equal(result.status, "success", "legacy mixed-case account signs in with any casing");
  users.push({ id: "lower", email: "maria@example.com", password: "hash:other", emailVerified: true });
  assert.equal((await findUserByLoginEmail("Maria@Example.com")).id, "legacy", "exact spelling wins among case duplicates");
  assert.equal((await findUserByLoginEmail("MARIA@example.com")).id, "lower", "then the lowercase row");

  users = [{ id: "pending", email: "new@example.com", password: "hash:secret1", emailVerified: null }];
  assert.equal((await authenticateCredentials({ email: "new@example.com", password: "wrong" }, "global")).code, "CredentialsSignin", "state is hidden behind a wrong password");
  assert.equal((await authenticateCredentials({ email: "new@example.com", password: "secret1" }, "global")).code, "EmailNotVerified");
  users = [{ id: "s", email: "s@example.com", password: "hash:secret1", emailVerified: true, suspendedAt: new Date() }];
  assert.equal((await authenticateCredentials({ email: "s@example.com", password: "secret1" }, "global")).code, "AccountSuspended");

  users = [{ id: "v", email: "v@example.com", password: "hash:secret1", emailVerified: true }];
  for (let i = 0; i < 10; i++) assert.equal((await authenticateCredentials({ email: "V@example.com", password: "bad" }, "global")).code, "CredentialsSignin");
  const before = compares;
  assert.equal((await authenticateCredentials({ email: "v@example.com", password: "secret1" }, "global")).code, "RateLimited", "11th attempt is limited even with the right password");
  assert.equal(compares, before, "limited attempts skip bcrypt");

  // Parallel wrong-password burst against a fresh e-mail: bcrypt runs at most `limit` times.
  users = [{ id: "p", email: "p@example.com", password: "hash:secret1", emailVerified: true }];
  const burstStart = compares;
  const burst = await Promise.all(Array.from({ length: 30 }, () => authenticateCredentials({ email: "p@example.com", password: "guess" }, "global")));
  const reached = compares - burstStart;
  assert.ok(reached <= 10, "only up to the limit reaches the password check");
  assert.equal(burst.filter(r => r.code === "CredentialsSignin").length, reached);
  assert.ok(burst.every(r => r.code === "CredentialsSignin" || r.code === "RateLimited"));
  // Correct password on an unverified account does not consume a failure slot.
  users = [{ id: "u", email: "u@example.com", password: "hash:secret1", emailVerified: null }];
  const rowsBefore = store.rows.length;
  assert.equal((await authenticateCredentials({ email: "u@example.com", password: "secret1" }, "global")).code, "EmailNotVerified");
  assert.equal(store.rows.length, rowsBefore, "right password releases its reservation");

  failDb = true;
  result = await validateUser({ email: "x@example.com", password: "secret1" }, "global");
  assert.equal(result.code, "ServiceUnavailable");
  assert.equal(JSON.stringify(result).includes("db.internal"), false, "database details never reach the client");
  failDb = false;

  // NextAuth authorize: null for wrong credentials, whitelisted codes otherwise.
  const optionsSource = read("lib/auth/options.ts");
  assert.match(optionsSource, /authenticateCredentials/);
  assert.match(optionsSource, /if \(result\.code === "CredentialsSignin"\) return null;/);
  assert.doesNotMatch(optionsSource, /encodeURIComponent\(/, "no raw pt-BR text through the error query string");
}

async function checkRegistration() {
  const store = tokenStore();
  let users = [], mails = [], failMail = false;
  const tx = {
    ...store,
    user: {
      findFirst: async ({ where }) => users.find(user => user.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null,
      create: async ({ data }) => { users.push({ ...data, emailVerified: null }); return data; },
    },
    verificationTokenEmail: { deleteMany: async () => ({ count: 1 }), create: async ({ data }) => data },
  };
  const prisma = { $transaction: async work => work(tx) };
  process.env.NEXTAUTH_URL = "https://eventmap.example";
  const load = loader({
    "@/lib/prisma": { __esModule: true, default: prisma },
    bcrypt: { __esModule: true, default: { hash: async password => `hash:${password}` } },
    uuid: { v4: () => "token-123" },
    "@/lib/mail/verification": { sendVerificationEmail: async (email, link) => { if (failMail) throw new Error("535 SMTP auth failed for secret@smtp"); mails.push(["verify", email, link]); } },
    "@/lib/mail/accountExists": { sendAccountExistsEmail: async (email, links) => { mails.push(["exists", email, links.recovery]); } },
    "@/lib/mail/transport": { isMailConfigured: () => mailConfigured },
  });
  let mailConfigured = true;
  const { registerUser, REGISTER_SUCCESS_MESSAGE } = load("lib/services/registration.ts");
  const input = { name: "Ana", email: " Ana@Example.com ", password: "secret12" };

  const created = await registerUser(input, "203.0.113.1");
  assert.deepEqual(created, { status: "success", message: REGISTER_SUCCESS_MESSAGE });
  assert.equal(users[0].email, "ana@example.com", "new e-mails are stored lowercase");
  assert.deepEqual(mails.pop().slice(0, 2), ["verify", "ana@example.com"]);

  const pending = await registerUser({ ...input, email: "ANA@example.com" }, "203.0.113.2");
  assert.deepEqual(pending, created, "pending account: identical response");
  assert.equal(mails.pop()[0], "verify", "pending account gets a fresh confirmation link");

  users[0].emailVerified = true;
  const existing = await registerUser({ ...input, password: "different1" }, "203.0.113.3");
  assert.deepEqual(existing, created, "existing account: identical response (no enumeration)");
  const notice = mails.pop();
  assert.deepEqual(notice.slice(0, 2), ["exists", "ana@example.com"], "owner is notified instead");
  assert.equal(notice[2], "https://eventmap.example/recuperar-senha");
  assert.equal(users[0].password, "hash:secret12", "existing password untouched");

  const limited = await registerUser(input, "203.0.113.4");
  assert.equal(limited.code, "rate_limited", "4th attempt for the same e-mail within the hour");

  failMail = true;
  const mailFailure = await registerUser({ ...input, email: "other@example.com" }, "203.0.113.5");
  assert.equal(mailFailure.code, "unavailable");
  assert.equal(/SMTP|secret|535/.test(mailFailure.error), false);
  mailConfigured = false;
  assert.equal((await registerUser({ ...input, email: "third@example.com" }, "203.0.113.6")).code, "unavailable");
  assert.equal((await registerUser({ ...input, email: "invalid" })).code, "invalid");

  const route = read("app/api/register/route.ts");
  assert.match(route, /checkOrigin\(req\)/);
  assert.match(route, /rate_limited: 429/);
  assert.match(route, /'Retry-After'/);
  assert.match(route, /Cache-Control': 'no-store'/);
  assert.match(read("schemas/accountInput.ts"), /\.trim\(\)\.toLowerCase\(\)/);
  assert.match(read("lib/services/passwordRecovery.ts"), /mode: "insensitive"/);
}

async function checkMail() {
  const transport = loader({ nodemailer: { __esModule: true, default: { createTransport: () => ({ sendMail: async () => undefined }) } } })("lib/mail/transport.ts");
  const resolve = transport.resolveMailConfig;
  assert.equal(resolve({}), null);
  assert.deepEqual(resolve({ EMAIL_USER: "box@gmail.com", EMAIL_PASS: "app" }), { kind: "gmail", user: "box@gmail.com", pass: "app", from: "box@gmail.com" }, "legacy Gmail kept when SMTP_HOST is unset");
  assert.equal(resolve({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p", MAIL_FROM: "EventMap <n@example.com>", EMAIL_USER: "box@gmail.com", EMAIL_PASS: "app" }).kind, "smtp", "SMTP_HOST wins");
  assert.deepEqual(resolve({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASS: "p" }), { kind: "smtp", host: "smtp.example.com", port: 587, secure: false, user: "u", pass: "p", from: "u" });
  const implicit = resolve({ SMTP_HOST: "h", SMTP_SECURE: "true", MAIL_FROM: "a@b.co" });
  assert.equal(implicit.port, 465); assert.equal(implicit.secure, true); assert.equal(implicit.user, null);
  assert.equal(resolve({ SMTP_HOST: "h", SMTP_PORT: "465", MAIL_FROM: "a@b.co" }).secure, true);
  assert.equal(resolve({ SMTP_HOST: "h", SMTP_PORT: "99999", MAIL_FROM: "a@b.co" }), null, "invalid port disables mail");
  assert.equal(resolve({ SMTP_HOST: "h", SMTP_USER: "u" }), null, "user without password disables mail");
  assert.equal(resolve({ SMTP_HOST: "h" }), null, "a sender is required");
  await assert.rejects(transport.sendMail({ to: "a@b.co", subject: "x", text: "y" }), error => error.message === "MAIL_NOT_CONFIGURED");

  const { renderAccountEmail, escapeHtml } = loader({})("lib/mail/templates.ts");
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  const email = renderAccountEmail({ preheader: "p", heading: "Confirme <seu> e-mail", paragraphs: ["Olá & bem-vindo"], action: { label: "Confirmar", url: "https://eventmap.example/verifyEmail?token=a&b=1" }, note: "n" });
  assert.match(email.html, /<html lang="pt-BR">/);
  assert.match(email.html, /Confirme &lt;seu&gt; e-mail/);
  assert.match(email.html, /token=a&amp;b=1/);
  assert.match(email.text, /Confirmar: https:\/\/eventmap\.example\/verifyEmail\?token=a&b=1/, "text fallback carries the link");
  assert.throws(() => renderAccountEmail({ preheader: "", heading: "h", paragraphs: [], action: { label: "x", url: "javascript:alert(1)" } }), /UNSAFE_MAIL_LINK/);
  for (const file of ["lib/mail/verification.ts", "lib/mail/recovery.ts", "lib/mail/accountExists.ts"]) {
    const source = read(file);
    assert.match(source, /sendMail\(/, `${file} uses the shared transport`);
    assert.doesNotMatch(source, /createTransport/, `${file} has no private transporter`);
  }
  const env = read(".env.example");
  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "EMAIL_USER", "EMAIL_PASS"]) assert.match(env, new RegExp(`^${name}=""$`, "m"), `${name} documented with an empty value`);
}

async function checkHeaders() {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const config = (await import(`${require("node:url").pathToFileURL(path.join(root, "next.config.mjs")).href}?t=${Date.now()}`)).default;
  process.env.NODE_ENV = previous;
  assert.equal(config.poweredByHeader, false);
  const rules = await config.headers();
  const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match");
  const headersFor = pathname => {
    const result = {};
    for (const rule of rules) if (getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(pathname)) for (const header of rule.headers) result[header.key] = header.value;
    return result;
  };
  for (const pathname of ["/", "/login", "/eventos/abc", "/api/health", "/embedded"]) {
    const headers = headersFor(pathname);
    assert.equal(headers["X-Frame-Options"], "SAMEORIGIN", pathname);
    assert.equal(headers["Content-Security-Policy"], "frame-ancestors 'self'", pathname);
    assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.match(headers["Permissions-Policy"], /geolocation=\(self\)/);
    assert.match(headers["Content-Security-Policy-Report-Only"], /frame-ancestors 'self'/);
    assert.match(headers["Content-Security-Policy-Report-Only"], /maps\.googleapis\.com/);
  }
  for (const pathname of ["/embed", "/embed/evento/abc", "/embed/mapa"]) {
    const headers = headersFor(pathname);
    assert.equal(headers["X-Frame-Options"], undefined, `${pathname} can be framed`);
    assert.equal(headers["Content-Security-Policy"], "frame-ancestors *", pathname);
    assert.match(headers["Content-Security-Policy-Report-Only"], /frame-ancestors \*/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  }
  // HSTS only in production.
  process.env.NODE_ENV = "development";
  const devConfig = (await import(`${require("node:url").pathToFileURL(path.join(root, "next.config.mjs")).href}?dev=${Date.now()}`)).default;
  process.env.NODE_ENV = previous;
  const devHeaders = (await devConfig.headers()).flatMap(rule => rule.headers.map(header => header.key));
  assert.equal(devHeaders.includes("Strict-Transport-Security"), false);
  assert.equal(devHeaders.includes("Content-Security-Policy-Report-Only"), false);
}

async function checkHealth() {
  let fail = false, queries = 0;
  const prisma = { $queryRaw: async strings => { queries++; assert.equal(strings.join("?").trim(), "SELECT 1"); if (fail) throw new Error("password authentication failed for user admin at db.internal"); return [{ "?column?": 1 }]; } };
  const route = loader({ "@/lib/prisma": { __esModule: true, default: prisma } })("app/api/health/route.ts");
  assert.equal(route.dynamic, "force-dynamic");
  let response = await route.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  let body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["db", "status", "time"]);
  assert.equal(body.db, "ok"); assert.equal(body.status, "ok");
  assert.ok(!Number.isNaN(Date.parse(body.time)));
  fail = true;
  const warn = console.warn; let logged = "";
  console.warn = message => { logged += message; };
  response = await route.GET();
  console.warn = warn;
  body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.db, "error");
  assert.equal(/db\.internal|password|admin/.test(JSON.stringify(body) + logged), false, "no sensitive details");
  assert.equal(queries, 2);
}

async function checkUserAdministration() {
  let target = { id: "member", role: "BASIC", _count: { Events: 0, friendsOwned: 0 } };
  const calls = [];
  const tx = {
    user: {
      deleteMany: async args => { calls.push(["delete", args.where]); return { count: 1 }; },
      findUnique: async () => target && { role: target.role },
      updateMany: async args => { calls.push(["role", args.where, args.data]); if (args.where.role !== target.role) return { count: 0 }; target.role = args.data.role; return { count: 1 }; },
    },
    communitySignal: { create: async args => calls.push(["signal", args.data.room]) },
    userSuspensionAudit: { create: async args => calls.push(["audit", args.data]) },
    notification: { createMany: async args => { calls.push(["notify", args.data]); return { count: args.data.length }; } },
  };
  const prisma = { user: { findUnique: async args => { assert.equal(args.select._count.select.Events, true); return target; } }, $transaction: async work => work(tx) };
  const admin = loader({ "@/lib/prisma": { __esModule: true, default: prisma }, "@/lib/services/adminPagination": { getAdminUsersPage: async () => ({}) } })("lib/services/userAdministration.ts");

  assert.equal(admin.deletionBlocker(0, 0), null);
  assert.match(admin.deletionBlocker(2, 1), /2 eventos publicados e 1 sala de amigos/);
  target._count.Events = 1;
  const blocked = await admin.deleteUser({ id: "member" }, async () => "admin");
  assert.equal(blocked.status, "error");
  assert.match(blocked.message, /Suspenda a conta/);
  assert.equal(calls.length, 0, "no transaction when events would cascade");
  target._count.Events = 0;
  assert.equal((await admin.deleteUser({ id: "member" }, async () => "admin")).status, "success");
  const [, where] = calls.find(call => call[0] === "delete");
  assert.deepEqual(where, { id: "member", role: { not: "ADMIN" }, Events: { none: {} }, friendsOwned: { none: {} } }, "guard is re-checked atomically");
  assert.ok(calls.some(call => call[0] === "signal" && call[1] === "user:member"));

  calls.length = 0;
  assert.equal((await admin.alterRoleUser({ id: "member" }, "PROMOTER", async () => null)).status, "error");
  assert.equal((await admin.alterRoleUser({ id: "member" }, "ROOT", async () => "admin")).status, "error");
  assert.equal(calls.length, 0);
  const changed = await admin.alterRoleUser({ id: "member" }, "PROMOTER", async () => "admin");
  assert.equal(changed.status, "success");
  const audit = calls.find(call => call[0] === "audit");
  assert.deepEqual(audit[1], { actorId: "admin", userId: "member", action: "ROLE_CHANGE", reason: "BASIC -> PROMOTER" });
  const notice = calls.find(call => call[0] === "notify");
  assert.ok(notice, "promotion to PROMOTER notifies the user in the same transaction");
  assert.equal(notice[1].length, 1);
  assert.equal(notice[1][0].userId, "member"); assert.equal(notice[1][0].type, "ADMIN"); assert.equal(notice[1][0].href, "/CriarEvento");
  assert.equal(notice[1][0].groupKey, "organizer-promoted:member");
  assert.match(read("lib/services/userAdministration.ts"), /createNotifications\(tx, \[organizerPromotionNotice\(userId\)\]\)/);
  calls.length = 0;
  assert.equal((await admin.alterRoleUser({ id: "member" }, "PROMOTER", async () => "admin")).status, "success");
  assert.equal(calls.length, 0, "unchanged role writes no audit");
  assert.equal((await admin.alterRoleUser({ id: "member" }, "BASIC", async () => "admin")).status, "success");
  assert.ok(calls.some(call => call[0] === "audit" && call[1].reason === "PROMOTER -> BASIC"));
  assert.equal(calls.some(call => call[0] === "notify"), false, "demotion sends no organizer notice");
  calls.length = 0;
  target.role = "ADMIN";
  assert.equal((await admin.alterRoleUser({ id: "member" }, "BASIC", async () => "admin")).status, "error", "admins keep their role");
  assert.equal(calls.length, 0);
}

function checkLoginForm() {
  const form = read("components/login-form.tsx");
  assert.doesNotMatch(form, /validateUser/, "single round trip: NextAuth authorize enforces limits");
  assert.doesNotMatch(form, /decodeURIComponent\(error\)/, "raw ?error= is never rendered");
  assert.match(form, /loginErrorMessage\(urlError\)/);
  assert.match(form, /loginErrorMessage\(signInResponse\?\.error\)/);
  assert.match(form, /submittingRef\.current\) return;/, "double submit guard");
  assert.match(form, /timers\.forEach\(clearTimeout\)/, "timers cleared on unmount");
  assert.match(form, /id="login-form-error" role="alert"/);
  assert.match(form, /aria-describedby=\{describedBy\(errors\.email/);
  assert.match(form, /aria-required="true"/);
  const google = read("components/MyComponents/GoogleButton.tsx");
  assert.match(google, /disabled=\{pending\}/);
  assert.doesNotMatch(google, /console\.log/);
}

(async () => {
  await checkRateLimit();
  await checkCredentials();
  await checkRegistration();
  await checkMail();
  await checkHeaders();
  await checkHealth();
  await checkUserAdministration();
  checkLoginForm();
  console.log("PASS: security platform (rate limits, anti-enumeration, login errors, mail transport/templates, headers, health, safe user deletion)");
})().catch(error => { console.error(error); process.exitCode = 1; });
