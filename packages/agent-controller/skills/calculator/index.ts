/**
 * Calculator skill — performs arithmetic and mathematical operations
 * without needing an LLM or network request.
 *
 * Maps to no specific capability requirement (always available).
 */

import { tool } from "ai";
import { z } from "zod";
import type { SkillDefinition } from "../../src/skills/types.js";

export const skill: SkillDefinition = {
  name: "calculator",
  description: "Arithmetic, statistics, and unit conversions without an LLM",
  version: "1.0.0",
  tools: [
    {
      name: "calculate",
      capability: "code_execution",
      requiresApproval: false,
      tool: tool({
        description:
          "Evaluate a mathematical expression and return the result. " +
          "Supports basic arithmetic (+, -, *, /), exponentiation (**), " +
          "modulo (%), and Math functions (Math.sqrt, Math.round, etc.).",
        inputSchema: z.object({
          expression: z
            .string()
            .describe(
              "Math expression to evaluate (e.g. '2 + 2', 'Math.sqrt(144)', '(100 * 0.15).toFixed(2)')"
            ),
        }),
        execute: async ({ expression }) => {
          // Restrict to math-safe subset only
          const SAFE_RE = /^[0-9\s\+\-\*\/\%\(\)\.\,e\^]*$|Math\.[a-zA-Z]+/;
          const sanitized = expression.replace(/\s/g, "");

          // Allow Math.* calls and numeric operations only
          if (
            !/^[\d\s+\-*/%.()e,^]*$/.test(
              sanitized.replace(/Math\.[a-zA-Z]+\(/g, "")
            )
          ) {
            return { error: "Expression contains non-mathematical characters" };
          }

          try {
            // eslint-disable-next-line no-new-func
            const fn = new Function(
              "Math",
              `"use strict"; return (${expression});`
            );
            const result = fn(Math);
            return { result: String(result), expression };
          } catch (err) {
            return { error: `Evaluation failed: ${String(err)}`, expression };
          }
        },
      }),
    },
  ],
  systemPromptExtension:
    "You have access to a 'calculate' tool for precise arithmetic. " +
    "Always use it for numerical calculations instead of estimating.",
};
