import { cn } from '@/lib/utils';

/**
 * The Atlas mark.
 *
 * A vector trace of the supplied logo (`icons/just-icon.png`), kept to the same
 * geometry: five nodes joined by four edges, forming an A. The originals are
 * 2000px opaque-white PNGs, which would paint a white box on the paper ground
 * and cost 300KB to draw a 24px glyph — so the UI uses this instead. The PNGs
 * are kept in `public/brand/` for the places a raster is correct (social cards,
 * the iOS home-screen icon).
 *
 * It draws in `currentColor`, so it works on paper and on ink without a second
 * asset. The mark is the product's whole thesis in one glyph: people are nodes,
 * the lines between them are the point.
 */
export function LogoMark({
  className,
  title,
}: {
  className?: string;
  /** Pass a title only when the mark stands alone as the accessible name. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={cn('shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={6.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {/* edges — outer legs from the apex, inner legs from the mid node */}
      <path d="M60 18 12 103M60 18l48 85M60 64 42 103M60 64l48 39" />
      {/* nodes */}
      <g fill="currentColor" stroke="none">
        <circle cx="60" cy="18" r="10" />
        <circle cx="60" cy="64" r="10" />
        <circle cx="12" cy="103" r="10" />
        <circle cx="42" cy="103" r="10" />
        <circle cx="108" cy="103" r="10" />
      </g>
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is set in Archivo rather than traced from
 * the PNG so it stays crisp at every size and matches the product's typography.
 */
export function Logo({
  className,
  markClassName,
  wordClassName,
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={cn('h-6 w-6 text-ink', markClassName)} />
      <span className={cn('title text-[15px] leading-none tracking-[-0.02em]', wordClassName)}>
        Atlas
      </span>
    </span>
  );
}
