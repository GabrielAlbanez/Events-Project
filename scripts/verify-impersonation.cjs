const assert = require("node:assert/strict");
const service = require("./load-impersonation.cjs");

(async () => {
  const users = new Map([
    ["admin", { id: "admin", role: "ADMIN", name: "Administrador" }],
    ["other-admin", { id: "other-admin", role: "ADMIN" }],
    ["target", { id: "target", role: "BASIC", name: "Participante" }],
    ["other", { id: "other", role: "BASIC" }],
  ]);
  const records = [];
  const db = {
    user: { findUnique: async ({ where }) => users.get(where.id) ?? null },
    $queryRaw: async () => [],
    impersonationSession: {
      findUnique: async ({ where }) => { const record = records.find(r => r.id === where.id); return record ? { ...record, user: users.get(record.userId) ?? null } : null; },
      findFirst: async ({ where }) => records.find(r => {
        if (where.endedAt === null && r.endedAt) return false;
        if (where.expiresAt?.gt && r.expiresAt <= where.expiresAt.gt) return false;
        if (where.OR) return where.OR.some(clause => clause.userId === r.userId || clause.adminId === r.adminId);
        return (!where.adminId || r.adminId === where.adminId) && (!where.userId || r.userId === where.userId);
      }) ?? null,
      updateMany: async ({ where, data }) => { let count = 0; for (const r of records) if ((!where.id || where.id === r.id) && (!where.adminId || where.adminId === r.adminId) && (!where.userId || where.userId === r.userId) && !r.endedAt && (!where.expiresAt?.lte || r.expiresAt <= where.expiresAt.lte)) { Object.assign(r, data); count++; } return { count }; },
      create: async ({ data }) => { const row = { id: String(records.length + 1), startedAt: new Date(), endedAt: null, ...data }; records.push(row); return row; },
    },
    $transaction: async callback => callback(db),
  };
  const admin = { id: "admin", provider: "google" };
  const target = { id: "target", provider: "google" };
  assert.equal((await service.resolveImpersonationIdentity(db, target)).user.id, "target");
  await assert.rejects(service.startImpersonation(db, target, "other", null, "Verificação de suporte"), /restrito/);
  await assert.rejects(service.startImpersonation(db, admin, "admin", null, "Verificação de suporte"), /própria/);
  await assert.rejects(service.startImpersonation(db, admin, "other-admin", null, "Verificação de suporte"), /não pode/);
  const session = await service.startImpersonation(db, admin, "target", "127.0.0.1", "Verificação de suporte");
  assert.equal(session.adminId, "admin"); assert.equal(session.userId, "target"); assert.equal(session.ip, "127.0.0.1", "Verificação de suporte");
  assert.ok(session.expiresAt > new Date());
  const impersonated = { ...admin, impersonationId: session.id };
  assert.equal((await service.resolveImpersonationIdentity(db, impersonated)).user.role, "BASIC");
  assert.equal((await service.resolveImpersonationIdentity(db, target)).blocked, true);
  assert.equal((await service.resolveImpersonationIdentity(db, admin)).user, null, "Verificação de suporte");
  assert.equal((await service.resolveImpersonationIdentity(db, { ...target, impersonationId: session.id })).user, null, "Verificação de suporte");
  await assert.rejects(service.startImpersonation(db, { id: "other-admin", provider: "google" }, "target", null, "Verificação de suporte"), /já está/);
  await service.endImpersonation(db, { ...target, impersonationId: session.id });
  assert.equal(session.endedAt, null, "Verificação de suporte");
  await service.endImpersonation(db, impersonated);
  assert.ok(session.endedAt);
  assert.equal((await service.resolveImpersonationIdentity(db, target)).blocked, false);
  assert.equal((await service.resolveImpersonationIdentity(db, impersonated)).user.id, "admin");
  const expired = await service.startImpersonation(db, admin, "target", null, "Verificação de suporte");
  expired.expiresAt = new Date(0);
  assert.equal((await service.resolveImpersonationIdentity(db, { ...admin, impersonationId: expired.id })).user.id, "admin");
  assert.ok(expired.endedAt);
  assert.equal((await service.resolveImpersonationIdentity(db, target)).blocked, false);
  users.get("admin").role = "BASIC";
  await assert.rejects(service.startImpersonation(db, admin, "target", null, "Verificação de suporte"), /restrito/);
  console.log("PASS: server authorization, self/admin exclusion, target blocking, cross-account isolation, audit, restoration, expiry and role revocation.");
})().catch(() => { console.error("FAIL: impersonation security checks."); process.exitCode = 1; });
