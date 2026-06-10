/**
 * HTML → clean text/markdown pipeline for the http_request tool.
 *
 * Priority:
 *   1. Docling server  — POST to DOCLING_URL if the env var is set and the server responds.
 *   2. Built-in cleaner — zero-dependency regex/string approach that removes noise elements
 *      and converts common HTML constructs to markdown.
 */

import pino from "pino";

const logger = pino({ name: "html-cleaner" });

// ---------------------------------------------------------------------------
// 1. Docling (optional, requires a running docling-serve instance)
// ---------------------------------------------------------------------------

/**
 * Call a docling-serve instance to convert HTML to markdown.
 * Returns null when Docling is not configured, unavailable, or errors.
 *
 * Set DOCLING_URL to the base URL of your docling-serve instance,
 * e.g. http://localhost:5001
 */
export async function tryDocling(
  html: string,
  sourceUrl?: string
): Promise<string | null> {
  const base = process.env.DOCLING_URL?.replace(/\/+$/, "");
  if (!base) return null;

  try {
    // Quick health check (3 s timeout)
    const health = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!health.ok) {
      logger.warn({ status: health.status }, "Docling health check failed");
      return null;
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "Docling health check unreachable");
    return null;
  }

  try {
    // Prefer converting via URL (keeps document base for relative links).
    // Fall back to base64 file upload when we only have the HTML string.
    let body: Record<string, unknown>;

    if (sourceUrl) {
      body = {
        options: { to_formats: ["md"] },
        http_sources: [{ url: sourceUrl }],
      };
    } else {
      body = {
        options: { to_formats: ["md"] },
        file_sources: [
          {
            base64_string: Buffer.from(html).toString("base64"),
            filename: "page.html",
          },
        ],
      };
    }

    const res = await fetch(`${base}/v1alpha/convert/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "Docling conversion failed — falling back to built-in cleaner"
      );
      return null;
    }

    const data = (await res.json()) as Record<string, any>;

    // docling-serve may place markdown under several keys depending on version
    const md: string | undefined =
      data?.document?.md_content ??
      data?.document?.markdown_content ??
      data?.output?.md_content ??
      data?.output?.markdown_content ??
      data?.md_content ??
      data?.markdown_content;

    if (!md) {
      logger.warn(
        { keys: Object.keys(data) },
        "Docling response missing markdown content"
      );
      return null;
    }

    logger.info(
      { chars: md.length, sourceUrl },
      "Docling conversion successful"
    );
    return md;
  } catch (err) {
    logger.warn({ err: String(err) }, "Docling conversion error — falling back");
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Built-in HTML cleaner (zero external dependencies)
// ---------------------------------------------------------------------------

/** Decode the most common HTML entities. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

/**
 * Convert an HTML string to clean markdown-ish plain text.
 *
 * Steps:
 *  1. Drop noise elements: <script>, <style>, <nav>, <footer>, <header>, <aside>
 *  2. Promote semantic structure: headings → #, lists → -, links, bold, code, pre
 *  3. Strip all remaining tags
 *  4. Decode HTML entities
 *  5. Normalise whitespace
 */
export function cleanHtmlFallback(html: string): string {
  let t = html;

  // --- 1. Remove noise sections entirely ---
  const noiseTags = [
    "script",
    "style",
    "noscript",
    "nav",
    "footer",
    "header",
    "aside",
    "form",
    "iframe",
    "svg",
    "canvas",
  ];
  for (const tag of noiseTags) {
    t = t.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }
  // HTML comments
  t = t.replace(/<!--[\s\S]*?-->/g, "");

  // --- 2. Semantic → markdown ---

  // Headings
  for (let i = 1; i <= 6; i++) {
    const hashes = "#".repeat(i);
    t = t.replace(
      new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, "gi"),
      (_, inner) => `\n\n${hashes} ${stripTags(inner).trim()}\n\n`
    );
  }

  // Block quotes
  t = t.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_, inner) =>
      inner
        .split("\n")
        .map((l: string) => `> ${l}`)
        .join("\n") + "\n"
  );

  // Preformatted / code blocks (before inline code)
  t = t.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, inner) => `\n\`\`\`\n${stripTags(inner)}\n\`\`\`\n`
  );

  // Inline code
  t = t.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
    const text = stripTags(inner).trim();
    return text.includes("\n") ? `\n\`\`\`\n${text}\n\`\`\`\n` : `\`${text}\``;
  });

  // Links — keep label and URL
  t = t.replace(
    /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, label) => {
      const text = stripTags(label).trim();
      if (!text || text === href) return href;
      // Skip anchor-only and javascript: links
      if (href.startsWith("#") || href.startsWith("javascript:")) return text;
      return `[${text}](${href})`;
    }
  );

  // Images — alt text only
  t = t.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) =>
    alt ? `[Image: ${alt}]` : ""
  );

  // Bold / strong
  t = t.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const text = stripTags(inner).trim();
    return text ? `**${text}**` : "";
  });

  // Italic / em
  t = t.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    const text = stripTags(inner).trim();
    return text ? `_${text}_` : "";
  });

  // Ordered lists — number each item
  t = t.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let idx = 0;
    return (
      "\n" +
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, li: string) => {
        idx++;
        return `${idx}. ${stripTags(li).trim()}\n`;
      }) +
      "\n"
    );
  });

  // Unordered lists
  t = t.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return (
      "\n" +
      inner.replace(
        /<li[^>]*>([\s\S]*?)<\/li>/gi,
        (_: string, li: string) => `- ${stripTags(li).trim()}\n`
      ) +
      "\n"
    );
  });

  // Tables — emit header + separator + rows
  t = t.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const rows: string[][] = [];
    const rowMatches = inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const [, rowHtml] of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      for (const [, cellHtml] of cellMatches) {
        cells.push(stripTags(cellHtml).replace(/\|/g, "\\|").trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return "";
    const colCount = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => {
      while (r.length < colCount) r.push("");
      return `| ${r.join(" | ")} |`;
    });
    // Insert markdown separator after the first row (treat as header)
    const sep = `| ${Array(colCount).fill("---").join(" | ")} |`;
    padded.splice(1, 0, sep);
    return "\n" + padded.join("\n") + "\n";
  });

  // Block-level line breaks
  t = t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|main|figure|figcaption|li)[^>]*>/gi, "\n");

  // Horizontal rule
  t = t.replace(/<hr\s*\/?>/gi, "\n---\n");

  // --- 3. Strip all remaining tags ---
  t = stripTags(t);

  // --- 4. Decode entities ---
  t = decodeEntities(t);

  // --- 5. Normalise whitespace ---
  t = t
    .replace(/[ \t]+/g, " ")          // collapse inline spaces
    .replace(/\n[ \t]+/g, "\n")       // leading space on lines
    .replace(/[ \t]+\n/g, "\n")       // trailing space on lines
    .replace(/\n{3,}/g, "\n\n")       // at most one blank line
    .trim();

  return t;
}

/** Strip all HTML tags (used internally to clean tag content). */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

// ---------------------------------------------------------------------------
// 3. Public entry point
// ---------------------------------------------------------------------------

export interface HtmlCleanResult {
  text: string;
  method: "docling" | "fallback";
}

/**
 * Convert an HTML page to clean text/markdown.
 * Tries Docling first; uses the built-in cleaner as fallback.
 */
export async function htmlToText(
  html: string,
  sourceUrl?: string
): Promise<HtmlCleanResult> {
  const doclingResult = await tryDocling(html, sourceUrl);
  if (doclingResult) {
    return { text: doclingResult, method: "docling" };
  }
  return { text: cleanHtmlFallback(html), method: "fallback" };
}
