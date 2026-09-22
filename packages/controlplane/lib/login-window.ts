/**
 * How long a QR login stays open — the window between rendering the code and a wallet actually
 * connecting to the server-side PeerJS channel (`UserLoginChannel.startP2PSession`, round 0).
 *
 * Until this existed, round 0 had no bound at all. Rounds 1+ raced `channel.receive()` against a
 * 5-second timeout, but the *first* receive — the one waiting for a wallet that may never arrive —
 * awaited forever, because PeerJS does not signal that nobody ever connected. Every abandoned QR
 * code therefore left a background async loop and an open channel alive for the life of the
 * process. The window closes that, and doubles as the number the page counts down so the person
 * looking at the code knows how long they have.
 *
 * Bounded on both ends rather than free-form:
 *
 * - **Below `MIN`**, the window is shorter than it takes to unlock a phone and open a wallet app,
 *   so a legitimate scan would fail on a timer an admin set by accident.
 * - **Above `MAX`**, it would outlive the `AuthCertificate` row the exchange writes to
 *   (`AUTH_CERTIFICATE_TTL_MS`, ten minutes). A wallet connecting after that point would run a
 *   complete, valid handshake against a row that can no longer be redeemed — the worst kind of
 *   failure, since everything looks like it worked. The cap keeps the window inside the credential.
 */
export const DEFAULT_P2P_CONNECT_WINDOW_SECONDS = 120;
export const MIN_P2P_CONNECT_WINDOW_SECONDS = 30;
export const MAX_P2P_CONNECT_WINDOW_SECONDS = 600;

/**
 * Read a stored window value, falling back to the default and clamping to the bounds above.
 *
 * Total rather than throwing, because this runs on the public login path: a `Setting` row holding
 * something unparseable — hand-edited, or written by an older build — must degrade to the default
 * window, not take sign-in down. {@link validateP2PConnectWindowSeconds} is the strict counterpart
 * the admin form uses, where rejecting bad input is exactly the right thing.
 */
export function parseP2PConnectWindowSeconds(raw: string | null | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_P2P_CONNECT_WINDOW_SECONDS;
  return Math.min(
    MAX_P2P_CONNECT_WINDOW_SECONDS,
    Math.max(MIN_P2P_CONNECT_WINDOW_SECONDS, parsed)
  );
}

/** The admin form's check: say no to an out-of-range value rather than silently clamping it, so
 *  nobody saves "5" and later wonders why logins get two minutes. */
export function validateP2PConnectWindowSeconds(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error("The sign-in window must be a number of seconds");
  if (parsed < MIN_P2P_CONNECT_WINDOW_SECONDS || parsed > MAX_P2P_CONNECT_WINDOW_SECONDS) {
    throw new Error(
      `The sign-in window must be between ${MIN_P2P_CONNECT_WINDOW_SECONDS} and ${MAX_P2P_CONNECT_WINDOW_SECONDS} seconds`
    );
  }
  return parsed;
}
