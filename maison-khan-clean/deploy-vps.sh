#!/bin/bash

echo "=== Mise à jour VPS MAISON KHAN ==="
echo "1. Mise à jour des fichiers..."
# API products
cat > /var/www/maison-khan/src/app/api/products/route.ts << 'EOF'
// Cache bust: v6 - Prix dans VariantSize
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Helper function for stock notification
async function sendOutOfStockNotification(productName: string, productId: string, previousStock: number, category: string) {
  console.log(`[NOTIFICATION] Stock alert: ${productName} (${productId}) went from ${previousStock} to 0`)
}

// GET - Fetch all products with variants and sizes
export async function GET() {
  try {
    const products = await db.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            sizes: {
              where: { isActive: true },
              orderBy: { size: 'asc' }
            }
          }
        }
      }
    })
    
    // Parse sizes and variant images from JSON strings, calculate min price
    const productsWithParsedData = products.map(p => {
      // Calculate minimum price across all variants and sizes
      let minPrice = Infinity
      let totalStock = 0
      
      p.variants.forEach(v => {
        v.sizes.forEach(s => {
          if (s.price > 0 && s.price < minPrice) {
          minPrice = s.price
          }
          totalStock += s.stock
        })
      })
      
      return {
        ...p,
        sizes: JSON.parse(p.sizes),
        minPrice: minPrice === Infinity ? 0 : minPrice,
        totalStock,
        variants: p.variants.map(v => ({
          ...v,
          images: JSON.parse(v.images || '[]'),
          sizes: v.sizes.map(s => ({
            ...s,
            price: s.price
          }))
        }))
      }
    })
    
    return NextResponse.json(productsWithParsedData)
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

// POST - Create a new product with variants and sizes (transaction)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, category, subCategory, genre, image, sizes, type, variants } = body
    
    console.log('[PRODUCT] Creating product:', { name, category, hasVariants: variants?.length > 0 })
    
    // Use transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
      // 1. Create the product first
      const product = await tx.product.create({
        data: {
          name,
          description: description || null,
          category,
          subCategory: subCategory || null,
          genre: genre || 'femme',
          image: image || '',
          sizes: JSON.stringify(sizes || []),
          type: type || 'chaussure'
        }
      })
      
      console.log('[PRODUCT] Product created with ID:', product.id)
      
      // 2. Create variants with sizes if provided
      if (variants && variants.length > 0) {
        for (let i = 0; i < variants.length; i++) {
        const variant = variants[i]
        
        const createdVariant = await tx.variant.create({
          data: {
            productId: product.id,
            colorName: variant.colorName,
            colorValue: variant.colorValue,
            images: JSON.stringify(variant.images || []),
            order: i + 1
          }
        })
        
        console.log('[PRODUCT] Variant created:', variant.colorName)
        
        // Create sizes for this variant (with price and stock)
        if (variant.sizes && variant.sizes.length > 0) {
          for (const sizeData of variant.sizes) {
            await tx.variantSize.create({
              data: {
                variantId: createdVariant.id,
                size: sizeData.size,
                price: sizeData.price || 00                stock: sizeData.stock || 0
              }
            })
          }
          console.log('[PRODUCT] Sizes created for variant:', variant.colorName)
        }
      }
      
      // Update product's main image from first variant
      if (variants[0].images && variants[0].images.length > 0) {
        await tx.product.update({
          where: { id: product.id },
          data: { image: variants[0].images[0] }
        })
      }
      
      // Fetch the complete product with relations
      const completeProduct = await tx.product.findUnique({
        where: { id: product.id },
        include: {
          variants: {
            orderBy: { order: 'asc' },
            include: {
              sizes: {
                orderBy: { size: 'asc' }
              }
            }
          }
        }
      })
      
      return completeProduct
    })
    
    console.log('[PRODUCT] Transaction completed successfully')
    
    // Calculate min price for response
    let minPrice = Infinity
    result?.variants?.forEach(v => {
      v.sizes.forEach(s => {
        if (s.price > 0 && s.price < minPrice) {
          minPrice = s.price
        }
      })
    })
    
    return NextResponse.json({
      ...result,
      sizes: JSON.parse(result?.sizes || '[]'),
      minPrice: minPrice === Infinity ? 0 : minPrice,
      variants: result?.variants?.map(v => ({
        ...v,
        images: JSON.parse(v.images || '[]')
      }))
    })
  } catch (error) {
    console.error('[PRODUCT] Error creating product:', error)
    return NextResponse.json({ error: 'Failed to create product', details: String(error) }, { status: 500 })
  }
}

