import styles from "./Landing.module.css";

type CityMapProps = {
  /** Prefixo único para ids de gradientes quando o mapa aparece mais de uma vez na página. */
  id: string;
  /** Exibe o pulso sutil no pin principal (desativado com prefers-reduced-motion). */
  pulse?: boolean;
};

type Pin = { x: number; y: number; tone: "blue" | "lime"; r: number };

const PINS: Pin[] = [
  { x: 842, y: 214, tone: "lime", r: 7 },
  { x: 968, y: 352, tone: "blue", r: 5 },
  { x: 702, y: 410, tone: "blue", r: 5 },
  { x: 1086, y: 160, tone: "blue", r: 4 },
  { x: 560, y: 150, tone: "blue", r: 4 },
  { x: 1012, y: 560, tone: "lime", r: 4 },
  { x: 214, y: 520, tone: "blue", r: 4 },
  { x: 380, y: 300, tone: "blue", r: 3.5 },
];

/** Malha de ruas decorativa (SVG estático, leve) usada nos fundos escuros. */
export function CityMap({ id, pulse = false }: CityMapProps) {
  const vertical = Array.from({ length: 16 }, (_, index) => 40 + index * 76);
  const horizontal = Array.from({ length: 10 }, (_, index) => 30 + index * 74);
  const main = PINS[0];

  return (
    <svg className={styles.heroMap} viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-glow-blue`}>
          <stop offset="0%" stopColor="hsl(226.58 100% 62%)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(226.58 100% 62%)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-glow-lime`}>
          <stop offset="0%" stopColor="hsl(75.62 87.56% 62%)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="hsl(75.62 87.56% 62%)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="rotate(-8 600 360)" stroke="hsl(218 40% 80%)" strokeOpacity="0.07" strokeWidth="1">
        {vertical.map(x => <line key={`v${x}`} x1={x} y1={-120} x2={x} y2={860} />)}
        {horizontal.map(y => <line key={`h${y}`} x1={-120} y1={y} x2={1320} y2={y} />)}
      </g>
      <g fill="none" stroke="hsl(218 50% 85%)" strokeLinecap="round">
        <path d="M-40 610 C 220 520, 360 560, 560 430 S 900 250, 1260 120" strokeOpacity="0.12" strokeWidth="2.5" />
        <path d="M120 -20 C 260 160, 420 260, 640 300 S 980 420, 1240 640" strokeOpacity="0.09" strokeWidth="2" />
        <path d="M-40 260 C 160 300, 300 220, 470 250" strokeOpacity="0.07" strokeWidth="1.5" />
      </g>
      <path d="M-40 700 C 200 640, 380 690, 620 640 S 1000 560, 1260 600 L 1260 760 L -40 760 Z" fill="hsl(226.58 100% 57%)" fillOpacity="0.05" />
      <circle cx={main.x} cy={main.y} r="120" fill="none" stroke="hsl(75.62 87.56% 62%)" strokeOpacity="0.16" strokeDasharray="3 6" />
      {PINS.map(pin => (
        <g key={`${pin.x}-${pin.y}`}>
          <circle cx={pin.x} cy={pin.y} r={pin.r * 7} fill={`url(#${id}-glow-${pin.tone})`} />
          <circle cx={pin.x} cy={pin.y} r={pin.r} fill={pin.tone === "lime" ? "hsl(75.62 87.56% 62%)" : "hsl(226.58 100% 66%)"} />
        </g>
      ))}
      {pulse && <circle className={styles.pinPulse} cx={main.x} cy={main.y} r="16" fill="none" stroke="hsl(75.62 87.56% 62%)" strokeWidth="1.5" />}
    </svg>
  );
}
