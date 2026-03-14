import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://maison-khan.com'

  // Google n'accepte pas les URLs avec # (ancres) dans le sitemap
  // Pour une SPA, on déclare seulement la page principale
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ]
}
