import { generateObject } from "ai";
import { tasksService } from "@/services/tasks-service";
import { getDecomposeModel } from "@/shared/infra/llm";
import { logger } from "@/shared/lib/logger";
import type { ActionResult } from "@/shared/types/action-result";
import type { DecomposeResult } from "@/shared/types/decompose";
import { decomposeSchema } from "@/use-cases/decompose-agent/schema";
import { DECOMPOSE_SYSTEM_PROMPT } from "@/use-cases/decompose-agent/system-prompt";

// Single structured call: reads the task's title + description and returns ordered
// subtask suggestions (or an empty list + a reason). Read-only — writes nothing.
export async function decomposeTask(
  taskId: string,
): Promise<ActionResult<DecomposeResult>> {
  const task = tasksService.getTask(taskId);
  if (!task) {
    return { ok: false, error: "Task not found" };
  }

  try {
    const model = await getDecomposeModel();
    const { object } = await generateObject({
      model,
      system: DECOMPOSE_SYSTEM_PROMPT,
      schema: decomposeSchema,
      prompt: `Title: ${task.title}\n\nDescription: ${task.description}`,
    });
    return {
      ok: true,
      data: { subtasks: object.subtasks, reasoning: object.reasoning },
    };
  } catch (error) {
    logger.error({ error }, "Decompose agent failed");
    return { ok: false, error: "The decomposition agent failed. Try again." };
  }
}
