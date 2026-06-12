import type { Task } from "@/shared/types/task";

// The recommendation returned by the prioritization agent. `task` is null only
// when the pool (todo + in-progress) is empty; `reasoning` is always present.
export interface PrioritizationResult {
  readonly task: Task | null;
  readonly reasoning: string;
}
