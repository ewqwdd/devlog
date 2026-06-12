"use client";

import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { SubtaskList } from "@/app/_components/subtask-list";
import { useCreateSubtaskMutation } from "@/shared/hooks/use-create-subtask-mutation";
import { useDeleteSubtaskMutation } from "@/shared/hooks/use-delete-subtask-mutation";
import { useMoveSubtaskMutation } from "@/shared/hooks/use-move-subtask-mutation";
import { useSubtasksQuery } from "@/shared/hooks/use-subtasks-query";
import { useUpdateSubtaskMutation } from "@/shared/hooks/use-update-subtask-mutation";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";

export function SubtaskSection({
  taskId,
}: {
  taskId: string;
}): React.JSX.Element {
  const [newTitle, setNewTitle] = useState("");

  const { data: subtasks, isLoading } = useSubtasksQuery(taskId);

  const createMutation = useCreateSubtaskMutation(taskId, {
    onError: (err): void => {
      toast.error(err.message);
    },
  });
  const updateMutation = useUpdateSubtaskMutation(taskId, {
    onError: (): void => {
      toast.error("Could not update the subtask");
    },
  });
  const moveMutation = useMoveSubtaskMutation(taskId, {
    onError: (): void => {
      toast.error("Could not reorder the subtask");
    },
  });
  const deleteMutation = useDeleteSubtaskMutation(taskId, {
    onError: (): void => {
      toast.error("Could not delete the subtask");
    },
  });

  function handleAdd(): void {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) {
      return;
    }
    createMutation.mutate(trimmed, {
      onSuccess: () => setNewTitle(""),
    });
  }

  const list = subtasks ?? [];
  const subTotal = list.length;
  const subDone = list.filter((s) => s.done).length;
  const pct = subTotal === 0 ? 0 : Math.round((subDone / subTotal) * 100);

  return (
    <section className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground/80">
          Subtasks
        </h3>
        {subTotal > 0 ? (
          <span className="text-[12.5px] font-semibold text-muted-foreground">
            {subDone} of {subTotal} done
          </span>
        ) : null}
      </div>

      {subTotal > 0 ? (
        <div className="mb-3.5 h-1.5 overflow-hidden rounded bg-muted-foreground/15">
          <div
            className="h-full rounded bg-[#22a06b] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[8px] border border-border">
        {isLoading ? (
          <div className="flex flex-col">
            <Skeleton className="h-10 w-full rounded-none" />
            <Skeleton className="h-10 w-full rounded-none" />
          </div>
        ) : (
          <SubtaskList
            taskId={taskId}
            subtasks={list}
            onMove={(vars): void => moveMutation.mutate(vars)}
            onToggle={(id, done): void =>
              updateMutation.mutate({ id, patch: { done } })
            }
            onRename={(id, title): void =>
              updateMutation.mutate({ id, patch: { title } })
            }
            onDelete={(id): void => deleteMutation.mutate(id)}
          />
        )}
        <div className="flex items-center gap-2 bg-muted/50 px-3 py-2.5">
          <Input
            data-testid="subtask-add-input"
            value={newTitle}
            placeholder="Add a subtask…"
            disabled={createMutation.isPending}
            onChange={(e): void => setNewTitle(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="h-8 text-[13.5px]"
          />
          <Button
            type="button"
            size="sm"
            data-testid="subtask-add-submit"
            disabled={createMutation.isPending}
            onClick={handleAdd}
          >
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}
