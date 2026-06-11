"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notFound, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteTaskAction,
  getBoardAction,
  moveTaskAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import type {
  Board,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/shared/types/task";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const BOARD_KEY = ["board"] as const;
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function findTask(board: Board | undefined, id: string): Task | undefined {
  if (!board) {
    return undefined;
  }
  for (const status of TASK_STATUSES) {
    const found = board[status].find((t) => t.id === id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function TaskModalContent({
  id,
}: {
  id: string;
}): React.JSX.Element | null {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: board, isLoading } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: async (): Promise<Board> => {
      const result = await getBoardAction();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const task = findTask(board, id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const seededIdRef = useRef<string | null>(null);

  // Seed the text fields once per opened task. Guarding on the task identity
  // (not the object reference) stops a save's invalidation→refetch from
  // clobbering an in-progress edit of another field.
  useEffect(() => {
    if (task && seededIdRef.current !== task.id) {
      seededIdRef.current = task.id;
      setTitle(task.title);
      setDescription(task.description);
    }
  }, [task]);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
  };

  const updateMutation = useMutation({
    mutationFn: async (patch: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
    }): Promise<Task> => {
      const result = await updateTaskAction({ id, ...patch });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: invalidate,
    onError: (err: Error): void => {
      toast.error(err.message);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (toStatus: TaskStatus): Promise<Board> => {
      const toIndex = board ? board[toStatus].length : 0;
      const result = await moveTaskAction({ id, toStatus, toIndex });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: invalidate,
    onError: (err: Error): void => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      const result = await deleteTaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (): void => {
      invalidate();
      router.back();
    },
    onError: (err: Error): void => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!task) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <Input
        data-testid="modal-title"
        value={title}
        onChange={(e): void => {
          setTitle(e.target.value);
        }}
        onBlur={(): void => {
          if (title !== task.title) {
            updateMutation.mutate({ title });
          }
        }}
        onKeyDown={(e): void => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="text-lg font-semibold"
      />
      <Textarea
        data-testid="modal-description"
        value={description}
        onChange={(e): void => {
          setDescription(e.target.value);
        }}
        onBlur={(): void => {
          if (description !== task.description) {
            updateMutation.mutate({ description });
          }
        }}
        placeholder="Add a description…"
      />
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Status</span>
          <Select
            value={task.status}
            onValueChange={(v): void => {
              statusMutation.mutate(v as TaskStatus);
            }}
          >
            <SelectTrigger data-testid="modal-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Priority</span>
          <Select
            value={task.priority}
            onValueChange={(v): void => {
              updateMutation.mutate({ priority: v as TaskPriority });
            }}
          >
            <SelectTrigger data-testid="modal-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="modal-delete">
              Delete
            </Button>
          </AlertDialogTrigger>
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
                data-testid="modal-confirm-delete"
                onClick={(): void => {
                  deleteMutation.mutate();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
