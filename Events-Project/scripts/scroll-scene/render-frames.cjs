#!/usr/bin/env node
/*
 * Renderiza a sequência "Do mapa à porta do evento" usada por components/MyComponents/landing/ScrollSequence.tsx.
 * Ferramenta de desenvolvimento: não roda no build nem em produção.
 *
 * Uso:
 *   node scripts/scroll-scene/render-frames.cjs                  # todos os conjuntos (light/dark × desktop/mobile)
 *   node scripts/scroll-scene/render-frames.cjs --only=dark/desktop
 *   node scripts/scroll-scene/render-frames.cjs --preview=0,0.5,1 --out=/tmp/preview   # quadros soltos em PNG
 *
 * Como funciona: abre o Edge headless com --remote-debugging-port, conecta pelo DevTools Protocol (pacote `ws`,
 * já instalado), carrega scripts/scroll-scene/scene.html via file:// e, para cada t, chama window.renderFrame(t)
 * e grava Page.captureScreenshot em WebP. Determinístico: a cena usa semente fixa e cada execução apaga os quadros
 * antigos do conjunto antes de gravar. Saída: public/landing/sequence/<variante>/<tamanho>/frame-###.webp + manifest.json.
 * Variáveis opcionais: EDGE_PATH (caminho do navegador), CDP_PORT (porta, padrão 9333).
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const WebSocket = require("ws");

const root = path.resolve(__dirname, "..", "..");
const SCENE = path.join(__dirname, "scene.html");
const OUT_ROOT = path.join(root, "public", "landing", "sequence");
const EDGE = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = Number(process.env.CDP_PORT || 9333);

// Conjuntos: desktop 16:9 e mobile retrato recomposto. Qualidade calibrada para o orçamento de bytes.
const SETS = [
  { variant: "light", size: "desktop", width: 1600, height: 900, count: 120, quality: 72 },
  { variant: "dark", size: "desktop", width: 1600, height: 900, count: 120, quality: 72 },
  { variant: "light", size: "mobile", width: 810, height: 1080, count: 60, quality: 68 },
  { variant: "dark", size: "mobile", width: 810, height: 1080, count: 60, quality: 68 },
];

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, res => {
    let body = "";
    res.on("data", chunk => { body += chunk; });
    res.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on("error", reject);
});

async function waitForPage(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find(target => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* navegador ainda subindo */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Edge não abriu a porta de depuração a tempo.");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    let id = 0;
    const pending = new Map();
    ws.on("message", data => {
      const message = JSON.parse(data.toString());
      if (message.id && pending.has(message.id)) {
        const { ok, fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message}`));
        else ok(message.result);
      }
    });
    ws.on("open", () => resolve({
      send: (method, params = {}) => new Promise((ok, fail) => {
        id += 1;
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      close: () => ws.close(),
    }));
    ws.on("error", reject);
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Erro na cena: ${result.exceptionDetails.text}`);
  return result.result.value;
}

async function loadScene(cdp, set) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: set.width, height: set.height, deviceScaleFactor: 1, mobile: false });
  const url = `${pathToFileURL(SCENE).href}?variant=${set.variant}&layout=${set.size}&t=0`;
  await cdp.send("Page.navigate", { url });
  for (let i = 0; i < 100; i++) {
    const ready = await evaluate(cdp, "typeof window.sceneReady === 'object' ? window.sceneReady.then(() => true) : false").catch(() => false);
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("A cena não ficou pronta.");
}

async function capture(cdp, set, format, quality) {
  const params = { format, captureBeyondViewport: false, clip: { x: 0, y: 0, width: set.width, height: set.height, scale: 1 } };
  if (format !== "png") params.quality = quality;
  const { data } = await cdp.send("Page.captureScreenshot", params);
  return Buffer.from(data, "base64");
}

async function renderSet(cdp, set) {
  const dir = path.join(OUT_ROOT, set.variant, set.size);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(dir)) if (/^frame-\d+\.webp$|^manifest\.json$/.test(file)) fs.unlinkSync(path.join(dir, file));
  await loadScene(cdp, set);
  let bytes = 0;
  for (let i = 0; i < set.count; i++) {
    const t = set.count === 1 ? 0 : i / (set.count - 1);
    await evaluate(cdp, `window.renderFrame(${t.toFixed(6)})`);
    const buffer = await capture(cdp, set, "webp", set.quality);
    bytes += buffer.length;
    fs.writeFileSync(path.join(dir, `frame-${String(i).padStart(3, "0")}.webp`), buffer);
  }
  const manifest = {
    count: set.count,
    width: set.width,
    height: set.height,
    pattern: "frame-###.webp",
    path: `/landing/sequence/${set.variant}/${set.size}/`,
    bytes,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${set.variant}/${set.size}: ${set.count} quadros ${set.width}×${set.height}, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

async function renderPreview(cdp, times, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const only = args.only ? SETS.filter(set => `${set.variant}/${set.size}` === args.only) : SETS;
  for (const set of only) {
    await loadScene(cdp, set);
    for (const t of times) {
      await evaluate(cdp, `window.renderFrame(${t})`);
      const file = path.join(outDir, `${set.variant}-${set.size}-${t}.png`);
      fs.writeFileSync(file, await capture(cdp, set, "png"));
      console.log(file);
    }
  }
}

async function main() {
  if (!fs.existsSync(EDGE)) throw new Error(`Navegador não encontrado em ${EDGE}. Defina EDGE_PATH.`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "scroll-scene-"));
  const browser = spawn(EDGE, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--allow-file-access-from-files",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });
  let cdp;
  try {
    cdp = await connect(await waitForPage());
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    if (args.preview) {
      await renderPreview(cdp, args.preview.split(",").map(Number), path.resolve(args.out || path.join(os.tmpdir(), "scroll-scene-preview")));
    } else {
      const sets = args.only ? SETS.filter(set => `${set.variant}/${set.size}` === args.only) : SETS;
      if (!sets.length) throw new Error(`Conjunto desconhecido: ${args.only}`);
      for (const set of sets) await renderSet(cdp, set);
    }
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    await new Promise(resolve => setTimeout(resolve, 400));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* perfil ainda travado pelo navegador */ }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
