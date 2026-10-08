const { test } = require('node:test');
const assert = require('node:assert/strict');

let importer;
async function loadImporter() {
  importer ??= await import('../independent/scripts/import-referenced-media.mjs');
  return importer;
}

test('media importer selects only strict flat /uploads references and rejects traversal', async () => {
  const { parseReferencedUpload } = await loadImporter();
  assert.equal(parseReferencedUpload('/uploads/9d4625d2-4d44-47f7-a25b-43b6942ecafe.jpg'), '9d4625d2-4d44-47f7-a25b-43b6942ecafe.jpg');
  assert.equal(parseReferencedUpload('https://cdn.example/image.jpg'), null);
  assert.equal(parseReferencedUpload('/uploads-old/image.jpg'), null);
  for (const value of [
    '/uploads/../secret.jpg',
    '/uploads/%2e%2e%2fsecret.jpg',
    '/uploads/subdir/image.jpg',
    '/uploads/file..jpg',
  ]) {
    assert.throws(() => parseReferencedUpload(value), /Unsafe upload reference/);
  }
});

test('media importer checks actual image signature, extension, and size', async () => {
  const { inspectImage, maximumAssetBytes } = await loadImporter();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  assert.equal(inspectImage(jpeg, 'photo.jpg'), 'image/jpeg');
  assert.throws(() => inspectImage(jpeg, 'photo.png'), /Unsupported or mismatched/);
  assert.throws(() => inspectImage(Buffer.alloc(maximumAssetBytes + 1), 'big.jpg'), /Image size/);
  assert.throws(() => inspectImage(Buffer.from('not an image'), 'bad.jpg'), /Unsupported or mismatched/);
});
