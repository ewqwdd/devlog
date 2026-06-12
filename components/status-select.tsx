"use client";

import type React from "react";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import { cn } from "@/shared/lib/utils";
import type { TaskStatus } from "@/shared/types/task";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  done: "Done",
};

export function StatusSelect({
  value,
  onValueChange,
  "data-testid": dataTestId,
  className,
}: {
  value: TaskStatus;
  onValueChange: (status: TaskStatus) => void;
  "data-testid"?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Select
      value={value}
      onValueChange={(v): void => onValueChange(v as TaskStatus)}
    >
      <SelectTrigger
        data-testid={dataTestId}
        className={cn(
          "h-auto w-auto gap-2 rounded-[4px] border-0 bg-primary/10 px-[13px] py-[9px] text-[12px] font-bold tracking-[0.04em] text-primary uppercase hover:bg-primary/20 focus-visible:ring-2 [&_svg]:text-primary",
          className,
        )}
      >
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
  );
}
