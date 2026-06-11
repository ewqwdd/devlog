"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { use } from "react";
import { TaskModalContent } from "@/app/_components/task-modal-content";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
      <DialogContent className="h-[90vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Task</DialogTitle>
          <DialogDescription className="sr-only">
            View and edit task details.
          </DialogDescription>
        </DialogHeader>
        <TaskModalContent id={id} />
      </DialogContent>
    </Dialog>
  );
}
