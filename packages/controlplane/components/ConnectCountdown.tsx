"use client";

import { useEffect, useState } from "react";

/**
 * How much of the QR sign-in window is left.
 *
 * Purely feedback — it starts no timers the flow depends on and decides nothing. The page's own
 * poll loop owns the transition to failure, and the server's `startP2PSession` owns the actual
 * deadline; this only draws the number both of them already agreed on
 * (`connectWindowSeconds`, from the `p2p-connect` route). Hitting 0:00 here therefore means "the
 * server has stopped waiting", not "this component gave up".
 *
 * Before it existed, a QR code that nobody scanned looked identical to one being processed —
 * "Waiting for scan…" and a spinner, indefinitely — so there was nothing to tell someone whether
 * to keep holding their phone up or start again.
 */
export default function ConnectCountdown({
  deadline,
  totalSeconds,
}: {
  /** `Date.now()`-based epoch ms at which the server stops waiting. */
  deadline: number;
  totalSeconds: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  // 250ms rather than 1s: the bar is a continuous quantity, and a once-a-second step makes a
  // two-minute window visibly lurch. The label is derived with Math.ceil so it still reads as a
  // normal whole-second countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, deadline - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const fraction = totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const label = `${minutes}:${String(seconds).padStart(2, "0")}`;

  // The last 20% turns amber and the last 10% red — the point is that someone glancing at the
  // card can tell "plenty of time" from "start again" without reading the number.
  const tone =
    fraction > 0.2
      ? { bar: "bg-primary-500", text: "text-foreground-500" }
      : fraction > 0.1
        ? { bar: "bg-warning-500", text: "text-warning-600" }
        : { bar: "bg-danger-500", text: "text-danger-600" };

  return (
    <div className="space-y-2">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-neutral-200/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSeconds}
        aria-valuenow={remainingSeconds}
        aria-label="Time left to scan the code"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${tone.bar}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p className={`text-center text-xs tabular-nums ${tone.text}`}>
        {remainingSeconds > 0 ? (
          <>
            This code expires in <span className="font-medium">{label}</span>
          </>
        ) : (
          "This code has expired."
        )}
      </p>
    </div>
  );
}
