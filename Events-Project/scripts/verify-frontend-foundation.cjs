// Offline checks for the front-end foundation: global states, landmarks, navigation,
// impersonation polling policy, event page conversion and shared status/header components.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const results = [];
function check(name, fn) {
  try { fn(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}
function loadModule(file, imports = {}) {
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(name => {
    if (name in imports) return imports[name];
    return new Proxy({}, { get: (_, key) => (key === "__esModule" ? false : () => null) });
  }, module, module.exports);
  return module.exports;
}
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(rel, out); }
    else if (/\.tsx$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// 1. Global states.
check("global states exist in pt-BR without leaking error details", () => {
  const notFound = read("app/not-found.tsx");
  assert.match(notFound, /Não encontramos esta página/);
  assert.match(notFound, /robots: \{ index: false \}/);
  const error = read("app/error.tsx");
  assert.match(error, /^"use client";/);
  assert.match(error, /reset\(\)/, "error boundary must call reset");
  assert.doesNotMatch(error, /error\.(message|stack)/, "error details must not be rendered");
  assert.match(error, /Tentar novamente/);
  const globalError = read("app/global-error.tsx");
  assert.match(globalError, /^"use client";/);
  assert.match(globalError, /<html lang="pt-BR">/);
  assert.match(globalError, /<body/);
  assert.doesNotMatch(globalError, /error\.(message|stack)/);
  for (const file of [error, globalError]) assert.match(file, /\/\^\[\\w-\]\{1,64\}\$\/\.test\(error\.digest\)/, "only a sanitized digest may be shown");
});
check("loading skeletons for the heavy routes", () => {
  const routes = ["app/(private)/salvos/loading.tsx", "app/(private)/notificacoes/loading.tsx", "app/(private)/atividade/loading.tsx", "app/(private)/salas/loading.tsx", "app/(private)/myEvents/loading.tsx"];
  for (const file of routes) {
    assert.ok(exists(file), `${file} missing`);
    assert.match(read(file), /route-skeletons/, `${file} must reuse the shared skeletons`);
  }
  // A loading boundary streams the response before the page runs, so notFound() would answer 200.
  // Segments whose pages call notFound() (public event and its community) must stay without loading.tsx.
  for (const file of ["app/eventos/loading.tsx", "app/eventos/[id]/loading.tsx", "app/eventos/[id]/comunidade/loading.tsx"]) assert.ok(!exists(file), `${file} would turn real 404s into 200`);
  for (const file of routes) {
    const dir = path.dirname(path.join(root, file));
    const pages = fs.readdirSync(dir, { recursive: true }).filter(name => /page\.tsx$/.test(name)).map(name => fs.readFileSync(path.join(dir, name), "utf8"));
    assert.ok(pages.every(source => !/\bnotFound\(\)|\bredirect\(/.test(source)), `${file} wraps a page that calls notFound()/redirect()`);
  }
  const skeletons = read("components/ui/route-skeletons.tsx");
  assert.match(skeletons, /role="status"/);
  assert.match(skeletons, /aria-busy="true"/);
  assert.match(skeletons, /motion-reduce:animate-none/);
  assert.doesNotMatch(skeletons, /<main/, "skeletons render inside the layout main");
});
check("community page answers unknown events with notFound()", () => {
  const page = read("app/eventos/[id]/comunidade/page.tsx");
  assert.match(page, /import \{ notFound \} from "next\/navigation"/);
  assert.match(page, /=== false\) notFound\(\)/);
  assert.match(page, /catch \{[\s\S]*return null;/, "database failure must not become a false 404");
});

// 2. Landmarks and skip link.
check("layout renders exactly one main#conteudo after a skip link", () => {
  const providers = read("components/Providers/ClientProviders.tsx");
  assert.equal((providers.match(/<main\b/g) || []).length, 1);
  assert.match(providers, /<main id="conteudo" tabIndex=\{-1\}/);
  const skip = providers.indexOf('href="#conteudo"');
  assert.ok(skip > -1 && skip < providers.indexOf("<AppSidebar"), "skip link must be the first focusable element");
  assert.match(providers, /Pular para o conteúdo/);
  const css = read("components/MyComponents/SiteHeader.module.css");
  assert.match(css, /\.skipLink \{[^}]*transform:translateY/);
  assert.match(css, /\.skipLink:focus,\.skipLink:focus-visible \{ transform:none;/);
  assert.match(css, /\.skipLink \{[^}]*min-height:44px/);
});
// Pages still declaring their own <main>: the coordinator converts them to <div> (see integration notes).
// Remove entries from this list as they are converted; new nested mains outside it fail.
const PENDING_MAIN_CONVERSION = new Set([]);
// Legitimate mains: the layout, documents rendered instead of the layout, and the unused shadcn SidebarInset primitive.
const ALLOWED_MAIN = new Set(["components/Providers/ClientProviders.tsx", "app/global-error.tsx", "components/MyComponents/ImpersonationGuard.tsx", "components/ui/sidebar.tsx"]);
check("no page adds a second main landmark", () => {
  const offenders = [], pending = [];
  for (const file of [...walk("app"), ...walk("components")]) {
    if (!/<main\b/.test(read(file)) || ALLOWED_MAIN.has(file)) continue;
    (PENDING_MAIN_CONVERSION.has(file) ? pending : offenders).push(file);
  }
  assert.deepEqual(offenders, [], "unexpected nested <main>");
  if (pending.length) results.push(`WARN ${pending.length} file(s) still declare <main> pending coordinator conversion`);
  assert.doesNotMatch(read("app/eventos/[id]/page.tsx"), /<main\b/);
  const guard = read("components/MyComponents/ImpersonationGuard.tsx");
  assert.match(guard, /\{!blocked && children\}/, "guard main only replaces the layout");
  assert.match(guard, /<main id="conteudo"/);
  const used = [...walk("app"), ...walk("components")].filter(file => file !== "components/ui/sidebar.tsx" && /SidebarInset/.test(read(file)));
  assert.deepEqual(used, [], "SidebarInset renders a <main> and must not be used inside the layout");
});
check("shared dialog and sheet close labels are pt-BR", () => {
  for (const file of ["components/ui/dialog.tsx", "components/ui/sheet.tsx"]) {
    const source = read(file);
    assert.match(source, /<span className="sr-only">Fechar<\/span>/);
    assert.doesNotMatch(source, /sr-only">Close</);
  }
});

// 3. Impersonation polling.
check("impersonation polling only where the socket cannot help", () => {
  const { impersonationPollInterval } = loadModule("components/MyComponents/ImpersonationGuard.tsx");
  const base = { authenticated: true, blocked: false, impersonating: false, socketConnected: true };
  assert.equal(impersonationPollInterval({ ...base, authenticated: false, blocked: true }), null, "logged-out sessions never poll");
  assert.equal(impersonationPollInterval(base), null, "regular users with a live socket do not poll");
  assert.equal(impersonationPollInterval({ ...base, socketConnected: false }), 60000, "slow fallback without socket");
  assert.equal(impersonationPollInterval({ ...base, impersonating: true }), 15000);
  assert.equal(impersonationPollInterval({ ...base, blocked: true, socketConnected: false }), 5000, "blocked account learns quickly when access returns");
  const guard = read("components/MyComponents/ImpersonationGuard.tsx");
  for (const cleanup of ["request?.abort()", "clearTimeout(timer)", 'removeEventListener("visibilitychange", resume)', 'removeEventListener("focus", resume)']) assert.ok(guard.includes(cleanup), `cleanup missing: ${cleanup}`);
  assert.match(guard, /document\.visibilityState === "visible"/, "hidden tabs stop polling");
  assert.doesNotMatch(guard, /setTimeout\(\(\) => void check\(\), 5000\)/, "the unconditional 5s loop is gone");
  assert.match(read("context/SocketContext.tsx"), /socket\.on\("account-impersonated"/, "socket signal the guard relies on");
});

// 4. Navigation.
check("sidebar: one distinct icon per destination, every route reachable and grouped", () => {
  const source = read("components/ui/app-sidebar.tsx");
  const block = source.slice(source.indexOf("const navigation"), source.indexOf("];", source.indexOf("const navigation")));
  const items = [...block.matchAll(/\{ label: "([^"]+)", href: "([^"]+)", icon: (\w+)([^}]*)\}/g)].map(([, label, href, icon, rest]) => ({ label, href, icon, rest }));
  assert.ok(items.length >= 15, "navigation parsed");
  const icons = items.map(item => item.icon);
  assert.equal(new Set(icons).size, icons.length, `duplicated icons: ${icons.filter((icon, i) => icons.indexOf(icon) !== i)}`);
  const groupPaths = [...source.slice(source.indexOf("const groups")).matchAll(/"(\/[^"]*)"/g)].map(match => match[1]);
  for (const item of items) assert.ok(groupPaths.includes(item.href), `${item.href} is not in any sidebar group`);
  for (const route of ["/atividade", "/salvos", "/notificacoes", "/resultados", "/salas", "/perfil-conexoes", "/admin/reports", "/admin/auditoria", "/para-organizadores"]) assert.ok(items.some(item => item.href === route), `${route} has no nav entry`);
  const pages = [...walk("app")].filter(file => /\/page\.tsx$/.test(file)).map(file => "/" + file.replace(/^app\//, "").replace(/\/?page\.tsx$/, "").split("/").filter(part => !/^\(.*\)$/.test(part)).join("/"));
  for (const item of items) {
    const href = item.href.split("#")[0] || "/";
    assert.ok(pages.includes(href === "/" ? "/" : href), `${item.href} points to a route without page.tsx`);
  }
  const organizers = items.find(item => item.href === "/para-organizadores");
  assert.match(organizers.rest, /roles: \["BASIC"\], guest: true/, "Para organizadores only for guests and BASIC");
  assert.match(source, /if \(!authenticatedUser\) return Boolean\(item\.guest\) && status === "unauthenticated";/);
});
check("header: bell for logged users, organizers link for guests/BASIC, 44px targets", () => {
  const header = read("components/MyComponents/SiteHeader.tsx");
  assert.match(header, /\{authenticated && <NotificationBell \/>\}/);
  assert.match(header, /href="\/para-organizadores"/);
  assert.match(header, /status === "unauthenticated" \|\| \(authenticated && session\?\.user\?\.role === "BASIC"\)/);
  assert.match(header, /className=\{styles\.account\} aria-label="Minha conta"/, "icon-only account link on mobile needs a name");
  assert.doesNotMatch(read("components/Providers/ClientProviders.tsx"), /NotificationBell/, "bell is rendered once, inside the header");
  const bell = read("components/MyComponents/NotificationBell.tsx");
  assert.match(bell, /inline-flex size-11 shrink-0/);
  const css = read("components/MyComponents/SiteHeader.module.css");
  assert.match(css, /\.organizers \{[^}]*min-height:44px/);
  assert.match(css, /\.menu,\.search \{[^}]*width:44px; height:44px/);
});

// 5. Event page conversion.
check("Google Agenda link is computed locally and skips invalid or cancelled events", () => {
  const eventTime = loadModule("lib/eventTime.ts");
  const { googleCalendarLink } = loadModule("lib/googleCalendarLink.ts", { "@/lib/eventTime": eventTime });
  const base = { nome: "Show & Cia", descricao: "Uma noite especial", endereco: "Av. Paulista, 1000", dataInicio: "2026-12-05", dataFim: "2026-12-05", startTime: "20:00", endTime: "23:00", timezone: "America/Sao_Paulo", status: "PUBLISHED" };
  const url = new URL(googleCalendarLink(base, "https://eventmap.example/eventos/abc"));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Show & Cia");
  assert.equal(url.searchParams.get("dates"), "20261205T230000Z/20261206T020000Z");
  assert.equal(url.searchParams.get("location"), "Av. Paulista, 1000");
  assert.match(url.searchParams.get("details"), /Detalhes no EventMap: https:\/\/eventmap\.example\/eventos\/abc/);
  assert.equal(googleCalendarLink({ ...base, status: "CANCELLED" }, "x"), null);
  assert.equal(googleCalendarLink({ ...base, dataFim: "2026-12-04" }, "x"), null);
  assert.equal(googleCalendarLink({ ...base, dataInicio: "invalid" }, "x"), null);
  const long = new URL(googleCalendarLink({ ...base, descricao: "a".repeat(2000) }, "u")).searchParams.get("details");
  assert.ok(long.length < 700, "description is truncated");
});
check("event page: clear facts, calendar links, LGPD notice and mobile CTA reusing actions", () => {
  const page = read("app/eventos/[id]/page.tsx");
  assert.match(page, /aria-label="Data, local e valor"/);
  assert.match(page, /googleCalendarUrl=\{googleCalendarUrl\}/);
  assert.match(page, /priceLabel=\{priceLabel\}/);
  assert.match(page, /EventStatusBadge/);
  assert.doesNotMatch(page, /ParallaxCard/, "decorative parallax removed from the event header");
  // The global footer (ClientProviders) reserves the space of the fixed mobile bar through --event-cta-space.
  assert.doesNotMatch(page, /pb-32/, "page does not double the footer reservation");
  assert.match(page, /showClaim && <ClaimEventCta eventId=\{event\.id\} eventName=\{event\.nome\} \/>/, "claim CTA near the organizer block");
  assert.match(page, /role === "ADMIN" && viewerId !== event\.userId/, "claim only for platform-held events, never for the publisher");
  assert.match(page, /select: \{ role: true \}[\s\S]*catch \{\s*return null;/, "role lookup failure only hides the CTA");
  const actions = read("components/MyComponents/EventPublicActions.tsx");
  assert.match(actions, /registrationPrivacyNotice = "Ao confirmar, seu nome e e-mail ficam visíveis para a organização do evento\."/);
  assert.ok((actions.match(/\{registrationPrivacyNotice\}/g) || []).length >= 2, "notice near both RSVP buttons");
  assert.match(actions, /Adicionar ao calendário \(\.ics\)/);
  assert.match(actions, /\{googleCalendarUrl && <a[^>]*target="_blank" rel="noopener noreferrer"/);
  const sticky = actions.slice(actions.indexOf("const stickyAction"), actions.indexOf("const showStickyBar"));
  assert.match(sticky, /changeRegistration\("POST"\)/, "sticky CTA reuses the existing mutation");
  assert.doesNotMatch(sticky, /fetch\(/, "no duplicated registration request");
  assert.match(sticky, /Entrar na lista de espera/);
  assert.match(sticky, /Comprar ingresso/);
  assert.match(sticky, /registrationOpen && hasExternalTickets/, "no ticket CTA for ended/cancelled events");
  assert.match(actions, /className="fixed inset-x-0 bottom-0 z-30[^"]*xl:hidden"/);
  assert.match(actions, /observer\.disconnect\(\)/, "IntersectionObserver cleanup");
  assert.match(actions, /env\(safe-area-inset-bottom\)/);
  assert.match(actions, /setProperty\("--event-cta-space", "8rem"\)[\s\S]*removeProperty\("--event-cta-space"\)/, "footer reservation follows the sticky bar and is cleaned up");
});

// 5b. Global footer and standalone embed widgets.
check("footer rendered once after main; /embed renders without site chrome", () => {
  const providers = read("components/Providers/ClientProviders.tsx");
  assert.ok(providers.indexOf("<SiteFooter") > providers.indexOf("</main>"), "footer after the main landmark");
  assert.match(providers, /<SiteFooter className="[^"]*pb-\[calc\(1\.5rem\+var\(--event-cta-space,0px\)\)\] xl:pb-6"/);
  const embedReturn = providers.indexOf("if (isEmbedPath(pathname)) return <>{children}</>;");
  assert.ok(embedReturn > -1 && embedReturn < providers.indexOf("<SocketProvider"), "embed returns before socket, session, maps, sidebar, header and footer");
  const { isEmbedPath } = loadModule("components/Providers/ClientProviders.tsx");
  assert.equal(isEmbedPath("/embed/promotores/abc"), true);
  assert.equal(isEmbedPath("/embedded"), false);
  assert.equal(isEmbedPath("/"), false);
  assert.equal(isEmbedPath(null), false);
  // Full-height app views end exactly at the viewport bottom; a footer below them pushes their top under the sticky header.
  const { showsSiteFooter } = loadModule("components/Providers/ClientProviders.tsx");
  assert.equal(typeof showsSiteFooter, "function", "footer visibility is a pure, testable rule");
  for (const fullHeight of ["/", "/eventos/abc/chat"]) assert.equal(showsSiteFooter(fullHeight), false, `${fullHeight} has no footer`);
  for (const page of ["/termos", "/para-organizadores", "/eventos/abc", "/eventos/abc/comunidade", "/resultados", "/eventos/chat-promo"]) assert.equal(showsSiteFooter(page), true, `${page} keeps the footer`);
  assert.match(providers, /showsSiteFooter\(pathname\) && <SiteFooter/);
  const usages = walk("app").concat(walk("components")).filter(file => file !== "components/Providers/ClientProviders.tsx" && file !== "components/MyComponents/SiteFooter.tsx" && /<SiteFooter/.test(read(file)));
  assert.deepEqual(usages, [], "pages must not render a second footer");
  const embedCss = read("app/embed/embed.module.css");
  assert.doesNotMatch(embedCss, /position:\s*fixed/, "embed frame uses normal flow");
});

// 6. Shared components.
check("status badges pair color with icon and text for every status", () => {
  const source = read("components/ui/status-badge.tsx");
  const eventStatuses = ["DRAFT", "PENDING", "CHANGES_REQUESTED", "PUBLISHED", "CANCELLED", "ENDED"];
  const registrationStatuses = ["CONFIRMED", "WAITLISTED", "CHECKED_IN", "CANCELLED"];
  const eventBlock = source.slice(source.indexOf("eventStatusTone"), source.indexOf("};", source.indexOf("eventStatusTone")));
  for (const status of eventStatuses) assert.match(eventBlock, new RegExp(`${status}: \\{ tone: "\\w+", icon: \\w+ \\}`));
  const labelBlock = source.slice(source.indexOf("registrationStatusLabels"), source.indexOf("};", source.indexOf("registrationStatusLabels")));
  const toneBlock = source.slice(source.indexOf("registrationStatusTone:"), source.indexOf("};", source.indexOf("registrationStatusTone:")));
  for (const status of registrationStatuses) { assert.match(labelBlock, new RegExp(`${status}: "[^"]+"`)); assert.match(toneBlock, new RegExp(`${status}: \\{ tone: "\\w+", icon: \\w+ \\}`)); }
  assert.match(source, /\{Icon && <Icon[^>]*aria-hidden="true"/);
  assert.match(source, /<span>\{children\}<\/span>/);
  const features = read("types/features.ts");
  for (const status of eventStatuses) assert.match(features, new RegExp(`${status}: "`), `label for ${status}`);
  const header = read("components/ui/page-header.tsx");
  assert.equal((header.match(/<h1\b/g) || []).length, 1);
  assert.match(header, /actions && <div/);
  assert.match(read("app/not-found.tsx"), /<PageHeader/);
});

for (const line of results) console.log(line);
if (!process.exitCode) console.log("PASS frontend foundation: global states, landmarks, navigation, impersonation polling, event conversion and shared components.");
