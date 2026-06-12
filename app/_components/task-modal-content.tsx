"use client";

import { notFound, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SubtaskSection } from "@/app/_components/subtask-section";
import { useBoardQuery } from "@/shared/hooks/use-board-query";
import { useDeleteTaskMutation } from "@/shared/hooks/use-delete-task-mutation";
import { useMoveTaskMutation } from "@/shared/hooks/use-move-task-mutation";
import { useUpdateTaskMutation } from "@/shared/hooks/use-update-task-mutation";
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

  const { data: board, isLoading } = useBoardQuery();

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

  const updateMutation = useUpdateTaskMutation(id, {
    onError: (err: Error): void => {
      toast.error(err.message);
    },
  });

  const moveMutation = useMoveTaskMutation({
    onError: (err: Error): void => {
      toast.error(err.message);
    },
  });

  // No optimistic removal here: the modal calls notFound() as soon as the task
  // disappears from the cached board, which would 404 the modal before
  // router.back() runs.
  const deleteMutation = useDeleteTaskMutation({
    onSuccess: (): void => {
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
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Status
          </span>
          <Select
            value={task.status}
            onValueChange={(v): void => {
              const toStatus = v as TaskStatus;
              moveMutation.mutate({
                id,
                toStatus,
                toIndex: board ? board[toStatus].length : 0,
              });
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
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Priority
          </span>
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
      <SubtaskSection taskId={task.id} />
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
                  deleteMutation.mutate(id);
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
