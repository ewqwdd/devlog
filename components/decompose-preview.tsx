"use client";

import { RiCloseLine } from "@remixicon/react";
import type React from "react";
import type { DecomposeStatus, DraftRow } from "@/shared/types/decompose";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function DecomposePreview({
  status,
  reasoning,
  drafts,
  isSaving,
  onRenameDraft,
  onRemoveDraft,
  onSave,
  onDiscard,
  onDismiss,
}: {
  status: DecomposeStatus;
  reasoning: string;
  drafts: DraftRow[];
  isSaving: boolean;
  onRenameDraft: (key: string, title: string) => void;
  onRemoveDraft: (key: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDismiss: () => void;
}): React.JSX.Element | null {
  if (status === "idle") {
    return null;
  }

  if (status === "loading") {
    return (
      <div
        data-testid="decompose-preview"
        className="mb-3 text-[13px] text-muted-foreground"
      >
        Decomposing…
      </div>
    );
  }

  if (status === "refused" || status === "error") {
    const message =
      status === "error" ? "Couldn't decompose. Try again." : reasoning;
    return (
      <div data-testid="decompose-preview" className="mb-3">
        <Alert variant="destructive" data-testid="decompose-alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="decompose-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  // status === "preview"
  const validCount = drafts.filter((d) => d.title.trim().length > 0).length;
  return (
    <div data-testid="decompose-preview" className="mb-3 flex flex-col gap-2">
      <Alert data-testid="decompose-alert">
        <AlertDescription>{reasoning}</AlertDescription>
      </Alert>
      <div className="flex flex-col gap-1.5">
        {drafts.map((draft) => (
          <div
            key={draft.key}
            data-testid="decompose-draft-row"
            className="flex items-center gap-2"
          >
            <Input
              data-testid="decompose-draft-input"
              value={draft.title}
              onChange={(e): void => onRenameDraft(draft.key, e.target.value)}
              className="h-8 text-[13.5px]"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove subtask"
              data-testid="decompose-draft-remove"
              onClick={(): void => onRemoveDraft(draft.key)}
            >
              <RiCloseLine className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="decompose-discard"
          onClick={onDiscard}
        >
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="decompose-save"
          disabled={isSaving || validCount === 0}
          onClick={onSave}
        >
          Save {validCount}
        </Button>
      </div>
    </div>
  );
}
