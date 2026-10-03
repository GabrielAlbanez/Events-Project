// Dry run by default. Review the result before invoking with --apply.
const fs = require("node:fs/promises");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
require("@next/env").loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
async function referenced(url) {
  const [user, event, profile] = await Promise.all([
    prisma.user.findFirst({ where: { image: url }, select: { id: true } }),
    prisma.events.findFirst({ where: { OR: [{ banner: url }, { carrossel: { has: url } }] }, select: { id: true } }),
    prisma.partyProfile.findFirst({ where: { photoUrl: url }, select: { userId: true } }),
  ]);
  return Boolean(user || event || profile);
}
async function main() {
  const directory = path.resolve(process.cwd(), "public/uploads");
  const realDirectory = await fs.realpath(directory);
  if (realDirectory !== directory) throw Error("Upload directory must not be a symlink.");
  const cutoff = Date.now() - 24 * 3600000;
  let examined = 0, candidates = 0, removed = 0;
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (!entry.isFile() || !/^[a-zA-Z0-9._-]+$/.test(entry.name)) continue;
    const target = path.resolve(directory, entry.name);
    if (path.dirname(target) !== directory) throw Error("Invalid upload path.");
    const metadata = await fs.lstat(target); examined++;
    if (!metadata.isFile() || metadata.mtimeMs >= cutoff || metadata.ctimeMs >= cutoff) continue;
    const url = `/uploads/${entry.name}`;
    if (await referenced(url)) continue;
    candidates++;
    if (apply) {
      // Recheck immediately before deletion; never remove recently written files.
      const current = await fs.lstat(target);
      if (!current.isFile() || current.mtimeMs >= cutoff || current.ctimeMs >= cutoff || await referenced(url)) continue;
      await fs.unlink(target); removed++;
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", examined, candidates, removed }));
}
main().catch(() => { console.error("Upload maintenance could not complete."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
