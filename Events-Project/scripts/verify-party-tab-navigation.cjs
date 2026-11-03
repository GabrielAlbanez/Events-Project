const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Render the actual hub and dispatch its real navigation handlers, stubbing only dependencies.
function harness(data, overrides = {}) {
  let selected, tree;
  const jsx = (type, props) => ({ type, props: props || {} });
  const resource = { data, loading: false, refreshing: false, online: true, revoked: false, busy: false, error: '', message: '', refresh() {}, act() { throw new Error('Navigation must not mutate participation'); }, ...overrides };
  const dependencies = name => {
    if (name === 'react') return { useState: initial => [selected ?? initial, value => { selected = value; }] };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === 'next/link') return { default: 'link' };
    if (name === 'next-auth/react') return { useSession: () => ({ status: overrides.authLoading ? 'loading' : 'authenticated', data: { user: { id: 'self' } } }) };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name.endsWith('useGlobalConnectionsProfile')) return { useGlobalConnectionsProfile: () => ({ busy: false, save: () => { throw new Error('Navigation must not save global profile'); } }) };
    if (name.endsWith('usePartyConnections')) return { usePartyConnections: () => resource };
    if (name.endsWith('usePartyRealtime')) return { usePartyRealtime: () => 'live' };
    if (name.endsWith('PartyActions')) return { partyButton: 'min-h-11', PartyConfirm: 'confirm', PartySafetyActions: 'safety' };
    if (name.endsWith('sidebar')) return { SidebarTrigger: 'sidebar' };
    if (name.endsWith('FadeInView')) return { FadeInView: 'fade' };
    if (name.endsWith('PartyProfileForm')) return { default: 'profile-form', partyIntents: { FRIENDSHIP: { label: 'Amizade' } } };
    if (name.endsWith('PartyAvatar')) return { default: 'avatar' };
    if (name.endsWith('PartyDiscovery')) return { default: 'discovery' };
    throw new Error('Unexpected dependency: ' + name);
  };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('components/MyComponents/PartyConnectionsHub.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', source)(dependencies, module, module.exports);
  function render() { const content = module.exports.default({ eventId: 'event' }); tree = content.type(content.props); }
  function nodes() {
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object' || !node.props) return;
      if (typeof node.type === 'function') return visit(node.type(node.props));
      result.push(node); visit(node.props.children);
    }
    visit(tree); return result;
  }
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node);
  const click = label => { const button = nodes().find(node => node.type === 'button' && text(node) === label); assert.ok(button, label); assert.ok(!button.props.disabled, 'Cannot click disabled button: ' + label); button.props.onClick(); render(); };
  render();
  return { resource, render, nodes, click, text: () => nodes().map(text).join(' '), has: type => nodes().some(node => node.type === type) };
}
const match = { id: 'private-match', profile: { userId: 'other', displayName: 'Pessoa conectada', photoUrl: '' } };
const snapshot = { event: { id: 'event', name: 'Festa' }, eligible: true, mine: null, profiles: [], matches: [], blocks: [] };
for (const mine of [null, { active: false }]) {
  const h = harness({ ...snapshot, mine, matches: [match] });
  assert.ok(h.has('profile-form'), 'Discover offers onboarding');
  h.click('Conexões');
  assert.ok(!h.has('profile-form'), 'Connections must never mount the profile form');
  assert.ok(!h.has('link') || !h.nodes().some(node => node.type === 'link' && node.props.href.endsWith('/private-match')), 'Inactive profiles must not expose stale matches');
  assert.match(h.text(), /Participe das conex/);
  assert.equal(h.nodes().find(node => node.type === 'button' && node.props['aria-current'] === 'page').props.children[1], 'Conexões');
  h.click('Criar meu perfil');
  assert.ok(h.has('profile-form'), 'Explicit activation CTA opens My profile');
}

const active = harness({ ...snapshot, mine: { active: true }, matches: [match] });
active.click('Conexões1');
assert.ok(!active.has('profile-form'));
assert.ok(active.nodes().some(node => node.type === 'link' && node.props.href.endsWith('/private-match')), 'Authorized active match opens its existing chat');
active.resource.revoked = true; active.render();
assert.ok(!active.nodes().some(node => node.type === 'link' && node.props.href.endsWith('/private-match')), 'Revocation hides even stale match data');
active.click('Descobrir'); assert.ok(!active.has('discovery'), 'Revocation hides discovery');
const empty = harness({ ...snapshot, mine: { active: true } });
empty.click('Conexões'); assert.match(empty.text(), /Boas conexões levam um instante/); assert.ok(!empty.has('profile-form'));
const ineligible = harness({ ...snapshot, eligible: false, matches: [match] });
ineligible.click('Conexões'); assert.match(ineligible.text(), /Confirme sua presença primeiro/); assert.ok(!ineligible.has('profile-form'));
const loading = harness(null, { loading: true });
assert.ok(loading.nodes().some(node => node.props.role === 'status')); assert.ok(!loading.has('profile-form'));
for (const label of ['Descobrir', 'Conexões', 'Meu perfil']) {
  const button = loading.nodes().find(node => node.type === 'button' && node.props.disabled && node.props.children[1] === label);
  assert.ok(button, 'Loading must disable section navigation: ' + label);
  assert.throws(() => loading.click(label), /Cannot click disabled button/);
}
const authenticating = harness(null, { authLoading: true });
assert.throws(() => authenticating.click('Conexões'), /Cannot click disabled button/, 'Authentication transition must not accept a selection that remounting would discard');
const failed = harness(null, { error: 'Não foi possível carregar.' });
failed.click('Conexões'); assert.ok(failed.nodes().some(node => node.props.role === 'alert')); assert.match(failed.text(), /Conexões indisponíveis/);
console.log('PASS real PartyConnectionsHub: section navigation, inactive CTA, active matches, empty, ineligible, revoked, loading and error states');
