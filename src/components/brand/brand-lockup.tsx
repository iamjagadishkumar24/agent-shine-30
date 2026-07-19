import { Link } from "@tanstack/react-router";
import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * BrandLockup — the canonical Zenwork Performance Manager identity block.
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
  sm: "h-9 w-9 sm:h-10 sm:w-10",
  md: "h-10 w-10 sm:h-11 sm:w-11 lg:h-12 lg:w-12",
  lg: "h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14",
};

const WORDMARK_SIZE: Record<BrandLockupSize, string> = {
  sm: "text-[18px] sm:text-[20px]",
  md: "text-[20px] sm:text-[24px] lg:text-[26px]",
  lg: "text-[22px] sm:text-[26px] md:text-[28px] lg:text-[30px]",
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
  focusOffsetClass = "focus-visible:ring-offset-[#F4F7FC]",
}: BrandLockupProps) {
  const taglineText = tagline === true ? DEFAULT_TAGLINE : tagline || "";

  const lockupInner = (
    <>
      <img
        src={zenworkLogo.url}
        alt=""
        aria-hidden="true"
        className={cn("shrink-0 object-contain", LOGO_SIZE[size])}
      />
      <span
        className={cn(
          "font-display font-bold leading-none tracking-tight whitespace-nowrap",
          "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent",
          WORDMARK_SIZE[size],
        )}
      >
        Zenwork Performance Manager
      </span>

    </>
  );

  const lockupClasses = cn(
    "group inline-flex flex-col items-center gap-3 rounded-xl px-2 py-1 outline-none",
    "transition-opacity hover:opacity-90",
    "focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-4",
    focusOffsetClass,
    "sm:flex-row sm:gap-4",
  );

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {href ? (
        <Link
          to={href}
          aria-label="Zenwork Performance Manager — go to home"
          className={lockupClasses}
        >
          {lockupInner}
        </Link>
      ) : (
        <div aria-label="Zenwork Performance Manager" className={lockupClasses}>
          {lockupInner}
        </div>
      )}
      {taglineText && (
        <p
          className={cn(
            "mt-3 max-w-xs text-center leading-relaxed text-slate-500 sm:max-w-sm",
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
