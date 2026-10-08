const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

const filename = path.resolve(__dirname, '../independent/src/admin-service.ts');
let PostgresAdminService;

test('load isolated admin service', async () => {
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
  PostgresAdminService = compiled.exports.PostgresAdminService;
  assert.equal(typeof PostgresAdminService, 'function');
});

test('admin user list searches with bound parameters and reports counts', async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('COUNT(*)::int AS total FROM "User" u')) return { rows: [{ total: 1 }] };
      if (sql.includes('AS "isSuspended"')) {
        return { rows: [{ id: 'user-2', name: 'Ada', email: 'ada@example.com', role: 'BASIC', isSuspended: false }] };
      }
      return { rows: [{ total: 5, admins: 1, promoters: 2 }] };
    },
  };
  const service = new PostgresAdminService(pool);
  const result = await service.listUsers('admin-1', { page: 2, q: 'ada_%', role: 'BASIC' });

  assert.equal(result.data[0].id, 'user-2');
  assert.equal(result.pagination.page, 2);
  assert.deepEqual(result.counts, { total: 5, admins: 1, promoters: 2 });
  assert.match(queries[1].sql, /ILIKE/);
  assert.deepEqual(queries[1].values, ['%ada\\_\\%%', 'BASIC']);
  assert.equal(queries[2].values[1], 'BASIC');
});

test('admin access is checked against the database for every service operation', async () => {
  const pool = { async query() { return { rows: [{ role: 'BASIC' }] }; } };
  const service = new PostgresAdminService(pool);
  await assert.rejects(service.listUsers('user-1'), error => error.status === 403);
});

test('role changes preserve the active session and publish a transactional realtime notification', async () => {
  const statements = [];
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('SELECT id, role FROM "User"')) return { rows: [{ id: 'user-2', role: 'BASIC' }] };
      if (sql.includes('UPDATE "User" SET role = $2')) {
        return { rows: [{ id: 'user-2', name: 'Ada', role: 'PROMOTER' }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = new PostgresAdminService({
    async connect() { return client; },
    async query() { return { rows: [] }; },
  });
  const result = await service.updateUserRole('admin-1', 'user-2', { role: 'PROMOTER' });

  assert.equal(result.role, 'PROMOTER');
  const update = statements.find(entry => entry.sql.includes('UPDATE "User" SET role = $2'));
  assert.doesNotMatch(update.sql, /sessionVersion/);
  const notification = statements.find(entry => entry.sql.includes("pg_notify('eventmap_user_role_updated'"));
  assert.equal(notification.values[0], 'user-2');
  assert.equal(statements.at(-1).sql, 'COMMIT');
});

test('suspension updates revoke mobile sessions and write an audit record transactionally', async () => {
  const statements = [];
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('SELECT id, name, "sessionVersion" FROM "User"')) {
        return { rows: [{ id: 'admin-1', name: 'Admin', sessionVersion: 2 }] };
      }
      if (sql.includes('FROM "User" u WHERE u.id = $1 FOR UPDATE')) {
        return { rows: [{
          id: 'user-2', name: 'Ada', email: 'ada@example.com', image: null, role: 'BASIC',
          emailVerified: true, suspendedAt: null, suspendedUntil: null, sessionVersion: 0,
          provider: 'credentials',
        }] };
      }
      if (sql.includes('SELECT id, role FROM "User"')) return { rows: [{ id: 'user-2', role: 'BASIC' }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async query() { return { rows: [] }; },
  };
  const service = new PostgresAdminService(pool, () => new Date('2026-10-07T12:00:00.000Z'));
  const result = await service.setSuspension('admin-1', 'user-2', {
    action: 'suspend',
    reason: 'Repeated abusive messages',
    until: '2026-10-08T12:00:00.000Z',
  });

  assert.equal(result.action, 'suspend');
  const update = statements.find(entry => entry.sql.includes('UPDATE "User" SET "suspendedAt"'));
  assert.match(update.sql, /"sessionVersion" = "sessionVersion" \+ 1/);
  assert.deepEqual(update.values.slice(0, 2), ['user-2', new Date('2026-10-07T12:00:00.000Z')]);
  assert.ok(statements.some(entry => entry.sql.includes('INSERT INTO "UserSuspensionAudit"')));
  assert.ok(statements.some(entry => entry.sql === 'COMMIT'));
});

test('event and party report queues expose only pending reports with public moderation details', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('FROM "PartyReport" WHERE status')) return { rows: [{ total: 1 }] };
      if (sql.includes('FROM "PartyReport" r')) {
        return { rows: [{
          id: 'report-1', eventId: 'event-1', reporterId: 'reporter-1', targetId: 'target-1',
          reason: 'unsafe', evidence: 'message reference', status: 'PENDING',
          createdAt: new Date('2026-10-07T12:00:00.000Z'), joinedEventId: 'event-1',
          eventName: 'Sample event', reporterName: 'Reporter', targetName: 'Target',
        }] };
      }
      return { rows: [{ total: 0 }] };
    },
  };
  const service = new PostgresAdminService(pool);
  const queue = await service.listPartyReports('admin-1');
  assert.equal(queue.reports.length, 1);
  assert.equal(queue.reports[0].event.nome, 'Sample event');
  assert.equal(queue.reports[0].evidence, 'message reference');
  assert.equal(queue.pagination.total, 1);
});

