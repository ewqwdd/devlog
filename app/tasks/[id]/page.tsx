import type React from "react";
import { TaskModalContent } from "@/components/task-modal-content";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return (
    <div className="min-h-svh bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-[8px] border border-border bg-card shadow-[0_1px_3px_rgba(9,30,66,0.1)]">
        <TaskModalContent id={id} />
      </div>
    </div>
  );
}
