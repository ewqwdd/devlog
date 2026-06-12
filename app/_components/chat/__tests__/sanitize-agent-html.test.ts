// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeAgentHtml } from "@/app/_components/chat/sanitize-agent-html";

describe("sanitizeAgentHtml", () => {
  it("keeps allowed tags + internal links, strips scripts/handlers/external links", () => {
    const dirty = `
      <p>Hello <strong>world</strong> <em>x</em> <code>y</code></p>
      <ul><li>a</li></ul>
      <a href="/tasks/123">task</a>
      <a href="https://evil.com">bad</a>
      <a href="javascript:alert(1)">js</a>
      <a href="//evil.example">proto</a>
      <a href="/\\evil.example">backslash</a>
      <script>alert('xss')</script>
      <img src=x onerror="alert(1)" />
      <button onclick="alert(1)">click</button>
    `;
    const clean = sanitizeAgentHtml(dirty);

    expect(clean).toContain("<strong>world</strong>");
    expect(clean).toContain("<li>a</li>");
    expect(clean).toContain('<a href="/tasks/123">task</a>');
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("evil.com");
    expect(clean).not.toContain("javascript:");
    // external / javascript anchors keep their text but lose the href
    expect(clean).toContain("bad");
    // protocol-relative and backslash hrefs are stripped (they resolve external)
    expect(clean).not.toContain("//evil.example");
    expect(clean).not.toContain("/\\evil.example");
    expect(clean).toContain("proto"); // text kept, href dropped
  });
});
