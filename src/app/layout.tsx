import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const description =
  'The War Above the Storm. Humanity’s last civilization fights across floating megacities on ancient wind technology — a fast-paced multiplayer FPS, free in your browser. No downloads.';

export const metadata: Metadata = {
  title: 'WindArms — The War Above the Storm',
  description,
  keywords: ['WindArms', 'browser FPS', 'multiplayer shooter', 'io game', 'competitive FPS', 'free FPS'],
  openGraph: {
    title: 'WindArms — The War Above the Storm',
    description,
    type: 'website',
    siteName: 'WindArms',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WindArms — The War Above the Storm',
    description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A1522',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
