"use server";

import type { ActionResult } from "@/shared/types/action-result";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import { runPrioritization } from "@/use-cases/prioritization-agent";

export async function prioritizeAction(): Promise<
  ActionResult<PrioritizationResult>
> {
  return runPrioritization();
}
