import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/products/[id] — Récupère un produit par son ID avec ses couleurs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: {
        colors: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Produit introuvable' },
        { status: 404 }
      );
    }

    // Parser les champs JSON (sizes, images)
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

    // Calculer le prix minimum et le stock total
    let minPrice = 0;
    let totalStock = 0;
    for (const color of parsedProduct.colors) {
      for (const s of color.sizes) {
        if (s.price > 0) {
          if (minPrice === 0 || s.price < minPrice) {
            minPrice = s.price;
          }
        }
        totalStock += s.stock || 0;
      }
    }

    return NextResponse.json({
      ...parsedProduct,
      minPrice,
      totalStock,
    });
  } catch (error) {
    console.error('Erreur GET /api/products/[id]:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du produit' },
      { status: 500 }
    );
  }
}
