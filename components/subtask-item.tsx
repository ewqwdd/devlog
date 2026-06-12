"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RiDeleteBinLine, RiDraggable } from "@remixicon/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import type { Subtask } from "@/shared/types/subtask";
import { Checkbox } from "@/shared/ui/checkbox";

export function SubtaskItem({
  subtask,
  onToggle,
  onRename,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: (done: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}): React.JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(subtask.title);
  // Esc unmounts the input; its blur must not then save. A ref flag survives
  // the synchronous setState + unmount without an extra render.
  const cancelEditRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  function startEditing(): void {
    cancelEditRef.current = false;
    setDraft(subtask.title);
    setIsEditing(true);
  }

  function commitEditing(): void {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      return;
    }
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== subtask.title) {
      onRename(trimmed);
    }
  }

  function cancelEditing(): void {
    cancelEditRef.current = true;
    setIsEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      data-testid="subtask-item"
      className="flex items-center gap-2.5 border-b border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted"
    >
      <button
        type="button"
        aria-label="Drag subtask"
        data-testid="subtask-drag-handle"
        className="cursor-grab text-[#b3bac5]"
        {...attributes}
        {...listeners}
      >
        <RiDraggable className="size-4" />
      </button>
      <Checkbox
        data-testid="subtask-checkbox"
        checked={subtask.done}
        onCheckedChange={(checked): void => onToggle(checked === true)}
        className="size-4 rounded-[4px] border-2 border-input bg-card data-checked:border-[#22a06b] data-checked:bg-[#22a06b]"
      />
      {isEditing ? (
        <input
          ref={inputRef}
          data-testid="subtask-title-input"
          value={draft}
          onChange={(e): void => setDraft(e.target.value)}
          onBlur={commitEditing}
          onKeyDown={(e): void => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              cancelEditing();
            }
          }}
          className="flex-1 rounded-[4px] border border-input bg-card px-2 py-0.5 text-[14px] outline-none focus-visible:border-ring"
        />
      ) : (
        <button
          type="button"
          data-testid="subtask-title"
          onClick={startEditing}
          className={cn(
            "flex-1 text-left text-[14px] text-foreground",
            subtask.done && "text-muted-foreground line-through",
          )}
        >
          {subtask.title}
        </button>
      )}
      <button
        type="button"
        aria-label="Delete subtask"
        data-testid="subtask-delete"
        onClick={onDelete}
        className="rounded-[4px] p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground"
      >
        <RiDeleteBinLine className="size-4" />
      </button>
    </div>
  );
}
