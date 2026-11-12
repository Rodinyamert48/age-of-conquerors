import type { Metadata, Viewport } from 'next';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/700.css';
import './globals.css';
import ClientShell from '@/components/ClientShell';
import { asset } from '@/lib/base';

export const metadata: Metadata = {
  title: 'Age of Conquerors',
  description: 'Tarayıcıda çalışan büyük strateji oyunu: ekonomi, diplomasi, ordu ve alternatif tarih.',
  icons: { icon: asset('/favicon.svg') },
  manifest: asset('/manifest.webmanifest'),
  appleWebApp: { capable: true, title: 'Age of Conquerors', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#060606',
  width: 'device-width',
  initialScale: 1,
  // Mobilde çift dokunma/kıstırma sayfayı değil haritayı yakınlaştırsın
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="h-full">
      <body className="h-full antialiased">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
