import type { TaskPriority, TaskStatus } from "@/shared/types/task";

// Source of ordering/iteration for columns, zod enums, and selects.
// `as const` preserves the literal tuple (so z.enum infers the exact union);
// `satisfies` guards against drift from the schema enums in shared/infra/db/schema.ts.
export const TASK_STATUSES = [
  "todo",
  "in-progress",
  "done",
] as const satisfies readonly TaskStatus[];

export const TASK_PRIORITIES = [
  "low",
  "medium",
  "high",
] as const satisfies readonly TaskPriority[];
