const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Execute the actual component and event handlers, with deterministic React hook slots.
// No database, network, or browser session is required for the explicit-save contract.
function harness() {
  const slots = [], effects = [], calls = []; let index = 0, tree;
  const differs = (old, next) => !old || old.some((value, i) => value !== next[i]);
  const react = {
    useState(initial) { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const motion = { AnimatePresence: 'presence', LazyMotion: 'motion-provider', m: new Proxy({}, { get: (_, name) => name }), useReducedMotion: () => true };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('components/MyComponents/PartyProfileForm.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const requireComponent = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'next-auth/react') return { useSession: () => ({ data: { user: { id: 'participant' } } }) };
    if (name === 'framer-motion') return motion;
    if (name === 'lucide-react') return new Proxy({}, { get: (_, name) => name });
    if (name.endsWith('PartyActions')) return { partyButton: '', partyInput: '' };
    if (name.endsWith('PartyAvatar')) return { default: 'avatar' };
    if (name.endsWith('animations/config')) return { loadAnimationFeatures() {} };
    throw new Error('Unexpected dependency: ' + name);
  };
  new Function('require', 'module', 'exports', source)(requireComponent, module, module.exports);
  const act = payload => new Promise(resolve => calls.push({ payload, resolve }));
  const render = () => { index = 0; tree = module.exports.default({ profile: null, eligible: true, busy: false, act }); while (effects.length) effects.shift()(); return tree; };
  const nodes = () => { const result = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object' && 'type' in value) { result.push(value); visit(value.props.children); } }; visit(tree); return result; };
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null ? '' : String(value);
  const button = label => { const result = nodes().find(node => node.type === 'button' && text(node).includes(label)); assert.ok(result, 'Missing button: ' + label); return result; };
  return { calls, render, nodes, button, async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); }, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}
(async () => {
  const h = harness();
  try {
    h.render(); assert.equal(h.calls.length, 0, 'Mount must not create a profile');
    h.button('Continuar').props.onClick(); h.render(); assert.equal(h.calls.length, 0, 'Step changes must not save');
    h.nodes().find(node => node.type === 'input' && node.props.placeholder === 'Seu nome ou apelido').props.onChange({ target: { value: 'Ana da festa' } });
    h.nodes().find(node => node.type === 'textarea').props.onChange({ target: { value: 'Quero conhecer pessoas' } });
    h.render(); assert.equal(h.calls.length, 0, 'Field changes must not save');
    // Enter in a native text input can only implicitly submit an enclosing form.
    // Verify the rendered structure has no form or submit handler, then dispatch any key handlers.
    assert.ok(!h.nodes().some(node => node.type === 'form' || node.props.onSubmit), 'Enter must have no implicit submit path');
    for (const node of h.nodes()) node.props.onKeyDown?.({ key: 'Enter', preventDefault() {} });
    assert.equal(h.calls.length, 0, 'Enter must not save');
    h.button('Continuar').props.onClick(); h.render();
    h.nodes().find(node => node.type === 'input' && node.props.placeholder === 'Música, dança, gastronomia…').props.onChange({ target: { value: 'Música, Dança, Música' } });
    h.render(); h.button('Continuar').props.onClick(); h.render();
    assert.equal(h.calls.length, 0, 'Reaching review must not save');
    const save = h.button('Criar perfil'); assert.equal(save.props.type, 'button');
    save.props.onClick(); save.props.onClick(); h.render();
    assert.equal(h.calls.length, 1, 'Immediate double click must share one pending save');
    assert.equal(h.button('Enviando e salvando').props.disabled, true);
    assert.deepEqual(h.calls[0].payload, { action: 'profile.save', displayName: 'Ana da festa', photoUrl: '', bio: 'Quero conhecer pessoas', interests: ['Música', 'Dança'], intent: 'FRIENDSHIP', adultDeclared: false });
    h.calls[0].resolve(false); await h.flush();
    assert.ok(h.nodes().some(node => node.props.role === 'alert'), 'Failed save must show an error');
    h.button('Voltar').props.onClick(); h.render();
    assert.equal(h.nodes().find(node => node.type === 'input' && node.props.placeholder === 'Música, dança, gastronomia…').props.value, 'Música, Dança, Música');
    h.button('Voltar').props.onClick(); h.render();
    assert.equal(h.nodes().find(node => node.type === 'input' && node.props.placeholder === 'Seu nome ou apelido').props.value, 'Ana da festa');
    assert.equal(h.nodes().find(node => node.type === 'textarea').props.value, 'Quero conhecer pessoas');
    h.button('Continuar').props.onClick(); h.render(); h.button('Continuar').props.onClick(); h.render();
    h.button('Criar perfil').props.onClick(); assert.equal(h.calls.length, 2, 'User can explicitly retry after failure');
    assert.deepEqual(h.calls[1].payload, h.calls[0].payload, 'Retry must preserve the draft');
    h.calls[1].resolve(true); await h.flush();
    assert.ok(!h.nodes().some(node => node.props.role === 'alert'));
    console.log('PASS real PartyProfileForm: mount, navigation, edits and Enter do not save; explicit review click saves; pending double click is locked; failure preserves draft and retry succeeds');
  } finally { h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
