/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

const nextConfig = {
  output: 'standalone',
  // Le frontend appelle l'API en chemin relatif ; Next proxifie vers le backend Express.
  // proxyTimeout relevé : la génération pédagogique via Ollama local peut légitimement
  // dépasser 30 s (modèle 8B sur matériel modeste) ; défaut = 30 s → 500 côté interface.
  experimental: {
    proxyTimeout: 300_000,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

module.exports = nextConfig;
