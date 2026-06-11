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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { BoardColumn } from "@/app/_components/board-column";
import {
  deleteTaskAction,
  getBoardAction,
  moveTaskAction,
} from "@/app/actions/tasks";
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

const BOARD_KEY = ["board"] as const;
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
  const queryClient = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragBoard, setDragBoard] = useState<BoardData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data, isLoading } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: async (): Promise<BoardData> => {
      const result = await getBoardAction();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
  const board = data ?? EMPTY_BOARD;
  const view = dragBoard ?? board;

  const moveMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      toStatus: TaskStatus;
      toIndex: number;
    }) => {
      const result = await moveTaskAction(vars);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<BoardData>(BOARD_KEY);
      if (previous) {
        queryClient.setQueryData<BoardData>(
          BOARD_KEY,
          applyMove(previous, vars.id, vars.toStatus, vars.toIndex),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BOARD_KEY, context.previous);
      }
      toast.error("Could not move the task");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<BoardData>(BOARD_KEY);
      if (previous) {
        const next: BoardData = { todo: [], "in-progress": [], done: [] };
        for (const status of TASK_STATUSES) {
          next[status] = previous[status]
            .filter((t) => t.id !== id)
            .map((t, index) => ({ ...t, position: index }));
        }
        queryClient.setQueryData<BoardData>(BOARD_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BOARD_KEY, context.previous);
      }
      toast.error("Could not delete the task");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
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
