// QR ilustrativo e determinístico (não codifica nada): mesmos módulos no servidor e no navegador.
const SIZE = 21;

function buildPath(seed: number) {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > SIZE - 9 && y < 8) || (x < 8 && y > SIZE - 9);
  const finder = (ox: number, oy: number) => `M${ox} ${oy}h7v7h-7zM${ox + 1} ${oy + 1}v5h5v-5zM${ox + 2} ${oy + 2}h3v3h-3z`;
  let path = finder(0, 0) + finder(SIZE - 7, 0) + finder(0, SIZE - 7);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!inFinder(x, y) && random() > 0.52) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return path;
}

const PATHS = new Map<number, string>();

export function DemoQr({ seed = 2026, className, label }: { seed?: number; className?: string; label?: string }) {
  let path = PATHS.get(seed);
  if (!path) {
    path = buildPath(seed);
    PATHS.set(seed, path);
  }
  return (
    <svg
      viewBox={`-1 -1 ${SIZE + 2} ${SIZE + 2}`}
      className={className}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x="-1" y="-1" width={SIZE + 2} height={SIZE + 2} fill="#fff" />
      <path d={path} fill="#0b1020" fillRule="evenodd" />
    </svg>
  );
}
