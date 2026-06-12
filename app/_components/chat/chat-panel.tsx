"use client";

import { useChat } from "@ai-sdk/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/app/_components/chat/chat-message";
import { useChatBoardSync } from "@/shared/hooks/use-chat-board-sync";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";

export function ChatPanel(): React.JSX.Element {
  const { messages, sendMessage, status, stop, error } = useChat();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useChatBoardSync(messages);

  // Auto-scroll to the bottom on new parts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages is intentionally listed to trigger scroll when new messages arrive, even though it isn't read inside the effect body
  useEffect((): void => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  function handleSend(): void {
    const text = input.trim();
    if (!text || isBusy) {
      return;
    }
    void sendMessage({ text });
    setInput("");
  }

  let statusLine: string | null = null;
  if (status === "submitted") {
    statusLine = "Thinking…";
  } else if (status === "streaming") {
    const lastPart = messages.at(-1)?.parts.at(-1);
    if (lastPart) {
      if (
        lastPart.type.startsWith("tool-") &&
        "state" in lastPart &&
        lastPart.state !== "output-available" &&
        lastPart.state !== "output-error"
      ) {
        statusLine = `Using ${lastPart.type.slice("tool-".length)}…`;
      }
    }
  }

  return (
    <aside className="hidden h-svh w-[400px] shrink-0 flex-col border-l bg-background lg:flex">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Assistant</h2>
        <p className="text-xs text-muted-foreground">
          Chat history is not saved and is lost on reload.
        </p>
      </header>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask me to create or update tasks. Try "create: Buy milk".
          </p>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        {statusLine ? (
          <p
            data-testid="chat-status"
            className="text-xs text-muted-foreground"
          >
            {statusLine}
          </p>
        ) : null}
        {error ? (
          <p data-testid="chat-error" className="text-sm text-destructive">
            {error.message}
          </p>
        ) : null}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            data-testid="chat-input"
            value={input}
            rows={1}
            placeholder="Message the assistant…"
            onChange={(e): void => setInput(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="max-h-32 min-h-0 flex-1 bg-background"
          />
          {isBusy ? (
            <Button
              type="button"
              variant="outline"
              data-testid="chat-stop"
              onClick={(): void => {
                void stop();
              }}
            >
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="chat-send"
              onClick={(): void => handleSend()}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
