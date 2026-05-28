/**
 * ConversationSummarizer — extracts durable memories from chat history.
 *
 * Uses the LLM to produce a structured list of facts learned from the
 * conversation. Each extracted fact is saved to the MemoryStore so future
 * conversations can benefit from it.
 *
 * Call `summarize()` at the end of a conversation or when the message history
 * grows beyond a configurable threshold.
 */

import { Agent } from "@mastra/core/agent";
import { buildModel } from "../llm";
import type { LlmConfig } from "@vaultysclaw/shared";
import { MemoryStore } from "./store";
import pino from "pino";

const logger = pino({ name: "memory-summarizer" });

const EXTRACTION_PROMPT = `You are a memory extraction assistant.
Analyze the following conversation and extract a concise list of durable facts,
preferences, and procedures the agent learned. Each item must be:
- Specific and self-contained (understandable without the conversation)
- Categorized as one of: fact | procedure | preference
- On its own line in the format:  [type] content

Example:
[fact] The user prefers Python 3.12 for scripting tasks
[procedure] To deploy: run pnpm build then pnpm start
[preference] Keep responses under 150 words

Only output the list. If nothing durable was learned, output: (none)`;

export interface SummarizeOptions {
  /** Maximum number of memories to extract per call. Default 10. */
  maxItems?: number;
  /** Default importance for extracted facts. Default 0.65. */
  defaultImportance?: number;
  /** Only summarize if there are at least this many messages. Default 4. */
  minMessages?: number;
}

export class ConversationSummarizer {
  private store: MemoryStore;
  private opts: Required<SummarizeOptions>;

  constructor(store: MemoryStore, opts: SummarizeOptions = {}) {
    this.store = store;
    this.opts = {
      maxItems: opts.maxItems ?? 10,
      defaultImportance: opts.defaultImportance ?? 0.65,
      minMessages: opts.minMessages ?? 4,
    };
  }

  /**
   * Summarize a conversation and persist any learned facts to memory.
   * Returns the number of memories saved.
   */
  async summarize(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    llmConfig: LlmConfig,
    tags: string[] = [],
  ): Promise<number> {
    if (messages.length < this.opts.minMessages) return 0;

    // Truncate very long conversations to avoid huge prompts
    const recent = messages.slice(-30);
    const transcript = recent
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    logger.info({ messageCount: messages.length }, "Summarizing conversation for memory extraction");

    try {
      const model = buildModel(llmConfig);
      const summaryAgent = new Agent({
        id: "memory-extractor",
        name: "memory-extractor",
        instructions: EXTRACTION_PROMPT,
        model,
      });
      const result = await summaryAgent.generate(`Conversation:\n${transcript}`, {
        modelSettings: { maxOutputTokens: 800 },
      });
      const text = result.text ?? "";

      if (!text || text.trim() === "(none)") return 0;

      let saved = 0;
      const lines = text.split("\n").filter((l) => l.trim().startsWith("["));

      for (const line of lines.slice(0, this.opts.maxItems)) {
        const match = line.match(/^\[(\w+)\]\s+(.+)$/);
        if (!match) continue;

        const rawType = match[1].toLowerCase();
        const content = match[2].trim();
        if (!content) continue;

        const type =
          rawType === "fact" || rawType === "procedure" || rawType === "preference"
            ? rawType
            : "fact";

        this.store.save({
          type,
          content,
          tags,
          importance: this.opts.defaultImportance,
        });
        saved++;
      }

      logger.info({ saved }, "Memory extraction complete");
      return saved;
    } catch (err) {
      logger.warn({ err }, "Memory extraction failed — skipping");
      return 0;
    }
  }
}
