/**
 * Web scraper skill — fetch and extract content from web pages.
 *
 * Requires "internet_access" capability. Uses regex-based extraction to avoid
 * a cheerio/jsdom dependency — works in any JS runtime.
 */

import { tool } from "ai";
import { z } from "zod";
import type { SkillDefinition } from "../../src/skills/types.js";

const MAX_TEXT = 64 * 1024;
const DEFAULT_TIMEOUT = 30_000;

/** Strip HTML tags and collapse whitespace. */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract all <a href="..."> links. */
function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const text = extractText(m[2]).trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    try {
      const abs = new URL(href, baseUrl).href;
      links.push({ text, href: abs });
    } catch {
      // Relative URL parsing failed — skip
    }
  }
  return links.slice(0, 50); // cap at 50 links
}

export const skill: SkillDefinition = {
  name: "web-scraper",
  description: "Fetch and extract text content and links from web pages",
  version: "1.0.0",
  tools: [
    {
      name: "scrape_page",
      capability: "internet_access",
      requiresApproval: false,
      tool: tool({
        description:
          "Fetch a web page and extract its readable text content and links. " +
          "Returns clean text (no HTML tags) and an array of hrefs found on the page.",
        inputSchema: z.object({
          url: z.string().url().describe("URL of the page to scrape"),
          includeLinks: z
            .boolean()
            .optional()
            .default(false)
            .describe("Whether to include extracted links in the response"),
          timeoutMs: z
            .number()
            .optional()
            .default(DEFAULT_TIMEOUT)
            .describe("Fetch timeout in milliseconds"),
        }),
        execute: async ({ url, includeLinks, timeoutMs }) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT);

          try {
            const res = await fetch(url, {
              headers: {
                "User-Agent": "VaultysClaw-Agent/1.0 (web scraper)",
                Accept: "text/html,text/plain,*/*",
              },
              signal: controller.signal,
            });

            if (!res.ok) {
              return { error: `HTTP ${res.status}: ${res.statusText}`, text: null, links: [] };
            }

            const contentType = res.headers.get("content-type") ?? "";
            if (!contentType.includes("text/")) {
              return { error: `Non-text content type: ${contentType}`, text: null, links: [] };
            }

            const html = await res.text();
            const text = extractText(html);
            const truncated = text.length > MAX_TEXT;
            const finalText = truncated ? text.slice(0, MAX_TEXT) + "... [truncated]" : text;

            return {
              url,
              text: finalText,
              truncated,
              links: includeLinks ? extractLinks(html, url) : [],
            };
          } catch (err) {
            if ((err as Error).name === "AbortError") {
              return { error: "Fetch timed out", text: null, links: [] };
            }
            return { error: String(err), text: null, links: [] };
          } finally {
            clearTimeout(timer);
          }
        },
      }),
    },
  ],
  systemPromptExtension:
    "Use 'scrape_page' to fetch and read web pages. " +
    "It returns clean readable text stripped of HTML. Set includeLinks=true to get a list of hrefs.",
};
