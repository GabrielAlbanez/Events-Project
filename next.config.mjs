/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "lh3.googleusercontent.com",
      "cdnb.artstation.com",
      "pbs.twimg.com",
    ], // Adicione o domínio do Google para imagens externas
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.watchOptions = {
        ignored: /node_modules/, // Ignora mudanças na pasta node_modules
        poll: 1000, // Verifica mudanças a cada 1 segundo (para evitar problemas no OneDrive)
      };
    }
    return config;
  },
};

export default nextConfig;
