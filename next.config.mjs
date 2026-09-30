/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que next build sobrescreva os arquivos servidos por next dev.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    domains: [
      "lh3.googleusercontent.com",
      "cdnb.artstation.com",
      "pbs.twimg.com",
    ], // Adicione o domínio do Google para imagens externas
  },
  // Removido polling do webpack para evitar rebuilds constantes em dev
};

export default nextConfig;
