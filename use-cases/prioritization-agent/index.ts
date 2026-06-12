import { generateText, stepCountIs } from "ai";
import { tasksService } from "@/services/tasks-service";
import { getPrioritizationModel } from "@/shared/infra/llm";
import { logger } from "@/shared/lib/logger";
import type { ActionResult } from "@/shared/types/action-result";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import {
  NO_TASKS_MESSAGE,
  SYSTEM_PROMPT,
} from "@/use-cases/prioritization-agent/system-prompt";
import {
  prioritizationTools,
  recommendSchema,
} from "@/use-cases/prioritization-agent/tools";

// 6 steps is the runaway guard; a healthy run is listTasks -> recommend.
export async function runPrioritization(): Promise<
  ActionResult<PrioritizationResult>
> {
  const board = tasksService.listBoard();
  const pool = [...board.todo, ...board["in-progress"]];
  if (pool.length === 0) {
    return { ok: true, data: { task: null, reasoning: NO_TASKS_MESSAGE } };
  }

  try {
    const model = await getPrioritizationModel();
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      tools: prioritizationTools,
      prompt: "Recommend the single task to start right now.",
      stopWhen: stepCountIs(6),
    });

    const recommendCall = result.steps
      .flatMap((step) => step.toolCalls)
      .find((call) => call.toolName === "recommend");
    if (!recommendCall) {
      return {
        ok: false,
        error: "The prioritization agent did not return a recommendation.",
      };
    }

    const parsed = recommendSchema.safeParse(recommendCall.input);
    if (!parsed.success) {
      return { ok: false, error: "Could not resolve the recommended task." };
    }

    const task = parsed.data.taskId
      ? tasksService.getTask(parsed.data.taskId)
      : null;
    const inPool =
      task !== null &&
      (task.status === "todo" || task.status === "in-progress");
    if (!inPool) {
      return { ok: false, error: "Could not resolve the recommended task." };
    }

    return { ok: true, data: { task, reasoning: parsed.data.reasoning } };
  } catch (error) {
    logger.error({ error }, "Prioritization agent failed");
    return { ok: false, error: "The prioritization agent failed. Try again." };
  }
}
