import { randomUUID } from "crypto";
import type { Document, Chunk } from "./types";

// ---------------------------------------------------------------------------
// Recursive splitter — LangChain-style but dependency-free
// ---------------------------------------------------------------------------

/**
 * Separator cascades by document format.
 * Tries each separator in order; falls back to the next when chunks are still too big.
 */
const SEPARATORS: Record<string, string[]> = {
  markdown: [
    "\n## ",
    "\n### ",
    "\n#### ", // section headers
    "\n\n", // paragraph break
    "\n", // line break
    ". ",
    "! ",
    "? ", // sentence boundaries
    " ",
    "", // word / char fallback
  ],
  text: ["\n\n", "\n", ". ", "! ", "? ", " ", ""],
};

/**
 * Split text recursively using a priority-ordered list of separators.
 * Produces chunks of at most `chunkSize` characters with `overlap` carried over.
 */
function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  overlap: number
): string[] {
  if (text.length <= chunkSize) return text.trim() ? [text] : [];

  const [sep, ...rest] = separators;

  // No more separators — hard split
  if (sep === "") {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize));
      if (i + chunkSize >= text.length) break;
    }
    return chunks;
  }

  const parts = text.split(sep);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? current + sep + part : part;

    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      // current is full — flush it
      if (current.trim()) {
        // current itself might still be too big: recurse with next separator
        if (current.length > chunkSize) {
          chunks.push(...recursiveSplit(current, rest, chunkSize, overlap));
        } else {
          chunks.push(current);
        }
      }
      // carry overlap from previous chunk into next
      const overlapText = current.slice(-overlap);
      current = overlapText ? overlapText + sep + part : part;
    }
  }

  if (current.trim()) {
    if (current.length > chunkSize) {
      chunks.push(...recursiveSplit(current, rest, chunkSize, overlap));
    } else {
      chunks.push(current);
    }
  }

  return chunks.filter((c) => c.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a document into overlapping chunks using a Markdown-aware recursive
 * splitter. Falls back gracefully to plain-text splitting for non-Markdown content.
 *
 * `format` defaults to 'markdown' when content starts with a Markdown header,
 * otherwise 'text'. Can be overridden explicitly.
 */
export function chunkDocument(
  doc: Document,
  chunkSize = 1000,
  overlap = 100,
  format?: "markdown" | "text"
): Chunk[] {
  const text = doc.content.trim();
  if (!text) return [];

  // Auto-detect: if the document starts with a '#' header or has markdown headings, treat as markdown
  const detectedFormat = format ?? (isMarkdown(text) ? "markdown" : "text");

  const separators = SEPARATORS[detectedFormat];
  const rawChunks = recursiveSplit(text, separators, chunkSize, overlap);

  return rawChunks
    .map((content, index) => ({
      id: randomUUID(),
      docId: doc.id,
      docTitle: doc.title,
      content: content.trim(),
      chunkIndex: index,
      metadata: doc.metadata,
    }))
    .filter((c) => c.content.length > 20); // drop tiny trailing fragments
}

/** Heuristic: treat as Markdown if 3+ lines look like headings or bullet lists */
function isMarkdown(text: string): boolean {
  const lines = text.slice(0, 2000).split("\n");
  const mdLines = lines.filter(
    (l) => /^#{1,6}\s/.test(l) || /^[-*]\s/.test(l) || /^\d+\.\s/.test(l)
  );
  return mdLines.length >= 3;
}
