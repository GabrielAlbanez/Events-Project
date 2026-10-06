const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const max = 5 * 1024 * 1024;
let size = 4, symlink = false, regular = true, missing = false, reads = 0;
const files = {
  lstat: async () => { if (missing) throw new Error("missing"); return { size, isFile: () => regular, isSymbolicLink: () => symlink }; },
  readFile: async () => { reads++; return Buffer.alloc(size); },
};
const source = fs.readFileSync(path.join(__dirname, "../app/api/media/[filename]/route.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", output)(name => name === "next/server" ? { NextResponse } : name === "node:fs/promises" ? files : name === "@/lib/storage/profileImages" ? { maximumImageBytes: max } : require(name), mod, mod.exports);
async function main() {
  const get = filename => mod.exports.GET(new Request("http://localhost/api/media/test"), { params: { filename } });
  const valid = "12345678-1234-1234-1234-123456789012.jpg";
  for (const filename of ["../.env", "photo.svg", "arbitrary.jpg", "1761657565058-uploaded_image.svg", "../1761657565058-uploaded_image.jpg", "1761657565058-uploaded_image.jpg.exe", "12345678-1234-1234-1234-123456789012.jpg.exe"]) assert.equal((await get(filename)).status, 404);
  assert.equal(reads, 0, "invalid paths never touch storage");
  let response = await get(valid);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await response.arrayBuffer()).byteLength, 4);
  assert.equal((await get("1761657565058-uploaded_image.jpg")).status, 200, "legacy profile uploads remain readable");
  symlink = true; assert.equal((await get(valid)).status, 404); symlink = false;
  regular = false; assert.equal((await get(valid)).status, 404); regular = true;
  size = max + 1; assert.equal((await get(valid)).status, 404); size = 4;
  missing = true; assert.equal((await get(valid)).status, 404);
  assert.equal(reads, 2, "unsafe, missing and oversized files are never read");
  console.log("PASS media: runtime serving, strict names, MIME, symlink/directory rejection and bounded reads (mock storage)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
