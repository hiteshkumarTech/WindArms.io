import BackgroundFallback from '@/components/three/BackgroundFallback';
import Footer from '@/components/landing/Footer';
import Navbar from '@/components/landing/Navbar';

interface PageShellProps {
  children: React.ReactNode;
}

/**
 * Shared shell for content routes (heroes/weapons/maps): a fixed navbar over a
 * static ambient backdrop, a centered content column padded clear of the nav,
 * and the site footer. Server-rendered; the interactive nav/footer are client
 * islands.
 */
export default function PageShell({ children }: PageShellProps) {
  return (
    <div className="relative min-h-[100dvh] bg-void">
      <div className="fixed inset-0 z-0">
        <BackgroundFallback />
      </div>
      <div
        className="noise-overlay pointer-events-none fixed inset-0 z-[1] opacity-[0.05] mix-blend-overlay"
        aria-hidden
      />
      <Navbar />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-28 sm:px-8 lg:pt-32">
        {children}
      </main>
      <Footer />
    </div>
  );
}
