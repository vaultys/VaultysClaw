/**
 * Demo Skill: Web Research
 *
 * Loaded by the research-agent to demonstrate internet_access capability
 * with a human-in-the-loop approval gate.
 *
 * Tools:
 *   - fetch_and_summarize: Fetches a URL and extracts readable text content
 *   - search_topic: Performs a DuckDuckGo instant-answer lookup (no API key)
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_CHARS = 8000;

function extractText(html) {
  // Strip scripts, styles, tags; collapse whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

export const skill = {
  name: "web-research",
  description: "Fetch web pages and perform topic searches for research tasks.",
  version: "1.0.0",

  systemPromptExtension: `
You have access to web research tools. When asked to research a topic:
1. Use search_topic to find relevant pages.
2. Use fetch_and_summarize to read specific pages in detail.
3. Synthesize findings into a clear, structured summary.
Always cite your sources (URLs) in the response.
`.trim(),

  tools: [
    {
      name: "fetch_and_summarize",
      capability: "internet_access",
      requiresApproval: true, // pauses for human approval — visible in the demo
      tool: createTool({
        id: "fetch_and_summarize",
        description:
          "Fetch a URL and return its readable text content. " +
          "Use this to read documentation, articles, or any public web page.",
        inputSchema: z.object({
          url: z.string().url().describe("The URL to fetch"),
          reason: z.string().describe("Why you are fetching this URL (shown to the approver)"),
        }),
        execute: async ({ url }) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          try {
            const res = await fetch(url, {
              signal: controller.signal,
              headers: { "User-Agent": "VaultysClaw-Demo-Agent/1.0" },
            });
            if (!res.ok) {
              return { success: false, error: `HTTP ${res.status} ${res.statusText}`, content: "" };
            }
            const html = await res.text();
            const content = extractText(html);
            return { success: true, url, content };
          } catch (err) {
            return { success: false, error: String(err), content: "" };
          } finally {
            clearTimeout(timer);
          }
        },
      }),
    },
    {
      name: "search_topic",
      capability: "internet_access",
      requiresApproval: false,
      tool: createTool({
        id: "search_topic",
        description:
          "Search for a topic using DuckDuckGo instant answers. " +
          "Returns a brief abstract and related URLs. No API key required.",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
        }),
        execute: async ({ query }) => {
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": "VaultysClaw-Demo-Agent/1.0" },
            });
            const data = await res.json();
            return {
              query,
              abstract: data.Abstract || "(no abstract available)",
              abstractSource: data.AbstractSource || "",
              abstractURL: data.AbstractURL || "",
              relatedTopics: (data.RelatedTopics || [])
                .slice(0, 5)
                .map((t) => ({ text: t.Text, url: t.FirstURL }))
                .filter((t) => t.text),
            };
          } catch (err) {
            return { query, abstract: "", error: String(err), relatedTopics: [] };
          }
        },
      }),
    },
  ],
};
