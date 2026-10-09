const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let calls = 0, rows = [], values, query;
const prisma = { $queryRaw: async (_sql, ...args) => { calls++; query = _sql.join("?"); values = args; return rows; } };
function load(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => name === '@/lib/prisma' ? { __esModule: true, default: prisma } : name === '@/lib/storage/profileImages' ? load('lib/storage/profileImages.ts') : require(name), module, module.exports);
  return module.exports;
}
(async () => {
  const { profileMediaUrl } = load('lib/profileMediaUrl.ts');
  const asset = '12345678-1234-1234-1234-123456789012';
  assert.equal(profileMediaUrl('http://192.168.1.2:4100/v1/media/profile/' + asset), '/api/profile-media/' + asset);
  assert.equal(profileMediaUrl('/uploads/photo.png'), '/uploads/photo.png');
  assert.equal(profileMediaUrl('https://lh3.googleusercontent.com/photo'), 'https://lh3.googleusercontent.com/photo');
  assert.equal(profileMediaUrl(null), null);
  const { GET } = load('app/api/profile-media/[assetId]/route.ts');
  const read = assetId => GET(new Request('https://site.invalid'), { params: { assetId } });
  assert.equal((await read('../private')).status, 404); assert.equal(calls, 0);
  assert.equal((await read(asset)).status, 404);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2uoAAAAASUVORK5CYII=', 'base64');
  rows = [{ mimeType: 'image/png', size: png.length, content: png }];
  const valid = await read(asset); assert.equal(valid.status, 200); assert.equal(valid.headers.get('content-type'), 'image/png'); assert.equal(valid.headers.get('x-content-type-options'), 'nosniff');
  assert.match(query, /EXISTS.*SELECT 1 FROM \"User\" u WHERE RIGHT\(u\.image/s); assert.equal(values[0], asset); assert.ok(values.includes('/v1/media/profile/' + asset));
  rows = [{ mimeType: 'text/html', size: png.length, content: png }]; assert.equal((await read(asset)).status, 404);
  rows = [{ mimeType: 'image/png', size: 6000000, content: png }]; assert.equal((await read(asset)).status, 404);
  rows = [{ mimeType: 'image/png', size: 1, content: Buffer.from('x') }]; assert.equal((await read(asset)).status, 404);
  console.log('PASS: shared profile same-origin URLs, parameterized references, missing/private assets, size limits and image signature validation');
})().catch(error => { console.error(error); process.exitCode = 1; });
