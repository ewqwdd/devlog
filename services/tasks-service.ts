import { TaskNotFoundError } from "@/services/task-not-found-error";
import { clamp } from "@/shared/lib/clamp";
import { tasksRepository } from "@/shared/repositories/tasks-repository";
import type {
  Board,
  Task,
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
    const task = tasksRepository.findById(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    // Columns stay dense, so the target's max position is its last index.
    const maxTarget = tasksRepository.getMaxPosition(toStatus) ?? -1;
    const toPosition =
      toStatus === task.status
        ? clamp(toIndex, 0, maxTarget) // same column: last valid index
        : clamp(toIndex, 0, maxTarget + 1); // other column: may append at end
    tasksRepository.move(id, task.status, task.position, toStatus, toPosition);
  },

  deleteTask(id: string): void {
    const task = tasksRepository.findById(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    tasksRepository.delete(id);
    tasksRepository.closeGapAfterDelete(task.status, task.position);
  },

  listBoard(): Board {
    return buildBoard();
  },
};
