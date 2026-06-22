import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import ProductDetail from './ProductDetail';
import { formatPrice } from '@/lib/product';
import type { Metadata } from 'next';

// Générer les métadonnées SEO + Open Graph pour le partage social
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
    include: { colors: { orderBy: { order: 'asc' } } },
  });

  if (!product) {
    return {
      title: 'Produit introuvable | Maison Khan',
      description: 'Ce produit n\'existe pas ou n\'est plus disponible.',
    };
  }

  // Calculer le prix min
  let minPrice = 0;
  for (const color of product.colors) {
    try {
      const sizes = JSON.parse(color.sizes);
      for (const s of sizes) {
        if (s.price > 0 && (minPrice === 0 || s.price < minPrice)) {
          minPrice = s.price;
        }
      }
    } catch {}
  }

  // Première image disponible
  let firstImage = product.image;
  for (const color of product.colors) {
    try {
      const imgs = JSON.parse(color.images);
      if (Array.isArray(imgs) && imgs.length > 0) {
        firstImage = imgs[0];
        break;
      }
    } catch {}
  }

  const title = `${product.name} | Maison Khan`;
  const description =
    product.description?.slice(0, 160) ||
    `Découvrez ${product.name} — ${product.subCategory || product.category} Maison Khan. ${minPrice > 0 ? 'À partir de ' + formatPrice(minPrice) + '.' : 'Prix sur demande.'}`;

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://shop.maison-khan.com';

  return {
    title,
    description,
    keywords: [
      product.name,
      product.category,
      product.subCategory,
      'Maison Khan',
      'luxe',
      'mode',
      'Made in Africa',
      product.genre,
    ].filter(Boolean),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${siteUrl}/produit/${product.id}`,
      siteName: 'Maison Khan',
      locale: 'fr_FR',
      images: [
        {
          url: firstImage.startsWith('data:')
            ? `${siteUrl}/logo.png`
            : firstImage,
          width: 1200,
          height: 1200,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [firstImage.startsWith('data:') ? `${siteUrl}/logo.png` : firstImage],
    },
    alternates: {
      canonical: `${siteUrl}/produit/${product.id}`,
    },
  };
}

// Page serveur — récupère le produit et le passe au composant client
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const product = await db.product.findUnique({
    where: { id },
    include: {
      colors: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!product || !product.isActive) {
    notFound();
  }

  // Parser les champs JSON
  const parsedProduct = {
    ...product,
    sizes: (() => {
      try {
        return JSON.parse(product.sizes);
      } catch {
        return [];
      }
    })(),
    colors: product.colors.map((color) => ({
      ...color,
      images: (() => {
        try {
          return JSON.parse(color.images);
        } catch {
          return [];
        }
      })(),
      sizes: (() => {
        try {
          return JSON.parse(color.sizes);
        } catch {
          return [];
        }
      })(),
    })),
  };

  // Calculer minPrice et totalStock
  let minPrice = 0;
  let totalStock = 0;
  for (const color of parsedProduct.colors) {
    for (const s of color.sizes) {
      if (s.price > 0 && (minPrice === 0 || s.price < minPrice)) {
        minPrice = s.price;
      }
      totalStock += s.stock || 0;
    }
  }

  return (
    <ProductDetail
      product={{
        ...parsedProduct,
        minPrice,
        totalStock,
      }}
    />
  );
}
