"use client";

import { isToolUIPart, type UIMessage } from "ai";
import type React from "react";
import { MessageHtml } from "@/app/_components/chat/message-html";
import { ToolCallCard } from "@/app/_components/chat/tool-call-card";

export function ChatMessage({
  message,
}: {
  message: UIMessage;
}): React.JSX.Element {
  if (message.role === "user") {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    return (
      <div className="flex justify-end" data-testid="chat-message">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="chat-message">
      {message.parts.map((part, index): React.JSX.Element | null => {
        if (part.type === "text") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: assistant message parts are append-only and have no per-part id
            <MessageHtml key={`${message.id}-${index}`} html={part.text} />
          );
        }
        if (isToolUIPart(part)) {
          return <ToolCallCard key={part.toolCallId} part={part} />;
        }
        return null;
      })}
    </div>
  );
}
