// Applies pending Prisma migrations during Vercel *production* builds only.
// Preview/local builds skip it so branch deploys never touch the production database.
// If migrating fails or hangs, the build fails and Vercel keeps serving the previous deployment.
const { spawnSync } = require("node:child_process");

// Never echo datasource/connection details into build logs.
const safe = (text) => (text || "").split(/\r?\n/).filter((line) => line && !/datasource|postgres(ql)?:\/\/|@[\w.-]+:\d+/i.test(line)).join("\n");

/**
 * `prisma migrate status` takes no advisory lock. When it reports the schema up to date we skip `migrate deploy`,
 * so a stale lock held by a dead session can never block a deploy that has nothing to migrate.
 * Anything else (pending migrations, errors, timeouts) falls through to `migrate deploy`, which keeps its lock.
 */
function schemaUpToDate(status) {
  return Boolean(status && !status.error && status.status === 0 && /Database schema is up to date/i.test(`${status.stdout || ""}\n${status.stderr || ""}`));
}

function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("[migrate] skipped (VERCEL_ENV is not production)");
    return 0;
  }

  // The production runtime connects with EVENTMAP_PRODUCTION_DATABASE_URL (lib/prisma.ts), so migrate that same database.
  // Without it, `prisma migrate deploy` would use DATABASE_URL, a different database the site never reads.
  if (!process.env.EVENTMAP_PRODUCTION_DATABASE_URL) {
    console.error("[migrate] EVENTMAP_PRODUCTION_DATABASE_URL is not set; aborting build so the current deployment stays live.");
    return 1;
  }
  const env = { ...process.env, DATABASE_URL: process.env.EVENTMAP_PRODUCTION_DATABASE_URL };

  const status = spawnSync("npx", ["prisma", "migrate", "status"], { encoding: "utf8", shell: true, timeout: 60000, env });
  if (schemaUpToDate(status)) {
    console.log("[migrate] schema already up to date; nothing to apply");
    return 0;
  }

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", shell: true, timeout: 180000, env });
  const out = safe(result.stdout);
  const err = safe(result.stderr);
  if (out) console.log(out);
  if (err) console.error(err);
  if (result.error || result.status !== 0) {
    console.error(`[migrate] failed${result.error ? ` (${result.error.code || "error"})` : ""}; aborting build so the current deployment stays live.`);
    return 1;
  }
  console.log("[migrate] done");
  return 0;
}

module.exports = { schemaUpToDate, safe };
if (require.main === module) process.exit(main());
