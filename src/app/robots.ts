import { MetadataRoute } from 'next'

// Domaine canonique lu dans le .env (change de domaine sans toucher au code)
const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://maison-khan.com').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/panier/', '/checkout/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
