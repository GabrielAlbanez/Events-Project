const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const state = [];
const refs = [];
let refCursor = 0;
let cursor = 0;
const primitive = Object.fromEntries(['Dialog', 'DialogClose', 'DialogDescription', 'DialogOverlay', 'DialogPortal', 'DialogTitle', 'DialogTrigger', 'Content'].map(name => [name, function component() {}]));
function load(file) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'react') return {
      useRef(initial) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); },
      useEffect() {},
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    };
    if (name === '@radix-ui/react-dialog') return primitive;
    if (name === '@/components/ui/dialog') return primitive;
    if (name === '@/lib/utils') return { cn: (...classes) => classes.filter(Boolean).join(' ') };
    if (name === '@/lib/photoViewer') return load('lib/photoViewer.ts');
    if (name === '@/lib/profileMediaUrl' || name === './profileMediaUrl') return load('lib/profileMediaUrl.ts');
    return require(name);
  }, m, m.exports);
  return m.exports;
}
const { PhotoViewer } = load('components/MyComponents/PhotoViewer.tsx');
const asset = '12345678-1234-1234-1234-123456789012';
function render(src, props = {}) { cursor = 0; refCursor = 0; return PhotoViewer({ src, label: 'Foto de Ana', children: 'thumbnail', ...props }); }
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[].concat(tree.props?.children ?? []).flatMap(nodes)]; }
function find(tree, predicate) { const result = nodes(tree).find(predicate); assert.ok(result, 'expected viewer element was not found'); return result; }
for (const [src, expected] of [
  ['https://lh3.googleusercontent.com/photo', 'https://lh3.googleusercontent.com/photo'],
  ['/uploads/photo.webp', '/uploads/photo.webp'],
  ['/v1/media/profile/' + asset, '/api/profile-media/' + asset],
  ['/v1/media/events/' + asset, '/api/party-profile-media/' + asset],
  ['blob:https://site.invalid/preview', 'blob:https://site.invalid/preview'],
]) {
  state.length = 0;
  let tree = render(src);
  const image = find(tree, node => node.type === 'img');
  assert.equal(image.props.src, expected);
  assert.equal(image.props.referrerPolicy, 'no-referrer');
  const link = find(tree, node => node.type === 'a');
  assert.equal(link.props.href, expected);
  assert.equal(link.props.rel, 'noopener noreferrer');
  let stopped = false;
  find(tree, node => node.type === 'button' && node.props['aria-label']?.startsWith('Ampliar')).props.onClick({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'opening photo must not trigger parent card actions');
  image.props.onError();
  tree = render(src);
  assert.equal(nodes(tree).some(node => node.type === 'img'), false);
  find(tree, node => node.type === 'button' && node.props.children === 'Tentar novamente').props.onClick();
  assert.ok(find(render(src), node => node.type === 'img'));
  find(render(src), node => node.type === 'img').props.onError();
  const root = render(src);
  root.props.onOpenChange(false);
  root.props.onOpenChange(true);
  assert.ok(find(render(src), node => node.type === 'img'), 'reopening must reset previous load failure');
  const content = find(render(src), node => node.type === primitive.Content);
  if (content.props.onEscapeKeyDown) {
    let escapeStopped = false, prevented = false;
    content.props.onEscapeKeyDown({ stopPropagation() { escapeStopped = true; }, preventDefault() { prevented = true; } });
    assert.equal(escapeStopped, true, 'Escape must not also close the parent modal');
    assert.equal(prevented, false, 'Escape default must still close the photo through Radix');
  }
  assert.equal(content.props.onCloseAutoFocus, undefined, 'focus restoration must remain owned by Radix');
  assert.ok(find(tree, node => node.type === primitive.DialogTitle));
  assert.ok(find(tree, node => node.type === primitive.DialogDescription));
}
for (const src of ['', ' ', 'javascript:alert(1)', 'data:text/html,bad']) {
  state.length = 0;
  const tree = render(src);
  assert.equal(nodes(tree).some(node => node.type === primitive.DialogTrigger), false);
}
console.log('PASS: viewer URL formats, original link safety, propagation isolation, error/retry/reopen, invalid sources and Radix Escape/focus ownership. Actual keyboard/focus/gestures require browser validation.');

const { normalizePhotoGallery, nextPhotoIndex } = load('lib/photoViewer.ts');
const gallery = [
  { id: 'ana', src: '/uploads/ana.webp', label: 'Ana' },
  { id: 'bad', src: 'javascript:alert(1)', label: 'Invalid' },
  { id: 'bia', src: '/v1/media/profile/' + asset, label: 'Bia' },
  { id: 'ana', src: '/uploads/duplicate.webp', label: 'Duplicate' },
];
assert.deepEqual(normalizePhotoGallery(gallery, { id: 'bia', src: '/api/profile-media/' + asset, label: 'Bia' }), [
  { id: 'ana', src: '/uploads/ana.webp', label: 'Ana' },
  { id: 'bia', src: '/api/profile-media/' + asset, label: 'Bia' },
]);
assert.equal(normalizePhotoGallery(gallery, { id: 'carla', src: '/uploads/carla.webp', label: 'Carla' }).length, 3);
assert.equal(nextPhotoIndex(0, -1, 3), 2);
assert.equal(nextPhotoIndex(2, 1, 3), 0);
assert.equal(nextPhotoIndex(0, 1, 0), 0);
assert.equal(nextPhotoIndex(0, -1, 1), 0);
state.length = 0;
const selected = '/api/profile-media/' + asset;
const props = { gallery, photoId: 'bia' };
let tree = render(selected, props);
tree.props.onOpenChange(true);
tree = render(selected, props);
assert.equal(find(tree, node => node.type === 'img').props.src, selected, 'open selected photo, not first gallery entry');
assert.deepEqual(find(tree, node => node.props.role === 'status').props.children, [2, ' de ', 2]);
find(tree, node => node.props['aria-label'] === 'Próxima foto').props.onClick();
tree = render(selected, props);
assert.equal(find(tree, node => node.type === 'img').props.src, '/uploads/ana.webp', 'next wraps to first');
let prevented = false, stopped = false;
// Keyboard ignores modifier shortcuts and text inputs; plain arrows navigate.
global.HTMLElement = class HTMLElement {};
const content = find(tree, node => node.type === primitive.Content);
content.props.onKeyDown({ key: 'ArrowLeft', target: {}, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
assert.equal(prevented && stopped, true);
assert.equal(find(render(selected, props), node => node.type === 'img').props.src, selected);
content.props.onKeyDown({ key: 'ArrowLeft', ctrlKey: true, target: {}, preventDefault() { throw new Error('modified shortcut must be preserved'); }, stopPropagation() {} });
assert.equal(find(render(selected, props), node => node.type === 'img').props.src, selected);
const surface = find(render(selected, props), node => typeof node.props.onPointerUp === 'function');
surface.props.onPointerDown({ pointerType: 'touch', pointerId: 1, clientX: 180, clientY: 100, currentTarget: { setPointerCapture() {} }, stopPropagation() {} });
surface.props.onPointerUp({ pointerId: 1, clientX: 90, clientY: 105 });
assert.equal(find(render(selected, props), node => node.type === 'img').props.src, '/uploads/ana.webp', 'horizontal swipe advances');
const surface2 = find(render(selected, props), node => typeof node.props.onPointerUp === 'function');
surface2.props.onPointerDown({ pointerType: 'touch', pointerId: 2, clientX: 180, clientY: 100, currentTarget: { setPointerCapture() {} }, stopPropagation() {} });
surface2.props.onPointerUp({ pointerId: 2, clientX: 100, clientY: 240 });
assert.equal(find(render(selected, props), node => node.type === 'img').props.src, '/uploads/ana.webp', 'vertical gesture must not navigate');
state.length = 0;
assert.equal(nodes(render('/uploads/ana.webp')).some(node => node.props['aria-label'] === 'Próxima foto'), false, 'single photo has no gallery controls');
console.log('PASS: gallery URL normalization, invalid/duplicate filtering, selected photo, counters, wrapping, keyboard modifiers, horizontal/vertical swipe and single-photo controls. DOM focus and actual gestures still require browser QA.');
