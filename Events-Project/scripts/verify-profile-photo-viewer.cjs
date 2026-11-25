const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Executes the real ProfilePhotoViewer and photo crop math with deterministic hooks; no browser, database or network.
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const uploadLimits = () => { const loaded = { exports: {} }; new Function('require', 'module', 'exports', compile('lib/uploadLimits.ts'))(require, loaded, loaded.exports); return loaded.exports; };

function viewer({ reduced = false, triggerRect = { left: 20, top: 300, width: 48, height: 48 } } = {}) {
  const slots = [], effects = []; let index = 0, tree, open = false;
  const differs = (old, next) => !old || old.some((value, i) => value !== next[i]);
  const react = {
    useState(initial) { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { ref: true, current: initial }); },
    useCallback(fn) { index++; return fn; },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const motionValue = { value: 0, set(value) { this.value = value; }, get() { return this.value; } };
  const requireComponent = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === '@radix-ui/react-dialog') return new Proxy({}, { get: (_, part) => 'Dialog.' + String(part) });
    if (name === 'framer-motion') return { AnimatePresence: 'AnimatePresence', LazyMotion: 'LazyMotion', m: new Proxy({}, { get: (_, tag) => 'm.' + String(tag) }), useMotionValue: () => motionValue, useReducedMotion: () => reduced, useTransform: () => 'transform' };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, part) => part });
    if (name === '@/components/animations/config') return { loadLayoutFeatures: () => Promise.resolve({}) };
    if (name === '@/lib/utils') return { cn: (...classes) => classes.filter(Boolean).join(' ') };
    throw new Error('Unexpected dependency: ' + name);
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compile('components/MyComponents/ProfilePhotoViewer.tsx'))(requireComponent, module, module.exports);
  global.window = { innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {} };
  global.getComputedStyle = () => ({ borderTopLeftRadius: '24px' });
  const trigger = { getBoundingClientRect: () => ({ ...triggerRect, right: triggerRect.left + triggerRect.width, bottom: triggerRect.top + triggerRect.height }), querySelector: () => ({ currentSrc: '/_next/image?w=96' }), parentElement: null };
  const render = () => { index = 0; tree = module.exports.ProfilePhotoViewer({ src: '/api/profile-media/a', label: 'Foto de perfil de Isa', className: 'h-full w-full object-cover', children: 'small-avatar' }); while (effects.length) effects.shift()(); open = tree.props.open; return tree; };
  render();
  slots.find(slot => slot?.ref).current = trigger; // first ref is the trigger button
  const nodes = () => { const result = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object' && 'type' in value) { result.push(value); visit(value.props.children); } }; visit(tree); return result; };
  const find = predicate => nodes().find(predicate);
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || value === false ? '' : String(value);
  return { exports: module.exports, render, nodes, find, text, get open() { return open; }, setOpen(next) { tree.props.onOpenChange(next); render(); } };
}
const part = (v, name) => v.find(node => node.props['data-photo-viewer'] === name);

