import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { clamp } from "@/shared/lib/clamp";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import type { Subtask } from "@/shared/types/subtask";

interface CreateSubtaskInput {
  readonly taskId: string;
  readonly title: string;
}

interface UpdateSubtaskInput {
  readonly title?: string;
  readonly done?: boolean;
}

export const subtasksService = {
  listSubtasks(taskId: string): Subtask[] {
    return subtasksRepository.listByTaskId(taskId);
  },

  createSubtask(input: CreateSubtaskInput): Subtask {
    const position =
      (subtasksRepository.getMaxPosition(input.taskId) ?? -1) + 1;
    return subtasksRepository.create({ ...input, position });
  },

  createSubtasks(taskId: string, titles: string[]): Subtask[] {
    const clean = titles
      .map((title) => title.trim())
      .filter((t) => t.length > 0);
    if (clean.length === 0) {
      return [];
    }
    const base = (subtasksRepository.getMaxPosition(taskId) ?? -1) + 1;
    const rows = clean.map((title, index) => ({
      taskId,
      title,
      position: base + index,
    }));
    return subtasksRepository.createMany(rows);
  },

  updateSubtask(id: string, patch: UpdateSubtaskInput): Subtask {
    const updated = subtasksRepository.update(id, patch);
    if (!updated) {
      throw new SubtaskNotFoundError(id);
    }
    return updated;
  },

  moveSubtask(id: string, toPosition: number): void {
    const subtask = subtasksRepository.findById(id);
    if (!subtask) {
      throw new SubtaskNotFoundError(id);
    }
    // The list stays dense, so its max position is its last index.
    const max = subtasksRepository.getMaxPosition(subtask.taskId) ?? 0;
    const clamped = clamp(toPosition, 0, max);
    subtasksRepository.move(id, subtask.taskId, subtask.position, clamped);
  },

  deleteSubtask(id: string): void {
    const subtask = subtasksRepository.findById(id);
    if (!subtask) {
      throw new SubtaskNotFoundError(id);
    }
    subtasksRepository.delete(id);
    subtasksRepository.closeGapAfterDelete(subtask.taskId, subtask.position);
  },
};
