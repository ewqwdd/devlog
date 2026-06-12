import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["p", "ul", "ol", "li", "strong", "em", "code", "br", "a"];
const ALLOWED_ATTR = ["href"];

// Internal links only: a single leading "/" NOT followed by "/" or "\".
// This rejects protocol-relative ("//evil.com") and backslash ("/\\evil.com")
// hrefs, which the browser would otherwise resolve to an external origin.
const INTERNAL_HREF = /^\/(?![/\\])/;

export function isInternalHref(href: string): boolean {
  return INTERNAL_HREF.test(href);
}

let hookRegistered = false;

function ensureInternalLinkHook(): void {
  if (hookRegistered) {
    return;
  }
  DOMPurify.addHook("afterSanitizeAttributes", (node): void => {
    if (!(node instanceof Element)) {
      return;
    }
    const href = node.getAttribute("href");
    if (href !== null && !isInternalHref(href)) {
      node.removeAttribute("href");
    }
  });
  hookRegistered = true;
}

export function sanitizeAgentHtml(html: string): string {
  ensureInternalLinkHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
