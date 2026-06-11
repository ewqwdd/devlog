"use server";

import { z } from "zod";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksService } from "@/services/tasks-service";
import { logger } from "@/shared/lib/logger";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/shared/lib/task-constants";
import type { ActionResult } from "@/shared/types/action-result";
import type { Board, Task } from "@/shared/types/task";

// TASK_STATUSES / TASK_PRIORITIES are `as const` tuples, so z.enum infers the
// exact `TaskStatus` / `TaskPriority` unions (no string-widening, no casts needed).
const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).default(""),
  status: statusEnum.default("todo"),
  priority: priorityEnum.default("medium"),
});

const updateTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: priorityEnum.optional(),
});

const moveTaskSchema = z.object({
  id: z.uuid(),
  toStatus: statusEnum,
  toIndex: z.number().int().min(0),
});

const deleteTaskSchema = z.object({ id: z.uuid() });

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

function toErrorResult(error: unknown): { ok: false; error: string } {
  if (error instanceof TaskNotFoundError) {
    return { ok: false, error: error.message };
  }
  logger.error({ error }, "Unexpected task action error");
  return { ok: false, error: "Something went wrong" };
}

export async function createTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    return { ok: true, data: tasksService.createTask(parsed.data) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function updateTaskAction(
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    const { id, title, description, priority } = parsed.data;
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
    return { ok: true, data: tasksService.updateTask(id, patch) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function moveTaskAction(
  input: unknown,
): Promise<ActionResult<Board>> {
  const parsed = moveTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    tasksService.moveTask(
      parsed.data.id,
      parsed.data.toStatus,
      parsed.data.toIndex,
    );
    return { ok: true, data: tasksService.listBoard() };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function deleteTaskAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    tasksService.deleteTask(parsed.data.id);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function getBoardAction(): Promise<ActionResult<Board>> {
  try {
    return { ok: true, data: tasksService.listBoard() };
  } catch (error) {
    return toErrorResult(error);
  }
}
