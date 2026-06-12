import type React from "react";
import { BackButton } from "@/components/back-button";
import { TaskForm } from "@/components/task-form";

export default function CreateTaskPage(): React.JSX.Element {
  return (
    <div className="min-h-svh bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-3">
          <BackButton />
        </div>
        <div className="overflow-hidden rounded-[8px] border border-border bg-card shadow-[0_1px_3px_rgba(9,30,66,0.1)]">
          <div className="border-b border-border px-6 py-[18px]">
            <h1 className="text-[18px] font-bold">New task</h1>
          </div>
          <TaskForm />
        </div>
      </div>
    </div>
  );
}
