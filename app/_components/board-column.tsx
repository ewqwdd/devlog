"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type React from "react";
import { SortableTaskCard } from "@/app/_components/sortable-task-card";
import { cn } from "@/shared/lib/utils";
import type { Task, TaskStatus } from "@/shared/types/task";

const COLUMN_TITLE: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};

// Status accent dot — the column's at-a-glance color cue (todo / wip / done).
const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  "in-progress": "bg-blue-500",
  done: "bg-emerald-500",
};

export function BoardColumn({
  status,
  tasks,
  onOpen,
  onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-2.5">
      <div className="flex items-center gap-2 px-1.5 pt-0.5">
        <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {COLUMN_TITLE[status]}
        </h2>
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
          {tasks.length}
        </span>
      </div>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          data-testid={`column-${status}`}
          className="flex min-h-24 flex-1 flex-col gap-2"
        >
          {tasks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 py-6 text-xs text-muted-foreground/70">
              No tasks
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onOpen={(): void => onOpen(task.id)}
                onDelete={(): void => onDelete(task.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}
