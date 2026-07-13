import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}

/** Shared eyebrow/title/subtitle block — one look, every section. */
export default function SectionHeading({ eyebrow, title, subtitle, align = 'left' }: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <p
        data-reveal
        className="text-[11px] font-bold uppercase tracking-[0.35em] text-storm-gold"
      >
        {eyebrow}
      </p>
      <h2
        data-reveal
        className="mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight text-storm-marble sm:text-4xl md:text-5xl"
      >
        {title}
      </h2>
      {subtitle ? (
        <p data-reveal className="mt-4 text-sm leading-relaxed text-storm-mist/75 sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
