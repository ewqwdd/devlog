import { computeMove } from "@/services/compute-move";
import { TaskNotFoundError } from "@/services/task-not-found-error";
import { tasksRepository } from "@/shared/repositories/tasks-repository";
import type {
  Board,
  Task,
  TaskPositionUpdate,
  TaskPriority,
  TaskStatus,
} from "@/shared/types/task";

interface CreateTaskInput {
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
}

interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
}

function buildBoard(): Board {
  return {
    todo: tasksRepository.listByStatus("todo"),
    "in-progress": tasksRepository.listByStatus("in-progress"),
    done: tasksRepository.listByStatus("done"),
  };
}

export const tasksService = {
  createTask(input: CreateTaskInput): Task {
    const position = (tasksRepository.getMaxPosition(input.status) ?? -1) + 1;
    return tasksRepository.create({ ...input, position });
  },

  updateTask(id: string, patch: UpdateTaskInput): Task {
    const updated = tasksRepository.update(id, patch);
    if (!updated) {
      throw new TaskNotFoundError(id);
    }
    return updated;
  },

  moveTask(id: string, toStatus: TaskStatus, toIndex: number): void {
    const updates = computeMove(buildBoard(), id, toStatus, toIndex);
    if (updates.length > 0) {
      tasksRepository.updatePositions(updates);
    }
  },

  deleteTask(id: string): void {
    const task = tasksRepository.findById(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    tasksRepository.delete(id);
    const remaining = tasksRepository.listByStatus(task.status);
    const updates: TaskPositionUpdate[] = [];
    remaining.forEach((t, index) => {
      if (t.position !== index) {
        updates.push({ id: t.id, position: index, status: t.status });
      }
    });
    if (updates.length > 0) {
      tasksRepository.updatePositions(updates);
    }
  },

  listBoard(): Board {
    return buildBoard();
  },

  getTask(id: string): Task | null {
    return tasksRepository.findById(id) ?? null;
  },
};