(async () => {
  // Closed: the avatar is a labelled zoom trigger that never bubbles clicks to surrounding links.
  const v = viewer();
  const { shouldCloseFromSwipe, viewerTargetBox } = v.exports;
  const button = v.find(node => node.type === 'button');
  assert.equal(button.props['aria-label'], 'Ampliar: Foto de perfil de Isa');
  assert.match(button.props.className, /min-h-0/, 'Trigger cannot inflate grid tracks (centering fix)');
  let stopped = false; button.props.onClick({ stopPropagation: () => { stopped = true; } }); assert.ok(stopped);
  assert.ok(!v.find(node => node.type === 'Dialog.Portal'), 'Nothing is portalled while closed');

  // Open: the photo starts exactly over the avatar (circle) and grows into a centered 28px card.
  v.setOpen(true);
  assert.equal(v.open, true);
  const target = viewerTargetBox(390, 844, 1);
  assert.deepEqual(part(v, 'photo').props.initial, { opacity: 1, x: 20, y: 300, width: 48, height: 48, borderRadius: 24 });
  assert.equal(part(v, 'photo').props.animate.width, target.width); assert.equal(part(v, 'photo').props.animate.borderRadius, 28);
  const duration = part(v, 'photo').props.animate.transition.duration; assert.ok(duration >= 0.25 && duration <= 0.32);
  assert.equal(part(v, 'photo').props.exit.width, 48, 'Closing shrinks back to the avatar');
  assert.equal(part(v, 'backdrop').props.exit.opacity, 0, 'Backdrop fades out');
  assert.equal(v.text(v.find(node => node.type === 'Dialog.Title')), 'Foto de perfil de Isa');
  assert.ok(v.find(node => node.type === 'Dialog.Description'));
  assert.ok(v.find(node => node.props['aria-label'] === 'Fechar foto ampliada'));
  assert.ok(v.find(node => node.type === 'button').props.className.includes('[&>img]:opacity-0'), 'The small avatar hides while its photo is lifted');
  let images = v.nodes().filter(node => node.type === 'img');
  assert.equal(images[0].props.src, '/_next/image?w=96', 'Small avatar is the blurred placeholder');
  assert.match(images[0].props.className, /blur/);
  assert.match(images[1].props.className, /opacity-0/, 'Full photo waits for load before cross-fading');

  // Full image loaded: card follows the photo aspect and the crossfade completes.
  images[1].props.onLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 800 } }); v.render();
  assert.equal(Math.round(part(v, 'photo').props.animate.width / part(v, 'photo').props.animate.height * 100), 75);
  images = v.nodes().filter(node => node.type === 'img');
  assert.match(images[1].props.className, /opacity-100/); assert.match(images[0].props.className, /opacity-0/);

  // Error keeps "Tentar novamente" and retries.
  images[1].props.onError(); v.render();
  const retry = () => v.find(node => node.type === 'button' && v.text(node) === 'Tentar novamente');
  assert.ok(retry()); retry().props.onClick(); v.render(); assert.ok(!retry());

  // Backdrop tap closes; taps inside do not. Swipe down beyond the threshold closes.
  part(v, 'content').props.onClick({ stopPropagation() {}, target: {}, currentTarget: {} }); v.render(); assert.equal(v.open, true);
  const self = {}; part(v, 'content').props.onClick({ stopPropagation() {}, target: self, currentTarget: self }); v.render(); assert.equal(v.open, false);
  v.setOpen(true);
  assert.equal(part(v, 'drag').props.drag, 'y');
  part(v, 'drag').props.onDragEnd(null, { offset: { y: 40 }, velocity: { y: 100 } }); v.render(); assert.equal(v.open, true, 'Small drags snap back');
  part(v, 'drag').props.onDragEnd(null, { offset: { y: 160 }, velocity: { y: 0 } }); v.render(); assert.equal(v.open, false, 'Swipe down closes');
  assert.ok(shouldCloseFromSwipe(40, 900) && !shouldCloseFromSwipe(10, 2000));

  // Reduced motion: plain quick fade, no morph, no scale, no drag.
  const r = viewer({ reduced: true }); r.setOpen(true);
  const rp = part(r, 'photo');
  assert.equal(rp.props.initial.opacity, 0); assert.equal(rp.props.initial.width, rp.props.animate.width, 'No size morph');
  assert.equal(rp.props.initial.y, rp.props.animate.y, 'No slide'); assert.equal(rp.props.style, undefined, 'No drag scale');
  assert.ok(rp.props.animate.transition.duration <= 0.15);
  assert.equal(part(r, 'drag').props.drag, false);
  assert.ok(!r.find(node => node.type === 'button').props.className.includes('[&>img]:opacity-0'));

  // Trigger scrolled off-screen: no shared element, the card fades in place.
  const off = viewer({ triggerRect: { left: 10, top: -400, width: 48, height: 48 } }); off.setOpen(true);
  assert.equal(part(off, 'photo').props.initial.opacity, 0);
  assert.ok(viewerTargetBox(1440, 900, 1).width <= 560 && viewerTargetBox(390, 844, 0.5625).width <= 358);

  // Crop math: centered square, clamped so the photo always covers the circle, bounded output.
  const crop = { exports: {} };
  new Function('require', 'module', 'exports', compile('lib/photoCrop.ts'))(name => { if (name === '@/lib/uploadLimits') return uploadLimits(); throw new Error(name); }, crop, crop.exports);
  const c = crop.exports;
  assert.deepEqual(c.cropSourceRect(600, 800, 300, { zoom: 1, offsetX: 0, offsetY: 0 }), { sx: 0, sy: 100, size: 600 }, 'Default crop is the centered square');
  assert.deepEqual(c.cropSourceRect(600, 800, 300, { zoom: 2, offsetX: 0, offsetY: 0 }), { sx: 150, sy: 250, size: 300 });
  assert.deepEqual(c.cropSourceRect(600, 800, 300, { zoom: 1, offsetX: 0, offsetY: 9999 }), { sx: 0, sy: 0, size: 600 }, 'Dragging down reveals the top, clamped');
  assert.deepEqual(c.clampCrop(600, 800, 300, { zoom: 9, offsetX: 999, offsetY: -999 }), { zoom: 4, offsetX: 450, offsetY: -650 });
  assert.equal(c.clampZoom(0.2), 1);
  assert.equal(c.cropOutputSize(600), 600); assert.equal(c.cropOutputSize(4000), 1024); assert.equal(c.cropOutputSize(90), 320);
  const { maximumUploadImageBytes } = uploadLimits();
  let canvas;
  const make = sizes => size => (canvas = { width: size, height: size, draws: [], qualities: [], getContext() { return { fillRect() {}, drawImage: (...args) => canvas.draws.push(args), set fillStyle(_) {}, set imageSmoothingQuality(_) {} }; }, toBlob(callback, type, quality) { canvas.qualities.push(quality); assert.equal(type, 'image/jpeg'); callback(new Blob([new Uint8Array(sizes.shift())], { type })); } });
  const file = await c.renderCroppedPhoto({ width: 3000, height: 4000 }, { sx: 0, sy: 500, size: 3000 }, make([2048]));
  assert.equal(canvas.width, 1024); assert.equal(canvas.height, 1024, 'Square output capped at 1024px');
  assert.deepEqual(canvas.draws[0].slice(1), [0, 500, 3000, 3000, 0, 0, 1024, 1024]);
  assert.equal(file.type, 'image/jpeg'); assert.equal(file.name, 'foto-perfil.jpg'); assert.ok(file.size <= maximumUploadImageBytes);
  await c.renderCroppedPhoto({ width: 600, height: 600 }, { sx: 0, sy: 0, size: 600 }, make([maximumUploadImageBytes + 1, 1000]));
  assert.deepEqual(canvas.qualities, [0.9, 0.78], 'Lowers JPEG quality to respect the upload limit');
  await assert.rejects(c.renderCroppedPhoto({ width: 600, height: 600 }, { sx: 0, sy: 0, size: 600 }, make([maximumUploadImageBytes + 1, maximumUploadImageBytes + 1, maximumUploadImageBytes + 1])));
  const dialog = fs.readFileSync('components/MyComponents/PhotoCropDialog.tsx', 'utf8');
  assert.ok(dialog.includes('imageOrientation: "from-image"'), 'EXIF orientation respected');
  for (const key of ['ArrowLeft', 'ArrowDown', 'event.key === "+"', 'event.key === "-"', 'setPointerCapture', 'Enviar sem ajustar', 'Zoom da foto']) assert.ok(dialog.includes(key), 'Crop UI supports ' + key);
  const avatar = fs.readFileSync('components/MyComponents/ChatAvatar.tsx', 'utf8');
  assert.ok(avatar.includes('grid-cols-1 grid-rows-1'), 'Chat avatar tracks are fixed so portrait photos stay centered');
  console.log('PASS: profile photo viewer (shared-element open/close, placeholder crossfade, retry, backdrop/swipe/close, reduced motion, off-screen fallback) and photo crop (centered square, clamping, 320-1024px JPEG within upload limit, EXIF, keyboard/pinch)');
})().catch(error => { console.error(error); process.exit(1); });
