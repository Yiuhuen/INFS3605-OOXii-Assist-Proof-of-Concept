"use client";

import { useState } from "react";
import Image from "next/image";

export type BrandLogoSize = "small" | "medium" | "large";

/**
 * Height utility per size — screens pick a size name, never a raw pixel
 * value, so the wordmark stays consistent everywhere it appears. Width is
 * left to scale automatically (object-contain + w-auto) so the logo's real
 * aspect ratio is always preserved, however wide the source file is.
 */
const SIZE_CLASSES: Record<BrandLogoSize, string> = {
  small: "h-6",
  medium: "h-9",
  large: "h-14"
};

const TEXT_FALLBACK_CLASSES: Record<BrandLogoSize, string> = {
  small: "text-base",
  medium: "text-xl",
  large: "text-3xl"
};

/**
 * Official OOXii wordmark. Renders /public/brand/ooxii-logo.png via
 * next/image at a fixed intrinsic aspect ratio, sized by CSS height class
 * only (never distorted, never upscaled beyond its own resolution look —
 * object-contain keeps proportions exact).
 *
 * If the image file is missing or fails to load, falls back to a plain gold
 * "OOXii" text wordmark in the same footprint, so the screen never shows a
 * broken-image icon and stays usable offline or if the asset is absent.
 */
export function BrandLogo({ size = "medium", className = "" }: { size?: BrandLogoSize; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`font-black tracking-tight text-[var(--gold)] ${TEXT_FALLBACK_CLASSES[size]} ${className}`}>
        OOXii
      </span>
    );
  }

  return (
    <Image
      src="/brand/ooxii-logo.png"
      alt="OOXii logo"
      width={400}
      height={120}
      priority={size === "large"}
      className={`w-auto object-contain ${SIZE_CLASSES[size]} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
