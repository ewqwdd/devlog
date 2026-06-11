"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { TaskForm } from "@/app/_components/task-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new task.
          </DialogDescription>
        </DialogHeader>
        <TaskForm />
      </DialogContent>
    </Dialog>
  );
}
