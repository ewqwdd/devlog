"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type React from "react";
import { SortableTaskCard } from "@/app/_components/sortable-task-card";
import type { Task, TaskStatus } from "@/shared/types/task";

const COLUMN_TITLE: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};

export function BoardColumn({
  status,
  tasks,
  onOpen,
  onDelete,
  onCreate,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2 rounded-[8px] bg-muted p-2">
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
        <span className="text-[12px] font-bold tracking-[0.04em] text-muted-foreground uppercase">
          {COLUMN_TITLE[status]}
        </span>
        <span className="rounded-[10px] bg-muted-foreground/15 px-2 py-px text-[12px] font-semibold text-muted-foreground tabular-nums">
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
          className="flex min-h-[72px] flex-1 flex-col gap-2"
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onOpen={(): void => onOpen(task.id)}
              onDelete={(): void => onDelete(task.id)}
            />
          ))}
        </div>
      </SortableContext>
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground"
      >
        <span className="text-[17px] leading-none">+</span> Create
      </button>
    </section>
  );
}
