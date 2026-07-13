'use client';

import { IMAGE_EXTENSIONS, useResolvedAsset } from '@/lib/v2/assetResolver';
import { cn } from '@/lib/utils';

interface SmartImageProps {
  /** Asset slot name inside public/v2-art/ (no extension). */
  slot: string;
  alt: string;
  /** Rendered until (and unless) real art resolves — the procedural look. */
  fallback: React.ReactNode;
  className?: string;
  imgClassName?: string;
}

/**
 * Art-slot image: probes /v2-art/<slot>.(webp|png|jpg) and swaps the
 * procedural fallback for the real asset when it exists. Drop art in,
 * it appears; remove it, the fallback returns. Zero code changes.
 */
export default function SmartImage({ slot, alt, fallback, className, imgClassName }: SmartImageProps) {
  const url = useResolvedAsset(slot, IMAGE_EXTENSIONS);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
