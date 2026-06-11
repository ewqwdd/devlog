import type { tasks } from "@/shared/infra/db/schema";

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];

// One operation moves/renumbers tasks; the repository transaction consumes these.
export interface TaskPositionUpdate {
  readonly id: string;
  readonly position: number;
  readonly status: TaskStatus;
}

// The whole board, grouped by column, each column ordered by position asc.
export type Board = Record<TaskStatus, Task[]>;
