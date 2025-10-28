/** @type {import('next').NextConfig} */
const nextConfig = {
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
