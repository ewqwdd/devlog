"use client";

import { RiDeleteBinLine } from "@remixicon/react";
import type React from "react";
import { cn } from "@/shared/lib/utils";
import type { Task, TaskPriority } from "@/shared/types/task";
import { Badge } from "@/shared/ui/badge";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

export function TaskCard({
  task,
  onOpen,
  onDelete,
}: {
  task: Task;
  onOpen?: () => void;
  onDelete?: () => void;
}): React.JSX.Element {
  return (
    <div
      data-testid="task-card"
      className="group relative rounded-lg border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full pr-6 text-left text-sm font-medium"
      >
        {task.title}
      </button>
      <div className="mt-2">
        <Badge className={cn("text-xs", PRIORITY_CLASS[task.priority])}>
          {PRIORITY_LABEL[task.priority]}
        </Badge>
      </div>
      {onDelete ? (
        <button
          type="button"
          aria-label="Delete task"
          data-testid="card-delete"
          onClick={onDelete}
          className="absolute top-2 right-2 hidden rounded p-1 text-muted-foreground hover:bg-muted group-hover:block"
        >
          <RiDeleteBinLine className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
