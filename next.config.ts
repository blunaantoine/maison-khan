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
  // En-têtes de sécurité HTTP appliqués à toutes les pages et routes.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self)' },
        ],
      },
    ]
  },
  experimental: {
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;
