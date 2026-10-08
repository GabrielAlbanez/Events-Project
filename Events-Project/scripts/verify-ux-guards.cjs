const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function harness(path, globals = {}, imports = {}) {
  const slots = [], effects = []; let index = 0;
  const react = {
    useState(initial) { const i = index++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useCallback(callback, dependencies) { const i = index++; if (!slots[i] || slots[i].dependencies.some((value, j) => value !== dependencies[j])) slots[i] = { callback, dependencies }; return slots[i].callback; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(callback, dependencies) { const i = index++, old = slots[i]; if (!old || old.dependencies.some((value, j) => value !== dependencies[j])) { slots[i] = { dependencies, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = callback(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), source)(name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : imports[name] || new Proxy({}, { get: (_, key) => key }), module, module.exports, ...Object.values(globals));
  return { render(name, ...args) { index = 0; const result = module.exports[name](...args); effects.splice(0).forEach(effect => effect()); return result; }, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}
function buttons(node) {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  return [...(node.type === 'Button' ? [node] : []), ...(Array.isArray(children) ? children : [children]).flatMap(buttons)];
}
(async () => {
  let calls = 0, resolve;
  const c = harness('components/MyComponents/ConfirmAction.tsx');
  const props = { title: 'Remove?', description: 'Impact', label: 'Remove', onConfirm: () => { calls++; return new Promise(done => { resolve = done; }); } };
  const tree = c.render('ConfirmAction', props);
  const action = buttons(tree).at(-1).props.onClick;
  action(); action(); assert.equal(calls, 1, 'Repeated clicks must not duplicate the mutation');
  resolve(false); await Promise.resolve(); await Promise.resolve();
  const failed = c.render('ConfirmAction', props);
  assert.equal(failed.props.children[1].props.children[2].props.role, 'alert', 'Failed mutations must keep visible feedback');
  c.close();

  const listeners = new Map();
  const addEventListener = (name, listener) => listeners.set(name, listener);
  const removeEventListener = name => listeners.delete(name);
  class Anchor { constructor(href) { this.href = href; this.target = ''; } hasAttribute() { return false; } closest() { return this; } }
  const h = harness('hooks/useUnsavedChanges.tsx', { window: { location: { href: 'http://localhost:3000/CriarEvento', pathname: '/CriarEvento', search: '' }, addEventListener, removeEventListener }, document: { addEventListener, removeEventListener }, Element: Anchor, HTMLAnchorElement: Anchor });
  h.render('useUnsavedChanges', false); assert.equal(listeners.size, 0);
  let hook = h.render('useUnsavedChanges', true);
  let prevented = false;
  listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  prevented = false;
  listeners.get('click')({ target: new Anchor('http://localhost:3000/myEvents'), button: 0, preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true); hook = h.render('useUnsavedChanges', true); assert.equal(hook.dialog.props.open, true);
  hook.markSaved(); prevented = false; listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.equal(prevented, false);
  h.close(); assert.equal(listeners.size, 0, 'Listeners must be cleaned up');
  const account = { current: { data: { user: { id: 'first' } }, status: 'authenticated' } };
  const notificationCalls = [];
  const n = harness('app/(private)/notificacoes/page.tsx', { window: { dispatchEvent() {} }, Event: class {} }, {
    'next-auth/react': { useSession: () => account.current },
    '@/context/SocketContext': { useSocket: () => socket },
    '@/app/(actions)/engagement/action': { getNotificationPage: input => new Promise(resolve => notificationCalls.push({ input, resolve })), markNotificationRead: async () => ({ success: true }) },
  });
  const socket = { on() {}, off() {} };
  const notice = id => ({ id, title: 'Notice ' + id, message: 'Content', href: '/eventos/event', readAt: null, createdAt: '2026-10-04T00:00:00Z' });
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); return n.render('default'); };
  n.render('default'); assert.deepEqual(notificationCalls[0].input, { before: undefined, unread: false });
  notificationCalls[0].resolve({ items: [notice('one')], nextBefore: 'cursor' }); let notices = await flush();
  buttons(notices).find(button => button.props.children === 'Carregar avisos anteriores').props.onClick();
  assert.equal(notificationCalls[1].input.before, 'cursor'); notificationCalls[1].resolve({ items: [notice('one'), notice('two')], nextBefore: 'older' }); notices = await flush();
  const printed = JSON.stringify(notices); assert.equal((printed.match(/Notice one/g) || []).length, 1); assert.match(printed, /Notice two/);
  buttons(notices).find(button => button.props.children === 'Carregar avisos anteriores').props.onClick();
  account.current = { data: { user: { id: 'second' } }, status: 'authenticated' }; n.render('default');
  notificationCalls[2].resolve({ items: [notice('private-old-account')], nextBefore: null }); await flush();
  notificationCalls[3].resolve({ items: [notice('new-account')], nextBefore: null }); notices = await flush();
  assert.doesNotMatch(JSON.stringify(notices), /private-old-account|Notice one/); assert.match(JSON.stringify(notices), /new-account/);
  n.close();
  console.log('PASS real notifications UI: cursor pagination, duplicate removal and late responses isolated after account change');
  console.log('PASS UI guards: mutation deduplication, failed confirmation feedback, dirty link/unload warning, saved bypass and listener cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
