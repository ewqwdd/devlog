"use client";

import { RiCloseLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import type React from "react";
import { TaskForm } from "@/app/_components/task-form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";

export default function CreateTaskModal(): React.JSX.Element {
  const router = useRouter();
  return (
    <Dialog
      open
      onOpenChange={(open): void => {
        if (!open) {
          router.back();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[560px] gap-0 p-0 sm:max-w-[560px]"
      >
        <DialogDescription className="sr-only">
          Create a new task.
        </DialogDescription>
        <div className="flex items-center justify-between border-b border-border px-6 py-[18px]">
          <DialogTitle className="text-[18px] font-bold">New task</DialogTitle>
          <DialogClose className="flex size-[30px] items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted">
            <RiCloseLine className="size-[18px]" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <TaskForm />
      </DialogContent>
    </Dialog>
  );
}
