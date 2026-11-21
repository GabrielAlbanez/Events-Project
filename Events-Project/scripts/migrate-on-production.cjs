// Applies pending Prisma migrations during Vercel *production* builds only.
// Preview/local builds skip it so branch deploys never touch the production database.
// If migrating fails or hangs, the build fails and Vercel keeps serving the previous deployment.
const { spawnSync } = require("node:child_process");

if (process.env.VERCEL_ENV !== "production") {
  console.log("[migrate] skipped (VERCEL_ENV is not production)");
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", shell: true, timeout: 180000 });
// Never echo datasource/connection details into build logs.
const safe = (text) => (text || "").split(/\r?\n/).filter((line) => line && !/datasource|postgres(ql)?:\/\/|@[\w.-]+:\d+/i.test(line)).join("\n");
const out = safe(result.stdout);
const err = safe(result.stderr);
if (out) console.log(out);
if (err) console.error(err);
if (result.error || result.status !== 0) {
  console.error(`[migrate] failed${result.error ? ` (${result.error.code || "error"})` : ""}; aborting build so the current deployment stays live.`);
  process.exit(1);
}
console.log("[migrate] done");
