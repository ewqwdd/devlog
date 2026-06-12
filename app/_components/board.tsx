"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { BoardColumn } from "@/app/_components/board-column";
import { TaskCard } from "@/components/task-card";
import { applyMove } from "@/services/compute-move";
import { BOARD_KEY, useBoardQuery } from "@/shared/hooks/use-board-query";
import { useDeleteTaskMutation } from "@/shared/hooks/use-delete-task-mutation";
import { useMoveTaskMutation } from "@/shared/hooks/use-move-task-mutation";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import type { Board as BoardData, Task, TaskStatus } from "@/shared/types/task";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Skeleton } from "@/shared/ui/skeleton";

const EMPTY_BOARD: BoardData = { todo: [], "in-progress": [], done: [] };

function findColumn(board: BoardData, id: string): TaskStatus | undefined {
  if (TASK_STATUSES.includes(id as TaskStatus)) {
    return id as TaskStatus;
  }
  return TASK_STATUSES.find((s) => board[s].some((t) => t.id === id));
}

function indexInColumn(
  board: BoardData,
  status: TaskStatus,
  id: string,
): number {
  const idx = board[status].findIndex((t) => t.id === id);
  return idx === -1 ? board[status].length : idx;
}

export function Board(): React.JSX.Element {
  const router = useRouter();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragBoard, setDragBoard] = useState<BoardData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data, isLoading } = useBoardQuery();
  const board = data ?? EMPTY_BOARD;
  const view = dragBoard ?? board;

  const moveMutation = useMoveTaskMutation({
    onError: () => {
      toast.error("Could not move the task");
    },
  });

  const deleteMutation = useDeleteTaskMutation({
    optimistic: true,
    onError: () => {
      toast.error("Could not delete the task");
    },
  });

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    const status = findColumn(board, id);
    const task = status
      ? (board[status].find((t) => t.id === id) ?? null)
      : null;
    setActiveTask(task);
    setDragBoard(board);
  }

  function handleDragOver(event: DragOverEvent): void {
    if (!dragBoard || !event.over) {
      return;
    }
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const toStatus = findColumn(dragBoard, overId);
    if (!toStatus) {
      return;
    }
    const toIndex = indexInColumn(dragBoard, toStatus, overId);
    setDragBoard(applyMove(dragBoard, activeId, toStatus, toIndex));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const current = dragBoard;
    setActiveTask(null);
    setDragBoard(null);
    if (!current) {
      return;
    }
    const activeId = String(event.active.id);
    const toStatus = findColumn(current, activeId);
    if (!toStatus) {
      return;
    }
    const toIndex = current[toStatus].findIndex((t) => t.id === activeId);
    const fromStatus = findColumn(board, activeId);
    const fromIndex = fromStatus
      ? board[fromStatus].findIndex((t) => t.id === activeId)
      : -1;
    if (fromStatus === toStatus && fromIndex === toIndex) {
      return;
    }
    moveMutation.mutate({ id: activeId, toStatus, toIndex });
    const previous = queryClient.getQueryData<BoardData>(BOARD_KEY);
    if (previous) {
      queryClient.setQueryData<BoardData>(
        BOARD_KEY,
        applyMove(previous, activeId, toStatus, toIndex),
      );
    }
  }

  const goToNewTask = (): void => router.push("/tasks/new");

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5">
        <h1 className="text-[18px] font-bold tracking-tight">Devlog</h1>
        <Button onClick={goToNewTask}>New task</Button>
      </header>

      {isLoading ? (
        <div className="flex flex-1 gap-3 p-6">
          {TASK_STATUSES.map((s) => (
            <div
              key={s}
              className="flex-1 space-y-2 rounded-[8px] bg-muted p-2"
            >
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-16 w-full rounded-[6px]" />
              <Skeleton className="h-16 w-full rounded-[6px]" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <main className="flex flex-1 items-stretch gap-3 p-6">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={view[status]}
                onOpen={(id): void => router.push(`/tasks/${id}`)}
                onDelete={(id): void => setPendingDelete(id)}
                onCreate={goToNewTask}
              />
            ))}
          </main>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open): void => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="Delete this task?"
        description="This cannot be undone."
        confirmLabel="Delete"
        confirmTestId="confirm-delete"
        onConfirm={(): void => {
          if (pendingDelete) {
            deleteMutation.mutate(pendingDelete);
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
