"use client";

import type React from "react";
import { PriorityIcon } from "@/components/priority-icon";
import { TASK_PRIORITIES } from "@/shared/lib/task-constants";
import { cn } from "@/shared/lib/utils";
import type { TaskPriority } from "@/shared/types/task";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function PrioritySelect({
  value,
  onValueChange,
  "data-testid": dataTestId,
  className,
}: {
  value: TaskPriority;
  onValueChange: (priority: TaskPriority) => void;
  "data-testid"?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Select
      value={value}
      onValueChange={(v): void => onValueChange(v as TaskPriority)}
    >
      <SelectTrigger
        data-testid={dataTestId}
        className={cn(
          "h-auto w-auto gap-1.5 rounded-[4px] border-0 bg-transparent px-1.5 py-1 text-[13.5px] font-normal text-foreground hover:bg-muted focus-visible:ring-2",
          className,
        )}
      >
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
  );
}
