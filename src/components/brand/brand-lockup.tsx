import { Link } from "@tanstack/react-router";
import qualipulseMark from "@/assets/qualipulse-mark.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * BrandLockup — the canonical QualiPulse identity block.
 *
 * A single unified lockup used across every authentication surface (sign in,
 * sign up, forgot password, reset password). The logo, wordmark, and optional
 * tagline are grouped so spacing, alignment, and typography stay identical
 * everywhere.
 *
 * Layout:
 *   - Mobile: logo stacks above the wordmark, both centered.
 *   - Tablet+: logo sits horizontally to the left of the wordmark with a
 *     consistent 12–16px gap, vertically centered.
 *   - Tagline (optional) sits directly beneath the lockup, centered.
 *
 * Sizes:
 *   size="sm"  — 36–40px logo, 18–20px wordmark (compact surfaces).
 *   size="md"  — 40–48px logo, 22–26px wordmark (secondary auth surfaces).
 *   size="lg"  — 40–56px logo, 22–30px wordmark (primary sign in / sign up).
 */

export type BrandLockupSize = "sm" | "md" | "lg";

type BrandLockupProps = {
  size?: BrandLockupSize;
  tagline?: string | boolean;
  href?: string | null;
  className?: string;
  taglineClassName?: string;
  /** Ring offset color on focus (must match the surrounding page background). */
  focusOffsetClass?: string;
};

const DEFAULT_TAGLINE =
  "Driving Customer Success Through Quality, Performance & Continuous Improvement";

const LOGO_SIZE: Record<BrandLockupSize, string> = {
  sm: "h-8 w-8 sm:h-9 sm:w-9",
  md: "h-9 w-9 sm:h-10 sm:w-10 lg:h-11 lg:w-11",
  lg: "h-9 w-9 sm:h-11 sm:w-11 md:h-12 md:w-12 lg:h-13 lg:w-13 xl:h-14 xl:w-14",
};

const WORDMARK_SIZE: Record<BrandLockupSize, string> = {
  sm: "text-[16px] sm:text-[18px]",
  md: "text-[18px] sm:text-[22px] lg:text-[24px]",
  lg: "text-[18px] sm:text-[22px] md:text-[26px] lg:text-[28px] xl:text-[30px]",
};


const TAGLINE_SIZE: Record<BrandLockupSize, string> = {
  sm: "text-[11.5px] sm:text-[12px]",
  md: "text-[12px] sm:text-[12.5px]",
  lg: "text-[12.5px] sm:text-[13px]",
};

export function BrandLockup({
  size = "lg",
  tagline = true,
  href = "/",
  className,
  taglineClassName,
  focusOffsetClass,
}: BrandLockupProps) {
  const taglineText = tagline === true ? DEFAULT_TAGLINE : tagline || "";

  const lockupInner = (
    <>
      <img
        src={qualipulseMark.url}
        alt=""
        aria-hidden="true"
        // The mark is a colored isometric cube (green / yellow / purple) that
        // reads well on both light and dark canvases. A soft rounded backdrop
        // guarantees minimum contrast against very dark surfaces without
        // altering the mark itself.
        className={cn(
          "shrink-0 object-contain rounded-md",
          "dark:bg-white/5 dark:ring-1 dark:ring-white/10 dark:p-0.5",
          LOGO_SIZE[size],
        )}
      />
      <span
        className={cn(
          "font-display font-bold leading-none tracking-tight whitespace-nowrap",
          // Light: deep indigo → violet → purple (AA on #F4F7FC / white).
          // Dark:  brighter indigo-400 → violet-400 → fuchsia-400 (AA on
          // near-black surfaces such as #0B1220). Fallback color is set so
          // the wordmark stays legible if `background-clip: text` is
          // unavailable or a print stylesheet strips gradients.
          "text-indigo-600 dark:text-indigo-300",
          "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600",
          "dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300",
          "bg-clip-text text-transparent",
          WORDMARK_SIZE[size],
        )}
      >
        QualiPulse
      </span>
    </>
  );

  const lockupClasses = cn(
    "group inline-flex flex-col items-center gap-3 rounded-xl px-2 py-1 outline-none",
    "transition-opacity hover:opacity-90",
    // Focus ring uses design-token background as offset so it works in both
    // light and dark themes without a hard-coded page color.
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
    focusOffsetClass,
    "sm:flex-row sm:gap-4",
  );

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {href ? (
        <Link
          to={href}
          aria-label="QualiPulse — go to home"
          className={lockupClasses}
        >
          {lockupInner}
        </Link>
      ) : (
        <div aria-label="QualiPulse" className={lockupClasses}>
          {lockupInner}
        </div>
      )}
      {taglineText && (
        <p
          className={cn(
            // `text-muted-foreground` resolves through the design system so
            // it stays WCAG-AA compliant in both themes; the previous
            // hard-coded `text-slate-500` failed contrast on dark surfaces.
            "mt-3 max-w-xs text-center leading-relaxed text-muted-foreground sm:max-w-sm",
            TAGLINE_SIZE[size],
            taglineClassName,
          )}
        >
          {taglineText}
        </p>
      )}
    </div>
  );
}

