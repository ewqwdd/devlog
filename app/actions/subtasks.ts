"use server";

import { z } from "zod";
import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { subtasksService } from "@/services/subtasks-service";
import { logger } from "@/shared/lib/logger";
import type { ActionResult } from "@/shared/types/action-result";
import type { Subtask } from "@/shared/types/subtask";

const titleSchema = z.string().trim().min(1, "Title is required").max(200);

const getSubtasksSchema = z.object({ taskId: z.uuid() });
const createSubtaskSchema = z.object({ taskId: z.uuid(), title: titleSchema });
const updateSubtaskSchema = z
  .object({
    id: z.uuid(),
    title: titleSchema.optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.done !== undefined, {
    message: "Nothing to update",
  });
const moveSubtaskSchema = z.object({
  id: z.uuid(),
  toPosition: z.number().int().min(0),
});
const deleteSubtaskSchema = z.object({ id: z.uuid() });

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

function toErrorResult(error: unknown): { ok: false; error: string } {
  if (error instanceof SubtaskNotFoundError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) {
    return { ok: false, error: "Task not found" };
  }
  logger.error({ error }, "Unexpected subtask action error");
  return { ok: false, error: "Something went wrong" };
}

export async function getSubtasksAction(
  input: unknown,
): Promise<ActionResult<Subtask[]>> {
  const parsed = getSubtasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    return { ok: true, data: subtasksService.listSubtasks(parsed.data.taskId) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function createSubtaskAction(
  input: unknown,
): Promise<ActionResult<Subtask>> {
  const parsed = createSubtaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    return { ok: true, data: subtasksService.createSubtask(parsed.data) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function updateSubtaskAction(
  input: unknown,
): Promise<ActionResult<Subtask>> {
  const parsed = updateSubtaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    const patch: { title?: string; done?: boolean } = {};
    if (parsed.data.title !== undefined) {
      patch.title = parsed.data.title;
    }
    if (parsed.data.done !== undefined) {
      patch.done = parsed.data.done;
    }
    return {
      ok: true,
      data: subtasksService.updateSubtask(parsed.data.id, patch),
    };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function moveSubtaskAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = moveSubtaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    subtasksService.moveSubtask(parsed.data.id, parsed.data.toPosition);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function deleteSubtaskAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteSubtaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  try {
    subtasksService.deleteSubtask(parsed.data.id);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return toErrorResult(error);
  }
}
