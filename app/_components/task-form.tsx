"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { PriorityIcon } from "@/components/priority-icon";
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
            <Select
              value={status}
              onValueChange={(v): void => setStatus(v as TaskStatus)}
            >
              <SelectTrigger data-testid="status-select" className="w-full">
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
          <div className="flex-1">
            <span className={LABEL_CLASS}>Priority</span>
            <Select
              value={priority}
              onValueChange={(v): void => setPriority(v as TaskPriority)}
            >
              <SelectTrigger data-testid="priority-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2">
                      <PriorityIcon priority={p} />
                      {PRIORITY_LABEL[p]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
