import { SubtaskNotFoundError } from "@/services/subtask-not-found-error";
import { clamp } from "@/shared/lib/clamp";
import type { Subtask } from "@/shared/types/subtask";

// Returns a new, fully dense list with the moved subtask at its new spot.
// Used client-side for optimistic reordering; the server persists via
// relative shifts in subtasksRepository.move.
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
