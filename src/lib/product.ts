/**
 * Utilitaires partagés pour les produits
 * Utilisé par la page d'accueil et la page produit détaillée
 */

export interface ColorSize {
  size: string;
  price: number;
  stock: number;
}

export interface ProductColor {
  id: string;
  productId: string;
  colorName: string;
  colorValue: string;
  images: string[];
  sizes: ColorSize[];
  order: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subCategory?: string | null;
  genre: string;
  description?: string | null;
  image: string;
  sizes: string[];
  type: string;
  isActive: boolean;
  isBestSeller: boolean;
  isNew: boolean;
  minPrice: number;
  totalStock: number;
  colors: ProductColor[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Formate un prix en XOF avec séparateur de milliers
 */
export function formatPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price) || price === 0) {
    return 'Prix sur demande';
  }
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' XOF';
}

/**
 * Convertit une valeur de couleur (nom ou hex) en hex valide
 */
export function getColorHex(colorValue: string): string {
  if (!colorValue) return '#9C7C5C';

  // Si c'est déjà un hex
  if (colorValue.startsWith('#')) {
    return colorValue;
  }

  // Mapping des noms de couleurs legacy
  const colorMap: Record<string, string> = {
    noir: '#0A0A0A',
    black: '#0A0A0A',
    marron: '#5C3A21',
    brown: '#5C3A21',
    camel: '#C4A77D',
    beige: '#E5D5B8',
    blanc: '#F8F6F3',
    white: '#F8F6F3',
    cream: '#F8F6F3',
    gris: '#6B6560',
    gray: '#6B6560',
    grey: '#6B6560',
    rouge: '#8B1A1A',
    red: '#8B1A1A',
    bordeaux: '#5C1A1A',
    bleu: '#1A3A5C',
    blue: '#1A3A5C',
    vert: '#2D5C3A',
    green: '#2D5C3A',
    jaune: '#C4A02D',
    yellow: '#C4A02D',
    orange: '#C4621A',
    rose: '#C47C8A',
    pink: '#C47C8A',
    violet: '#5C3A5C',
    purple: '#5C3A5C',
    or: '#C4A77D',
    gold: '#C4A77D',
    argent: '#B8B5B0',
    silver: '#B8B5B0',
  };

  return colorMap[colorValue.toLowerCase()] || '#9C7C5C';
}

/**
 * Génère un lien WhatsApp pré-rempli pour un produit
 */
export function getWhatsAppLink(product: Product, selectedColor?: string, selectedSize?: string): string {
  const phone = '22890000000'; // À adapter selon le numéro de la maison
  let text = `Bonjour Maison Khan, je suis intéressé(e) par ce produit : ${product.name}`;

  if (selectedColor) {
    text += ` - Couleur: ${selectedColor}`;
  }
  if (selectedSize) {
    text += ` - Taille: ${selectedSize}`;
  }

  if (product.minPrice > 0) {
    text += ` - Prix: ${formatPrice(product.minPrice)}`;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
