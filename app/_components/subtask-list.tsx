"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type React from "react";
import { SubtaskItem } from "@/app/_components/subtask-item";
import type { Subtask } from "@/shared/types/subtask";

export function SubtaskList({
  subtasks,
  onMove,
  onToggle,
  onRename,
  onDelete,
}: {
  subtasks: Subtask[];
  onMove: (vars: { id: string; toPosition: number }) => void;
  onToggle: (id: string, done: boolean) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const toPosition = subtasks.findIndex((s) => s.id === over.id);
    if (toPosition === -1) {
      return;
    }
    onMove({ id: String(active.id), toPosition });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext
        items={subtasks.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1.5">
          {subtasks.map((subtask) => (
            <SubtaskItem
              key={subtask.id}
              subtask={subtask}
              onToggle={(done): void => onToggle(subtask.id, done)}
              onRename={(title): void => onRename(subtask.id, title)}
              onDelete={(): void => onDelete(subtask.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
