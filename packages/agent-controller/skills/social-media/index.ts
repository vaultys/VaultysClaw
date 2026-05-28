/**
 * Social-media skill — post to X (Twitter) via browser automation.
 *
 * Uses Playwright with a persistent browser session (cookies stored on disk).
 * The user authenticates once via setup_x_session; subsequent posts are headless.
 *
 * Required capability: "social_media_posting"
 */

import { tool } from "ai";
import { z } from "zod";
import type { SkillDefinition } from "../../src/skills/types.js";
import {
  postTweet,
  setupXSession,
  hasXSession,
  clearXSession,
} from "./x-browser-client.js";

export const skill: SkillDefinition = {
  name: "social-media",
  description: "Post content to X (Twitter) via browser automation",
  version: "1.0.0",
  tools: [
    // ------------------------------------------------------------------
    // Setup — one-time interactive login
    // ------------------------------------------------------------------
    {
      name: "setup_x_session",
      capability: "social_media_posting",
      requiresApproval: false, // no external action yet, just opens a browser
      tool: tool({
        description:
          "One-time setup: opens a visible browser window so the user can log in to X. " +
          "After successful login the session is saved locally and re-used for all future posts. " +
          "Run this once before using post_to_x.",
        inputSchema: z.object({
          timeoutSeconds: z
            .number()
            .optional()
            .default(300)
            .describe("Seconds to wait for the user to log in (default 300 = 5 minutes)"),
        }),
        execute: async ({ timeoutSeconds }) => {
          try {
            if (hasXSession()) {
              return {
                success: true,
                message: "An X session already exists. Use clear_x_session first if you want to re-authenticate.",
                hasSession: true,
              };
            }

            await setupXSession((timeoutSeconds ?? 300) * 1000);
            return {
              success: true,
              message:
                "X session saved. You can now use post_to_x to publish tweets automatically.",
              hasSession: true,
            };
          } catch (err) {
            return {
              success: false,
              error: `Session setup failed: ${String(err)}`,
            };
          }
        },
      }),
    },

    // ------------------------------------------------------------------
    // Post a tweet
    // ------------------------------------------------------------------
    {
      name: "post_to_x",
      capability: "social_media_posting",
      requiresApproval: true, // requires human approval before posting publicly
      tool: tool({
        description:
          "Post a tweet to X (Twitter). Text must be 280 characters or fewer. " +
          "Requires a saved X session (run setup_x_session first).",
        inputSchema: z.object({
          text: z
            .string()
            .max(280)
            .describe("Tweet text — max 280 characters"),
        }),
        execute: async ({ text }) => {
          try {
            if (!hasXSession()) {
              return {
                success: false,
                error:
                  "No X session found. Run setup_x_session first to authenticate with X.",
              };
            }

            const result = await postTweet(text);

            return {
              success: true,
              tweetUrl: result.tweetUrl,
              text: result.text,
              postedAt: result.postedAt,
            };
          } catch (err) {
            const msg = String(err);
            // Detect session expiry so caller can re-prompt setup
            if (msg.includes("session expired") || msg.includes("re-authenticate")) {
              return {
                success: false,
                error: msg,
                sessionExpired: true,
              };
            }
            return {
              success: false,
              error: `Failed to post tweet: ${msg}`,
            };
          }
        },
      }),
    },

    // ------------------------------------------------------------------
    // Check session status
    // ------------------------------------------------------------------
    {
      name: "check_x_session",
      capability: "social_media_posting",
      requiresApproval: false,
      tool: tool({
        description: "Check whether a valid X browser session exists locally.",
        inputSchema: z.object({}),
        execute: async () => {
          const has = hasXSession();
          return {
            hasSession: has,
            message: has
              ? "X session file found. The agent can post to X."
              : "No X session found. Run setup_x_session first.",
          };
        },
      }),
    },

    // ------------------------------------------------------------------
    // Clear session (forces re-login)
    // ------------------------------------------------------------------
    {
      name: "clear_x_session",
      capability: "social_media_posting",
      requiresApproval: false,
      tool: tool({
        description:
          "Remove the saved X session. The next post_to_x call will require re-authentication via setup_x_session.",
        inputSchema: z.object({}),
        execute: async () => {
          clearXSession();
          return {
            success: true,
            message: "X session cleared. Run setup_x_session to re-authenticate.",
          };
        },
      }),
    },
  ],

  systemPromptExtension:
    "You have access to X (Twitter) social-media tools. " +
    "Use 'check_x_session' to verify setup, 'setup_x_session' for first-time authentication, " +
    "'post_to_x' to publish a tweet (requires approval). " +
    "Tweets must be ≤280 characters. Keep them engaging and on-brand.",
};
