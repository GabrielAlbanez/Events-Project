const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

let slots = [], index = 0, reduced = false;
const effects = [];
const react = {
  memo: component => component,
  useRef(value) { const i = index++; return slots[i] ?? (slots[i] = { current: value }); },
  useState(value) { const i = index++; if (!slots[i]) slots[i] = { value }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
  useEffect(effect) { effects.push(effect); },
};
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const requireLocal = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === 'framer-motion') return { m: new Proxy({}, { get: (_, key) => key }), useReducedMotion: () => reduced };
    if (name === 'next/link') return { default: 'link' };
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name.endsWith('ChatAvatar')) return { ChatAvatar: 'avatar', ChatMessageImage: 'image' };
    if (name.startsWith('.')) { const base = path.resolve(path.dirname(file), name); return load(base + (fs.existsSync(base + '.tsx') ? '.tsx' : '.ts')); }
    throw new Error(name);
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(requireLocal, module, module.exports);
  cache.set(file, module.exports); return module.exports;
}
const nodes = tree => { const all = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object' && 'type' in value) { all.push(value); visit(value.props.children); } }; visit(tree); return all; };
function render(component, props) { index = 0; return component(props); }
function reset() { slots = []; index = 0; effects.length = 0; }

const { MessageInput } = load(path.resolve('components/MyComponents/chat/MessageInput.tsx'));
reset();
let changed = '', submits = 0, requested = 0, focused = 0;
const props = { value: 'Olá', onChange: value => { changed = value; }, onBlur() {}, onSubmit() { submits++; }, disabled: false, hasAttachment: false, uploading: false };
let tree = render(MessageInput, props), input = nodes(tree).find(node => node.type === 'textarea');
const keyEvent = extra => ({ key: 'Enter', shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false }, preventDefault() { this.prevented = true; }, currentTarget: { form: { requestSubmit() { requested++; } } }, ...extra });
input.props.onKeyDown(keyEvent()); assert.equal(requested, 1);
input.props.onKeyDown(keyEvent({ shiftKey: true })); assert.equal(requested, 1);
input.props.onKeyDown(keyEvent({ nativeEvent: { isComposing: true } })); assert.equal(requested, 1);
input.props.onCompositionStart(); input.props.onKeyDown(keyEvent()); assert.equal(requested, 1); input.props.onCompositionEnd();
input.props.onKeyDown(keyEvent({ keyCode: 229 })); assert.equal(requested, 1);
input.props.ref.current = { focus() { focused++; }, style: {}, scrollHeight: 180 };
global.window = { matchMedia: () => ({ matches: true }) };
effects.forEach(effect => effect()); assert.equal(input.props.ref.current.style.height, '120px', 'textarea height is bounded');
tree.props.onSubmit({ preventDefault() {} }); assert.equal(submits, 1); assert.ok(focused > 0);
nodes(tree).find(node => node.props['aria-label'] === 'Escolher emoji').props.onClick();
tree = render(MessageInput, props); nodes(tree).find(node => node.props['aria-label'] === 'Inserir 😀').props.onClick(); assert.equal(changed, 'Olá😀');
tree = render(MessageInput, { ...props, value: '   ' }); assert.ok(nodes(tree).some(node => node.type === 'Mic')); assert.ok(!nodes(tree).some(node => node.props.type === 'submit'), 'whitespace has no send action');

const { messageWindow } = load(path.resolve('components/MyComponents/chat/messageWindow.ts'));
const heights = Array.from({ length: 1000 }, (_, i) => i % 3 === 0 ? 280 : 76);
const middle = messageWindow(heights, 40000, 600);
assert.ok(middle.start > 0 && middle.end < 1000);
assert.ok(middle.end - middle.start < 40, 'large history renders bounded overscan');
assert.equal(middle.before + heights.slice(middle.start, middle.end).reduce((sum, value) => sum + value, 0) + middle.after, middle.total, 'spacers preserve full scroll height');
const last = messageWindow(heights, middle.total - 600, 600); assert.equal(last.end, 1000);
assert.deepEqual(messageWindow([], 0, 600), { start: 0, end: 0, before: 0, after: 0, total: 0 });

const { MessageBubble, chatDate } = load(path.resolve('components/MyComponents/chat/MessageBubble.tsx'));
assert.equal(chatDate(new Date().toISOString()), 'Hoje');
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); assert.equal(chatDate(yesterday.toISOString()), 'Ontem');
const message = { id: 3, clientId: 'stable', text: 'Olá', createdAt: new Date().toISOString(), own: true, author: { id: 'me', name: 'Eu', image: null } };
reset();
const bubbleProps = { message, first: true, privateMode: true, deliveredThrough: 3, readThrough: 0, failed: false, retry() {}, onImageLoad() {} };
tree = render(MessageBubble, bubbleProps); assert.ok(nodes(tree).some(node => node.props['aria-label'] === 'Entregue')); assert.ok(nodes(tree).some(node => node.type === 'CheckCheck'));
tree = render(MessageBubble, { ...bubbleProps, readThrough: 3 }); assert.ok(nodes(tree).some(node => node.props['aria-label'] === 'Lida'));
tree = render(MessageBubble, { ...bubbleProps, message: { ...message, id: -1 }, failed: true }); assert.ok(nodes(tree).some(node => node.props['aria-label'] === 'Reenviar mensagem'));
assert.equal(tree.props['data-message-id'], undefined, 'local failure cannot be acknowledged as delivered');
reduced = true; tree = render(MessageBubble, bubbleProps); assert.deepEqual(tree.props.initial, { opacity: 1, y: 0 }); assert.equal(tree.props.transition.duration, 0); reduced = false;
const { MessageList } = load(path.resolve('components/MyComponents/chat/MessageList.tsx'));
reset();
tree = render(MessageList, { messages: [message, { ...message, id: 4, clientId: 'next', createdAt: new Date().toISOString() }, { ...message, id: 5, clientId: 'other', author: { id: 'other', name: 'Outra pessoa', image: null }, own: false }], viewport: { current: null }, privateMode: true, deliveredThrough: 0, readThrough: 0, failed: false, retry() {}, onImageLoad() {} });
assert.deepEqual(nodes(tree).filter(node => node.type === MessageBubble).map(node => node.props.first), [true, false, true], 'consecutive authors share one group, next author starts a tail');
reset();
tree = render(MessageList, { messages: Array.from({ length: 1000 }, (_, i) => ({ ...message, id: i + 1, clientId: 'message-' + i })), viewport: { current: null }, privateMode: true, deliveredThrough: 0, readThrough: 0, failed: false, retry() {}, onImageLoad() {} });
assert.ok(nodes(tree).filter(node => node.type === MessageBubble).length < 40, 'actual MessageList renders a bounded number of bubbles');
console.log('PASS chat components: Enter/Shift/IME, bounded composer, focus, emoji, whitespace, dates, receipts, error retry, author grouping and measured virtual window');
