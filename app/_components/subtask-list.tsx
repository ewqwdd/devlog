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
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { SubtaskItem } from "@/app/_components/subtask-item";
import { applySubtaskMove } from "@/services/compute-subtask-move";
import { subtasksKey } from "@/shared/hooks/use-subtasks-query";
import type { Subtask } from "@/shared/types/subtask";

export function SubtaskList({
  taskId,
  subtasks,
  onMove,
  onToggle,
  onRename,
  onDelete,
}: {
  taskId: string;
  subtasks: Subtask[];
  onMove: (vars: { id: string; toPosition: number }) => void;
  onToggle: (id: string, done: boolean) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
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
    const activeId = String(active.id);
    onMove({ id: activeId, toPosition });
    const queryKey = subtasksKey(taskId);
    const previous = queryClient.getQueryData<Subtask[]>(queryKey);
    if (previous) {
      queryClient.setQueryData<Subtask[]>(
        queryKey,
        applySubtaskMove(previous, activeId, toPosition),
      );
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext
        items={subtasks.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col">
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
