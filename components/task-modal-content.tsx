"use client";

import { notFound, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PrioritySelect } from "@/components/priority-select";
import { StatusSelect } from "@/components/status-select";
import { SubtaskSection } from "@/components/subtask-section";
import { useBoardQuery } from "@/shared/hooks/use-board-query";
import { useDeleteTaskMutation } from "@/shared/hooks/use-delete-task-mutation";
import { useMoveTaskMutation } from "@/shared/hooks/use-move-task-mutation";
import { useUpdateTaskMutation } from "@/shared/hooks/use-update-task-mutation";
import { formatDate } from "@/shared/lib/format-date";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import type { Board, Task } from "@/shared/types/task";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

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
    <div className="flex flex-col md:flex-row">
      {/* Main column */}
      <div className="min-w-0 flex-[1.7] border-b border-border px-7 pt-6 pb-8 md:border-r md:border-b-0">
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
          className="h-auto w-full rounded-[4px] border-0 bg-transparent px-0 py-1 text-[22px] leading-[1.3] font-bold text-foreground shadow-none focus-visible:bg-card focus-visible:ring-2"
        />

        <div className="mt-6">
          <h3 className="mb-2.5 text-[14px] font-semibold text-foreground/80">
            Description
          </h3>
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
            className="min-h-[48px] rounded-[4px] border-0 bg-transparent px-0 py-1.5 text-sm leading-[1.65] text-foreground/85 shadow-none focus-visible:bg-card focus-visible:ring-2"
          />
        </div>

        <div className="mt-7">
          <SubtaskSection taskId={task.id} />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full flex-shrink-0 px-6 pt-5 pb-7 md:w-[320px]">
        <StatusSelect
          value={task.status}
          onValueChange={(toStatus): void => {
            moveMutation.mutate({
              id,
              toStatus,
              toIndex: board ? board[toStatus].length : 0,
            });
          }}
          data-testid="modal-status"
        />

        <div className="mt-[18px] overflow-hidden rounded-[8px] border border-border">
          <div className="border-b border-border bg-muted/50 px-3.5 py-3 text-[13px] font-bold text-foreground/80">
            Details
          </div>
          <div className="px-3.5 pt-2 pb-3">
            <div className="flex min-h-10 items-center text-[13.5px]">
              <span className="w-24 flex-shrink-0 text-muted-foreground">
                Priority
              </span>
              <PrioritySelect
                value={task.priority}
                onValueChange={(priority): void => {
                  updateMutation.mutate({ priority });
                }}
                data-testid="modal-priority"
              />
            </div>
            <div className="flex min-h-10 items-center text-[13.5px]">
              <span className="w-24 flex-shrink-0 text-muted-foreground">
                Created
              </span>
              <time
                dateTime={task.createdAt.toISOString()}
                className="text-foreground/85"
              >
                {formatDate(task.createdAt)}
              </time>
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex justify-end">
          <ConfirmDialog
            trigger={
              <Button
                data-testid="modal-delete"
                className="border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Delete
              </Button>
            }
            title="Delete this task?"
            description="This cannot be undone."
            confirmLabel="Delete"
            confirmTestId="modal-confirm-delete"
            onConfirm={(): void => {
              deleteMutation.mutate(id);
            }}
          />
        </div>
      </div>
    </div>
  );
}
