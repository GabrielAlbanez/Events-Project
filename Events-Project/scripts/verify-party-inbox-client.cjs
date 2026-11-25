// Global inbox UI: list, event filter, "Match em…" badge, /conversas links and navigation entry points.
const assert = require("node:assert/strict"), fs = require("node:fs"), ts = require("typescript");
const compile = (file, jsx = false) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText;
const run = (source, resolve) => { const module = { exports: {} }; new Function("require", "module", "exports", source)(resolve, module, module.exports); return module.exports; };
const utils = run(compile("utils/partyInbox.ts"), require);

let slots = [], index = 0;
const react = { useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; } };
const jsx = (type, props) => ({ type, props: props ?? {} });
const inbox = run(compile("components/MyComponents/PartyInbox.tsx", true), name => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
  if (name === "next/link") return { __esModule: true, default: "link" };
  if (name === "lucide-react") return new Proxy({}, { get: (_, icon) => icon });
  if (name === "@/utils/partyInbox") return utils;
  if (name === "@/hooks/usePartyInbox") return { usePartyInbox: () => { throw new Error("screen not rendered here"); } };
  if (name === "./ChatAvatar") return { ChatAvatar: "avatar" };
  if (name === "./PushSettings") return { __esModule: true, default: "push-settings" };
  if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
  throw new Error("Unexpected dependency: " + name);
});
const expand = node => Array.isArray(node) ? node.map(expand) : node && typeof node === "object" && "type" in node ? (typeof node.type === "function" ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } }) : node;
const all = (node, test, found = []) => { if (Array.isArray(node)) node.forEach(child => all(child, test, found)); else if (node && typeof node === "object") { if (test(node)) found.push(node); all(node.props?.children, test, found); } return found; };
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : node === false || node == null ? "" : String(node);
const render = props => { index = 0; return expand(jsx(inbox.PartyInbox, props)); };

const item = (id, name, event, extra = {}) => ({ id, profile: { userId: `u-${id}`, displayName: name, photoUrl: "", bio: "", interests: [], intent: "FRIENDSHIP", liked: true }, createdAt: "2026-11-20T10:00:00.000Z", unreadCount: 0, event, ...extra });
const azul = { id: "e1", name: "Festa Azul", date: "2026-12-05" }, verde = { id: "e2", name: "Show Verde", date: "2026-12-10" };
const items = [
  item("m1", "Ana", azul, { unreadCount: 2, lastMessage: { text: "Bora?", createdAt: "2026-11-24T21:00:00.000Z", own: false } }),
  item("m2", "Bia", verde, { lastMessage: { text: "", createdAt: "2026-11-23T20:00:00.000Z", own: true } }),
  item("m3", "Caio", azul),
];
const resource = (extra = {}) => ({ items, unreadTotal: utils.inboxUnreadTotal(items), loading: false, refreshing: false, error: "", online: true, refresh() {}, ...extra });

// Pure helpers.
assert.equal(utils.formatEventDay("2026-12-05"), "5 dez");
assert.equal(utils.formatEventDay("not a date"), "");
assert.equal(utils.matchBadgeLabel(azul), "Match em Festa Azul · 5 dez");
assert.equal(utils.matchBadgeLabel({ name: "Sem data" }), "Match em Sem data");
assert.equal(utils.inboxPreview(items[1]), "Você: Foto");
assert.equal(utils.inboxUnreadTotal(items), 2);
assert.deepEqual(utils.inboxEvents(items), [{ id: "e1", name: "Festa Azul" }, { id: "e2", name: "Show Verde" }]);
assert.deepEqual(utils.filterInbox(items, "verde", null).map(entry => entry.id), ["m2"], "search matches the event name");
assert.deepEqual(utils.filterInbox(items, "caio", "e1").map(entry => entry.id), ["m3"]);
assert.deepEqual(utils.filterInbox(items, "", "e2").map(entry => entry.id), ["m2"]);
assert.equal(utils.formatActivity("2026-11-25T09:30:00", new Date("2026-11-25T18:00:00")), "09:30");
assert.equal(utils.formatActivity("2026-11-24T09:30:00", new Date("2026-11-25T18:00:00")), "Ontem");
assert.equal(utils.conversationHref("a b"), "/conversas/a%20b");

// List: every conversation links to /conversas/{id}, with its event badge and unread count.
slots = [];
let tree = render({ inbox: resource(), selectedId: "m2" });
let links = all(tree, node => node.type === "link");
assert.deepEqual(links.map(link => link.props.href), ["/conversas/m1", "/conversas/m2", "/conversas/m3"]);
assert.equal(links[1].props["aria-current"], "page", "open conversation is marked");
assert.match(text(links[0]), /Ana.*Match em Festa Azul · 5 dez.*Bora\?/);
assert.match(text(links[1]), /Match em Show Verde · 10 dez.*Você: Foto/);
assert.ok(all(links[0], node => node.props?.["aria-label"] === "2 mensagens não lidas").length === 1);
assert.match(text(all(tree, node => node.props?.["aria-live"] === "polite")[0]), /2 mensagens não lidas/);

