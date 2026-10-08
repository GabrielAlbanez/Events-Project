const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function harness() {
  const rootSlots = [], frames = new Map(), effects = [], calls = []; let slots = rootSlots, index = 0, tree;
  global.window = { matchMedia: () => ({ matches: false }) };
  const differs = (a, b) => !a || a.some((value, i) => value !== b[i]);
  const react = {
    memo: component => component,
    useState(value) { const i = index++; if (!slots[i]) slots[i] = { value: typeof value === 'function' ? value() : value }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(value) { const i = index++; return slots[i] ?? (slots[i] = { current: value }); },
    useCallback(callback, deps) { const i = index++; if (!slots[i] || differs(slots[i].deps, deps)) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const motion = { LazyMotion: 'motion-provider', m: new Proxy({}, { get: (_, name) => name }), useReducedMotion: () => false };
  const module = { exports: {} };
  const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const source = compile('components/MyComponents/EventChatHub.tsx');
  const cache = new Map();
  const requireComponent = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'framer-motion') return motion;
    if (name === 'lucide-react') return new Proxy({}, { get: (_, name) => name });
    if (name === 'next/link') return { default: 'link' };
    if (name === 'next-auth/react') return { useSession: () => ({ data: { user: { id: 'one' } } }) };
    if (name.endsWith('animations/config')) return { loadAnimationFeatures() {} };
    if (name.endsWith('FadeInView')) return { FadeInView: 'fade' };
    if (name.endsWith('sidebar')) return { SidebarTrigger: 'sidebar-trigger' };
    if (name.endsWith('ChatAvatar')) return { ChatAvatar: 'avatar', ChatMessageImage: 'message-image' };
    if (name.includes('useEventChat')) return {};
    if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('./chat/') || ['./MessageBubble', './messageWindow'].includes(name)) {
      const path = 'components/MyComponents/chat/' + name.split('/').at(-1) + (name.endsWith('messageWindow') ? '.ts' : '.tsx');
      if (!cache.has(path)) { const child = { exports: {} }; new Function('require', 'module', 'exports', compile(path))(requireComponent, child, child.exports); cache.set(path, child.exports); }
      return cache.get(path);
    }
    throw new Error('Unexpected dependency: ' + name);
  };
  new Function('require', 'module', 'exports', source)(requireComponent, module, module.exports);
  const message = (pending, id = -1) => ({ ...pending, id, own: true, author: { id: 'one', name: 'One', image: null } });
  const chat = { messages: [], optimisticMessage: null, pending: null, loading: false, loadingOlder: false, denied: false, sending: false, imageUploading: false, online: true, nextBefore: null, event: null, error: '', retryStopped: false, typing() {}, acknowledge() {}, refresh() {}, loadOlder() {}, uploadImage() {}, send(text, retry) {
    const pending = retry ? chat.pending : { clientId: `client-${calls.length}`, text: text.trim(), createdAt: '2026-10-05T10:00:00Z' };
    chat.pending = pending; chat.sending = true; chat.optimisticMessage = message(pending);
    return new Promise(resolve => calls.push({ pending, retry, finish(mode) { chat.sending = false; if (mode !== 'transient') { chat.pending = null; chat.optimisticMessage = null; } if (mode === 'success') chat.messages = [...chat.messages, message(pending, calls.length)]; resolve(mode === 'success'); } }));
  } };
  const expand = (value, path = 'root') => {
    if (Array.isArray(value)) return value.map((child, i) => expand(child, path + ':' + (child?.key ?? i)));
    if (!value || typeof value !== 'object' || !('type' in value)) return value;
    if (typeof value.type === 'function') {
      const oldSlots = slots, oldIndex = index;
      slots = frames.get(path) ?? []; frames.set(path, slots); index = 0;
      const rendered = value.type(value.props); slots = oldSlots; index = oldIndex;
      const expanded = expand(rendered, path + ':render'); if (expanded && typeof expanded === 'object' && value.key != null) expanded.key = value.key;
      return expanded;
    }
    return { ...value, props: { ...value.props, children: expand(value.props.children, path + ':children') } };
  };
  const nodes = () => { const result = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object' && 'type' in value) { result.push(value); visit(value.props.children); } }; visit(tree); return result; };
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null ? '' : String(value);
  const viewport = { scrollHeight: 1000, scrollTop: 0, clientHeight: 400, querySelector: () => null };
  const render = () => { slots = rootSlots; index = 0; tree = module.exports.EventChatView({ eventId: 'event', chat: { ...chat }, realtime: 'live', privateMode: true }); tree = expand(tree); const history = nodes().find(node => node.props['aria-label'] === 'Histórico de mensagens'); history.props.ref.current = viewport; while (effects.length) effects.shift()(); return tree; };
  const input = () => nodes().find(node => node.type === 'textarea');
  const type = value => { input().props.onChange({ target: { value } }); render(); };
  const button = label => nodes().find(node => node.type === 'button' && text(node).includes(label));
  return { chat, calls, render, nodes, text, input, type, button, viewport, submit: () => nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }), async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); render(); }, close() { [rootSlots, ...frames.values()].flat().forEach(slot => slot?.cleanup?.()); } };
}

