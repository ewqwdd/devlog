"use client";

import Link from "next/link";
import type React from "react";
import { PriorityIcon } from "@/components/priority-icon";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

export function PrioritizationResultDialog({
  open,
  onOpenChange,
  isPending,
  isError,
  result,
  onGoToTask,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  isError: boolean;
  result: PrioritizationResult | null;
  onGoToTask: (id: string) => void;
  onRetry: () => void;
}): React.JSX.Element {
  const task = result?.task ?? null;
  const reasoning = result?.reasoning ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="prioritization-dialog">
        <DialogHeader>
          <DialogTitle>What to work on next</DialogTitle>
          <DialogDescription>
            A recommendation from your assistant.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p
            data-testid="prioritization-loading"
            className="text-sm text-muted-foreground"
          >
            Thinking…
          </p>
        ) : isError ? (
          <div className="space-y-3">
            <p
              data-testid="prioritization-error"
              className="text-sm text-destructive"
            >
              The recommendation failed. Try again.
            </p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : task ? (
          <div
            className="space-y-3"
            data-testid="prioritization-recommendation"
          >
            <div className="flex items-center gap-2">
              <PriorityIcon priority={task.priority} />
              <Link
                href={`/tasks/${task.id}`}
                data-testid="recommended-task-link"
                className="font-medium underline underline-offset-2"
              >
                {task.title}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{reasoning}</p>
            <DialogFooter>
              <Button
                data-testid="go-to-task"
                onClick={(): void => onGoToTask(task.id)}
              >
                Go to task
              </Button>
            </DialogFooter>
          </div>
        ) : result ? (
          <p
            data-testid="prioritization-empty"
            className="text-sm text-muted-foreground"
          >
            {reasoning}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
