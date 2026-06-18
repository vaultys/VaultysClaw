"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useDarkMode } from "@/hooks/useDarkMode";

export function MarkdownDoc({ content }: Readonly<{ content: string }>) {
  const isDark = useDarkMode();

  return (
    <div
      className={[
        "prose prose-sm max-w-none",
        // prose-invert only in dark so light text/bg works correctly
        isDark ? "prose-invert" : "",
        // Headings
        "prose-headings:text-foreground prose-headings:font-semibold",
        "prose-h1:text-xl prose-h1:border-b prose-h1:border-neutral-200 prose-h1:pb-3",
        "prose-h2:text-lg prose-h2:border-b prose-h2:border-neutral-200/60 prose-h2:pb-2",
        "prose-h3:text-base",
        // Body
        "prose-p:text-foreground-500 prose-p:leading-7",
        "prose-strong:text-foreground prose-li:text-foreground-500",
        // Links
        "prose-a:text-primary-500 prose-a:no-underline hover:prose-a:underline prose-a:font-normal",
        // Inline code — suppress typography backtick decoration; styling is in component below
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0",
        // Blockquote
        "prose-blockquote:border-primary-500 prose-blockquote:text-foreground-500 prose-blockquote:bg-primary-500/5 prose-blockquote:rounded-r-lg prose-blockquote:not-italic",
        // Tables
        "prose-table:text-sm prose-th:text-foreground-500 prose-th:font-semibold prose-td:text-foreground-500",
        // HR
        "prose-hr:border-neutral-200",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Hide badge images (README shields) — don't load in a local context
          img: () => null,

          // Block code: read from the raw hast AST node to get the original
          // className ("language-bash") and plain text before component overrides.
          pre: ({ node }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const codeNode = (node as any)?.children?.find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c: any) => c.type === "element" && c.tagName === "code"
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const classList: string[] = codeNode?.properties?.className ?? [];
            const lang =
              RegExp(/language-(\w+)/).exec(classList.join(" "))?.[1] ?? "text";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = (codeNode?.children ?? [])
              .map((c: any) => c.value ?? "")
              .join("")
              .replace(/\n$/, "");

            return (
              <div className="my-4">
                <SyntaxHighlighter
                  style={isDark ? oneDark : oneLight}
                  language={lang}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: "0.75rem",
                    fontSize: "0.78rem",
                    lineHeight: "1.65",
                    border: "1px solid rgb(var(--neutral-200))",
                    background: "rgb(var(--background-50))",
                  }}
                  codeTagProps={{
                    style: { fontFamily: "ui-monospace, monospace" },
                  }}
                >
                  {raw}
                </SyntaxHighlighter>
              </div>
            );
          },

          // Inline code — uses design-system tokens, adapts to light/dark
          code: ({ children }) => (
            <code className="text-primary-600 bg-background-200 border border-neutral-200 px-1.5 py-0.5 rounded text-[0.8em] font-mono">
              {children}
            </code>
          ),

          // Open all links in a new tab
          a: ({ href, children }) => (
            <a href={href ?? "#"} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),

          // Scrollable wrapper for wide tables
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-neutral-200 my-4">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