// PUT - Update a product with variants and sizes (transaction)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, description, category, subCategory, genre, image, sizes, type, isActive, variants } = body
    
    console.log('[PRODUCT] Updating product:', { id, name, hasVariants: variants?.length > 0 })
    
    const currentProduct = await db.product.findUnique({
      where: { id },
      include: { variants: true }
    })
    
    if (!currentProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    
    const previousStock = 0 // Not needed anymore, stock is in VariantSize
    
    // Use transaction for atomic update
    const result = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {
        name,
        description: description || null,
        category,
        subCategory: subCategory || null,
        genre: genre || 'femme',
        image: image || currentProduct.image,
        sizes: JSON.stringify(sizes || []),
        type: type || 'chaussure',
        isActive: isActive ?? true
      }
      
      // 1. Update the product
      const product = await tx.product.update({
        where: { id },
        data: updateData
      })
      
      console.log('[PRODUCT] Product updated:', product.id)
      
      // 2. Handle variants if provided
      if (variants !== undefined) {
        // Delete existing variants (cascade will delete sizes)
        await tx.variant.deleteMany({
          where: { productId: id }
        })
        
        // Create new variants with sizes
        if (variants && variants.length > 0) {
          for (let i = 0; i < variants.length; i++) {
            const variant = variants[i]
            
            const createdVariant = await tx.variant.create({
              data: {
                productId: id,
                colorName: variant.colorName,
                colorValue: variant.colorValue,
                images: JSON.stringify(variant.images || []),
                order: i + 1
              }
            })
            
            console.log('[PRODUCT] Variant created:', variant.colorName)
            
            // Create sizes for this variant (with price and stock)
            if (variant.sizes && variant.sizes.length > 0) {
              for (const sizeData of variant.sizes) {
                await tx.variantSize.create({
                data: {
                  variantId: createdVariant.id,
                  size: sizeData.size,
                  price: sizeData.price || 0
                  stock: sizeData.stock || 1
                }
              })
            }
          }
          
          // Update product's main image from first variant
          if (variants[0].images && variants[0].images.length > 0) {
            await tx.product.update({
              where: { id },
              data: { image: variants[0].images[0] }
            })
          }
        }
      }
      
      // Fetch the complete product with relations
      const completeProduct = await tx.product.findUnique({
        where: { id },
        include: {
          variants: {
            orderBy: { order: 'asc' },
            include: {
              sizes: {
                orderBy: { size: 'asc' }
              }
            }
          }
        }
      })
      
      return completeProduct
    })
    
    console.log('[PRODUCT] Update transaction completed')
    
    // Calculate min price for response
    let minPrice = Infinity
    result?.variants?.forEach(v => {
      v.sizes.forEach(s => {
        if (s.price > 0 && s.price < minPrice) {
          minPrice = s.price
        }
      })
    })
    
    return NextResponse.json({
      ...result,
      sizes: JSON.parse(result?.sizes || '[]'),
      minPrice: minPrice === Infinity ? 0 : minPrice,
      variants: result?.variants?.map(v => ({
        ...v,
        images: JSON.parse(v.images || '[]')
      }))
    })
  } catch (error) {
    console.error('[PRODUCT] Error updating product:', error)
    return NextResponse.json({ error: 'Failed to update product', details: String(error) }, { status: 500 })
  }
}

// DELETE - Delete a product
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }
    
    await db.product.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
EOF

echo "✅ API products mise à jour"

# 2. Mise à jour du fichier db.ts
cat > /var/www/maison-khan/src/lib/db.ts << 'EOF'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Cache bust: v5 - force reload for sizes relation
const forceNewClient = process.env.NODE_ENV !== 'production'
export const db =
  (forceNewClient ? undefined : globalForPrisma.prisma) ??
  new PrismaClient({
    log: ['query'],
  })
if (process.env.NODE_ENV !== 'production' && !forceNewClient) globalForPrisma.prisma = db
EOF
echo "✅ Fichier db.ts mis à jour"

# 3. Mettre à jour le schéma Prisma
cat > /var/www/maison-khan/prisma/schema.prisma << 'EOF'
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// Produits (Chaussures et Accessoires)
model Product {
  id                   String          @id @default(cuid())
  name                 String
  description          String?
  category             String          // mules, sandales, ballerines, accessoires
  subCategory          String?         // Édition Limitée, Signature, etc.
  genre                String          @default("femme") // homme, femme, mixte
  image                String          // Image principale (première image de la première variante)
  sizes                String          // JSON stringifié: ["35", "36", "37", "38", "39", "40"]
  type                 String          @default("chaussure") // chaussure ou accessoire
  isActive             Boolean         @default(true)
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  
  variants             Variant[]       // Variantes par couleur
}

