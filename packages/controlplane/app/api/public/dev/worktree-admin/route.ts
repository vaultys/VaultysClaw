import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { normaliseIdentity, type BrowserIdData } from "@/lib/browser-identity";

/**
 * The seeded admin of a git worktree's dev stack, for the "Sign in as the worktree admin" button
 * on /login (scripts/worktree.mjs seeds it and writes its key to `.worktree/admin.identity.json`).
 *
 * This hands out a private key, so it exists only where that is harmless: a development server
 * (never `NODE_ENV=production`) that `scripts/worktree.mjs exec` started with
 * `VAULTYSCLAW_WORKTREE_ADMIN` pointing at that file — a disposable, seeded database, on
 * localhost. Anywhere else it is a 404, like every endpoint that does not exist in an environment.
 *
 * It grants nothing by itself: the browser stores the key and then signs in through the ordinary
 * Challenger exchange, against an ordinary human Actor holding an ordinary `admin_console_access`
 * certificate.
 *
 *   GET  → `{ name, did }` — whether to show the button, without shipping the key on every page load
 *   POST → the key, in the shape `lib/browser-connect.ts` stores
 */
async function seededAdmin() {
  const file = process.env.VAULTYSCLAW_WORKTREE_ADMIN;
  if (process.env.NODE_ENV === "production" || !file) return null;
  try {
    const { name, ...raw } = JSON.parse(await readFile(file, "utf-8")) as Partial<BrowserIdData> & {
      name?: string;
    };
    if (!raw.did || !raw.vid || !raw.secret) return null;
    return { name: name ?? "Worktree admin", identity: normaliseIdentity(raw) };
  } catch {
    return null; // not seeded (yet), or seeded before this file existed
  }
}

export async function GET() {
  const admin = await seededAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ name: admin.name, did: admin.identity.did });
}

export async function POST(req: NextRequest) {
  // Another site open in the same browser can send this POST but cannot read the answer (no CORS
  // headers) — refusing cross-site requests outright keeps it from even trying.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403 });
  const admin = await seededAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });
  return NextResponse.json(admin.identity);
}
