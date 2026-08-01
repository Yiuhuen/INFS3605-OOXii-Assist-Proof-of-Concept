export type BrandLogoSize = "small" | "medium" | "large";

const TEXT_CLASSES: Record<BrandLogoSize, string> = {
  small: "text-base",
  medium: "text-xl",
  large: "text-3xl"
};

/**
 * OOXii wordmark. Rendered as styled text rather than an image: the repo
 * ships no raster wordmark (public/brand/ holds only the small app icon), so
 * an <img> here would 404 on every load and flash an empty gap before any
 * fallback fired. Text renders instantly, works fully offline, and scales
 * cleanly at any pixel density. If a real wordmark asset lands later, swap
 * it in here — every screen picks a size name, never raw markup, so this
 * stays the single place to change.
 */
export function BrandLogo({ size = "medium", className = "" }: { size?: BrandLogoSize; className?: string }) {
  return (
    <span aria-label="OOXii" className={`font-black tracking-tight text-[var(--gold)] ${TEXT_CLASSES[size]} ${className}`}>
      OOXii
    </span>
  );
}
