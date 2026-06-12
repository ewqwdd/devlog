import { tool } from "ai";
import { z } from "zod";
import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { subtasksService } from "@/services/subtasks-service";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksService } from "@/services/tasks-service";
import { logger } from "@/shared/lib/logger";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import type { ActionResult } from "@/shared/types/action-result";
import type { PrioritizationResult } from "@/shared/types/prioritization";
import type { Subtask } from "@/shared/types/subtask";
import type { Task } from "@/shared/types/task";
import { runPrioritization as runPrioritizationAgent } from "@/use-cases/prioritization-agent";

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);
const titleSchema = z.string().trim().min(1, "Title is required").max(200);

function toErrorResult(error: unknown): { ok: false; error: string } {
  if (
    error instanceof TaskNotFoundError ||
    error instanceof SubtaskNotFoundError
  ) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) {
    return { ok: false, error: "Task not found" };
  }
  logger.error({ error }, "Chat tool error");
  return { ok: false, error: "Something went wrong" };
}

function findTaskById(id: string): Task | undefined {
  const board = tasksService.listBoard();
  for (const status of TASK_STATUSES) {
    const found = board[status].find((task) => task.id === id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

const listTasks = tool({
  description:
    "List tasks on the board. Optional filters (combined with AND): status, priority, and a case-insensitive search over title OR description. No filter returns the whole board.",
  inputSchema: z.object({
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    search: z.string().optional(),
  }),
  execute: async ({
    status,
    priority,
    search,
  }): Promise<ActionResult<Task[]>> => {
    try {
      const board = tasksService.listBoard();
      let tasks = TASK_STATUSES.flatMap((s) => board[s]);
      if (status) {
        tasks = tasks.filter((t) => t.status === status);
      }
      if (priority) {
        tasks = tasks.filter((t) => t.priority === priority);
      }
      if (search) {
        const query = search.toLowerCase();
        tasks = tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query),
        );
      }
      return { ok: true, data: tasks };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const createTask = tool({
  description:
    "Create a new task. It is appended to the bottom of its status column.",
  inputSchema: z.object({
    title: titleSchema,
    description: z.string().max(2000).default(""),
    status: statusEnum.default("todo"),
    priority: priorityEnum.default("medium"),
  }),
  execute: async (input): Promise<ActionResult<Task>> => {
    try {
      return { ok: true, data: tasksService.createTask(input) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const editTask = tool({
  description:
    "Edit a task. Provide its id and at least one of title, description, priority, status. Changing status moves the task to the end of the target column.",
  inputSchema: z
    .object({
      id: z.uuid(),
      title: titleSchema.optional(),
      description: z.string().max(2000).optional(),
      priority: priorityEnum.optional(),
      status: statusEnum.optional(),
    })
    .refine(
      (v) =>
        v.title !== undefined ||
        v.description !== undefined ||
        v.priority !== undefined ||
        v.status !== undefined,
      { message: "Provide at least one field to change" },
    ),
  execute: async ({
    id,
    title,
    description,
    priority,
    status,
  }): Promise<ActionResult<Task>> => {
    try {
      const patch: {
        title?: string;
        description?: string;
        priority?: (typeof TASK_PRIORITIES)[number];
      } = {};
      if (title !== undefined) {
        patch.title = title;
      }
      if (description !== undefined) {
        patch.description = description;
      }
      if (priority !== undefined) {
        patch.priority = priority;
      }
      if (Object.keys(patch).length > 0) {
        tasksService.updateTask(id, patch);
      }
      if (status !== undefined) {
        const target = tasksService.listBoard()[status];
        tasksService.moveTask(id, status, target.length);
      }
      const task = findTaskById(id);
      if (!task) {
        return { ok: false, error: `Task not found: ${id}` };
      }
      return { ok: true, data: task };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const deleteTask = tool({
  description: "Delete a task by id.",
  inputSchema: z.object({ id: z.uuid() }),
  execute: async ({ id }): Promise<ActionResult<{ id: string }>> => {
    try {
      tasksService.deleteTask(id);
      return { ok: true, data: { id } };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const listSubtasks = tool({
  description: "List a task's subtasks, ordered by position.",
  inputSchema: z.object({ taskId: z.uuid() }),
  execute: async ({ taskId }): Promise<ActionResult<Subtask[]>> => {
    try {
      return { ok: true, data: subtasksService.listSubtasks(taskId) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const createSubtask = tool({
  description: "Add a subtask to a task. It is appended at the end.",
  inputSchema: z.object({ taskId: z.uuid(), title: titleSchema }),
  execute: async ({ taskId, title }): Promise<ActionResult<Subtask>> => {
    try {
      return {
        ok: true,
        data: subtasksService.createSubtask({ taskId, title }),
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const editSubtask = tool({
  description:
    "Edit a subtask. Provide its id and at least one of title or done.",
  inputSchema: z
    .object({
      id: z.uuid(),
      title: titleSchema.optional(),
      done: z.boolean().optional(),
    })
    .refine((v) => v.title !== undefined || v.done !== undefined, {
      message: "Provide a title or done state",
    }),
  execute: async ({ id, title, done }): Promise<ActionResult<Subtask>> => {
    try {
      const patch: { title?: string; done?: boolean } = {};
      if (title !== undefined) {
        patch.title = title;
      }
      if (done !== undefined) {
        patch.done = done;
      }
      return { ok: true, data: subtasksService.updateSubtask(id, patch) };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const deleteSubtask = tool({
  description: "Delete a subtask by id.",
  inputSchema: z.object({ id: z.uuid() }),
  execute: async ({ id }): Promise<ActionResult<{ id: string }>> => {
    try {
      subtasksService.deleteSubtask(id);
      return { ok: true, data: { id } };
    } catch (error) {
      return toErrorResult(error);
    }
  },
});

const runPrioritization = tool({
  description:
    "Recommend the single best task to start working on right now, with reasoning. Returns the recommended task (or null if there is nothing to do) plus the reasoning. Takes no arguments.",
  inputSchema: z.object({}),
  execute: async (): Promise<ActionResult<PrioritizationResult>> =>
    runPrioritizationAgent(),
});

export const chatTools = {
  listTasks,
  createTask,
  editTask,
  deleteTask,
  listSubtasks,
  createSubtask,
  editSubtask,
  deleteSubtask,
  runPrioritization,
};
