import { tool } from "ai";
import { z } from "zod";
import { tasksService } from "@/services/tasks-service";
import type { Board } from "@/shared/types/task";

const listTasks = tool({
  description:
    "List the actionable board: every task in todo and in-progress, each with id, title, description, status, priority, and createdAt. Done tasks are excluded — they are never candidates. Takes no arguments.",
  inputSchema: z.object({}),
  execute: async (): Promise<Omit<Board, "done">> => {
    const board = tasksService.listBoard();
    return { todo: board.todo, "in-progress": board["in-progress"] };
  },
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
