"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateTaskMutation } from "@/shared/hooks/use-create-task-mutation";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import type { TaskPriority, TaskStatus } from "@/shared/types/task";
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="title"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Title
        </label>
        <Input
          id="title"
          data-testid="title-input"
          value={title}
          onChange={(e): void => setTitle(e.target.value)}
          autoFocus
        />
        {error ? (
          <p data-testid="form-error" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="description"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Description
        </label>
        <Textarea
          id="description"
          data-testid="description-input"
          value={description}
          onChange={(e): void => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Status
          </span>
          <Select
            value={status}
            onValueChange={(v): void => setStatus(v as TaskStatus)}
          >
            <SelectTrigger data-testid="status-select">
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
            value={priority}
            onValueChange={(v): void => setPriority(v as TaskPriority)}
          >
            <SelectTrigger data-testid="priority-select">
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
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
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
