/* eslint-disable @next/next/no-img-element -- static brand assets from /public, no optimisation needed */
import { cn } from "@/lib/utils";

/** The shield mark alone — for square slots (sidebar, compact headers). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/vaultysclaw-mark.png"
      alt="VaultysClaw"
      className={cn("h-8 w-auto shrink-0 select-none", className)}
      draggable={false}
    />
  );
}

/**
 * The full VaultysClaw wordmark. The navy "VAULTYS" would vanish on a dark
 * background, so a second asset with a light wordmark swaps in under `.dark`.
 */
export function BrandLogo({ className }: { className?: string }) {
  const base = cn("h-6 w-auto shrink-0 select-none", className);
  return (
    <>
      <img
        src="/brand/vaultysclaw-logo.png"
        alt="VaultysClaw"
        className={cn(base, "dark:hidden")}
        draggable={false}
      />
      <img
        src="/brand/vaultysclaw-logo-dark.png"
        alt="VaultysClaw"
        className={cn(base, "hidden dark:block")}
        draggable={false}
      />
    </>
  );
}
