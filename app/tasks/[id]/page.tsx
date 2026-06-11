import type React from "react";
import { TaskModalContent } from "@/app/_components/task-modal-content";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl p-6">
      <TaskModalContent id={id} />
    </div>
  );
}
