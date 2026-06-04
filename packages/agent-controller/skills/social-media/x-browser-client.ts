/**
 * X (Twitter) browser automation client using Playwright.
 *
 * Strategy: persistent browser context
 *   - On first use (or when session expired), opens a visible browser window
 *     so the human user can log in once (handles 2FA naturally).
 *   - After successful login the browser storage state (cookies + local storage)
 *     is saved to disk at `sessionPath`.
 *   - Subsequent posts load that saved state — no visible browser, no re-login.
 *
 * Session file location (default):
 *   <VAULTYS_DATA_DIR>/skills/social-media/x-session.json
 *   Falls back to ~/.vaultysclaw/skills/social-media/x-session.json
 */

import { chromium, type BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import os from "os";

// ---------------------------------------------------------------------------
// Session paths
// ---------------------------------------------------------------------------

function getSessionPath(): string {
  const dataDir =
    process.env.VAULTYS_DATA_DIR || path.join(os.homedir(), ".vaultysclaw");
  const dir = path.join(dataDir, "skills", "social-media");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "x-session.json");
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a saved session file exists (does not validate it).
 */
export function hasXSession(): boolean {
  return fs.existsSync(getSessionPath());
}

/**
 * Opens a visible (headed) Chromium window so the user can log in to X manually.
 * Waits until the user has fully authenticated (home feed visible) then saves
 * the browser state and closes the window.
 *
 * Call this from the `setup_x_session` skill tool.
 */
export async function setupXSession(timeoutMs = 300_000): Promise<void> {
  const sessionPath = getSessionPath();
  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(
      "[X-browser] Opening X login page — please log in within 5 minutes."
    );
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });

    // Wait until the user lands on the home feed (URL becomes x.com/home)
    await page.waitForURL("**/home", { timeout: timeoutMs });

    // Save the authenticated session state
    await context.storageState({ path: sessionPath });
    console.log(`[X-browser] Session saved to ${sessionPath}`);
  } finally {
    await browser.close();
  }
}

/**
 * Delete the saved session file (forces re-login on next run).
 */
export function clearXSession(): void {
  const sessionPath = getSessionPath();
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export interface PostResult {
  tweetUrl: string;
  text: string;
  postedAt: string;
}

/**
 * Post a tweet using the saved browser session.
 * Throws if no session is found (call setupXSession first).
 */
export async function postTweet(text: string): Promise<PostResult> {
  const sessionPath = getSessionPath();

  if (!fs.existsSync(sessionPath)) {
    throw new Error(
      "No X session found. Run the setup_x_session tool first to authenticate."
    );
  }

  if (!text || text.trim().length === 0) {
    throw new Error("Tweet text cannot be empty");
  }

  const trimmed = text.trim();
  if (trimmed.length > 280) {
    throw new Error(`Tweet exceeds 280 characters (${trimmed.length})`);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // Load saved cookies / local storage
    const context = await browser.newContext({
      storageState: sessionPath,
    });
    const page = await context.newPage();

    // Navigate to home
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

    // Check session is still valid
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/i/flow")) {
      await browser.close();
      // Remove stale session so next call triggers re-login
      clearXSession();
      throw new Error(
        "X session expired. Run setup_x_session to re-authenticate."
      );
    }

    // Click the tweet compose area
    // X's compose box uses a role="textbox" with a specific test ID
    const composeBox = page.getByTestId("tweetTextarea_0");
    await composeBox.waitFor({ state: "visible", timeout: 15_000 });
    await composeBox.click();
    await composeBox.fill(trimmed);

    // Short pause so X processes the input
    await page.waitForTimeout(500);

    // Click the "Post" button
    const postButton = page.getByTestId("tweetButtonInline");
    await postButton.waitFor({ state: "visible", timeout: 10_000 });
    await postButton.click();

    // Wait for the tweet to be submitted (post button disappears or URL changes)
    await page.waitForTimeout(2_000);

    // Update session state (refresh cookies/tokens)
    await context.storageState({ path: sessionPath });

    // Try to capture tweet URL from the latest tweet on the profile
    let tweetUrl = "https://x.com";
    try {
      await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
      // The first tweet in the feed after posting is usually the one we just posted
      const firstTweetLink = page
        .locator('article[data-testid="tweet"] a[href*="/status/"]')
        .first();
      const href = await firstTweetLink.getAttribute("href", {
        timeout: 5_000,
      });
      if (href) tweetUrl = `https://x.com${href}`;
    } catch {
      // Non-critical — we still posted successfully
    }

    return {
      tweetUrl,
      text: trimmed,
      postedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
