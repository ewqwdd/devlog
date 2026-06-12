"use client";

import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateSubtaskMutation } from "@/app/_components/hooks/use-create-subtask-mutation";
import { useDeleteSubtaskMutation } from "@/app/_components/hooks/use-delete-subtask-mutation";
import { useMoveSubtaskMutation } from "@/app/_components/hooks/use-move-subtask-mutation";
import { useSubtasksQuery } from "@/app/_components/hooks/use-subtasks-query";
import { useUpdateSubtaskMutation } from "@/app/_components/hooks/use-update-subtask-mutation";
import { SubtaskList } from "@/app/_components/subtask-list";
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

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Subtasks</h3>
      {isLoading ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <SubtaskList
          subtasks={subtasks ?? []}
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
      <div className="flex gap-2">
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
        />
        <Button
          type="button"
          data-testid="subtask-add-submit"
          disabled={createMutation.isPending}
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>
    </section>
  );
}
