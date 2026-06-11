"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type React from "react";
import { TaskCard } from "@/components/task-card";
import type { Task } from "@/shared/types/task";

export function SortableTaskCard({
  task,
  onOpen,
  onDelete,
}: {
  task: Task;
  onOpen: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onOpen={onOpen} onDelete={onDelete} />
    </div>
  );
}
