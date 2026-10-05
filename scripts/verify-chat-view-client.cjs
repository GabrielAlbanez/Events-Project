const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function harness() {
  const slots = [], effects = [], calls = []; let index = 0, tree;
  const differs = (a, b) => !a || a.some((value, i) => value !== b[i]);
  const react = {
    useState(value) { const i = index++; if (!slots[i]) slots[i] = { value: typeof value === 'function' ? value() : value }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(value) { const i = index++; return slots[i] ?? (slots[i] = { current: value }); },
    useCallback(callback, deps) { const i = index++; if (!slots[i] || differs(slots[i].deps, deps)) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const motion = { LazyMotion: 'motion-provider', m: new Proxy({}, { get: (_, name) => name }), useReducedMotion: () => false };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('components/MyComponents/EventChatHub.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
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
    throw new Error('Unexpected dependency: ' + name);
  };
  new Function('require', 'module', 'exports', source)(requireComponent, module, module.exports);
  const message = (pending, id = -1) => ({ ...pending, id, own: true, author: { id: 'one', name: 'One', image: null } });
  const chat = { messages: [], optimisticMessage: null, pending: null, loading: false, loadingOlder: false, denied: false, sending: false, imageUploading: false, online: true, nextBefore: null, event: null, error: '', retryStopped: false, typing() {}, acknowledge() {}, refresh() {}, loadOlder() {}, uploadImage() {}, send(text, retry) {
    const pending = retry ? chat.pending : { clientId: `client-${calls.length}`, text: text.trim(), createdAt: '2026-10-05T10:00:00Z' };
    chat.pending = pending; chat.sending = true; chat.optimisticMessage = message(pending);
    return new Promise(resolve => calls.push({ pending, retry, finish(mode) { chat.sending = false; if (mode !== 'transient') { chat.pending = null; chat.optimisticMessage = null; } if (mode === 'success') chat.messages = [...chat.messages, message(pending, calls.length)]; resolve(mode === 'success'); } }));
  } };
  const nodes = () => { const result = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object' && 'type' in value) { result.push(value); visit(value.props.children); } }; visit(tree); return result; };
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null ? '' : String(value);
  const viewport = { scrollHeight: 1000, scrollTop: 0, clientHeight: 400, querySelector: () => null };
  const render = () => { index = 0; tree = module.exports.EventChatView({ eventId: 'event', chat: { ...chat }, realtime: 'live', privateMode: true }); const history = nodes().find(node => node.props['aria-label'] === 'Histórico de mensagens'); history.props.ref.current = viewport; while (effects.length) effects.shift()(); return tree; };
  const input = () => nodes().find(node => node.type === 'textarea');
  const type = value => { input().props.onChange({ target: { value } }); render(); };
  const button = label => nodes().find(node => node.type === 'button' && text(node).includes(label));
  return { chat, calls, render, nodes, text, input, type, button, viewport, submit: () => nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }), async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); render(); }, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}

(async () => {
  const h = harness();
  try {
    h.render(); h.type('Primeira mensagem');
    const sending = h.submit(); h.submit(); h.render();
    assert.equal(h.calls.length, 1, 'immediate double submit keeps one request');
    assert.equal(h.input().props.value, '', 'composer clears before response');
    assert.equal(h.button('Enviar mensagem').props.disabled, true);
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
    console.log('PASS real EventChatView: instant bubble, draft clearing, double submit guard, truthful status, permanent recovery, new typing preservation, transient retry identity and photo progress');
  } finally { h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
