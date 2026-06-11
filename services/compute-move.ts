import { TaskNotFoundError } from "@/services/task-not-found-error";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import type {
  Board,
  Task,
  TaskPositionUpdate,
  TaskStatus,
} from "@/shared/types/task";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function arrayMove(items: readonly Task[], from: number, to: number): Task[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
}

function locate(
  board: Board,
  taskId: string,
): { fromStatus: TaskStatus; fromIndex: number; task: Task } {
  for (const status of TASK_STATUSES) {
    const fromIndex = board[status].findIndex((t) => t.id === taskId);
    if (fromIndex !== -1) {
      const task = board[status][fromIndex];
      if (task !== undefined) {
        return { fromStatus: status, fromIndex, task };
      }
    }
  }
  throw new TaskNotFoundError(taskId);
}

// Returns a new, fully dense board with the moved task at its new spot.
export function applyMove(
  board: Board,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): Board {
  const { fromStatus, fromIndex, task } = locate(board, taskId);

  const next: Board = {
    todo: [...board.todo],
    "in-progress": [...board["in-progress"]],
    done: [...board.done],
  };

  if (toStatus === fromStatus) {
    const clamped = clamp(toIndex, 0, board[fromStatus].length - 1);
    next[fromStatus] = arrayMove(board[fromStatus], fromIndex, clamped);
  } else {
    next[fromStatus] = board[fromStatus].filter((t) => t.id !== taskId);
    const targetCol = board[toStatus];
    const clamped = clamp(toIndex, 0, targetCol.length);
    next[toStatus] = [
      ...targetCol.slice(0, clamped),
      task,
      ...targetCol.slice(clamped),
    ];
  }

  const affected: TaskStatus[] =
    toStatus === fromStatus ? [fromStatus] : [fromStatus, toStatus];
  for (const status of affected) {
    next[status] = next[status].map((t, index) => ({
      ...t,
      position: index,
      status,
    }));
  }
  return next;
}

// Minimal transaction: only rows whose position or status actually changed.
export function computeMove(
  board: Board,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): TaskPositionUpdate[] {
  const next = applyMove(board, taskId, toStatus, toIndex);
  const updates: TaskPositionUpdate[] = [];
  for (const status of TASK_STATUSES) {
    const before = board[status];
    next[status].forEach((task, index) => {
      const original = before.find((t) => t.id === task.id);
      if (
        !original ||
        original.position !== index ||
        original.status !== status
      ) {
        updates.push({ id: task.id, position: index, status });
      }
    });
  }
  return updates;
}
