"use client";

import { RiCloseLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import type React from "react";
import { use } from "react";
import { TaskModalContent } from "@/app/_components/task-modal-content";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";

export default function TaskModal({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
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
        className="max-h-[90vh] w-[95vw] max-w-[920px] gap-0 overflow-y-auto p-0 sm:max-w-[920px]"
      >
        <DialogTitle className="sr-only">Task</DialogTitle>
        <DialogDescription className="sr-only">
          View and edit task details.
        </DialogDescription>
        <div className="flex justify-end border-b border-border px-[18px] py-3">
          <DialogClose className="flex size-[30px] items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted">
            <RiCloseLine className="size-[18px]" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <TaskModalContent id={id} />
      </DialogContent>
    </Dialog>
  );
}
