/*
 * Cena procedural "Do mapa à porta do evento" (canvas 2D com projeção em perspectiva própria).
 * Um único movimento de câmera contínuo: plana sobre a cidade, mergulha até um pin, o pin se abre num
 * cartão de evento genérico e o cartão se dobra num ingresso com QR. Sem giros nem torções.
 * Determinística: mesma semente, mesmo quadro para o mesmo t. Sem fotos nem nomes inventados.
 */
(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const VARIANT = params.get("variant") === "dark" ? "dark" : "light";
  const LAYOUT = params.get("layout") === "mobile" ? "mobile" : "desktop";

  // ---------- Paletas (derivadas dos tokens do app: --stage, --brand, --cta, --card) ----------
  const PALETTES = {
    light: {
      bg: [244, 246, 251], // --stage 220 45% 97%
      ground: [232, 237, 247],
      groundAlt: [226, 232, 244],
      street: [255, 255, 255],
      avenue: [255, 255, 255],
      avenueGlow: null,
      water: [205, 221, 252],
      park: [222, 238, 205],
      bTop: [250, 251, 254],
      bLeft: [214, 222, 238],
      bRight: [199, 209, 230],
      pin: [36, 85, 255], // --brand claro
      pinHot: [199, 243, 74], // --cta
      pinInk: [255, 255, 255],
      card: [255, 255, 255],
      cardLine: [221, 228, 240],
      bar: [228, 233, 243],
      barStrong: [200, 210, 230],
      ink: [17, 22, 33],
      inkSoft: [94, 104, 125],
      shadow: "rgba(25, 40, 90, 0.18)",
      haze: 0.92,
    },
    dark: {
      bg: [12, 14, 24], // --stage 230 35% 7%
      ground: [16, 20, 34],
      groundAlt: [18, 23, 39],
      street: [38, 48, 84],
      avenue: [70, 96, 190],
      avenueGlow: [56, 98, 255],
      water: [16, 30, 62],
      park: [20, 34, 30],
      bTop: [34, 41, 66],
      bLeft: [22, 27, 45],
      bRight: [18, 22, 37],
      pin: [92, 128, 255],
      pinHot: [199, 243, 74],
      pinInk: [12, 14, 24],
      card: [22, 26, 40], // --stage-raised 229 28% 12%
      cardLine: [43, 50, 80],
      bar: [36, 42, 66],
      barStrong: [58, 67, 102],
      ink: [250, 250, 250],
      inkSoft: [176, 186, 214],
      shadow: "rgba(0, 0, 0, 0.55)",
      haze: 0.96,
    },
  };
  const P = PALETTES[VARIANT];
  const BRAND = [36, 85, 255];
  const BRAND_DEEP = [28, 52, 190];
  const CTA = [199, 243, 74];

  // ---------- Utilitários ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
  const smoother = (a, b, v) => { const x = clamp((v - a) / (b - a)); return x * x * x * (x * (x * 6 - 15) + 10); };
  const mix = (c1, c2, k) => [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // ---------- Cidade procedural ----------
  const rand = mulberry32(20261118);
  const EXTENT = 1500;
  const STEP = 90;
  const AVENUE_EVERY = 4;
  const STREET_EXTENT = 2700; // ruas vão além dos prédios e somem na névoa: sem borda de mapa visível.
  const lines = [];
  for (let v = -EXTENT; v <= EXTENT; v += STEP) lines.push(v);
  const streetLines = [];
  for (let v = -Math.floor(STREET_EXTENT / STEP) * STEP; v <= STREET_EXTENT; v += STEP) streetLines.push(v);

  const streets = []; // {a:[x,y], b:[x,y], w, avenue}
  streetLines.forEach((v) => {
    const avenue = Math.round(v / STEP) % AVENUE_EVERY === 0;
    const w = avenue ? 20 : 9;
    streets.push({ a: [v, -STREET_EXTENT], b: [v, STREET_EXTENT], w, avenue });
    streets.push({ a: [-STREET_EXTENT, v], b: [STREET_EXTENT, v], w, avenue });
  });
  // Uma avenida diagonal dá leitura de mapa real sem parecer grade de jogo.
  streets.push({ a: [-STREET_EXTENT, -STREET_EXTENT * 0.55 + 100], b: [STREET_EXTENT, STREET_EXTENT * 0.75 - 100], w: 24, avenue: true });

  // Rio: faixa curva ao norte.
  const river = [];
  for (let x = -STREET_EXTENT; x <= STREET_EXTENT; x += 60) river.push([x, 560 + Math.sin(x / 380) * 140 + Math.sin(x / 150) * 22]);
  const RIVER_W = 70;
  const riverY = (x) => 560 + Math.sin(x / 380) * 140 + Math.sin(x / 150) * 22;

  // Parques: alguns quarteirões verdes.
  const parks = [[-450, -270, 2, 2], [540, -540, 1, 2], [-900, 180, 2, 1]];
  const inPark = (x, y) => parks.some(([px, py, cw, ch]) => x > px && x < px + cw * STEP && y > py && y < py + ch * STEP);

  // Prédios: lotes dentro dos quarteirões, mais altos perto do centro.
  const TARGET = [180, 90];
  const buildings = [];
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const x0 = lines[i], y0 = lines[j];
      const cx = x0 + STEP / 2, cy = y0 + STEP / 2;
      if (Math.hypot(cx, cy) > 1250) continue;
      if (inPark(cx, cy)) continue;
      if (Math.abs(cy - riverY(cx)) < RIVER_W + 30) continue;
      const margin = (Math.round(x0 / STEP) % AVENUE_EVERY === 0 ? 12 : 7);
      const inner = STEP - margin * 2;
      const split = rand() < 0.55 ? 2 : 1;
      const lot = inner / split;
      for (let a = 0; a < split; a++) {
        for (let b = 0; b < split; b++) {
          if (rand() < 0.3) continue;
          const bx = x0 + margin + a * lot + 3, by = y0 + margin + b * lot + 3;
          const bw = lot - 6, bd = lot - 6;
          const centerBoost = Math.max(0, 1 - Math.hypot(cx - 60, cy + 120) / 700);
          const toTarget = Math.hypot(bx + bw / 2 - TARGET[0], by + bd / 2 - TARGET[1]);
          // Prédios baixos perto do pin alvo: a câmera chega sem atravessar fachadas.
          const hgt = (8 + rand() * 26 + centerBoost * centerBoost * (40 + rand() * 90)) * (0.3 + 0.7 * smooth(90, 380, toTarget));
          if (toTarget < 80) continue;
          buildings.push({ x: bx, y: by, w: bw, d: bd, h: hgt });
        }
      }
    }
  }

  // Pins nos cruzamentos; o alvo usa a cor de CTA.
  const pins = [
    [-540, -180], [-270, 270], [-90, -360], [360, -90], [450, 270], [-630, 450], [630, -360],
    [90, 450], [-360, -540], [810, 90], [-810, -90], [270, -450], [-180, 90], [540, 630],
  ].map(([x, y], i) => ({ x, y, hot: false, phase: i * 0.37 }));
  pins.push({ x: TARGET[0], y: TARGET[1], hot: true, phase: 0 });

  // QR decorativo (não escaneável): padrões de localização + módulos pseudoaleatórios.
  const QR_N = 25;
  const qr = [];
  {
    const r = mulberry32(77);
    const finder = (x, y) => {
      for (const [fx, fy] of [[0, 0], [QR_N - 7, 0], [0, QR_N - 7]]) {
        const dx = x - fx, dy = y - fy;
        if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          return ring === 3 || ring <= 1 ? 1 : 0;
        }
        if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return 0;
      }
      return -1;
    };
    for (let y = 0; y < QR_N; y++) {
      for (let x = 0; x < QR_N; x++) {
        const f = finder(x, y);
        let on;
        if (f >= 0) on = f === 1;
        else if (y === 6 || x === 6) on = (x + y) % 2 === 0;
        else on = r() < 0.48;
        if (on) qr.push({ x, y, order: (x + y) / (QR_N * 2) + r() * 0.08 });
      }
    }
  }

  // ---------- Canvas e câmera ----------
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  function resize() {
    W = Math.round(window.innerWidth);
    H = Math.round(window.innerHeight);
    canvas.width = W;
    canvas.height = H;
  }

  const L = LAYOUT === "mobile"
    ? { focusX: 0.5, focusY: 0.45, camFocusY: 0.32, hfov: 64, card: 0.6, cardAspect: 0.64 }
    : { focusX: 0.62, focusY: 0.5, camFocusY: 0.5, vfov: 46, card: 0.7, cardAspect: 0.64 };

  function bezier3(a, b, c, k) {
    const u = 1 - k;
    return [0, 1, 2].map((i) => u * u * a[i] + 2 * u * k * b[i] + k * k * c[i]);
  }

  function cameraAt(t) {
    // Planar → mergulhar: posição em curva de Bézier com uma única curva de aceleração suave.
    const k = smoother(0, 0.66, t);
    const T = TARGET;
    const c0 = [T[0] - 560, T[1] - 1650, 1220];
    const c1 = [T[0] - 380, T[1] - 760, 620];
    const c2 = [T[0] - 26, T[1] - 175, 300];
    const pos = bezier3(c0, c1, c2, k);
    // Depois do mergulho, um avanço residual mínimo mantém a sensação de movimento durante a troca para o cartão.
    const drift = smooth(0.6, 1, t);
    pos[1] += drift * 40; pos[2] -= drift * 46;
    const look0 = [T[0] - 120, T[1] + 160, 0];
    const look1 = [T[0], T[1] + 10, 22];
    const look = [lerp(look0[0], look1[0], k), lerp(look0[1], look1[1], k), lerp(look0[2], look1[2], k)];
    return { pos, look };
  }

  let cam;
  function setupCamera(t) {
    const { pos, look } = cameraAt(t);
    const f = norm(sub(look, pos));
    const r = norm(cross(f, [0, 0, 1]));
    const u = cross(r, f);
    const F = L.hfov ? W / (2 * Math.tan((L.hfov * Math.PI) / 360)) : H / (2 * Math.tan((L.vfov * Math.PI) / 360));
    const D = Math.hypot(...sub(look, pos));
    cam = { pos, f, r, u, F, cx: W * L.focusX, cy: H * L.camFocusY, near: 12, fogNear: D * 0.55, fogFar: D * 3.1 };
  }
  function toCam(p) {
    const d = sub(p, cam.pos);
    return [dot(d, cam.r), dot(d, cam.u), dot(d, cam.f)];
  }
  function toScreen(c) {
    return [cam.cx + (c[0] * cam.F) / c[2], cam.cy - (c[1] * cam.F) / c[2]];
  }
  const fogK = (z) => smooth(cam.fogNear, cam.fogFar, z);
  const fogged = (c, z) => rgb(mix(c, P.bg, fogK(z) * P.haze));

  // Recorta um polígono no plano z = near (Sutherland–Hodgman) e projeta.
  function projectPoly(points) {
    const cs = points.map(toCam);
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length];
      const ain = a[2] >= cam.near, bin = b[2] >= cam.near;
      if (ain) out.push(a);
      if (ain !== bin) {
        const k = (cam.near - a[2]) / (b[2] - a[2]);
        out.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k), cam.near]);
      }
    }
    if (out.length < 3) return null;
    let z = 0;
    for (const c of out) z += c[2];
    const screen = out.map(toScreen);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of screen) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (maxX < -40 || minX > W + 40 || maxY < -40 || minY > H + 40) return null;
    return { screen, z: z / out.length };
  }
  function fillPoly(poly, color) {
    ctx.beginPath();
    poly.screen.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ---------- Camadas do mapa ----------
  function drawGround() {
    const tile = 300;
    for (let x = -3000; x < 3000; x += tile) {
      for (let y = -3000; y < 3000; y += tile) {
        const poly = projectPoly([[x, y, 0], [x + tile, y, 0], [x + tile, y + tile, 0], [x, y + tile, 0]]);
        if (!poly) continue;
        fillPoly(poly, fogged(P.ground, poly.z));
      }
    }
  }

  function drawBand(a, b, w, color, z0 = 0) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
    const poly = projectPoly([[a[0] + nx, a[1] + ny, z0], [b[0] + nx, b[1] + ny, z0], [b[0] - nx, b[1] - ny, z0], [a[0] - nx, a[1] - ny, z0]]);
    if (poly) fillPoly(poly, typeof color === "function" ? color(poly.z) : color);
  }

  function drawWaterAndParks() {
    for (let i = 0; i < river.length - 1; i++) drawBand(river[i], river[i + 1], RIVER_W * 2, (z) => fogged(P.water, z), 0.1);
    for (const [px, py, cw, ch] of parks) {
      const poly = projectPoly([[px + 6, py + 6, 0.2], [px + cw * STEP - 6, py + 6, 0.2], [px + cw * STEP - 6, py + ch * STEP - 6, 0.2], [px + 6, py + ch * STEP - 6, 0.2]]);
      if (poly) fillPoly(poly, fogged(P.park, poly.z));
    }
  }

  function drawStreets() {
    const SEG = 150;
    const draw = (s, widthScale, colorFn, z0) => {
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const n = Math.ceil(len / SEG);
      for (let i = 0; i < n; i++) {
        const k0 = i / n, k1 = (i + 1) / n;
        const a = [lerp(s.a[0], s.b[0], k0), lerp(s.a[1], s.b[1], k0)];
        const b = [lerp(s.a[0], s.b[0], k1), lerp(s.a[1], s.b[1], k1)];
        drawBand(a, b, s.w * widthScale, colorFn, z0);
      }
    };
    for (const s of streets) if (!s.avenue) draw(s, 1, (z) => fogged(P.street, z), 0.3);
    if (P.avenueGlow) {
      for (const s of streets) if (s.avenue) draw(s, 3.2, (z) => rgb(P.avenueGlow, 0.13 * (1 - fogK(z))), 0.35);
    }
    for (const s of streets) if (s.avenue) draw(s, 1, (z) => fogged(P.avenue, z), 0.4);
  }

  function buildingFaces(b) {
    const { x, y, w, d, h } = b;
    const faces = [];
    const cp = cam.pos;
    // Só as faces voltadas para a câmera.
    if (cp[1] < y) faces.push({ pts: [[x, y, 0], [x + w, y, 0], [x + w, y, h], [x, y, h]], c: P.bLeft });
    if (cp[1] > y + d) faces.push({ pts: [[x + w, y + d, 0], [x, y + d, 0], [x, y + d, h], [x + w, y + d, h]], c: P.bLeft });
    if (cp[0] < x) faces.push({ pts: [[x, y + d, 0], [x, y, 0], [x, y, h], [x, y + d, h]], c: P.bRight });
    if (cp[0] > x + w) faces.push({ pts: [[x + w, y, 0], [x + w, y + d, 0], [x + w, y + d, h], [x + w, y, h]], c: P.bRight });
    faces.push({ pts: [[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]], c: P.bTop });
    return faces;
  }

  function drawPin(pin, t, cardOpen) {
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 6 + pin.phase * 4);
    const hot = pin.hot;
    const color = hot ? P.pinHot : P.pin;
    const zGround = toCam([pin.x, pin.y, 0])[2];
    if (zGround < cam.near * 2) return;
    const fog = fogK(zGround);
    const alpha = 1 - fog * 0.85;
    // Halo no chão (círculo projetado).
    const ring = [];
    const R = hot ? 46 + pulse * 10 : 30;
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; ring.push([pin.x + Math.cos(a) * R, pin.y + Math.sin(a) * R, 0.6]); }
    const halo = projectPoly(ring);
    if (halo) {
      ctx.save();
      ctx.globalAlpha = (hot ? 0.34 : 0.2) * alpha * (1 - cardOpen);
      fillPoly(halo, rgb(color));
      ctx.restore();
    }
    const head = toCam([pin.x, pin.y, hot ? 40 : 30]);
    const tip = toCam([pin.x, pin.y, 0]);
    if (head[2] < cam.near) return;
    const [hx, hy] = toScreen(head);
    const [tx, ty] = toScreen(tip);
    const r = Math.max(hot ? 8 : 5.5, ((hot ? 15 : 12) * cam.F) / head[2]);
    const fade = hot ? 1 - smooth(0.5, 0.58, t) : alpha * (1 - cardOpen * 0.6);
    if (fade <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = fade;
    // Brilho suave.
    const glowR = r * (hot ? 3.4 + pulse * 0.6 : 2.4);
    const g = ctx.createRadialGradient(hx, hy, r * 0.4, hx, hy, glowR);
    g.addColorStop(0, rgb(color, hot ? 0.5 : 0.32));
    g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(hx, hy, glowR, 0, Math.PI * 2); ctx.fill();
    // Gota: círculo + cauda até a ponta.
    const ang = Math.atan2(ty - hy, tx - hx);
    ctx.beginPath();
    ctx.arc(hx, hy, r, ang + 0.72 * Math.PI / 2 + 0.35, ang - 0.72 * Math.PI / 2 - 0.35 + Math.PI * 2);
    ctx.lineTo(tx, ty);
    ctx.closePath();
    ctx.fillStyle = rgb(mix(color, P.bg, fog * 0.6));
    ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = rgb(hot ? [17, 22, 33] : [255, 255, 255], 0.95);
    ctx.fill();
    ctx.restore();
  }

  function drawCity(t, cardOpen) {
    ctx.fillStyle = rgb(P.bg);
    ctx.fillRect(0, 0, W, H);
    drawGround();
    drawWaterAndParks();
    drawStreets();
    // Prédios e pins na mesma fila de profundidade (pintor), do mais distante ao mais próximo.
    const items = [];
    for (const b of buildings) {
      const z = toCam([b.x + b.w / 2, b.y + b.d / 2, b.h / 2])[2];
      if (z < cam.near || z > cam.fogFar * 1.05) continue;
      items.push({ z, b });
    }
    for (const pin of pins) items.push({ z: toCam([pin.x, pin.y, 0])[2] - 20, pin });
    items.sort((a, b) => b.z - a.z);
    for (const item of items) {
      if (item.pin) { drawPin(item.pin, t, cardOpen); continue; }
      for (const face of buildingFaces(item.b)) {
        const poly = projectPoly(face.pts);
        if (poly) fillPoly(poly, fogged(face.c, poly.z));
      }
    }
    // Névoa de profundidade no alto do quadro + vinheta leve.
    const haze = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    haze.addColorStop(0, rgb(P.bg, 0.95));
    haze.addColorStop(1, rgb(P.bg, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H * 0.55);
    const vig = ctx.createRadialGradient(cam.cx, cam.cy, Math.min(W, H) * 0.35, cam.cx, cam.cy, Math.max(W, H) * 0.85);
    vig.addColorStop(0, rgb(P.bg, 0));
    vig.addColorStop(1, rgb(P.bg, VARIANT === "dark" ? 0.7 : 0.55));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- Cartão → ingresso ----------
  function roundRect(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function bar(x, y, w, h, color, a = 1) {
    if (a <= 0.01 || w <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; roundRect(x, y, w, h, h / 2); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }
  function pinGlyph(x, y, s, color, ink) {
    ctx.beginPath();
    ctx.arc(x, y - s * 0.25, s * 0.5, Math.PI * 0.85, Math.PI * 0.15 + Math.PI * 2);
    ctx.lineTo(x, y + s * 0.6);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.2, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
  }
  function wordmark(x, y, size, color, align = "left") {
    pinGlyph(align === "left" ? x + size * 0.45 : x - size * 3.2, y - size * 0.1, size * 0.9, rgb(BRAND), "#fff");
    ctx.font = `600 ${size}px Geist, system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("EventMap", align === "left" ? x + size * 1.15 : x - size * 2.5, y);
  }

  function drawCard(t) {
    const open = smoother(0.48, 0.68, t); // pin → cartão
    if (open <= 0) return 0;
    const fold = smoother(0.72, 0.92, t); // cartão → ingresso
    // Âncora inicial: cabeça do pin alvo na tela.
    const head = toCam([TARGET[0], TARGET[1], 40]);
    const [hx, hy] = toScreen(head);
    const pr = (15 * cam.F) / Math.max(head[2], cam.near);
    const base = Math.min(W, H / 0.9);
    const ch = (LAYOUT === "mobile" ? H * L.card : H * L.card);
    const cw = Math.min(ch * L.cardAspect, base * 0.86);
    const tw = cw * 0.94, th = ch * 0.96;
    const fw = lerp(cw, tw, fold), fh = lerp(ch, th, fold);
    const w = lerp(pr * 2, fw, open), h = lerp(pr * 2, fh, open);
    const cx = lerp(hx, W * L.focusX, open), cy = lerp(hy, H * L.focusY, open);
    const x = cx - w / 2, y = cy - h / 2;
    const radius = lerp(pr, Math.min(26, cw * 0.07), open);
    const content = smooth(0.55, 0.64, t);
    const ink = rgb(P.ink), soft = rgb(P.inkSoft);
    const pad = cw * 0.075;

    // Escurece o mapa por trás para dar foco (névoa de cena, sem blur caro).
    ctx.fillStyle = rgb(P.bg, 0.62 * open);
    ctx.fillRect(0, 0, W, H);

    // "Porta do evento": luz azul da marca atrás do ingresso e um facho lima no chão, como luz sob a porta.
    if (fold > 0) {
      const dw = tw * 1.5, dh = H * 1.1;
      const dx = W * L.focusX - dw / 2, dy = H * L.focusY - dh * 0.5;
      const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
      g.addColorStop(0, rgb(BRAND, 0));
      g.addColorStop(0.55, rgb(BRAND, (VARIANT === "dark" ? 0.3 : 0.16) * fold));
      g.addColorStop(1, rgb(BRAND, 0));
      ctx.save();
      roundRect(dx, dy, dw, dh, dw / 2);
      ctx.fillStyle = g;
      ctx.fill();
      const fy = H * L.focusY + th * 0.56;
      const spill = ctx.createRadialGradient(W * L.focusX, fy, 0, W * L.focusX, fy, tw * 1.1);
      spill.addColorStop(0, rgb(CTA, (VARIANT === "dark" ? 0.3 : 0.55) * fold));
      spill.addColorStop(1, rgb(CTA, 0));
      ctx.translate(W * L.focusX, fy); ctx.scale(1, 0.16); ctx.translate(-W * L.focusX, -fy);
      ctx.fillStyle = spill;
      ctx.beginPath(); ctx.arc(W * L.focusX, fy, tw * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Recortes laterais do picote: o corpo inteiro é desenhado com um clip que exclui os dois círculos.
    ctx.save();
    if (fold > 0.02) {
      const perfY = y + h * 0.5;
      const nr = Math.max(8, cw * 0.04) * smooth(0.35, 0.65, fold);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.moveTo(x + nr, perfY); ctx.arc(x, perfY, nr, 0, Math.PI * 2);
      ctx.moveTo(x + w + nr, perfY); ctx.arc(x + w, perfY, nr, 0, Math.PI * 2);
      ctx.clip("evenodd");
    }

    // Sombra e corpo.
    ctx.save();
    ctx.shadowColor = P.shadow;
    ctx.shadowBlur = 50 * open;
    ctx.shadowOffsetY = 24 * open;
    roundRect(x, y, w, h, radius);
    ctx.fillStyle = rgb(P.card);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(x, y, w, h, radius);
    ctx.strokeStyle = rgb(P.cardLine, open);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.clip();

    // O conteúdo é diagramado no tamanho final e escalado junto com o cartão, então cresce com ele.
    const scale = Math.min(w / fw, h / fh);
    if (content > 0) {
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      const x = -fw / 2, y = -fh / 2, w = fw, h = fh;
      ctx.globalAlpha = content;
      // Capa: dobra para trás em torno da borda superior, como virar a página de um bloco; a borda de baixo
      // se afasta (estreita) para simular a perspectiva.
      const coverH = h * 0.42;
      const ang = smooth(0, 0.6, fold) * Math.PI / 2;
      const visibleH = coverH * Math.cos(ang);
      const spread = Math.sin(ang) * w * 0.07;
      const cyTop = y;
      const cyBottom = y + visibleH;
      if (visibleH > 0.5) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, cyTop); ctx.lineTo(x + w, cyTop);
        ctx.lineTo(x + w - spread, cyBottom); ctx.lineTo(x + spread, cyBottom); ctx.closePath();
        const g = ctx.createLinearGradient(x, cyTop, x + w, cyTop + coverH);
        g.addColorStop(0, rgb(mix(BRAND, [255, 255, 255], 0.12)));
        g.addColorStop(1, rgb(BRAND_DEEP));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();
        // Mini mapa abstrato na capa.
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 2;
        for (let i = -2; i < 7; i++) {
          ctx.beginPath(); ctx.moveTo(x + i * w * 0.2, cyBottom); ctx.lineTo(x + i * w * 0.2 + w * 0.5, cyTop); ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        for (let i = 1; i < 4; i++) { const yy = lerp(cyTop, cyBottom, i / 4); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
        pinGlyph(x + w * 0.5, lerp(cyTop, cyBottom, 0.5), visibleH * 0.32, rgb(CTA), rgb(BRAND_DEEP));
        // Sombra da dobra.
        ctx.fillStyle = `rgba(0,0,0,${0.4 * Math.sin(ang)})`;
        ctx.fillRect(x, cyTop, w, visibleH);
        ctx.restore();
      }
      // Corpo: acompanha a borda de baixo da capa enquanto ela dobra.
      const bodyTop = cyBottom + pad;
      const lineH = Math.max(8, cw * 0.032);
      wordmark(x + pad - cw * 0.01, bodyTop + lineH * 0.9, Math.max(11, cw * 0.05), soft);
      bar(x + pad, bodyTop + lineH * 2.6, (w - pad * 2) * 0.82, lineH * 1.35, rgb(P.barStrong));
      bar(x + pad, bodyTop + lineH * 4.6, (w - pad * 2) * 0.56, lineH * 1.35, rgb(P.barStrong));
      // Linha de metadados: ícones + barras finas.
      const metaY = bodyTop + lineH * 7.1;
      for (let i = 0; i < 2; i++) {
        const my = metaY + i * lineH * 2.4;
        ctx.save(); roundRect(x + pad, my, lineH * 1.5, lineH * 1.5, lineH * 0.4); ctx.fillStyle = rgb(BRAND, VARIANT === "dark" ? 0.3 : 0.14); ctx.fill(); ctx.restore();
        bar(x + pad + lineH * 2.2, my + lineH * 0.45, (w - pad * 2) * (i ? 0.38 : 0.5), lineH * 0.6, rgb(P.bar));
      }
      // Linha do ingresso (data · setor · acesso) nasce no espaço livre enquanto a capa dobra.
      const infoA = smooth(0.45, 0.85, fold);
      if (infoA > 0.01) {
        const iy = bodyTop + lineH * 12.2;
        const colW = (w - pad * 2) / 3;
        for (let i = 0; i < 3; i++) {
          bar(x + pad + i * colW, iy, colW * 0.42, lineH * 0.55, rgb(P.bar), infoA);
          bar(x + pad + i * colW, iy + lineH * 1.2, colW * 0.7, lineH * 1.1, rgb(P.barStrong), infoA);
        }
      }
      // Chip de categoria.
      ctx.save();
      roundRect(x + w - pad - cw * 0.26, bodyTop + lineH * 0.2, cw * 0.26, lineH * 1.6, lineH);
      ctx.strokeStyle = rgb(P.barStrong); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      bar(x + w - pad - cw * 0.26 + lineH * 0.8, bodyTop + lineH * 0.85, cw * 0.26 - lineH * 1.6, lineH * 0.5, rgb(P.barStrong));

      // CTA "Garantir lugar": some quando o ingresso nasce.
      const ctaA = 1 - smooth(0.72, 0.8, t);
      if (ctaA > 0.01) {
        const bh = Math.max(34, ch * 0.085);
        const by = y + h - pad - bh;
        ctx.save();
        ctx.globalAlpha *= ctaA;
        roundRect(x + pad, by, w - pad * 2, bh, bh / 2);
        ctx.fillStyle = rgb(CTA); ctx.fill();
        ctx.font = `600 ${Math.round(bh * 0.38)}px Geist, system-ui, sans-serif`;
        ctx.fillStyle = "rgb(17,22,33)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Garantir lugar", x + w / 2, by + bh / 2 + 1);
        ctx.restore();
      }

      // Ingresso: picote com recortes laterais + QR que se desenha módulo a módulo.
      if (fold > 0.02) {
        const perfY = y + h * 0.5;
        ctx.save();
        ctx.globalAlpha *= smooth(0.35, 0.65, fold);
        ctx.setLineDash([6, 7]);
        ctx.strokeStyle = rgb(P.barStrong);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + pad * 0.9, perfY); ctx.lineTo(x + w - pad * 0.9, perfY); ctx.stroke();
        ctx.restore();
        const qs = Math.min(w - pad * 2, h * 0.5 - pad * 2) * 0.84;
        const qx = x + (w - qs) / 2, qy = perfY + (y + h - perfY - qs) / 2;
        const cell = qs / QR_N;
        const show = smooth(0.42, 0.9, fold);
        // Placa clara atrás do QR nos dois temas, como num ingresso real.
        ctx.save();
        ctx.globalAlpha = content * smooth(0.4, 0.55, fold);
        roundRect(qx - cell * 1.6, qy - cell * 1.6, qs + cell * 3.2, qs + cell * 3.2, cell * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "rgb(17, 22, 33)";
        for (const m of qr) {
          const k = clamp((show * 1.25 - m.order) / 0.25);
          if (k <= 0) continue;
          const s = cell * (0.5 + 0.5 * k) * 1.02;
          ctx.globalAlpha = content * k;
          ctx.fillRect(qx + m.x * cell + (cell - s) / 2, qy + m.y * cell + (cell - s) / 2, s, s);
        }
        ctx.globalAlpha = content;
      }
    }
    ctx.restore();

    ctx.restore();
    return open;
  }

  // ---------- API ----------
  function draw(t) {
    t = clamp(Number(t) || 0);
    setupCamera(t);
    const open = smoother(0.48, 0.68, t);
    drawCity(t, open);
    drawCard(t);
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  window.renderFrame = function (t) {
    draw(t);
    return nextPaint();
  };

  window.sceneReady = (async () => {
    document.body.style.background = rgb(P.bg);
    resize();
    try { await document.fonts.load("600 20px Geist"); } catch (_) { /* fonte local ausente: usa system-ui */ }
    await document.fonts.ready;
    draw(Number(params.get("t") || 0));
    await nextPaint();
    return { variant: VARIANT, layout: LAYOUT, width: W, height: H };
  })();

  window.addEventListener("resize", () => { resize(); draw(Number(params.get("t") || 0)); });
})();