// Event chips only for events that appear, and they filter the list.
let chips = all(tree, node => node.type === "button" && "aria-pressed" in node.props);
assert.deepEqual(chips.map(text), ["Todos", "Festa Azul", "Show Verde"]);
chips[2].props.onClick();
tree = render({ inbox: resource() });
assert.deepEqual(all(tree, node => node.type === "link").map(link => link.props.href), ["/conversas/m2"]);
assert.equal(all(tree, node => node.type === "button" && node.props["aria-pressed"] === true).map(text)[0], "Show Verde");
const search = all(tree, node => node.type === "input")[0];
search.props.onChange({ target: { value: "ana" } });
tree = render({ inbox: resource() });
assert.match(text(tree), /Nenhuma conversa encontrada com esses filtros/);
all(tree, node => node.type === "button" && text(node) === "Limpar filtros")[0].props.onClick();
tree = render({ inbox: resource() });
assert.equal(all(tree, node => node.type === "link").length, 3);

// Single-event inbox hides chips; empty, loading and error states.
slots = [];
assert.equal(all(render({ inbox: resource({ items: [items[0]] }) }), node => "aria-pressed" in (node.props ?? {})).length, 0);
slots = [];
tree = render({ inbox: resource({ items: [], unreadTotal: 0 }) });
assert.match(text(tree), /Você ainda não tem conversas/);
assert.ok(all(tree, node => node.type === "link" && node.props.href === "/EventsCreated").length === 1, "empty state links to discovery");
slots = [];
assert.ok(all(render({ inbox: resource({ items: [], loading: true }) }), node => node.props?.role === "status").length >= 1);
slots = [];
let retried = false;
tree = render({ inbox: resource({ items: [], error: "Falhou.", refresh() { retried = true; } }) });
assert.match(text(all(tree, node => node.props?.role === "alert")[0]), /Falhou\..*Tentar novamente/);
all(tree, node => node.type === "button" && text(node) === "Tentar novamente")[0].props.onClick();
assert.ok(retried);
assert.doesNotMatch(text(tree), /Você ainda não tem conversas/, "an error never pretends the inbox is empty");
slots = [];
assert.match(text(render({ inbox: resource({ online: false }) })), /Sem conexão/);

// Header badge on the chat links to the event.
index = 0;
const badge = expand(jsx(inbox.MatchEventBadge, { event: azul }));
assert.equal(badge.props.href, "/eventos/e1");
assert.equal(text(badge), "Match em Vocês deram match em Festa Azul · 5 dez", "short label on phones, full label from sm up");

// Entry points and wiring.
const header = fs.readFileSync("components/MyComponents/SiteHeader.tsx", "utf8");
assert.match(header, /\{authenticated && <ConversationsLink \/>\}\s*\{authenticated && <NotificationBell \/>\}/, "conversations icon sits next to the bell");
assert.match(fs.readFileSync("components/MyComponents/ConversationsLink.tsx", "utf8"), /href="\/conversas"[^>]*aria-label=\{label\}/);
assert.match(fs.readFileSync("components/ui/app-sidebar.tsx", "utf8"), /\{ label: "Conversas", href: "\/conversas", icon: MessagesSquare, roles: members \}/);
assert.match(fs.readFileSync("components/MyComponents/PartyConnectionsHub.tsx", "utf8"), /href="\/conversas"[^>]*>.*Ver todas as conversas/);
const conversation = fs.readFileSync("components/MyComponents/PartyConversation.tsx", "utf8");
assert.match(conversation, /source: "inbox"/);
assert.match(conversation, /listSlot=\{<PartyInbox inbox=\{inbox\} selectedId=\{matchId\} \/>\}/);
assert.equal((conversation.match(/headerBadge=\{headerBadge\}/g) || []).length, 2, "event badge on both the inbox and the event-scoped route");
assert.match(fs.readFileSync("app/(private)/conversas/[matchId]/page.tsx", "utf8"), /<PartyConversation source="inbox" matchId=\{params\.matchId\} \/>/);
assert.match(fs.readFileSync("app/eventos/[id]/conexoes/[matchId]/page.tsx", "utf8"), /<PartyConversation eventId=\{params\.id\} matchId=\{params\.matchId\} \/>/, "old route keeps working");
assert.match(fs.readFileSync("components/MyComponents/PartyInbox.tsx", "utf8"), /<PushSettings variant="compact" \/>/, "push invitation on /conversas");
const manifest = fs.readFileSync("app/manifest.ts", "utf8");
assert.match(manifest, /display: "standalone"/); assert.match(manifest, /start_url: "\/"/);
for (const [, src] of manifest.matchAll(/src: "([^"]+)"/g)) assert.ok(fs.existsSync(src === "/icon.svg" ? "app/icon.svg" : "public" + src), `manifest icon exists: ${src}`);
console.log("PASS party inbox client: /conversas links, Match em… badge, event chips + search, unread aria-live, loading/empty/error/offline, header/sidebar/event entry points, manifest icons");
