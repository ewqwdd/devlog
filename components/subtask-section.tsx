"use client";

import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { DecomposePreview } from "@/components/decompose-preview";
import { SubtaskList } from "@/components/subtask-list";
import { useCreateSubtaskMutation } from "@/shared/hooks/use-create-subtask-mutation";
import { useCreateSubtasksMutation } from "@/shared/hooks/use-create-subtasks-mutation";
import { useDecomposeTask } from "@/shared/hooks/use-decompose-task";
import { useDeleteSubtaskMutation } from "@/shared/hooks/use-delete-subtask-mutation";
import { useMoveSubtaskMutation } from "@/shared/hooks/use-move-subtask-mutation";
import { useSubtasksQuery } from "@/shared/hooks/use-subtasks-query";
import { useUpdateSubtaskMutation } from "@/shared/hooks/use-update-subtask-mutation";
import type { DecomposeStatus, DraftRow } from "@/shared/types/decompose";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";

export function SubtaskSection({
  taskId,
}: {
  taskId: string;
}): React.JSX.Element {
  const [newTitle, setNewTitle] = useState("");

  const [status, setStatus] = useState<DecomposeStatus>("idle");
  const [reasoning, setReasoning] = useState("");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

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

  const decomposeMutation = useDecomposeTask(taskId, {
    onError: (): void => setStatus("error"),
  });
  const createSubtasksMutation = useCreateSubtasksMutation(taskId, {
    onSuccess: (): void => clearDraft(),
    onError: (): void => {
      toast.error("Could not save the subtasks");
    },
  });

  function clearDraft(): void {
    setStatus("idle");
    setDrafts([]);
    setReasoning("");
  }

  function handleDecompose(): void {
    setStatus("loading");
    decomposeMutation.mutate(undefined, {
      onSuccess: (data): void => {
        setReasoning(data.reasoning);
        if (data.subtasks.length === 0) {
          setDrafts([]);
          setStatus("refused");
        } else {
          setDrafts(
            data.subtasks.map((s) => ({
              key: crypto.randomUUID(),
              title: s.title,
            })),
          );
          setStatus("preview");
        }
      },
    });
  }

  function handleRenameDraft(key: string, title: string): void {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, title } : d)));
  }

  function handleRemoveDraft(key: string): void {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  function handleSave(): void {
    const titles = drafts
      .map((d) => d.title.trim())
      .filter((t) => t.length > 0);
    if (titles.length === 0) {
      return;
    }
    createSubtasksMutation.mutate(titles);
  }

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
        <div className="flex items-center gap-2">
          {subTotal > 0 ? (
            <span className="text-[12.5px] font-semibold text-muted-foreground">
              {subDone} of {subTotal} done
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="decompose-button"
            disabled={status !== "idle"}
            onClick={handleDecompose}
          >
            {status === "loading" ? "Decomposing…" : "✨ Decompose"}
          </Button>
        </div>
      </div>

      {subTotal > 0 ? (
        <div className="mb-3.5 h-1.5 overflow-hidden rounded bg-muted-foreground/15">
          <div
            className="h-full rounded bg-[#22a06b] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <DecomposePreview
        status={status}
        reasoning={reasoning}
        drafts={drafts}
        isSaving={createSubtasksMutation.isPending}
        onRenameDraft={handleRenameDraft}
        onRemoveDraft={handleRemoveDraft}
        onSave={handleSave}
        onDiscard={clearDraft}
        onDismiss={clearDraft}
      />

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
