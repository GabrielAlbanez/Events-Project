// Offline static checks for the /conheca landing page: SEO kept in the server page, reduced-motion handling,
// accessible interactive controls, CTAs pointing to existing routes and no network/API calls. No database, network or server.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => value.replace(/\s+/g, " ");
const match = (source, pattern, message) => assert.ok(pattern.test(source), message ? `${message} (${pattern})` : `missing ${pattern}`);
const noMatch = (source, pattern, message) => assert.ok(!pattern.test(source), message ? `${message} (${pattern})` : `unexpected ${pattern}`);

const LANDING_DIR = "components/MyComponents/landing";
const PAGE = "app/conheca/page.tsx";
// ProductDemo is the older scripted demo; it is no longer rendered by /conheca.
const landingFiles = fs.readdirSync(path.join(root, LANDING_DIR))
  .filter(file => /\.(tsx|ts)$/.test(file) && !file.startsWith("ProductDemo"))
  .map(file => `${LANDING_DIR}/${file}`);
const sources = Object.fromEntries([...landingFiles, PAGE].map(file => [file, read(file)]));
const landing = (name) => sources[`${LANDING_DIR}/${name}`];

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("page stays a server component and keeps metadata, canonical and Open Graph", () => {
  const page = sources[PAGE];
  noMatch(page, /^\s*["']use client["']/m, "page.tsx must not be a client component");
  match(page, /export function generateMetadata\(\): Metadata/);
  match(page, /alternates: \{ canonical: "\/conheca" \}/);
  match(page, /openGraph: \{/);
  match(page, /twitter: \{ card: "summary_large_image"/);
  match(page, /robots: \{ index: true, follow: true \}/);
});

check("page keeps JSON-LD for the app and for the FAQ built from FAQ_ITEMS", () => {
  const page = plain(sources[PAGE]);
  match(page, /"@type": "SoftwareApplication"/);
  match(page, /"@type": "FAQPage"/);
  match(page, /mainEntity: FAQ_ITEMS\.map\(/);
  const scripts = page.match(/<script type="application\/ld\+json" dangerouslySetInnerHTML=\{jsonLd\(/g) || [];
  assert.equal(scripts.length, 2, "two JSON-LD scripts");
  match(page, /replace\(\/<\/g, "\\\\u003c"\)/, "JSON-LD escapes < to avoid breaking out of the script tag");
  match(page, /import \{ FAQ_ITEMS, FaqSection, FinalCta \} from "@\/components\/MyComponents\/landing\/LandingClosing"/);
});

check("FAQ items are complete and the FAQ section renders native details", () => {
  const closing = landing("LandingClosing.tsx");
  match(closing, /export const FAQ_ITEMS = \[/);
  const questions = closing.match(/question: "/g) || [];
  const answers = closing.match(/answer: "/g) || [];
  assert.ok(questions.length >= 5, "at least five FAQ questions");
  assert.equal(questions.length, answers.length, "every question has an answer");
  match(closing, /<details key=\{item\.question\}/);
});

check("page renders every chapter and the interactive experiences", () => {
  const page = sources[PAGE];
  for (const component of ["ScrollProgress", "LandingHero", "LiveAgenda", "ScrollSequence", "MapPlayground", "PhoneJourney", "ShowcaseDepth", "AudienceSwitch", "FaqSection", "FinalCta"]) {
    match(page, new RegExp(`<${component}\\b`), `${component} rendered`);
  }
  for (const id of ["descobrir", "participar", "por-dentro", "organizar"]) match(page, new RegExp(`id="${id}"`), `chapter #${id}`);
  noMatch(page, /ProductDemo/, "the old scripted demo is not rendered");
});

check("reduced motion disables parallax and scroll-scrub while content stays visible", () => {
  const motion = landing("useLandingMotion.ts");
  match(motion, /prefers-reduced-motion: no-preference/, "motion only turns on after checking the preference");
  match(motion, /useState\(false\)/, "motion starts disabled on the server and first paint");
  match(motion, /removeEventListener\("scroll", schedule\)/, "scroll listener is cleaned up");
  match(motion, /cancelAnimationFrame/, "pending frame is cancelled");
  const hero = landing("LandingHero.tsx");
  match(hero, /useMotionAllowed\(\)/);
  match(hero, /enabled: motionAllowed/, "scroll depth gated by the preference");
  match(hero, /if \(!section \|\| !stage \|\| !motionAllowed \|\| !finePointer\) return;/, "pointer depth gated by preference and fine pointer");
  match(hero, /removeEventListener\("pointermove", onMove\)/);
  const showcase = landing("ShowcaseDepth.tsx");
  match(showcase, /const enabled = motionAllowed && wide;/);
  match(showcase, /removeProperty\("transform"\)/, "inline transforms are cleared when the effect turns off");
  for (const css of ["Landing.module.css", "Playground.module.css"]) {
    match(read(`${LANDING_DIR}/${css}`), /@media \(prefers-reduced-motion: reduce\)/, `${css} has a reduced-motion block`);
  }
  const landingCss = read(`${LANDING_DIR}/Landing.module.css`);
  match(landingCss, /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*@supports \(animation-timeline: view\(\)\)/, "scroll reveals are opt-in CSS only");
  for (const file of ["MapPlayground.tsx", "PhoneJourney.tsx", "AudienceSwitch.tsx"]) {
    match(landing(file), /<MotionConfig reducedMotion="user"/, `${file} respects reduced motion in framer-motion`);
    match(landing(file), /<AnimatePresence initial=\{false\}/, `${file} renders the server state without an entrance animation`);
  }
});

check("interactive controls expose state with ARIA", () => {
  const map = landing("MapPlayground.tsx");
  assert.ok((map.match(/aria-pressed=\{/g) || []).length >= 4, "map chips, distance, day, pins and cards use aria-pressed");
  match(map, /aria-live="polite"/, "result count is announced");
  match(map, /<fieldset className=\{styles\.filterGroup\}>\s*<legend>/, "filter groups are labelled");
  match(map, /aria-label=\{`\$\{event\.name\}, \$\{event\.category\}/, "pins have accessible names");
  const phone = landing("PhoneJourney.tsx");
  match(phone, /role="tablist"/);
  match(phone, /role="tab"/);
  match(phone, /aria-selected=\{step === index\}/);
  match(phone, /role="tabpanel"/);
  match(phone, /onKeyDown=\{event => onTabKey\(event, index\)\}/, "arrow keys move between tabs");
  match(phone, /aria-current=\{step === index \? "step" : undefined\}/);
  match(phone, /aria-live="polite"/);
  const audience = landing("AudienceSwitch.tsx");
  match(audience, /aria-label="Ver o EventMap como"/);
  match(audience, /aria-selected=\{audience === value\}/);
  match(audience, /aria-selected=\{tool === item\.id\}/);
  match(audience, /role="switch" aria-checked=\{featured\}/);
  match(audience, /aria-label=\{`Aprovar \$\{request\.name\}`\}/);
  match(audience, /aria-label="Evento em destaque patrocinado"/, "paid highlight keeps the sponsored label");
});

check("focus is visible and touch targets reach 44px", () => {
  const css = read(`${LANDING_DIR}/Playground.module.css`);
  match(css, /:is\(button, a\):focus-visible \{\s*outline: 2px solid/);
  match(read(`${LANDING_DIR}/Landing.module.css`), /\.btn:focus-visible,/);
  for (const selector of [".chip", ".pin", ".phoneBtn", ".couponBtn", ".iconBtnOk", ".statusChip", ".phoneNext", ".smallBtn"]) {
    const escaped = selector.replace(".", "\\.");
    match(css, new RegExp(`${escaped}[^{]*\\{[^}]*(min-height|height): (4[4-9]|[5-9]\\d)px`), `${selector} is at least 44px tall`);
  }
});

check("CTAs and anchors point to routes and sections that exist", () => {
  const pages = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name === "page.tsx") {
        const route = rel.replace(/^app/, "").replace(/\/page\.tsx$/, "").split("/").filter(part => part && !/^\(.*\)$/.test(part)).join("/");
        pages.add(`/${route}`);
      }
    }
  };
  walk("app");
  const all = Object.values(sources).join("\n");
  const hrefs = [...all.matchAll(/href="([^"]+)"/g)].map(found => found[1]);
  assert.ok(hrefs.length > 0, "found CTAs");
  const ids = new Set([...all.matchAll(/\bid="([^"]+)"/g)].map(found => found[1]));
  for (const href of hrefs) {
    if (href.startsWith("#")) assert.ok(ids.has(href.slice(1)), `anchor ${href} has a target`);
    else {
      assert.ok(href.startsWith("/"), `internal link ${href}`);
      assert.ok(pages.has(href.split(/[?#]/)[0]), `route ${href} exists under app/`);
    }
  }
  for (const route of ["/", "/para-organizadores", "/register"]) assert.ok(hrefs.includes(route), `links to ${route}`);
});

check("landing components make no network, API, auth or database calls", () => {
  for (const [file, source] of Object.entries(sources)) {
    noMatch(source, /\bfetch\(|axios|XMLHttpRequest|WebSocket|socket\.io|EventSource/, `${file} has no network calls`);
    noMatch(source, /["'`]\/api\//, `${file} does not call API routes`);
    noMatch(source, /["']use server["']|\(actions\)|@\/lib\/prisma|next-auth|useSession/, `${file} does not touch actions, auth or the database`);
  }
});

check("client boundary only where interactivity needs it", () => {
  const serverOnly = ["LandingChapter.tsx", "LandingClosing.tsx", "DemoQr.tsx", "DeviceFrames.tsx", "landingData.ts"];
  for (const file of serverOnly) noMatch(landing(file), /^\s*["']use client["']/m, `${file} stays server-compatible`);
  for (const [file, source] of Object.entries(sources)) {
    if (/\buse(State|Effect|Ref|Callback|Memo|Id)\b\(|framer-motion/.test(source)) match(source, /^["']use client["'];/, `${file} uses hooks or framer-motion and must be a client component`);
  }
});

check("images use next/image with alt text and sizes", () => {
  for (const [file, source] of Object.entries(sources)) {
    noMatch(source, /<img\b/, `${file} uses next/image`);
    const images = source.match(/<Image\b[\s\S]*?\/>/g) || [];
    for (const image of images) {
      match(image, /\balt=/, `${file}: every Image has alt`);
      match(image, /\bsizes=/, `${file}: every Image declares sizes`);
    }
  }
  const showcase = landing("ShowcaseDepth.tsx");
  match(showcase, /loading="lazy"/, "below-the-fold screenshots are lazy");
  for (const shot of ["descoberta-mapa.jpg", "evento-detalhes.jpg", "evento-celular.jpg", "painel-resultados.jpg"]) {
    match(showcase, new RegExp(shot.replace(".", "\\.")), `uses public/landing/${shot}`);
    assert.ok(fs.existsSync(path.join(root, "public/landing", shot)), `public/landing/${shot} exists`);
  }
  const referenced = [...Object.values(sources).join("\n").matchAll(/"(\/branding\/[^"]+\.webp)"/g)].map(found => found[1]);
  for (const asset of new Set(referenced)) assert.ok(fs.existsSync(path.join(root, "public", asset)), `public${asset} exists`);
});

check("copy stays truthful: demo data is labelled and no invented user counts", () => {
  const all = plain(Object.values(sources).join("\n"));
  match(all, /dados fictícios|eventos fictícios|dados de demonstração/i);
  match(landing("AudienceSwitch.tsx"), /Prévia interativa · dados de demonstração/);
  noMatch(all, /\b\d[\d.]*\s*(mil\s+)?(usuários|usuárias|pessoas usam|downloads)\b/i, "no unbacked user numbers");
  match(all, /Mercado Pago/);
  match(all, /lista de espera/);
});

check("no purple generated artwork: real banners or a neutral tile", () => {
  for (const [file, source] of Object.entries(sources)) {
    noMatch(source, /\/branding\/posters|home-(jazz|live|sunset)-v1|login-(night|city)/, `${file} does not use generated artwork`);
  }
  const image = landing("LandingEventImage.tsx");
  match(image, /unoptimized=\{\/\^https\?:\\\/\\\/\/i\.test\(src\)\}/, "remote banners are not optimized, like HomeEventImage");
  match(image, /onError=\{\(\) => setFailed\(src\)\}/, "broken banners fall back");
  match(image, /className=\{styles\.imageTile\}/, "neutral tile without a banner");
  const data = landing("landingData.ts");
  match(data, /export function safeImageUrl\(/);
  match(data, /!url\.username && !url\.password/, "credentials in banner URLs are rejected");
});

check("page loads the real catalog with cache, timeout and fallback", () => {
  const page = plain(sources[PAGE]);
  match(page, /import \{ listPublicCatalog \} from "@\/lib\/eventQueries"/);
  match(page, /unstable_cache\(/, "catalog summary is cached");
  match(page, /\{ revalidate: CATALOG_REVALIDATE_SECONDS \}/);
  match(page, /const CATALOG_REVALIDATE_SECONDS = 600;/);
  match(page, /Promise\.race\(\[ loadCatalogSummary\(\), new Promise<null>/, "timeout race");
  match(page, /const CATALOG_TIMEOUT_MS = 2500;/);
  match(page, /catch \{[^}]*return null;/, "database errors fall back to example content");
  match(page, /clearTimeout\(timer\)/);
  match(page, /const catalog = buildLandingCatalog\(await loadLandingSummary\(\)\);/);
  noMatch(sources[PAGE], /^export const revalidate/m, "revalidate export would be ignored on this dynamic route");
  for (const component of ["LandingHero", "MapPlayground", "PhoneJourney"]) match(page, new RegExp(`<${component} events=\\{catalog\\.events\\} real=\\{catalog\\.real\\}`), `${component} receives real events`);
  match(page, /<LiveAgenda catalog=\{catalog\} \/>/);
});

check("catalog summary: only upcoming validated events, real figures, fallback hides figures", () => {
  const ts = require("typescript");
  const output = ts.transpileModule(landing("landingData.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", output)(mod, mod.exports, require);
  const { summarizeCatalog, buildLandingCatalog } = mod.exports;
  const base = { banner: "https://img.example.com/a.jpg", category: "Música", startTime: "21:00", endereco: "Rua A, 1", isFree: false, priceCents: 5000, validate: true, status: "PUBLISHED" };
  const now = new Date("2026-11-22T15:00:00Z");
  const rows = [
    { ...base, id: "hoje", nome: "Hoje", dataInicio: "2026-11-22", dataFim: "2026-11-22", isFree: true },
    { ...base, id: "semana", nome: "Semana", dataInicio: "2026-11-27", dataFim: "2026-11-27", category: "Teatro" },
    { ...base, id: "longe", nome: "Longe", dataInicio: "2027-01-10", dataFim: "2027-01-10" },
    { ...base, id: "passado", nome: "Passado", dataInicio: "2026-11-01", dataFim: "2026-11-02" },
    { ...base, id: "cancelado", nome: "Cancelado", dataInicio: "2026-11-23", dataFim: "2026-11-23", status: "CANCELLED" },
    { ...base, id: "pendente", nome: "Pendente", dataInicio: "2026-11-23", dataFim: "2026-11-23", validate: false },
    { ...base, id: "credencial", nome: "Sem banner", dataInicio: "2026-11-24", dataFim: "2026-11-24", banner: "https://u:p@x.com/a.jpg" },
  ];
  const summary = summarizeCatalog(rows, now);
  assert.deepEqual(summary.picks.map(row => row.id), ["hoje", "semana", "longe"], "only upcoming, validated, non-cancelled events with a usable banner");
  assert.deepEqual(summary.figures, { today: 1, nextWeek: 3, categories: 2, free: 1 });
  const catalog = buildLandingCatalog(summary);
  assert.equal(catalog.real, true);
  assert.equal(catalog.events[0].href, "/eventos/hoje", "real events link to their page");
  assert.equal(catalog.events[0].priceLabel, "Gratuito");
  const fallback = buildLandingCatalog(null);
  assert.equal(fallback.real, false);
  assert.ok(fallback.events.length >= 3 && fallback.events.every(event => event.href === null && event.image === null), "fallback has no fake links or photos");
  assert.deepEqual(fallback.figures, { today: 0, nextWeek: 0, categories: 0, free: 0 }, "no figures without real data");
  assert.equal(buildLandingCatalog({ picks: [], figures: summary.figures }).real, false, "empty catalog falls back");
});

check("live agenda: figures only above zero, pausable marquee, reduced motion, links to events", () => {
  const live = landing("LiveAgenda.tsx");
  match(live, /if \(!catalog\.real\) return null;/, "hidden without the real catalog");
  match(live, /FIGURES\.filter\(figure => catalog\.figures\[figure\.key\] >= figure\.min\)/, "figures shown only from their minimum");
  const mins = [...live.matchAll(/min: (\d+) \}/g)].map(found => Number(found[1]));
  assert.equal(mins.length, 4, "every figure declares a minimum");
  assert.ok(mins.every(min => min >= 1), "a figure is never shown at zero");
  match(live, /const loop = events\.length >= MIN_LOOP;/, "few events stay static instead of looping repeats");
  match(live, /\{loop && <button type="button" className=\{styles\.marqueeToggle\} aria-pressed=\{userPaused\}/, "pause control whenever the strip moves");
  match(live, /\{loop && <ul className=\{cn\(styles\.marqueeList, styles\.marqueeClone\)\} aria-hidden="true">/, "loop copy only when looping");
  match(live, /visibilitychange/, "pauses when the tab is hidden");
  match(live, /aria-hidden="true">\s*\{events\.map\(event => <li key=\{event\.id\}><AgendaCard event=\{event\} hidden \/>/, "duplicate loop copy is hidden from assistive tech");
  match(live, /tabIndex=\{hidden \? -1 : undefined\}/);
  match(live, /useMotionAllowed\(\)/, "counter respects reduced motion");
  const css = read(`${LANDING_DIR}/Playground.module.css`);
  match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.marqueeTrack \{\s*animation: landingMarquee/, "marquee only animates with motion allowed");
  match(css, /\.marquee:focus-within \.marqueeTrack/, "pauses on keyboard focus");
  match(css, /\.marquee\[data-paused="true"\] \.marqueeTrack/);
  match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.marquee \{\s*overflow-x: auto;/, "static scrollable list under reduced motion");
  const data = landing("landingData.ts");
  match(data, /href: `\/eventos\/\$\{encodeURIComponent\(row\.id\)\}`/);
  assert.ok(fs.existsSync(path.join(root, "app/eventos/[id]/page.tsx")), "/eventos/[id] route exists");
});

check("hero carousel rotates real events with pause, drag and reduced-motion gating", () => {
  const hero = landing("LandingHero.tsx");
  match(hero, /const autoplay = motionAllowed && !userPaused && !held && count > 1;/);
  match(hero, /document\.visibilityState === "visible"/);
  match(hero, /drag=\{count > 1 \? "x" : false\}/);
  match(hero, /aria-roledescription="carrossel"/);
  match(hero, /aria-live=\{autoplay \? "off" : "polite"\}/, "announces only when not auto-rotating");
  match(hero, /aria-label="Próximo evento"/);
  match(hero, /if \(dragged\.current\) event\.preventDefault\(\);/, "a drag does not open the event");
  const map = landing("MapPlayground.tsx");
  match(map, /categoriesOf\(pins\)/, "category chips come from the events shown");
  match(map, /Mapa e distâncias ilustrativos · eventos reais da agenda/);
  const phone = landing("PhoneJourney.tsx");
  match(phone, /events\.find\(item => !item\.isFree && item\.priceCents > 0\) \?\? events\[0\]/, "phone uses a real event, preferring a real price");
});

check("theme: stage surfaces follow light and dark tokens", () => {
  const css = read(`${LANDING_DIR}/Landing.module.css`);
  const page = css.match(/\n\.page \{[\s\S]*?\n\}/)[0];
  match(page, /--stage: 220 45% 97%;/, "light stage by default");
  match(page, /--on-stage: var\(--foreground\);/);
  match(css, /:global\(\.dark\) \.page \{[\s\S]*?--stage: 230 35% 7%;/, "night stage only in dark theme");
  for (const selector of [".hero", ".chapterStage", ".final"]) {
    const block = css.match(new RegExp(`\\n\\${selector} \\{[\\s\\S]*?\\n\\}`));
    assert.ok(block, `${selector} block`);
    noMatch(block[0], /hsl\(\d/, `${selector} uses theme tokens, not fixed colors`);
    match(block[0], /hsl\(var\(--stage\)\)|hsl\(var\(--stage\)\) 0%/, `${selector} paints the themed stage`);
  }
  noMatch(css, /--night|Night\b/, "no leftover always-dark tokens");
});

check("scroll sequence: frame sets exist, match their manifests and stay under budget", () => {
  // Orçamento por variante (o visitante baixa um só conjunto): desktop 1600×900, desktop-hd 2560×1440 (telas grandes/retina), mobile retrato.
  const budgets = { desktop: 5 * 1024 * 1024, "desktop-hd": 9 * 1024 * 1024, mobile: 2.5 * 1024 * 1024 };
  const counts = {};
  for (const variant of ["light", "dark"]) {
    for (const size of ["desktop", "desktop-hd", "mobile"]) {
      const dir = path.join(root, "public/landing/sequence", variant, size);
      const manifestFile = path.join(dir, "manifest.json");
      assert.ok(fs.existsSync(manifestFile), `${variant}/${size}/manifest.json exists`);
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      const frames = fs.readdirSync(dir).filter(file => /^frame-\d{3}\.webp$/.test(file)).sort();
      assert.equal(frames.length, manifest.count, `${variant}/${size}: frame count matches the manifest`);
      frames.forEach((file, index) => assert.equal(file, `frame-${String(index).padStart(3, "0")}.webp`, `${variant}/${size}: frames are sequential`));
      assert.equal(manifest.path, `/landing/sequence/${variant}/${size}/`, `${variant}/${size}: manifest path`);
      if (size === "mobile") assert.ok(manifest.height > manifest.width && manifest.width >= 1000 && manifest.count >= 60, "mobile set is portrait, sharp on DPR 2–3 phones");
      else assert.ok(manifest.width > manifest.height && manifest.count >= 100, "desktop sets are landscape with ~120 frames");
      if (size === "desktop-hd") assert.ok(manifest.width >= 2400, "HD set is at least 2400px wide");
      counts[size] = counts[size] ?? manifest.count;
      assert.equal(manifest.count, counts[size], `${size}: same frame count in both themes`);
      const bytes = frames.reduce((sum, file) => sum + fs.statSync(path.join(dir, file)).size, 0);
      assert.ok(bytes <= budgets[size], `${variant}/${size}: ${(bytes / 1048576).toFixed(2)} MB within budget`);
      const head = fs.readFileSync(path.join(dir, frames[0])).subarray(0, 12).toString("latin1");
      assert.ok(head.startsWith("RIFF") && head.endsWith("WEBP"), `${variant}/${size}: frames are WebP`);
    }
  }
  assert.equal(counts.desktop, counts["desktop-hd"], "desktop and HD share the same frames (and card geometry)");
  for (const layout of ["desktop", "mobile"]) {
    const geometry = JSON.parse(read(`public/landing/sequence/card-${layout}.json`));
    assert.equal(geometry.frames.length, counts[layout], `card-${layout}.json has one entry per frame`);
    const final = geometry.frames[geometry.frames.length - 1];
    assert.ok(final && final[5] === 1 && final[4] === 0 && final[7] === 1, `card-${layout}: final frame is the open ticket`);
    assert.ok(geometry.card.w > 0 && geometry.card.h > 0, `card-${layout}: card box`);
  }
  const scene = read("scripts/scroll-scene/scene.html") + read("scripts/scroll-scene/scene.js");
  noMatch(scene, /(src|href)=["']https?:|import\s.*https?:/, "authoring scene loads nothing from a CDN");
  match(scene, /window\.renderFrame = function/);
  match(scene, /const GENERIC = params\.get\("mode"\) === "generic";/, "frames carry an empty card surface; content is DOM");
  match(scene, /ctx\.setTransform\(SS, 0, 0, SS, 0, 0\)/, "scene is supersampled for crisp edges");
  match(scene, /window\.__card = \{/, "scene exports the card geometry it draws");
  const render = read("scripts/scroll-scene/render-frames.cjs");
  match(render, /Page\.captureScreenshot/);
  match(render, /require\("ws"\)/, "drives Edge over the DevTools Protocol with ws");
  match(render, /"webp"/);
  match(render, /manifest\.json/);
  match(render, /card-\$\{set\.layout\}\.json/);
});

check("scroll sequence: eased progress, cross-fade, lazy preload, reduced motion, captions and cleanup", () => {
  const seq = landing("ScrollSequence.tsx");
  const css = read(`${LANDING_DIR}/ScrollSequence.module.css`);
  match(sources[PAGE], /<LiveAgenda catalog=\{catalog\} \/>\s*<ScrollSequence featured=\{featured\} \/>/, "placed right after the hero and live agenda");
  for (const set of ["light/desktop", "light/desktop-hd", "light/mobile", "dark/desktop", "dark/desktop-hd", "dark/mobile"]) match(seq, new RegExp(`from "@/public/landing/sequence/${set}/manifest\\.json"`), `imports the ${set} manifest`);
  match(seq, /useTheme\(\)/, "follows the next-themes theme");
  match(seq, /useMediaQuery\("\(orientation: portrait\)"\)/, "picks the portrait set on phones");
  match(seq, /stage\.clientWidth \* Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\) > HD_MIN_PIXELS/, "HD set chosen by real pixel width");
  // Lazy preload only near the viewport, in the scroll container.
  match(seq, /new IntersectionObserver\(/);
  match(seq, /root: getScrollParent\(section\)/);
  match(seq, /start\(\);\s*intersection\.disconnect\(\);/, "preload starts from the observer and only once");
  match(seq, /index === 0 && typeof image\.decode === "function"/, "only the first frame is force-decoded (memory-safe)");
  const ts = require("typescript");
  const load = (name, signature) => {
    const source = seq.match(new RegExp(`export function ${name}\\(${signature}[\\s\\S]*?\\n\\}`))[0];
    const js = ts.transpileModule(source.replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2019 } }).outputText;
    return new Function("OMEGA", `${js}; return ${name};`)(9);
  };
  const preloadOrder = load("preloadOrder", "count");
  const order = preloadOrder(120);
  assert.equal(order.length, 120, "every frame is scheduled");
  assert.equal(new Set(order).size, 120, "no frame twice");
  assert.deepEqual(order.slice(0, 4), [0, 119, 8, 16], "first frame, last frame, then every 8th");
  // Eased progress: critically damped spring, frame-rate independent, no overshoot, settles.
  const springStep = load("springStep", "offset");
  const run = (dt, seconds) => {
    let offset = 1, velocity = 0, min = 1;
    for (let t = 0; t < seconds; t += dt) { [offset, velocity] = springStep(offset, velocity, dt); min = Math.min(min, offset); }
    return { offset, min };
  };
  const at60 = run(1 / 60, 0.5), at144 = run(1 / 144, 0.5), at30 = run(1 / 30, 0.5);
  assert.ok(Math.abs(at60.offset - at144.offset) < 0.01 && Math.abs(at60.offset - at30.offset) < 0.01, "same motion at 30, 60 and 144 Hz");
  assert.ok(at60.min >= 0, "critically damped: never overshoots the scroll position");
  assert.ok(run(1 / 60, 1.5).offset < 0.001, "settles");
  match(seq, /if \(settled\) \{\s*shown = target;\s*velocity = 0;/, "snaps exactly to the target when settled");
  match(seq, /if \(!settled && !cancelled\) loop = window\.requestAnimationFrame\(tick\);/, "the rAF loop stops when settled");
  // Sub-frame interpolation: draws floor(i) and cross-fades ceil(i) by the fraction.
  match(seq, /const i0 = Math\.floor\(index\);\s*const i1 = Math\.min\(set\.count - 1, i0 \+ 1\);/);
  match(seq, /cover\(first, 1\);[\s\S]*?if \(second && f\) cover\(second, Number\(f\)\);/, "cross-fade between neighbouring frames");
  match(seq, /const nearest = nearestLoaded\(Math\.round\(index\)\);/, "falls back to the nearest loaded frame");
  match(seq, /if \(key === drawnKey\) return;/, "draws only when the blend changes");
  match(seq, /context\.imageSmoothingQuality = "high";/);
  match(seq, /Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\)/);
  match(seq, /Math\.max\(width \/ set\.width, height \/ set\.height\)/, "cover fit");
  // Captions, bar and card follow the eased progress, writing to the DOM only on change.
  match(seq, /drawFrames\(shown\);\s*renderUi\(shown\);/);
  match(seq, /if \(bar !== barValue && barRef\.current\)/);
  match(seq, /if \(cardValues\[k\] !== text\)/);
  // Accessibility.
  match(seq, /<canvas ref=\{canvasRef\}[^>]*aria-hidden="true"/, "canvas is hidden from assistive tech");
  match(seq, /className=\{styles\.media\} aria-hidden="true"/);
  noMatch(seq, /aria-live="(polite|assertive)"/, "captions do not announce on every scroll step");
  for (const title of ["Encontre no mapa", "Abra o evento", "Garanta o lugar", "Entre com o QR"]) match(seq, new RegExp(`title: "${title}"`), `caption "${title}"`);
  match(seq, /<ol ref=\{listRef\} className=\{styles\.steps\}>/, "captions are a real ordered list");
  match(seq, /item\.setAttribute\("aria-current", "step"\)/, "the active caption is marked as the current step");
  noMatch(seq, /useState\(0\)|setStep\(/, "scroll does not re-render React: captions are updated on the DOM");
  match(seq, /<h2 id="mapa-porta-titulo"/);
  // Reduced motion: no scrubbing, static final frame with the static ticket, no tall section.
  match(seq, /if \(!motionAllowed \|\| !section \|\| !canvas \|\| !context\) return;/, "no loading or drawing without motion");
  match(seq, /enabled: motionAllowed && !failed, mode: "sticky"/);
  match(seq, /if \(!card \|\| \(motionAllowed && !failed\)\) return;\s*finalCard\(/, "reduced motion or failure pins the card to the final ticket");
  match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.sequence \{\s*height: 280vh;/, "tall scroll track only with motion allowed");
  const reduced = (css.match(/\n@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}\r?\n/) || [""])[0];
  match(reduced, /\.canvas \{\s*display: none;/, "reduced motion hides the canvas");
  match(reduced, /\.poster\[data-kind="start"\] \{\s*display: none !important;/, "reduced motion shows the final frame");
  match(reduced, /\.sticky \{\s*height: auto;/, "reduced motion lets the band grow instead of clipping the steps");
  // Errors and cleanup.
  match(seq, /image\.onerror = \(\) => \{[\s\S]*?setFailed\(true\);/, "load errors fall back");
  match(seq, /data-poster=\{failed \? "end" : "start"\}/, "failure shows the static final frame");
  match(seq, /intersection\.disconnect\(\);\s*resizeObserver\.disconnect\(\);\s*window\.cancelAnimationFrame\(loop\);/, "observers and loop are cleaned up");
  match(seq, /image\.onload = null;/, "pending loads are cancelled");
  noMatch(seq, /<img\b/, "poster uses next/image");
});

check("scroll sequence: real featured event over the card, generic fallback without one", () => {
  const seq = landing("ScrollSequence.tsx");
  const css = read(`${LANDING_DIR}/ScrollSequence.module.css`);
  const page = plain(sources[PAGE]);
  match(page, /const featuredSource = catalog\.real \? catalog\.events\.find\(event => event\.href && event\.image\) \?\? null : null;/, "featured = soonest real event with a usable banner; none without the real catalog");
  match(page, /const featured = featuredSource\?\.href \? \{ id: featuredSource\.id, href: featuredSource\.href, name:/, "only a minimal serializable prop crosses to the client");
  match(seq, /export function ScrollSequence\(\{ featured \}: \{ featured: FeaturedEvent \| null \}\)/);
  match(seq, /<Link ref=\{setCardRef\} href=\{featured\.href\} className=\{styles\.liveCard\}[^>]*aria-label=\{cardLabel\}>/, "the card links to the event page with an accessible name");
  match(landing("landingData.ts"), /href: `\/eventos\/\$\{encodeURIComponent\(row\.id\)\}`/, "featured href points to /eventos/<id>");
  match(seq, /<LandingEventImage src=\{event\.image\}/, "real banner through the safe image component with fallback");
  for (const field of ["event.name", "event.dateLabel", "event.place", "event.priceLabel", "event.category"]) match(seq, new RegExp(`\\{${field.replace(".", "\\.")}\\}`), `shows ${field}`);
  match(seq, /QR Code ilustrativo/, "the QR is labelled as illustrative");
  const cardVars = seq.match(/const CARD_VARS = \[([^\]]+)\]/)[1].match(/--[\w-]+/g);
  const globals = new Set([...read("app/globals.css").matchAll(/(--[\w-]+):/g)].map(found => found[1]));
  for (const name of cardVars) assert.ok(!globals.has(name), `card variable ${name} does not shadow a global theme token`);
  match(seq, /<div ref=\{setCardRef\} className=\{styles\.liveCard\} style=\{cardStyle\(layout\)\} aria-hidden="true">\s*<GenericCardContent \/>/, "without an event: the generic card, decorative only");
  match(seq, /const visibility = values\[5\] < 0\.02 \? "hidden" : "";/, "an invisible card is not focusable");
  // Alignment: frame box mirrors the canvas cover fit; the card is driven by transform/opacity only.
  match(css, /\.frameBox \{[\s\S]*?width: max\(100cqw, calc\(100cqh \/ var\(--ar\)\)\);/);
  const liveCard = css.match(/\n\.liveCard \{[\s\S]*?\n\}/)[0];
  match(liveCard, /transform: translate\(calc\(var\(--x\) \* 100cqw - 50%\), calc\(var\(--y\) \* var\(--ar\) \* 100cqw - 50%\)\) scale\(var\(--sx\), var\(--sy\)\);/);
  noMatch(liveCard, /\b(left|top|width|height): calc\(var\(--(x|y|sx|sy)\)/, "per-frame values never touch layout properties");
  match(css, /\.liveCard\[data-driven="true"\] \{\s*opacity: var\(--a\);/);
});

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}\n  ${error.message}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} conheca landing checks passed`);
if (failed) process.exit(1);
