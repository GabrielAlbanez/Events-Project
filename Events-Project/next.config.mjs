import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que next build sobrescreva os arquivos servidos por next dev.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    optimizePackageImports: ["@heroui/react"],
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/uploads/:filename", destination: "/api/media/:filename" }] };
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "cdnb.artstation.com", pathname: "/**" },
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
    ],
  },
  // Removido polling do webpack para evitar rebuilds constantes em dev
};

export default withBundleAnalyzer(nextConfig);
