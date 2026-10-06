const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Run against already-started servers. Only this newly created file is removed;
// no account, database record or existing upload is touched.
async function main() {
  const origins = process.argv.slice(2);
  if (!origins.length) throw new Error("Pass at least one running server origin.");
  for (const value of origins) if (new URL(value).origin !== value) throw new Error("Pass origins without paths.");
  const name = `${randomUUID()}.png`;
  const target = path.join(process.cwd(), "public", "uploads", name);
  const image = await fs.readFile(path.join(process.cwd(), "public", "branding", "eventmap-community-logo.png"));
  await fs.writeFile(target, image, { flag: "wx" });
  try {
    for (const origin of origins) {
      const response = await fetch(`${origin}/uploads/${name}`, { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200, "uploads written after server startup must be served");
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
      console.log(`PASS runtime media at ${origin}: new file served with matching bytes`);
    }
  } finally { await fs.unlink(target); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
