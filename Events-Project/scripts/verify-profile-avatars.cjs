const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
let failed = null;
function load(file) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (name === './ProfilePhotoViewer' || name === './PhotoViewer') return { ProfilePhotoViewer: props => props.children, PhotoViewer: props => props.children };
    if (name === 'react') return { useState: () => [failed, value => { failed = value; }] };
    if (name === 'next/image') return { __esModule: true, default: props => ({ image: true, props }) };
    if (name === '@/lib/utils') return { cn: (...classes) => classes.filter(Boolean).join(' ') };
    if (name === '@/lib/profileMediaUrl') return load('lib/profileMediaUrl.ts');
    return require(name);
  }, m, m.exports);
  return m.exports;
}
const { ProfileAvatar } = load('components/MyComponents/ProfileAvatar.tsx');
const asset = '12345678-1234-1234-1234-123456789012';
function render(src, props = {}) {
  const child = ProfileAvatar({ src, name: 'Ana Maria', size: 48, className: 'size-12', ...props });
  return child.type(child.props);
}
const formats = [
  ['https://lh3.googleusercontent.com/photo', 'https://lh3.googleusercontent.com/photo'],
  ['/uploads/photo.png', '/uploads/photo.png'],
  ['/v1/media/profile/' + asset, '/api/profile-media/' + asset],
  ['/v1/media/events/' + asset, '/api/party-profile-media/' + asset],
  ['https://other.invalid/photo.jpg', 'https://other.invalid/photo.jpg'],
  ['blob:https://site.invalid/preview', 'blob:https://site.invalid/preview'],
];
for (const [src, resolved] of formats) {
  failed = null;
  const image = render(src);
  assert.equal(image.props.src, resolved);
  assert.equal(image.props.referrerPolicy, 'no-referrer');
  assert.equal(typeof image.props.onError, 'function');
  const viewer = render(src, { preview: true });
  assert.equal(viewer.props.src, resolved);
  assert.equal(viewer.props.label, 'Foto de perfil de Ana Maria');
  assert.equal(viewer.props.children.props.referrerPolicy, 'no-referrer');
  image.props.onError();
  const fallback = render(src, { preview: true });
  assert.equal(fallback.type, 'span', 'failed images must not leave a viewer trigger');
  assert.equal(fallback.props.children.props.children, 'AM');
}
for (const src of [null, undefined, '', '   ', 'invalid source', 'javascript:alert(1)', 'data:text/html,bad', 'https://user:password@host.invalid/image']) {
  failed = null;
  const fallback = render(src, { preview: true });
  assert.equal(fallback.type, 'span', 'invalid or empty sources must not offer a viewer');
  assert.equal(fallback.props.children.props.children, 'AM');
}
failed = null;
assert.equal(render('/v1/media/events/' + asset).props.unoptimized, true);
assert.equal(render('blob:https://site.invalid/preview').props.unoptimized, true);
assert.equal(render(null, { initialsLength: 1 }).props.children.props.children, 'A');
assert.equal(render(null, { name: null }).props.children.props.children, 'U');
console.log('PASS: avatar formats, normalized preview sources, failed/invalid sources without viewer, initials, no-referrer and private media optimizer bypass');
