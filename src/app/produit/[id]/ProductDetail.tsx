'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ShoppingBag,
  Heart,
  Share2,
  Copy,
  Check,
  MessageCircle,
  Truck,
  Shield,
  ChevronRight,
} from 'lucide-react';
import type { Product, ProductColor } from '@/lib/product';
import { formatPrice, getColorHex } from '@/lib/product';

interface ProductDetailProps {
  product: Product;
}

export default function ProductDetail({ product }: ProductDetailProps) {
  const router = useRouter();
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const selectedColor: ProductColor | undefined = product.colors?.[selectedColorIndex];
  const currentImages = selectedColor?.images?.length ? selectedColor.images : [product.image];

  // Reset image index quand on change de couleur
  useEffect(() => {
    setSelectedImageIndex(0);
  }, [selectedColorIndex]);

  // Initialiser la taille par défaut
  useEffect(() => {
    if (product.sizes?.length && !selectedSize) {
      setSelectedSize(product.sizes[0]);
    }
  }, [product.sizes, selectedSize]);

  // Récupérer le prix de la taille sélectionnée pour la couleur courante
  const getCurrentPrice = (): number => {
    if (!selectedColor?.sizes?.length) return product.minPrice || 0;
    const sizeInfo = selectedColor.sizes.find((s) => s.size === selectedSize);
    if (sizeInfo?.price && sizeInfo.price > 0) return sizeInfo.price;
    return product.minPrice || 0;
  };

  const getCurrentStock = (): number => {
    if (!selectedColor?.sizes?.length) return product.totalStock || 0;
    const sizeInfo = selectedColor.sizes.find((s) => s.size === selectedSize);
    return sizeInfo?.stock || 0;
  };

  const currentPrice = getCurrentPrice();
  const currentStock = getCurrentStock();

  // URL de partage
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = `Découvrez ${product.name} sur Maison Khan`;
  const shareImage = currentImages[selectedImageIndex] || product.image;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copie impossible:', err);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `${shareText}\n\n${currentPrice > 0 ? 'Prix : ' + formatPrice(currentPrice) : ''}\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleShareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank'
    );
  };

  const handleAddToCart = async () => {
    if (!selectedSize) return;
    setAddingToCart(true);
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          quantity,
          size: selectedSize,
          colorValue: selectedColor?.colorValue || '',
        }),
      });
      if (res.ok) {
        setAddedToCart(true);
        setTimeout(() => setAddedToCart(false), 3000);
        // Rediriger vers l'accueil avec le panier ouvert
        router.push('/?openCart=1');
      }
    } catch (err) {
      console.error('Erreur ajout panier:', err);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleWhatsAppOrder = () => {
    const phone = '22890000000';
    let text = `Bonjour Maison Khan, je souhaite commander :\n\n`;
    text += `📦 ${product.name}\n`;
    if (selectedColor) text += `🎨 Couleur : ${selectedColor.colorName}\n`;
    if (selectedSize) text += `📏 Taille : ${selectedSize}\n`;
    text += `🔢 Quantité : ${quantity}\n`;
    if (currentPrice > 0) text += `💰 Prix unitaire : ${formatPrice(currentPrice)}\n`;
    text += `\n${shareUrl}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Navigation images
  const nextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % currentImages.length);
  };
  const prevImage = () => {
    setSelectedImageIndex((prev) => (prev - 1 + currentImages.length) % currentImages.length);
  };

  const genreLabel =
    product.genre === 'femme' ? 'Femme' : product.genre === 'homme' ? 'Homme' : 'Mixte';

  const stockLabel =
    currentStock > 10
      ? 'En stock'
      : currentStock > 0
      ? `Plus que ${currentStock} en stock`
      : 'Épuisé';
  const stockClass =
    currentStock > 10
      ? 'text-green-700'
      : currentStock > 0
      ? 'text-amber-700'
      : 'text-red-700';

  return (
    <div className="min-h-screen bg-[#F8F6F3] text-[#0A0A0A]">
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-[#6B6560] hover:text-[#0A0A0A] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour à la boutique
        </Link>
      </div>

      {/* Breadcrumb path */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <nav className="flex items-center gap-2 text-xs text-[#9C9A92] tracking-wider">
          <Link href="/" className="hover:text-[#9C7C5C] transition-colors">
            Accueil
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="uppercase">{product.category}</span>
          {product.subCategory && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className="uppercase">{product.subCategory}</span>
            </>
          )}
        </nav>
      </div>

      {/* Layout principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          {/* === COLONNE GAUCHE : GALERIE D'IMAGES === */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="flex flex-col-reverse md:flex-row gap-4">
              {/* Thumbnails (vertical sur desktop, horizontal sur mobile) */}
              {currentImages.length > 1 && (
                <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:max-h-[600px] md:overflow-y-auto">
                  {currentImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative flex-shrink-0 w-20 h-20 md:w-24 md:h-24 overflow-hidden border-2 transition-all ${
                        selectedImageIndex === idx
                          ? 'border-[#9C7C5C]'
                          : 'border-[#E5E0DA] hover:border-[#9C7C5C]/50'
                      }`}
                    >
                      <img
                        src={img}
                        alt={`${product.name} - vue ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Image principale */}
              <div className="flex-1 relative aspect-[4/5] bg-[#EDE8E1] overflow-hidden group">
                {currentImages[selectedImageIndex] ? (
                  <img
                    src={currentImages[selectedImageIndex]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#9C9A92]">
                    Pas d'image
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  {product.isNew && (
                    <span className="bg-[#0A0A0A] text-[#F8F6F3] text-[10px] tracking-widest uppercase px-3 py-1">
                      Nouveauté
                    </span>
                  )}
                  {product.isBestSeller && (
                    <span className="bg-[#9C7C5C] text-[#F8F6F3] text-[10px] tracking-widest uppercase px-3 py-1">
                      Best-seller
                    </span>
                  )}
                </div>

                {/* Flèches navigation */}
                {currentImages.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      aria-label="Image précédente"
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#F8F6F3]/80 backdrop-blur-sm flex items-center justify-center hover:bg-[#F8F6F3] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={nextImage}
                      aria-label="Image suivante"
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#F8F6F3]/80 backdrop-blur-sm flex items-center justify-center hover:bg-[#F8F6F3] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>

                    {/* Compteur images */}
                    <div className="absolute bottom-4 right-4 bg-[#0A0A0A]/70 text-[#F8F6F3] text-xs px-3 py-1 tracking-wider">
                      {selectedImageIndex + 1} / {currentImages.length}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* === COLONNE DROITE : INFOS PRODUIT === */}
          <div className="flex flex-col">
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[10px] tracking-[0.2em] uppercase text-[#9C7C5C]">
                {product.subCategory || product.category}
              </span>
              <span className="text-[#E5E0DA]">|</span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-[#6B6560]">
                {genreLabel}
              </span>
            </div>

            {/* Titre */}
            <h1
              className="font-display text-4xl md:text-5xl lg:text-6xl font-light leading-tight mb-4"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {product.name}
            </h1>

            {/* Prix + Stock */}
            <div className="flex items-baseline gap-4 mb-6 pb-6 border-b border-[#E5E0DA]">
              {currentPrice > 0 ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-[#6B6560] uppercase tracking-wider">
                    {product.colors?.length > 1 || product.sizes?.length > 1
                      ? 'À partir de'
                      : 'Prix'}
                  </span>
                  <span className="text-3xl font-light tracking-wide">
                    {formatPrice(currentPrice)}
                  </span>
                </div>
              ) : (
                <span className="text-xl text-[#6B6560] italic">Prix sur demande</span>
              )}
              <span className={`text-xs ml-auto uppercase tracking-wider ${stockClass}`}>
                {stockLabel}
              </span>
            </div>

            {/* Description */}
            {product.description && (
              <div className="mb-8">
                <p className="text-[#6B6560] leading-relaxed text-sm md:text-base whitespace-pre-wrap">
                  {product.description}
                </p>
              </div>
            )}

            {/* === SÉLECTEUR DE COULEUR === */}
            {product.colors?.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs tracking-widest uppercase text-[#0A0A0A]">
                    Couleur
                  </label>
                  <span className="text-xs text-[#6B6560] italic">
                    {selectedColor?.colorName}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {product.colors.map((color, idx) => (
                    <button
                      key={color.id}
                      onClick={() => setSelectedColorIndex(idx)}
                      aria-label={color.colorName}
                      className={`relative w-12 h-12 rounded-full border-2 transition-all ${
                        selectedColorIndex === idx
                          ? 'border-[#0A0A0A] scale-110'
                          : 'border-[#E5E0DA] hover:border-[#9C7C5C]'
                      }`}
                      style={{ backgroundColor: getColorHex(color.colorValue) }}
                      title={color.colorName}
                    >
                      {selectedColorIndex === idx && (
                        <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-md" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* === SÉLECTEUR DE TAILLE === */}
            {product.sizes?.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs tracking-widest uppercase text-[#0A0A0A]">
                    Taille
                  </label>
                  <span className="text-xs text-[#9C7C5C] underline cursor-pointer">
                    Guide des tailles
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => {
                    const sizeInfo = selectedColor?.sizes?.find((s) => s.size === size);
                    const isAvailable = !sizeInfo || sizeInfo.stock > 0;
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        disabled={!isAvailable}
                        className={`min-w-[3rem] h-12 px-3 border text-sm tracking-wider transition-all ${
                          selectedSize === size
                            ? 'border-[#0A0A0A] bg-[#0A0A0A] text-[#F8F6F3]'
                            : isAvailable
                            ? 'border-[#E5E0DA] hover:border-[#0A0A0A]'
                            : 'border-[#E5E0DA] text-[#9C9A92] line-through cursor-not-allowed'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === QUANTITÉ === */}
            <div className="mb-8">
              <label className="text-xs tracking-widest uppercase text-[#0A0A0A] mb-3 block">
                Quantité
              </label>
              <div className="inline-flex items-center border border-[#E5E0DA]">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-12 h-12 text-lg hover:bg-[#EDE8E1] transition-colors"
                  aria-label="Diminuer"
                >
                  −
                </button>
                <span className="w-16 text-center text-lg">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(currentStock || 99, q + 1))}
                  className="w-12 h-12 text-lg hover:bg-[#EDE8E1] transition-colors"
                  aria-label="Augmenter"
                >
                  +
                </button>
              </div>
            </div>

            {/* === BOUTONS D'ACTION === */}
            <div className="flex flex-col gap-3 mb-8">
              <button
                onClick={handleAddToCart}
                disabled={!selectedSize || currentStock === 0 || addingToCart}
                className="w-full py-4 bg-[#0A0A0A] text-[#F8F6F3] text-xs tracking-[0.2em] uppercase hover:bg-[#2C2C2A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {addingToCart ? (
                  <>Ajout en cours...</>
                ) : addedToCart ? (
                  <>
                    <Check className="w-4 h-4" />
                    Ajouté au panier
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    Ajouter au panier
                  </>
                )}
              </button>

              <button
                onClick={handleWhatsAppOrder}
                disabled={currentStock === 0}
                className="w-full py-4 border border-[#0A0A0A] text-[#0A0A0A] text-xs tracking-[0.2em] uppercase hover:bg-[#0A0A0A] hover:text-[#F8F6F3] transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <MessageCircle className="w-4 h-4" />
                Commander via WhatsApp
              </button>
            </div>

            {/* === PARTAGE === */}
            <div className="mb-8 pb-8 border-b border-[#E5E0DA]">
              <div className="flex items-center justify-between">
                <span className="text-xs tracking-widest uppercase text-[#6B6560]">
                  Partager ce produit
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleShareWhatsApp}
                    aria-label="Partager sur WhatsApp"
                    className="w-10 h-10 flex items-center justify-center border border-[#E5E0DA] hover:border-[#9C7C5C] hover:bg-[#9C7C5C]/10 transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleShareFacebook}
                    aria-label="Partager sur Facebook"
                    className="w-10 h-10 flex items-center justify-center border border-[#E5E0DA] hover:border-[#9C7C5C] hover:bg-[#9C7C5C]/10 transition-all"
                  >
                    <span className="text-xs font-bold">f</span>
                  </button>
                  <button
                    onClick={handleCopyLink}
                    aria-label="Copier le lien"
                    className="w-10 h-10 flex items-center justify-center border border-[#E5E0DA] hover:border-[#9C7C5C] hover:bg-[#9C7C5C]/10 transition-all"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-700" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    aria-label="Plus d'options"
                    className="w-10 h-10 flex items-center justify-center border border-[#E5E0DA] hover:border-[#9C7C5C] hover:bg-[#9C7C5C]/10 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Lien partageable */}
              {showShareMenu && (
                <div className="mt-4 p-4 bg-[#EDE8E1]/50 border border-[#E5E0DA]">
                  <p className="text-xs text-[#6B6560] mb-2 uppercase tracking-wider">
                    Lien direct du produit
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="flex-1 px-3 py-2 text-xs bg-white border border-[#E5E0DA] text-[#6B6560] truncate"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-2 bg-[#0A0A0A] text-[#F8F6F3] text-xs uppercase tracking-wider hover:bg-[#2C2C2A]"
                    >
                      {copied ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                  {copied && (
                    <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Lien copié dans le presse-papier
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* === AVANTAGES === */}
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="flex flex-col items-center gap-2 p-3">
                <Truck className="w-6 h-6 text-[#9C7C5C]" />
                <p className="text-[10px] tracking-wider uppercase text-[#6B6560]">
                  Livraison rapide
                </p>
              </div>
              <div className="flex flex-col items-center gap-2 p-3">
                <Shield className="w-6 h-6 text-[#9C7C5C]" />
                <p className="text-[10px] tracking-wider uppercase text-[#6B6560]">
                  Paiement sécurisé
                </p>
              </div>
            </div>

            {/* Bouton wishlist (décoratif) */}
            <button className="mt-6 self-start inline-flex items-center gap-2 text-xs tracking-widest uppercase text-[#6B6560] hover:text-[#0A0A0A] transition-colors">
              <Heart className="w-4 h-4" />
              Ajouter aux favoris
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
