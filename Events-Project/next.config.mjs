import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

function socketSources() {
  try {
    const socket = new URL(process.env.NEXT_PUBLIC_SOCKET_URL || "");
    if (!["https:", "wss:"].includes(socket.protocol) || socket.username || socket.password) return "";
    return " https://" + socket.host + " wss://" + socket.host;
  } catch {
    return "";
  }
}

const CSP_REPORT_PATH = "/api/csp-report";
const CSP_REPORT_GROUP = "csp-endpoint";

function cspDirectives(frameAncestors) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://lh3.googleusercontent.com https://*.public.blob.vercel-storage.com https://cdnb.artstation.com https://pbs.twimg.com",
    "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com" + socketSources(),
    "frame-src 'self' https://accounts.google.com https://www.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors " + frameAncestors,
    "form-action 'self' https://accounts.google.com",
    // Violations are collected (sanitized, rate-limited) by app/api/csp-report while the policy is Report-Only.
    "report-uri " + CSP_REPORT_PATH,
    "report-to " + CSP_REPORT_GROUP,
  ].join("; ");
}

const isProduction = process.env.NODE_ENV === "production";

// Every route except /embed/* (public widgets meant to be framed by other sites).
const NON_EMBED_ROUTES = "/:path((?!embed(?:/|$)).*)";
const EMBED_ROUTES = "/embed/:path*";

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays available to the map; camera is used by check-in QR scanning.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

/**
 * Framing is enforced (X-Frame-Options + a frame-ancestors-only CSP). The full CSP
 * stays Report-Only until Google Maps, Blob media, Socket.IO, OAuth avatars and web
 * push are verified against it in production.
 */
function securityHeaders(embeddable) {
  return [
    ...baseSecurityHeaders,
    // COOP isolates our window from cross-origin openers; popups (Google OAuth) keep working. Embeds are left untouched.
    ...(embeddable ? [] : [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }]),
    { key: "Content-Security-Policy", value: embeddable ? "frame-ancestors *" : "frame-ancestors 'self'" },
    ...(isProduction
      ? [
          { key: "Content-Security-Policy-Report-Only", value: cspDirectives(embeddable ? "*" : "'self'") },
          { key: "Reporting-Endpoints", value: CSP_REPORT_GROUP + '="' + CSP_REPORT_PATH + '"' },
        ]
      : []),
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Evita que next build sobrescreva os arquivos servidos por next dev.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    serverActions: { bodySizeLimit: 4_450_000 },
    optimizePackageImports: ["@heroui/react"],
    outputFileTracingIncludes: {
      "/api/media/**": ["./public/uploads/*"],
    },
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/uploads/:filename", destination: "/api/media/:filename" }] };
  },
  async headers() {
    return [
      { source: NON_EMBED_ROUTES, headers: securityHeaders(false) },
      { source: EMBED_ROUTES, headers: securityHeaders(true) },
    ];
  },
  images: {
    // Os blobs privados são servidos pelas rotas locais de mídia.
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "cdnb.artstation.com", pathname: "/**" },
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
    ],
  },
  // Removido polling do webpack para evitar rebuilds constantes em dev
};

export default withBundleAnalyzer(nextConfig);
