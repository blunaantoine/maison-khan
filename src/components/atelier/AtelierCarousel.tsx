'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'

/**
 * MAISON KHAN — Carrousel « Images de l'atelier ».
 *
 * Affiché sur la page d'accueil (après « Notre Savoir-Faire ») et sur la
 * page À Propos. Les images sont gérées depuis le panneau admin
 * (Produits → « Images de l'atelier ») — voir /api/atelier-images.
 *
 * Carrousel embla (shadcn/ui) : glisser-déposer, flèches, points de
 * progression, avance automatique toutes les 5 s (en boucle), pause au
 * survol. Accessible : alt sur chaque image, boutons natifs du carrousel.
 */

export interface AtelierImageData {
  id: string
  image: string
  caption?: string | null
  order: number
}

interface AtelierCarouselProps {
  images: AtelierImageData[]
  title?: string
  subtitle?: string
  /** true = placé à l'intérieur d'un container existant (évite le double container) */
  contained?: boolean
}

const AUTOPLAY_MS = 5000

export default function AtelierCarousel({
  images,
  title = 'Dans Notre Atelier',
  subtitle = 'Le savoir-faire en images',
  contained = false,
}: AtelierCarouselProps) {
  const [paused, setPaused] = useState(false)
  const [api, setApi] = useState<CarouselApi | null>(null)
  const [selected, setSelected] = useState(0)
  const [snaps, setSnaps] = useState<number[]>([])

  const onApi = useCallback((carouselApi: CarouselApi) => {
    setApi(carouselApi)
    const update = () => {
      setSelected(carouselApi.selectedScrollSnap())
      setSnaps(carouselApi.scrollSnapList())
    }
    update()
    carouselApi.on('select', update)
    carouselApi.on('reInit', update)
  }, [])

  // Avance automatique (pause au survol) — en boucle
  useEffect(() => {
    if (!api || paused || images.length < 2) return
    const timer = setInterval(() => api.scrollNext(), AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [api, paused, images.length])

  if (!images || images.length === 0) return null

  return (
    <div
      className={contained ? 'py-16' : 'py-24 bg-[#F8F6F3]'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={contained ? '' : 'container mx-auto px-6 lg:px-12'}>
        <div className="text-center mb-12">
          <p className="hero-subtitle text-[#9C7C5C] mb-4">{subtitle}</p>
          <h2
            className="font-display text-4xl lg:text-5xl text-[#0A0A0A]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {title}
          </h2>
          <div className="section-divider mx-auto mt-6" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <Carousel
            opts={{ align: 'start', loop: true }}
            setApi={onApi}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {images.map((img) => (
                <CarouselItem
                  key={img.id}
                  className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3"
                >
                  <figure className="relative aspect-[4/3] bg-[#EDE8E1] overflow-hidden rounded-sm group">
                    <img
                      src={img.image}
                      alt={img.caption || 'Atelier MAISON KHAN — production artisanale'}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    {img.caption && (
                      <>
                        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#0A0A0A]/70 to-transparent pointer-events-none" />
                        <figcaption
                          className="absolute bottom-0 inset-x-0 p-4 text-[#F8F6F3] text-sm italic text-center"
                          style={{ fontFamily: "'Cormorant Garamond', serif" }}
                        >
                          {img.caption}
                        </figcaption>
                      </>
                    )}
                  </figure>
                </CarouselItem>
              ))}
            </CarouselContent>

            {/* Flèches — bronze, hors flux sur mobile */}
            <CarouselPrevious className="left-2 lg:-left-14 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border-[#9C7C5C] bg-[#F8F6F3]/90 text-[#9C7C5C] hover:bg-[#9C7C5C] hover:text-white hover:border-[#9C7C5C] shadow-sm" aria-label="Image précédente" />
            <CarouselNext className="right-2 lg:-right-14 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full border-[#9C7C5C] bg-[#F8F6F3]/90 text-[#9C7C5C] hover:bg-[#9C7C5C] hover:text-white hover:border-[#9C7C5C] shadow-sm" aria-label="Image suivante" />
          </Carousel>

          {/* Points de progression */}
          {snaps.length > 1 && (
            <div className="flex justify-center gap-2 mt-6" role="tablist" aria-label="Position dans le carrousel">
              {snaps.map((_, idx) => (
                <button
                  key={idx}
                  role="tab"
                  aria-selected={selected === idx}
                  aria-label={`Aller à la position ${idx + 1}`}
                  onClick={() => api?.scrollTo(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    selected === idx
                      ? 'w-8 bg-[#9C7C5C]'
                      : 'w-1.5 bg-[#E5E0DA] hover:bg-[#9C7C5C]/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
