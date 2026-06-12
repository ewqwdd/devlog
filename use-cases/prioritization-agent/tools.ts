import { tool } from "ai";
import { z } from "zod";
import { tasksService } from "@/services/tasks-service";
import type { Board } from "@/shared/types/task";

const listTasks = tool({
  description:
    "List the whole board: every task in todo, in-progress, and done, each with id, title, description, status, priority, and createdAt. Takes no arguments.",
  inputSchema: z.object({}),
  execute: async (): Promise<Board> => tasksService.listBoard(),
});

export const recommendSchema = z.object({
  taskId: z.string(),
  reasoning: z.string().min(1),
});

const recommend = tool({
  description:
    "Record your final recommendation: the id of the single task to start right now, plus concise reasoning. Call this exactly once, as your last action.",
  inputSchema: recommendSchema,
  execute: async (
    input: z.infer<typeof recommendSchema>,
  ): Promise<z.infer<typeof recommendSchema>> => input,
});

export const prioritizationTools = { listTasks, recommend };
