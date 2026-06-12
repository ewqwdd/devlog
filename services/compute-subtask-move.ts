import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import type { Subtask, SubtaskPositionUpdate } from "@/shared/types/subtask";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Returns a new, fully dense list with the moved subtask at its new spot.
export function applySubtaskMove(
  subtasks: readonly Subtask[],
  id: string,
  toPosition: number,
): Subtask[] {
  const from = subtasks.findIndex((s) => s.id === id);
  if (from === -1) {
    throw new SubtaskNotFoundError(id);
  }
  const to = clamp(toPosition, 0, subtasks.length - 1);
  const next = [...subtasks];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next.map((subtask, index) => ({ ...subtask, position: index }));
}

// Minimal transaction: only rows whose position actually changed.
export function computeSubtaskMove(
  subtasks: readonly Subtask[],
  id: string,
  toPosition: number,
): SubtaskPositionUpdate[] {
  const next = applySubtaskMove(subtasks, id, toPosition);
  const updates: SubtaskPositionUpdate[] = [];
  next.forEach((subtask, index) => {
    const original = subtasks.find((s) => s.id === subtask.id);
    if (!original || original.position !== index) {
      updates.push({ id: subtask.id, position: index });
    }
  });
  return updates;
}