// Variantes de produit (par couleur)
model Variant {
  id          String        @id @default(cuid())
  productId   String
  product     Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
  colorName   String        // Nom affiché: Noir, Blanc, Rouge, etc.
  colorValue  String        // Valeur technique: noir, blanc, rouge, etc.
  images      String        // JSON stringifié: ["image1_base64", "image2_base64", ...]
  isActive    Boolean       @default(true)
  order       Int           @default(0) // Ordre d'affichage
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  
  sizes       VariantSize[] // Tailles avec prix et stock individuel
  
  @@index([productId])
  @@index([colorValue])
}

// Tailles par variante (avec prix et stock)
model VariantSize {
  id        String   @id @default(cuid())
  variantId String
  variant   Variant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  size      String   // "35", "36", "37", etc. ou "Unique", "S", "M", "L" pour accessoires
  price     Int      // Prix en FCFA pour cette taille spécifique
  stock     Int      @default(0) // Stock pour cette taille spécifique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([variantId])
  @@unique([variantId, size]) // Une seule entrée: par variante+taille
}
// Commandes (pour le suivi des ventes WhatsApp)
model Order {
  id          String   @id @default(cuid())
  product     String   // Nom du produit
  productId   String?  // ID du produit (optionnel si supprimé)
  variantId   String?  // ID de la variante (optionnel)
  color       String   // Couleur choisie
  size        String   // Taille choisie
  price       Int      // Prix au moment de la commande
  customerName String? // Nom du client (optionnel)
  phone       String?  // Téléphone du client
  status      String   @default("pending") // pending, confirmed, shipped, delivered, cancelled
  notes       String?  // Notes additionnelles
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([status])
  @@index([createdAt])
}

// Catégories du Méga-Menu
model MenuCategory {
  id          String   @id @default(cuid())
  name        String   // Nom affiché: Chaussures, Accessoires, etc.
  slug        String   @unique // Identifiant: chaussures, accessoires
  order       Int      @default(0)
  isActive    Boolean  @default(true)
  subCategories SubCategory[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Sous-catégories du Méga-Menu
model SubCategory {
  id           String   @id @default(cuid())
  name         String   // Mules, Sandales, Ballerines
  slug         String   @unique // mules, sandales, ballerines
  genre        String   @default("all") // homme, femme, all (affiché pour les deux)
  menuCategoryId String
  menuCategory  MenuCategory @relation(fields: [menuCategoryId], references: [id], onDelete: Cascade)
  images       MenuImage[]
  order        Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  @@index([menuCategoryId])
}

// Images associées aux sous-catégories du méga-menu
model MenuImage {
  id             String   @id @default(cuid())
  subCategoryId  String
  subCategory    SubCategory @relation(fields: [subCategoryId], references: [id], onDelete: Cascade)
  image          String   // Base64 ou URL
  title          String?  // Titre optionnel
  link           String?  // Lien vers la catégorie/produit
  order          Int      @default(0)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

// Images et Vidéos du Hero Slider
model HeroSlide {
  id          String   @id @default(cuid())
  image       String   // Base64 ou URL
  type        String   @default("image") // "image" ou "video"
  title       String?  // Titre optionnel superposé
  subtitle    String?  // Sous-titre optionnel
  link        String?  // Lien optionnel
  order       Int      @default(0)
  isActive    Boolean  @default(true)
  interval    Int      @default(5000) // Intervalle en ms
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Logo du site
model SiteSetting {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String   // Base64 ou URL
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Contenu textuel du site (éditable via admin)
model SiteContent {
  id          String   @id @default(cuid())
  key         String   @unique // Identifiant unique: hero_title, hero_subtitle, etc.
  value       String   // Contenu textuel
  description String?  // Description pour l'admin (ex: "Titre principal de la page d'accueil")
  category    String   @default("general") // Catégorie pour organiser: hero, about, contact, footer
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
EOF
echo "✅ Schema Prisma mis à jour"

# 4. Régénérer Prisma
cd /var/www/maison-khan
npx prisma generate

# 5. Pousser les changements dans la base de données
npx prisma db push --accept-data-loss

# 6. Redémarrer l'application
pm2 restart maison-khan

echo ""
echo "=== Mise à jour terminée ==="
echo "La nouvelle structure est en place :"
echo "Product → Variant → VariantSize"
echo "Le prix est maintenant par taille !"
