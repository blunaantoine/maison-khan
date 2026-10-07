import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Uploads admin : vidéos du hero slider (≤ 9 Mo de vidéo ≈ 12 Mo de base64
  // + enveloppe JSON). Sans cette limite relevée (10 Mo par défaut), le proxy
  // Next.js tronque les corps trop grands et l'upload échoue en JSON invalide.
  experimental: {
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;
