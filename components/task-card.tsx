"use client";

import { RiDeleteBinLine } from "@remixicon/react";
import type React from "react";
import { PriorityIcon } from "@/components/priority-icon";
import type { Task } from "@/shared/types/task";

export function TaskCard({
  task,
  onOpen,
  onDelete,
}: {
  task: Task;
  onOpen?: () => void;
  onDelete?: () => void;
}): React.JSX.Element {
  return (
    <div
      data-testid="task-card"
      className="group relative rounded-[6px] border border-border bg-card px-3 py-[11px] shadow-[0_1px_1px_rgba(9,30,66,0.12)] transition-[border-color,box-shadow] hover:border-[#c8cdd4] hover:shadow-[0_4px_8px_rgba(9,30,66,0.16)]"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full pr-5 text-left text-[14px] leading-[1.4] font-medium text-card-foreground"
      >
        {task.title}
      </button>
      <div className="mt-2.5 flex items-center">
        <PriorityIcon priority={task.priority} />
      </div>
      {onDelete ? (
        <button
          type="button"
          aria-label="Delete task"
          data-testid="card-delete"
          onClick={onDelete}
          className="absolute top-1.5 right-1.5 hidden rounded-[4px] p-1 text-muted-foreground transition-colors group-hover:block hover:bg-muted hover:text-foreground"
        >
          <RiDeleteBinLine className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
