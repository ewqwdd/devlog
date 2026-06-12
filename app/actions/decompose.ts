"use server";

import { z } from "zod";
import type { ActionResult } from "@/shared/types/action-result";
import type { DecomposeResult } from "@/shared/types/decompose";
import { decomposeTask } from "@/use-cases/decompose-agent";

const decomposeInputSchema = z.object({ taskId: z.uuid() });

export async function decomposeTaskAction(
  taskId: string,
): Promise<ActionResult<DecomposeResult>> {
  const parsed = decomposeInputSchema.safeParse({ taskId });
  if (!parsed.success) {
    return { ok: false, error: "Invalid task id" };
  }
  return decomposeTask(parsed.data.taskId);
}
