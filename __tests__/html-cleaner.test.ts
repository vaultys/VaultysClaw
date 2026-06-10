import { describe, it, expect } from "vitest";
import { cleanHtmlFallback, htmlToText } from "../packages/agent-controller/src/tools/html-cleaner";

describe("cleanHtmlFallback", () => {
  it("strips script and style tags", () => {
    const html = `<html><head><style>body{color:red}</style></head><body><script>alert(1)</script><p>Hello</p></body></html>`;
    const result = cleanHtmlFallback(html);
    expect(result).not.toContain("color:red");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("Hello");
  });

  it("removes nav and footer noise", () => {
    const html = `<nav><a href="/">Home</a></nav><main><p>Article content</p></main><footer>Footer</footer>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("Article content");
    expect(result).not.toContain("Footer");
    // nav link text may or may not remain, but the nav structure should be gone
  });

  it("converts headings to markdown", () => {
    const html = `<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("# Title");
    expect(result).toContain("## Subtitle");
    expect(result).toContain("### Section");
  });

  it("converts links to markdown", () => {
    const html = `<p>Visit <a href="https://example.com">Example</a> for more.</p>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("[Example](https://example.com)");
  });

  it("skips anchor-only links", () => {
    const html = `<a href="#section">Jump</a>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("Jump");
    expect(result).not.toContain("(#section)");
  });

  it("converts unordered lists", () => {
    const html = `<ul><li>Apple</li><li>Banana</li><li>Cherry</li></ul>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("- Apple");
    expect(result).toContain("- Banana");
    expect(result).toContain("- Cherry");
  });

  it("converts ordered lists with numbers", () => {
    const html = `<ol><li>First</li><li>Second</li><li>Third</li></ol>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("1. First");
    expect(result).toContain("2. Second");
    expect(result).toContain("3. Third");
  });

  it("converts bold and italic", () => {
    const html = `<p><strong>bold</strong> and <em>italic</em></p>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("**bold**");
    expect(result).toContain("_italic_");
  });

  it("converts inline code", () => {
    const html = `<p>Use <code>npm install</code> to install.</p>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("`npm install`");
  });

  it("converts pre blocks", () => {
    const html = `<pre>const x = 1;\nconst y = 2;</pre>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("```");
    expect(result).toContain("const x = 1;");
  });

  it("converts tables to markdown", () => {
    const html = `
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
        <tr><td>Bob</td><td>25</td></tr>
      </table>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("| Name | Age |");
    expect(result).toContain("| ---");
    expect(result).toContain("| Alice | 30 |");
    expect(result).toContain("| Bob | 25 |");
  });

  it("decodes HTML entities", () => {
    const html = `<p>Caf&eacute; &amp; bar &lt;test&gt; &quot;quoted&quot; &#8364;</p>`;
    const result = cleanHtmlFallback(html);
    expect(result).toContain("&");
    expect(result).toContain("<test>");
    expect(result).toContain('"quoted"');
    // numeric entity €
    expect(result).toContain("€");
    // Note: named entities beyond the basic set (&eacute;) are not decoded — that's OK
  });

  it("collapses multiple blank lines", () => {
    const html = `<p>Line 1</p><p>Line 2</p><p>Line 3</p>`;
    const result = cleanHtmlFallback(html);
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("handles real-world article snippet", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
        <style>.hidden{display:none}</style>
      </head>
      <body>
        <header><nav><a href="/">Home</a> | <a href="/about">About</a></nav></header>
        <main>
          <h1>Breaking News</h1>
          <p>The quick brown <strong>fox</strong> jumps over the lazy <em>dog</em>.</p>
          <ul>
            <li>Fact one</li>
            <li>Fact two</li>
          </ul>
          <p>Read more at <a href="https://example.com/full">full article</a>.</p>
        </main>
        <aside>Related: blah blah</aside>
        <footer>© 2025 Example Corp</footer>
        <script>trackPageView()</script>
      </body>
      </html>`;

    const result = cleanHtmlFallback(html);
    expect(result).toContain("# Breaking News");
    expect(result).toContain("**fox**");
    expect(result).toContain("_dog_");
    expect(result).toContain("- Fact one");
    expect(result).toContain("[full article](https://example.com/full)");
    expect(result).not.toContain("trackPageView");
    expect(result).not.toContain("© 2025");
    expect(result).not.toContain("display:none");
    expect(result).not.toContain("Related: blah blah");
  });
});

describe("htmlToText", () => {
  it("falls back to built-in cleaner when DOCLING_URL is not set", async () => {
    delete process.env.DOCLING_URL;
    const html = `<h1>Hello</h1><p>World</p>`;
    const result = await htmlToText(html, "https://example.com");
    expect(result.method).toBe("fallback");
    expect(result.text).toContain("# Hello");
    expect(result.text).toContain("World");
  });
});
