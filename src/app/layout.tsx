import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const description =
  'Enter WindArms.io — a fast-paced multiplayer FPS where futuristic anime heroes, precision gunplay, and strategic teamwork collide inside breathtaking competitive arenas. Play free in your browser, no downloads.';

export const metadata: Metadata = {
  title: 'WindArms.io — Master the Storm. Dominate Every Match.',
  description,
  keywords: ['WindArms', 'browser FPS', 'multiplayer shooter', 'io game', 'competitive FPS', 'free FPS'],
  openGraph: {
    title: 'WindArms.io — Fast-Paced Browser Multiplayer FPS',
    description,
    type: 'website',
    siteName: 'WindArms.io',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WindArms.io — Fast-Paced Browser Multiplayer FPS',
    description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050505',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
