import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LlmConfig } from "@vaultysclaw/shared";
import { searchKnowledge } from "./retriever";
import { listKnowledgeSources } from "../db";
import pino from "pino";

const logger = pino({ name: "knowledge-tool" });

/**
 * Build the knowledge_search Mastra tool.
 * getLlmConfig is a function (not a value) so the tool always uses the
 * latest active config at call-time.
 */
export function buildKnowledgeTool(getLlmConfig: () => LlmConfig | null) {
  return createTool({
    id: "knowledge_search",
    description:
      "Search the agent's local knowledge base for relevant information. " +
      "Use this tool when asked about topics that may be in indexed documents. " +
      "Returns the most relevant text passages with their source.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("The search query — describe what you are looking for"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Number of results to return (default 5)"),
      sourceId: z
        .string()
        .optional()
        .describe(
          "Restrict search to a specific knowledge source ID (optional)"
        ),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          content: z.string(),
          docTitle: z.string().nullable(),
          sourceId: z.string(),
          score: z.number(),
        })
      ),
      totalSources: z.number(),
      message: z.string(),
    }),
    execute: async ({ query, topK, sourceId }) => {
      const llmConfig = getLlmConfig();
      if (!llmConfig) {
        return {
          results: [],
          totalSources: 0,
          message:
            "LLM not configured — cannot generate embeddings for search.",
        };
      }

      const sources = listKnowledgeSources();
      const readySources = sources.filter((s) => s.status === "ready");

      if (readySources.length === 0) {
        return {
          results: [],
          totalSources: 0,
          message:
            "No knowledge bases are ready. Ask an admin to sync a knowledge source.",
        };
      }

      try {
        const results = await searchKnowledge(query, llmConfig, {
          topK,
          sourceId,
        });

        logger.info(
          { query, found: results.length },
          "Knowledge search executed"
        );

        return {
          results: results.map((r) => ({
            content: r.content,
            docTitle: r.docTitle,
            sourceId: r.sourceId,
            score: Math.round(r.score * 1000) / 1000,
          })),
          totalSources: readySources.length,
          message:
            results.length > 0
              ? `Found ${results.length} relevant passages.`
              : "No relevant passages found above the similarity threshold.",
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err }, "Knowledge search failed");
        return {
          results: [],
          totalSources: readySources.length,
          message: `Search failed: ${msg}`,
        };
      }
    },
  });
}
