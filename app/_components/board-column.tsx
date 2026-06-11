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
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl bg-muted/40 p-3">
      <h2 className="px-1 text-sm font-semibold text-muted-foreground">
        {COLUMN_TITLE[status]} ({tasks.length})
      </h2>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          data-testid={`column-${status}`}
          className="flex min-h-24 flex-col gap-2"
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
    </section>
  );
}
