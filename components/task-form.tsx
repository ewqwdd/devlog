"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { PrioritySelect } from "@/components/priority-select";
import { StatusSelect } from "@/components/status-select";
import { useCreateTaskMutation } from "@/shared/hooks/use-create-task-mutation";
import type { TaskPriority, TaskStatus } from "@/shared/types/task";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

const LABEL_CLASS =
  "mb-1.5 block text-[12.5px] font-semibold text-foreground/80";

export function TaskForm(): React.JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateTaskMutation({
    onSuccess: () => {
      router.back();
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
  });

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setError(null);
    if (title.trim().length === 0) {
      setError("Title is required");
      return;
    }
    mutation.mutate({ title, description, status, priority });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="flex flex-col gap-[18px] px-6 py-5">
        <div>
          <label htmlFor="title" className={LABEL_CLASS}>
            Title <span className="text-destructive">*</span>
          </label>
          <Input
            id="title"
            data-testid="title-input"
            value={title}
            onChange={(e): void => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
          />
          {error ? (
            <p
              data-testid="form-error"
              className="mt-1.5 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="description" className={LABEL_CLASS}>
            Description
          </label>
          <Textarea
            id="description"
            data-testid="description-input"
            value={description}
            placeholder="Add a description…"
            onChange={(e): void => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-3.5">
          <div className="flex-1">
            <span className={LABEL_CLASS}>Status</span>
            <StatusSelect
              value={status}
              onValueChange={setStatus}
              data-testid="status-select"
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <span className={LABEL_CLASS}>Priority</span>
            <PrioritySelect
              value={priority}
              onValueChange={setPriority}
              data-testid="priority-select"
              className="w-full border border-zinc-200"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2.5 border-t border-border bg-muted/50 px-6 py-3.5">
        <Button
          type="button"
          variant="ghost"
          onClick={(): void => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          data-testid="create-submit"
          disabled={mutation.isPending}
        >
          Create
        </Button>
      </div>
    </form>
  );
}
