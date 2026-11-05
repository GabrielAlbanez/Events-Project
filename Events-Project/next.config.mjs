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

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://lh3.googleusercontent.com https://cdnb.artstation.com https://pbs.twimg.com",
  "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com" + socketSources(),
  "frame-src 'self' https://accounts.google.com https://www.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy }]
          : []),
      ],
    }];
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
