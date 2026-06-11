"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { SubtaskList } from "@/app/_components/subtask-list";
import {
  createSubtaskAction,
  deleteSubtaskAction,
  getSubtasksAction,
  moveSubtaskAction,
  updateSubtaskAction,
} from "@/app/actions/subtasks";
import { applySubtaskMove } from "@/services/compute-subtask-move";
import type { Subtask } from "@/shared/types/subtask";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";

export function SubtaskSection({
  taskId,
}: {
  taskId: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const queryKey = ["subtasks", taskId] as const;
  const [newTitle, setNewTitle] = useState("");

  const { data: subtasks, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Subtask[]> => {
      const result = await getSubtasksAction({ taskId });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const createMutation = useMutation({
    mutationFn: async (title: string): Promise<Subtask> => {
      const result = await createSubtaskAction({ taskId, title });
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

  const updateMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      patch: { title?: string; done?: boolean };
    }): Promise<Subtask> => {
      const result = await updateSubtaskAction({ id: vars.id, ...vars.patch });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subtask[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Subtask[]>(
          queryKey,
          previous.map((s) => (s.id === vars.id ? { ...s, ...vars.patch } : s)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Could not update the subtask");
    },
    onSettled: invalidate,
  });

  const moveMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      toPosition: number;
    }): Promise<void> => {
      const result = await moveSubtaskAction(vars);
      if (!result.ok) {
        throw new Error(result.error);
      }
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subtask[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Subtask[]>(
          queryKey,
          applySubtaskMove(previous, vars.id, vars.toPosition),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Could not reorder the subtask");
    },
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const result = await deleteSubtaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subtask[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Subtask[]>(
          queryKey,
          previous
            .filter((s) => s.id !== id)
            .map((s, index) => ({ ...s, position: index })),
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Could not delete the subtask");
    },
    onSettled: invalidate,
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
