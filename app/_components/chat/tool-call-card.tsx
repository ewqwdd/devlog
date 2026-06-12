"use client";

import { getToolName, type ToolUIPart } from "ai";
import type React from "react";
import { useState } from "react";

function stateIcon(state: ToolUIPart["state"]): string {
  if (state === "output-error") {
    return "✕";
  }
  if (state === "output-available") {
    return "✓";
  }
  return "…";
}

export function ToolCallCard({
  part,
}: {
  part: ToolUIPart;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card text-xs" data-testid="tool-card">
      <button
        type="button"
        data-testid="tool-card-toggle"
        onClick={(): void => setExpanded((prev): boolean => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span aria-hidden="true">{stateIcon(part.state)}</span>
        <span className="font-medium">{getToolName(part)}</span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-2 border-t px-3 py-2">
          <pre className="overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(part.input ?? {}, null, 2)}
          </pre>
          {part.state === "output-available" ? (
            <pre className="overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(part.output ?? {}, null, 2)}
            </pre>
          ) : null}
          {part.state === "output-error" ? (
            <p className="text-destructive">{part.errorText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
