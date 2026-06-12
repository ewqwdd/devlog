import type { subtasks } from "@/shared/infra/db/schema";

export type Subtask = typeof subtasks.$inferSelect;
export type NewSubtask = typeof subtasks.$inferInsert;
