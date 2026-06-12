"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef } from "react";
import {
  isInternalHref,
  sanitizeAgentHtml,
} from "@/app/_components/chat/sanitize-agent-html";

export function MessageHtml({ html }: { html: string }): React.JSX.Element {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect((): (() => void) => {
    const el = ref.current;
    if (!el) {
      return (): void => {};
    }
    function handleClick(event: MouseEvent): void {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      const href = anchor?.getAttribute("href");
      if (href && isInternalHref(href)) {
        event.preventDefault();
        router.push(href);
      }
    }
    el.addEventListener("click", handleClick);
    return (): void => el.removeEventListener("click", handleClick);
  }, [router]);

  return (
    <div
      ref={ref}
      data-testid="message-html"
      className="text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized by sanitizeAgentHtml (DOMPurify) — XSS boundary covered by sanitize-agent-html.test.ts
      dangerouslySetInnerHTML={{ __html: sanitizeAgentHtml(html) }}
    />
  );
}
