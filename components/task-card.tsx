"use client";

import {
  type RemixiconComponentType,
  RiArrowDownLine,
  RiArrowUpDoubleLine,
  RiDeleteBinLine,
  RiEqualLine,
} from "@remixicon/react";
import type React from "react";
import { cn } from "@/shared/lib/utils";
import type { Task, TaskPriority } from "@/shared/types/task";

interface PriorityMeta {
  readonly label: string;
  readonly Icon: RemixiconComponentType;
  readonly className: string;
}

// Jira-style priority indicator: a directional, color-coded glyph rather than a
// filled badge — reads faster on a dense board and keeps the card calm.
const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  low: {
    label: "Low",
    Icon: RiArrowDownLine,
    className: "text-sky-600 dark:text-sky-400",
  },
  medium: {
    label: "Medium",
    Icon: RiEqualLine,
    className: "text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "High",
    Icon: RiArrowUpDoubleLine,
    className: "text-rose-600 dark:text-rose-400",
  },
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
  const { label, Icon, className } = PRIORITY_META[task.priority];

  return (
    <div
      data-testid="task-card"
      className="group relative rounded-lg border border-border/70 bg-card p-3 shadow-sm transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-md"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full pr-6 text-left text-sm font-medium leading-snug text-card-foreground"
      >
        {task.title}
      </button>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            className,
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </span>
      </div>
      {onDelete ? (
        <button
          type="button"
          aria-label="Delete task"
          data-testid="card-delete"
          onClick={onDelete}
          className="absolute top-2 right-2 hidden rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-hover:block"
        >
          <RiDeleteBinLine className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
