import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientShell from '@/components/ClientShell';
import { asset } from '@/lib/base';

export const metadata: Metadata = {
  title: 'Age of Conquerors',
  description: 'Tarayıcıda çalışan büyük strateji oyunu: ekonomi, diplomasi, ordu ve alternatif tarih.',
  icons: { icon: asset('/favicon.svg') },
};

export const viewport: Viewport = {
  themeColor: '#0a101b',
  width: 'device-width',
  initialScale: 1,
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
