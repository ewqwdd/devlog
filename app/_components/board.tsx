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
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { BoardColumn } from "@/app/_components/board-column";
import { useBoardQuery } from "@/app/_components/hooks/use-board-query";
import { useDeleteTaskMutation } from "@/app/_components/hooks/use-delete-task-mutation";
import { useMoveTaskMutation } from "@/app/_components/hooks/use-move-task-mutation";
import { TaskCard } from "@/components/task-card";
import { applyMove } from "@/services/compute-move";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import type { Board as BoardData, Task, TaskStatus } from "@/shared/types/task";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
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
  }

  return (
    <div className="flex min-h-svh flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Devlog</h1>
        <Button onClick={(): void => router.push("/tasks/new")}>
          New task
        </Button>
      </header>

      {isLoading ? (
        <div className="flex gap-4">
          {TASK_STATUSES.map((s) => (
            <div key={s} className="flex-1 space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
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
          <div className="flex flex-1 gap-4">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={view[status]}
                onOpen={(id): void => router.push(`/tasks/${id}`)}
                onDelete={(id): void => setPendingDelete(id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open): void => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete"
              onClick={(): void => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete);
                }
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