test('event report review only changes a pending row and records the reviewer', async () => {
  const statements = [];
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('UPDATE "EventReport"')) {
        return { rows: [{ id: values[0], status: values[1], reviewedAt: values[3], resolutionNote: values[4] }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = new PostgresAdminService({ async connect() { return client; } }, () => new Date('2026-10-07T12:00:00.000Z'));
  const result = await service.reviewEventReport('admin-1', 'report-1', {
    status: 'RESOLVED',
    resolutionNote: 'Reviewed and corrected.',
  });
  const update = statements.find(entry => entry.sql.includes('UPDATE "EventReport"'));
  assert.equal(result.status, 'RESOLVED');
  assert.match(update.sql, /WHERE id = \$1 AND status = 'PENDING'/);
  assert.deepEqual(update.values.slice(0, 3), ['report-1', 'RESOLVED', 'admin-1']);
  assert.ok(statements.some(entry => entry.sql === 'COMMIT'));
});

test('impersonation audit creation refuses admin targets and stores a short-lived support record', async () => {
  const statements = [];
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('SELECT id, name, "sessionVersion" FROM "User"')) {
        return { rows: [{ id: 'admin-1', name: 'Admin', sessionVersion: 2 }] };
      }
      if (sql.includes('UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1')) {
        return { rows: [{ sessionVersion: 3 }] };
      }
      if (sql.includes('FROM "User" u WHERE u.id = $1 FOR UPDATE')) {
        return { rows: [{
          id: 'user-2', name: 'Ada', email: 'ada@example.com', role: 'BASIC',
          image: null, emailVerified: true, suspendedAt: null, suspendedUntil: null,
          sessionVersion: 0, provider: 'credentials',
        }] };
      }
      if (sql.includes('FROM "ImpersonationSession"')) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; }, async query() { return { rows: [] }; } };
  const now = new Date('2026-10-07T12:00:00.000Z');
  let tokenInput;
  const service = new PostgresAdminService(pool, () => now, {
    issue(input) { tokenInput = input; return `impersonation:${input.sessionId}`; },
  });
  const session = await service.startImpersonation('admin-1', 'user-2', { reason: 'Help diagnose account issue' }, { ip: '127.0.0.1' });

  assert.equal(session.user.id, 'user-2');
  assert.equal(session.user.impersonation.adminId, 'admin-1');
  assert.equal(session.token, `impersonation:${session.user.impersonation.id}`);
  assert.equal(Date.parse(session.expiresAt) - now.getTime(), 15 * 60 * 1000);
  assert.equal(tokenInput.adminSessionVersion, 3);
  const insert = statements.find(entry => entry.sql.includes('INSERT INTO "ImpersonationSession"'));
  assert.deepEqual(insert.values.slice(1, 3), ['admin-1', 'user-2']);
  assert.ok(statements.some(entry => entry.sql === 'COMMIT'));

  const adminTargetClient = {
    async query(sql, values) {
      if (sql.includes('SELECT role FROM "User"')) return { rows: [{ role: 'ADMIN' }] };
      if (sql.includes('SELECT id, name, "sessionVersion" FROM "User"')) {
        return { rows: [{ id: 'admin-1', name: 'Admin', sessionVersion: 2 }] };
      }
      if (sql.includes('FROM "User" u WHERE u.id = $1 FOR UPDATE')) {
        return { rows: [{
          id: values[0], name: 'Admin target', email: null, image: null, role: 'ADMIN',
          emailVerified: true, suspendedAt: null, suspendedUntil: null, sessionVersion: 0,
          provider: 'credentials',
        }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const adminTargetService = new PostgresAdminService(
    { async connect() { return adminTargetClient; } },
    () => now,
    { issue(input) { return `impersonation:${input.sessionId}`; } },
  );
  await assert.rejects(
    adminTargetService.startImpersonation('admin-1', 'admin-2', { reason: 'Approved admin support request' }),
    error => error.status === 400,
  );
});

test('admin session restoration rotates sessionVersion once, preventing support-token replay', async () => {
  const now = new Date('2026-10-07T12:20:00.000Z');
  let adminVersion = 3;
  let endedAt = null;
  const client = {
    async query(sql, values) {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT id, "expiresAt", "endedAt" FROM "ImpersonationSession"')) {
        return { rows: [{ id: 'imp-1', expiresAt: new Date('2026-10-07T12:15:00.000Z'), endedAt }] };
      }
      if (sql.includes('UPDATE "ImpersonationSession" SET "endedAt"')) {
        endedAt = values[1];
        return { rows: [] };
      }
      if (sql.includes('FROM "User" WHERE id = $1 FOR UPDATE')) {
        return { rows: [{
          id: 'admin-1', name: 'Admin', email: 'admin@example.com', image: null, role: 'ADMIN',
          emailVerified: true, sessionVersion: adminVersion, suspendedAt: null, suspendedUntil: null,
        }] };
      }
      if (sql.includes('UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1')) {
        if (Number(values[1]) !== adminVersion) return { rows: [] };
        adminVersion++;
        return { rows: [{ sessionVersion: adminVersion }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = new PostgresAdminService(
    { async connect() { return client; } },
    () => now,
    undefined,
    { issue(userId, sessionVersion, provider) { return `${userId}:${sessionVersion}:${provider}`; } },
  );
  const claims = {
    subject: 'user-2',
    sessionVersion: 0,
    provider: 'credentials',
    sessionId: 'imp-1',
    adminId: 'admin-1',
    adminSessionVersion: 3,
    adminProvider: 'google',
    expiresAt: new Date('2026-10-07T12:15:00.000Z'),
  };
  const restored = await service.endImpersonationWithToken(claims);
  assert.equal(restored.token, 'admin-1:4:google');
  assert.equal(restored.user.id, 'admin-1');
  await assert.rejects(
    service.endImpersonationWithToken(claims),
    error => error.status === 401,
  );
  assert.equal(adminVersion, 4);
});

test('impersonation token can be restored only from signed, matching session claims', async () => {
  const { createImpersonationToken } = await (async () => {
    const tokenFile = path.resolve(__dirname, '../independent/src/impersonation-token.ts');
    const result = await build({
      entryPoints: [tokenFile],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      packages: 'external',
      write: false,
    });
    const compiled = new Module(tokenFile, module);
    compiled.filename = tokenFile;
    compiled.paths = Module._nodeModulePaths(path.dirname(tokenFile));
    compiled._compile(result.outputFiles[0].text, tokenFile);
    return compiled.exports;
  })();
  const now = Date.parse('2026-10-07T12:00:00.000Z');
  const tokens = createImpersonationToken('s'.repeat(48), () => now);
  const issued = tokens.issue({
    userId: 'user-2',
    sessionVersion: 3,
    provider: 'credentials',
    sessionId: 'session-1',
    adminId: 'admin-1',
    adminSessionVersion: 8,
    adminProvider: 'google',
    expiresAt: new Date(now + 15 * 60 * 1000),
  });

  assert.deepEqual(tokens.verify(issued), {
    subject: 'user-2',
    sessionVersion: 3,
    provider: 'credentials',
    sessionId: 'session-1',
    adminId: 'admin-1',
    adminSessionVersion: 8,
    adminProvider: 'google',
    expiresAt: new Date(now + 15 * 60 * 1000),
  });
  assert.throws(() => tokens.verify(`${issued.slice(0, -1)}x`));

  const accessFile = path.resolve(__dirname, '../independent/src/access-token.ts');
  const accessBuild = await build({
    entryPoints: [accessFile],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    write: false,
  });
  const accessCompiled = new Module(accessFile, module);
  accessCompiled.filename = accessFile;
  accessCompiled.paths = Module._nodeModulePaths(path.dirname(accessFile));
  accessCompiled._compile(accessBuild.outputFiles[0].text, accessFile);
  const regularTokens = accessCompiled.exports.createAccessToken('s'.repeat(48), () => now);
  assert.throws(
    () => regularTokens.verify(issued),
    'MobileAuthService normal-token verification must reject support-session tokens.',
  );
});
