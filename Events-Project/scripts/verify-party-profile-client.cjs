const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Execute the actual component and event handlers, with deterministic React hook slots.
// No database, network, or browser session is required for the explicit-save contract.
function harness(props = {}) {
  const slots = [], effects = [], calls = []; let index = 0, tree;
  const differs = (old, next) => !old || old.some((value, i) => value !== next[i]);
  const react = {
    useState(initial) { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(effect, deps) { const i = index++, old = slots[i]; if (!old || differs(old.deps, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('components/MyComponents/PartyProfileForm.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const requireComponent = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'next-auth/react') return { useSession: () => ({ data: { user: { id: 'participant' } } }) };
    if (name === 'next/navigation') return { usePathname: () => '/perfil-conexoes' };
    if (name.endsWith('MobileBottomNav')) return { showsMobileBottomNav: () => true };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, name) => name });
    if (name.endsWith('PartyActions')) return { partyButton: '', partyInput: '' };
    if (name.endsWith('PartyAvatar')) return { default: 'avatar' };
    if (name.endsWith('PhotoCropDialog')) return { PhotoCropDialog: 'photo-crop' };
    if (name === '@/lib/uploadLimits') return (() => { const loaded = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('lib/uploadLimits.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, loaded, loaded.exports); return loaded.exports; })();
    throw new Error('Unexpected dependency: ' + name);
  };
  new Function('require', 'module', 'exports', source)(requireComponent, module, module.exports);
  const act = payload => new Promise(resolve => calls.push({ payload, resolve }));
  const render = () => { index = 0; tree = module.exports.default({ profile: null, eligible: true, busy: false, act, ...props }); while (effects.length) effects.shift()(); return tree; };
  const nodes = () => { const result = []; const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object' && 'type' in value) { result.push(value); visit(value.props.children); } }; visit(tree); return result; };
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || value === false ? '' : String(value);
  const findButton = label => nodes().find(node => node.type === 'button' && (text(node).includes(label) || node.props['aria-label'] === label));
  const button = label => { const result = findButton(label); assert.ok(result, 'Missing button: ' + label); return result; };
  const has = label => !!findButton(label);
  const field = id => { const result = nodes().find(node => node.props.id === id); assert.ok(result, 'Missing field: ' + id); return result; };
  const alerts = () => nodes().filter(node => node.props.role === 'alert').map(text);
  const chips = () => nodes().filter(node => node.type === 'button' && String(node.props['aria-label']).startsWith('Remover interesse')).length;
  return { calls, render, nodes, button, has, field, alerts, chips, text, async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); }, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}
(async () => {
  // Creation: one page, no steps; every section is directly editable.
  const h = harness();
  try {
    h.render(); assert.equal(h.calls.length, 0, 'Mount must not create a profile');
    for (const label of ['Voltar', 'Continuar']) assert.ok(!h.has(label), 'No wizard navigation: ' + label);
    for (const id of ['party-photo', 'party-name', 'party-bio', 'party-interest-input']) h.field(id);
    assert.equal(h.nodes().filter(node => node.type === 'input' && node.props.name === 'party-intent').length, 3, 'Three intent cards');
    assert.ok(!h.nodes().some(node => node.props.id === 'party-adult'), '18+ declaration only appears for Paquera');
    h.button('Criar perfil').props.onClick(); h.render();
    assert.equal(h.calls.length, 0, 'Invalid name must not save');
    assert.ok(h.alerts().some(message => message.includes('pelo menos 2 caracteres')), 'Inline name error');
    assert.equal(h.field('party-name').props['aria-invalid'], true);
    h.field('party-name').props.onChange({ target: { value: 'Ana da festa' } });
    h.field('party-bio').props.onChange({ target: { value: 'Quero conhecer pessoas' } });
    h.render(); assert.equal(h.field('party-name').props['aria-invalid'], false, 'Typing clears the field error');
    h.field('party-interest-input').props.onChange({ target: { value: 'Música, Dança, Música' } }); h.render();
    assert.equal(h.calls.length, 0, 'Field changes must not save');
    assert.ok(h.has('Remover interesse Música') && h.has('Remover interesse Dança'), 'Comma turns text into chips');
    const preview = h.nodes().find(node => node.props['aria-label'] === 'Prévia do seu perfil');
    assert.match(h.text(preview), /Ana da festa/); assert.match(h.text(preview), /Quero conhecer pessoas/); assert.match(h.text(preview), /Dança/);
    // Enter in a native text input can only implicitly submit an enclosing form.
    assert.ok(!h.nodes().some(node => node.type === 'form' || node.props.onSubmit), 'Enter must have no implicit submit path');
    for (const node of h.nodes()) node.props.onKeyDown?.({ key: 'Enter', preventDefault() {} });
    h.render(); assert.equal(h.calls.length, 0, 'Enter must not save');
    const save = h.button('Criar perfil'); assert.equal(save.props.type, 'button');
    save.props.onClick(); save.props.onClick(); h.render();
    assert.equal(h.calls.length, 1, 'Immediate double click must share one pending save');
    assert.equal(h.button('Enviando e salvando').props.disabled, true);
    assert.deepEqual(h.calls[0].payload, { action: 'profile.save', displayName: 'Ana da festa', photoUrl: '', bio: 'Quero conhecer pessoas', interests: ['Música', 'Dança'], intent: 'FRIENDSHIP', adultDeclared: false });
    h.calls[0].resolve(false); await h.flush();
    assert.ok(h.alerts().length > 0, 'Failed save must show an error');
    assert.equal(h.field('party-name').props.value, 'Ana da festa', 'Failure preserves the draft');
    assert.equal(h.field('party-bio').props.value, 'Quero conhecer pessoas');
    h.button('Tentar salvar novamente').props.onClick(); assert.equal(h.calls.length, 2, 'User can explicitly retry after failure');
    assert.deepEqual(h.calls[1].payload, h.calls[0].payload, 'Retry must preserve the draft');
    h.calls[1].resolve(true); await h.flush();
    assert.equal(h.alerts().length, 0);
    assert.ok(h.nodes().some(node => node.props.role === 'status' && h.text(node).includes('Perfil salvo')), 'Success feedback');
    assert.ok(!h.has('Salvar perfil') && !h.has('Criar perfil'), 'Save bar hides with no pending changes');
    // Editing after save shows the unsaved bar; discard restores the saved values.
    h.field('party-name').props.onChange({ target: { value: 'Ana' } }); h.render();
    assert.ok(h.nodes().some(node => h.text(node) === 'Alterações não salvas'));
    h.button('Descartar').props.onClick(); h.render();
    assert.equal(h.field('party-name').props.value, 'Ana da festa'); assert.ok(!h.has('Salvar perfil'));
    assert.equal(h.calls.length, 2, 'Discard never saves');
  } finally { h.close(); }

  // Editing an existing profile opens directly on editable fields, with no save bar until changes.
  const profile = { displayName: 'Bia', photoUrl: '', bio: 'Oi', interests: ['Samba'], intent: 'FRIENDSHIP', adultDeclared: false };
  const e = harness({ profile, global: true });
  try {
    e.render();
    assert.equal(e.field('party-name').props.value, 'Bia'); assert.ok(e.has('Remover interesse Samba'));
    assert.ok(!e.has('Salvar perfil') && !e.has('Voltar'), 'No save bar nor wizard navigation on open');
    // Interest limits: max 6, 30 characters each.
    e.field('party-interest-input').props.onChange({ target: { value: 'a, b, c, d, e,' } }); e.render();
    assert.equal(e.chips(), 6);
    e.field('party-interest-input').props.onChange({ target: { value: 'f,' } }); e.render();
    assert.ok(e.alerts().some(message => message.includes('até 6')), 'Seventh chip is rejected');
    e.button('Salvar perfil').props.onClick(); e.render(); assert.equal(e.calls.length, 0, 'Over-limit draft cannot save');
    e.field('party-interest-input').props.onChange({ target: { value: '' } });
    e.button('Remover interesse e').props.onClick(); e.render();
    e.field('party-interest-input').props.onChange({ target: { value: 'x'.repeat(31) + ',' } }); e.render();
    assert.ok(e.alerts().some(message => message.includes('30 caracteres')), 'Long chip is rejected');
    assert.equal(e.chips(), 5);
    e.field('party-interest-input').props.onChange({ target: { value: '' } }); e.render();
    // Paquera requires the inline 18+ declaration.
    e.nodes().find(node => node.props.name === 'party-intent' && node.props.value === 'DATING').props.onChange(); e.render();
    e.button('Salvar perfil').props.onClick(); e.render();
    assert.equal(e.calls.length, 0, 'Dating without adult declaration must not save');
    assert.ok(e.alerts().some(message => message.includes('18 anos')));
    e.field('party-adult').props.onChange({ target: { checked: true } }); e.render();
    e.button('Salvar perfil').props.onClick(); e.render();
    assert.equal(e.calls.length, 1);
    assert.deepEqual(e.calls[0].payload, { action: 'profile.save', displayName: 'Bia', photoUrl: '', bio: 'Oi', interests: ['Samba', 'a', 'b', 'c', 'd'], intent: 'DATING', adultDeclared: true });
    e.calls[0].resolve(true); await e.flush();
  } finally { e.close(); }

  // Imported profile awaiting review exposes the save action immediately; ineligible cannot save.
  const r = harness({ profile, global: true, needsReview: true });
  try { r.render(); assert.ok(r.has('Salvar perfil'), 'needsReview shows save bar'); } finally { r.close(); }
  const off = harness({ profile, global: true, needsReview: true, eligible: false });
  try { off.render(); assert.equal(off.button('Salvar perfil').props.disabled, true, 'Ineligible/offline cannot save'); } finally { off.close(); }

  // Photo: same type/size validation, upload on save, uploaded path in payload.
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalFetch = global.fetch;
  const uploads = [];
  URL.createObjectURL = () => 'blob:preview'; URL.revokeObjectURL = () => {};
  global.fetch = (url, options) => { uploads.push({ url, options }); return Promise.resolve({ ok: true, json: async () => ({ filePath: '/v1/media/party/new.webp' }) }); };
  const p = harness({ profile, global: true });
  try {
    p.render();
    p.field('party-photo').props.onChange({ target: { files: [{ type: 'image/gif', size: 10 }], value: 'x' } }); p.render();
    assert.ok(p.alerts().some(message => message.includes('JPG, PNG')), 'Wrong type rejected');
    p.field('party-photo').props.onChange({ target: { files: [{ type: 'image/png', size: 50 * 1024 * 1024 }], value: 'x' } }); p.render();
    assert.ok(p.alerts().some(message => message.includes('4 MB')), 'Oversized photo rejected');
    assert.ok(!p.has('Salvar perfil'), 'Rejected files do not create changes');
    const picked = new Blob(['x'], { type: 'image/png' });
    p.field('party-photo').props.onChange({ target: { files: [picked], value: 'x' } }); p.render();
    const crop = () => p.nodes().find(node => node.type === 'photo-crop');
    assert.equal(crop().props.file, picked, 'A valid photo opens the "Ajustar foto" step first');
    assert.ok(!p.has('Salvar perfil'), 'Nothing changes until the crop is confirmed');
    crop().props.onCancel(); p.render(); assert.equal(crop().props.file, null, 'Cancelling the crop keeps the old photo');
    p.field('party-photo').props.onChange({ target: { files: [picked], value: 'x' } }); p.render();
    crop().props.onConfirm(new Blob(['cropped'], { type: 'image/jpeg' })); p.render();
    assert.equal(crop().props.file, null);
    assert.ok(p.has('Salvar perfil') && p.has('Remover foto'));
    p.button('Salvar perfil').props.onClick(); await p.flush(); await p.flush();
    assert.equal(uploads.length, 1); assert.equal(uploads[0].url, '/api/upload?purpose=party'); assert.equal(uploads[0].options.method, 'POST');
    assert.equal(p.calls.length, 1); assert.equal(p.calls[0].payload.photoUrl, '/v1/media/party/new.webp');
    p.calls[0].resolve(true); await p.flush();
  } finally { p.close(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; global.fetch = originalFetch; }

  console.log('PASS real PartyProfileForm: single-page editor; mount, edits and Enter do not save; inline field errors; chip limits; 18+ declaration; photo validation and upload; pending double click locked; failure preserves draft and retry succeeds; unsaved bar with discard; success feedback');
})().catch(error => { console.error(error); process.exitCode = 1; });
