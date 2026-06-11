import { computeSubtaskMove } from "@/services/compute-subtask-move";
import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { subtasksRepository } from "@/shared/repositories/subtasks-repository";
import type { Subtask, SubtaskPositionUpdate } from "@/shared/types/subtask";

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
    const updates = computeSubtaskMove(
      subtasksRepository.listByTaskId(subtask.taskId),
      id,
      toPosition,
    );
    if (updates.length > 0) {
      subtasksRepository.updatePositions(updates);
    }
  },

  deleteSubtask(id: string): void {
    const subtask = subtasksRepository.findById(id);
    if (!subtask) {
      throw new SubtaskNotFoundError(id);
    }
    subtasksRepository.delete(id);
    const remaining = subtasksRepository.listByTaskId(subtask.taskId);
    const updates: SubtaskPositionUpdate[] = [];
    remaining.forEach((s, index) => {
      if (s.position !== index) {
        updates.push({ id: s.id, position: index });
      }
    });
    if (updates.length > 0) {
      subtasksRepository.updatePositions(updates);
    }
  },
};
