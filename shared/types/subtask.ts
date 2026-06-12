import type { subtasks } from "@/shared/infra/db/schema";

export type Subtask = typeof subtasks.$inferSelect;
export type NewSubtask = typeof subtasks.$inferInsert;

// One reorder operation renumbers a task's subtasks; the repository
// transaction (updatePositions), the pure compute function, and the
// service all consume these.
export interface SubtaskPositionUpdate {
  readonly id: string;
  readonly position: number;
}
