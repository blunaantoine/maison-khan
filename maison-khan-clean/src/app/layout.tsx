import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F8F6F3",
};

export const metadata: Metadata = {
  title: {
    default: "MAISON KHAN | Chaussures de Luxe Made in Africa",
    template: "%s | MAISON KHAN"
  },
  description: "MAISON KHAN - Chaussures de luxe artisanales confectionnées au Togo. Made in Africa. Savoir-faire artisanal africain.",
  keywords: ["MAISON KHAN", "Chaussures", "Luxe", "Africa", "Togo", "Artisanat", "Mules", "Sandales", "Ballerines", "Made in Africa"],
  authors: [{ name: "MAISON KHAN" }],
  
  // Google Search Console Verification
  verification: {
    google: "h4Pb0vsHTU__5k51Tz2KIrZVrf54134xP7-7vBEtEXg",
  },
  
  // Favicon et icons
  icons: {
    icon: [
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    shortcut: "/favicon-32x32.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    other: [
      { rel: "icon", url: "/android-chrome-192x192.png", sizes: "192x192" },
      { rel: "icon", url: "/android-chrome-512x512.png", sizes: "512x512" },
    ],
  },
  
  // Open Graph (Facebook, LinkedIn)
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://maisonkhan.com",
    siteName: "MAISON KHAN",
    title: "MAISON KHAN | Chaussures de Luxe Made in Africa",
    description: "Chaussures de luxe artisanales confectionnées au Togo. Made in Africa.",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "MAISON KHAN - Chaussures de Luxe",
      },
    ],
  },
  
  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "MAISON KHAN | Chaussures de Luxe Made in Africa",
    description: "Chaussures de luxe artisanales confectionnées au Togo. Made in Africa.",
    images: ["/logo.png"],
  },
  
  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  
  // Autres métadonnées
  metadataBase: new URL("https://maisonkhan.com"),
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Favicon - format principal avec version pour vider le cache */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=2" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />
        
        {/* Apple Touch Icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        
        {/* Android/Chrome */}
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png?v=2" />
        <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png?v=2" />
        
        {/* Windows Tiles */}
        <meta name="msapplication-TileColor" content="#F8F6F3" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        
        {/* Theme Color */}
        <meta name="theme-color" content="#F8F6F3" />
      </head>
      <body
        className={`${cormorant.variable} ${outfit.variable} antialiased bg-[#F8F6F3] text-[#0A0A0A]`}
        style={{ fontFamily: "'Outfit', sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
