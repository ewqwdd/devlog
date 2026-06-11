import type React from "react";
import { TaskForm } from "@/app/_components/task-form";

export default function CreateTaskPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-xl font-semibold">New task</h1>
      <TaskForm />
    </div>
  );
}