(async () => {
  const h = harness();
  try {
    h.render(); h.type('Primeira mensagem');
    const sending = h.submit(); h.submit(); h.render();
    assert.equal(h.calls.length, 1, 'immediate double submit keeps one request');
    assert.equal(h.input().props.value, '', 'composer clears before response');
    assert.ok(h.nodes().some(node => node.type === 'Mic'), 'empty composer shows microphone availability action');
    assert.ok(!h.nodes().some(node => node.type === 'Loader2'), 'text send has no spinner');
    const local = h.nodes().find(node => node.type === 'li');
    assert.equal(local.key, h.calls[0].pending.clientId);
    assert.deepEqual(local.props.initial, { opacity: 1, y: 0 }, 'local bubble appears without waiting for a fade');
    assert.equal(local.props['data-message-id'], undefined, 'local bubble cannot enter receipt queries');
    assert.match(h.text(local), /Primeira mensagem.*Aguardando confirmação/);
    assert.doesNotMatch(h.text(local), /#-1|Lida|Entregue|Enviada/);
    h.calls[0].finish('permanent'); await sending; await h.flush();
    assert.equal(h.input().props.value, 'Primeira mensagem', 'permanent failure restores original draft');

    h.type('Texto antigo'); const newer = h.submit(); h.render(); h.type('Novo texto');
    h.calls[1].finish('permanent'); await newer; await h.flush();
    assert.equal(h.input().props.value, 'Novo texto', 'failure never replaces new typing');

    h.type('Conexão atrasada'); const transient = h.submit(); h.render();
    const clientId = h.calls[2].pending.clientId;
    h.calls[2].finish('transient'); await transient; await h.flush();
    assert.equal(h.input().props.value, '', 'transient failure keeps content in bubble');
    assert.equal(h.nodes().find(node => node.type === 'li').key, clientId);
    const retry = h.button('Tentar agora').props.onClick(); h.render();
    assert.equal(h.calls[3].pending.clientId, clientId, 'retry retains stable bubble identity');
    h.calls[3].finish('success'); await retry; await h.flush();
    assert.equal(h.nodes().filter(node => node.type === 'li' && node.key === clientId).length, 1);
    assert.equal(h.nodes().find(node => node.type === 'li').key, clientId);
    assert.doesNotMatch(h.text(h.nodes().find(node => node.type === 'li')), /Aguardando confirmação/);
    assert.equal(h.input().props.value, '');

    h.type('Falha automática'); const auto = h.submit(); h.render(); h.calls[4].finish('transient'); await auto; await h.flush();
    h.chat.pending = null; h.chat.optimisticMessage = null; h.render(); h.render();
    assert.equal(h.input().props.value, 'Falha automática', 'later permanent retry failure restores the draft');
    h.chat.imageUploading = true; h.render();
    assert.ok(h.button('Enviando foto…')); assert.ok(h.nodes().some(node => node.type === 'Loader2'), 'actual photo upload retains progress feedback');
    h.chat.imageUploading = false;
    h.viewport.scrollHeight = 2000; h.viewport.scrollTop = 900;
    h.nodes().find(node => node.props['aria-label'] === 'Histórico de mensagens').props.onScroll();
    const confirmed = h.chat.messages.at(-1);
    h.chat.messages = [...h.chat.messages, { ...confirmed, id: 60, clientId: 'layout-change' }]; h.render();
    assert.equal(h.viewport.scrollTop, 2000, 'layout measurement alone does not disable intentional auto-follow');
    h.viewport.scrollTop = 0;
    const history = h.nodes().find(node => node.props['aria-label'] === 'Histórico de mensagens'); history.props.onWheel(); history.props.onScroll();
    h.chat.messages = [...h.chat.messages, { ...confirmed, id: 61, clientId: 'while-reading' }]; h.render(); h.render();
    assert.equal(h.viewport.scrollTop, 0, 'explicit historical scroll is preserved on arrival');
    const jump = h.nodes().find(node => node.type === 'button' && h.text(node).includes('nova mensagem')); assert.ok(jump); jump.props.onClick();
    assert.equal(h.viewport.scrollTop, 2000, 'jump restores follow intent and reaches the bottom');
    console.log('PASS real EventChatView: instant bubble, draft clearing, double submit guard, truthful status, permanent recovery, new typing preservation, transient retry identity and photo progress');
  } finally { h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
