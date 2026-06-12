import { and, asc, eq, gt, gte, lt, lte, max, sql } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { subtasks } from "@/shared/infra/db/schema";
import type { NewSubtask, Subtask } from "@/shared/types/subtask";

export interface SubtaskPatch {
  readonly title?: string;
  readonly done?: boolean;
  readonly position?: number;
}

export const subtasksRepository = {
  create(data: NewSubtask): Subtask {
    return db.insert(subtasks).values(data).returning().get();
  },

  createMany(rows: NewSubtask[]): Subtask[] {
    return db.insert(subtasks).values(rows).returning().all();
  },

  findById(id: string): Subtask | undefined {
    return db.select().from(subtasks).where(eq(subtasks.id, id)).get();
  },

  listByTaskId(taskId: string): Subtask[] {
    return db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.position))
      .all();
  },

  /** Throws drizzle's "No values to set" when patch is empty — callers must pass at least one field. */
  update(id: string, patch: SubtaskPatch): Subtask | undefined {
    return db
      .update(subtasks)
      .set({ ...patch })
      .where(eq(subtasks.id, id))
      .returning()
      .get();
  },

  delete(id: string): boolean {
    return db.delete(subtasks).where(eq(subtasks.id, id)).run().changes > 0;
  },

  getMaxPosition(taskId: string): number | null {
    const row = db
      .select({ value: max(subtasks.position) })
      .from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .get();
    return row?.value ?? null;
  },

  /** After a row leaves `position` in a task, pull its followers down by one. */
  closeGapAfterDelete(taskId: string, position: number): void {
    db.update(subtasks)
      .set({ position: sql`${subtasks.position} - 1` })
      .where(and(eq(subtasks.taskId, taskId), gt(subtasks.position, position)))
      .run();
  },

  /**
   * Reorder via relative shifts: one ranged UPDATE closes/opens the gap, a
   * second places the moved row. Callers pass an already-clamped position.
   */
  move(
    id: string,
    taskId: string,
    fromPosition: number,
    toPosition: number,
  ): void {
    if (fromPosition === toPosition) {
      return;
    }
    db.transaction((tx) => {
      if (fromPosition < toPosition) {
        tx.update(subtasks)
          .set({ position: sql`${subtasks.position} - 1` })
          .where(
            and(
              eq(subtasks.taskId, taskId),
              gt(subtasks.position, fromPosition),
              lte(subtasks.position, toPosition),
            ),
          )
          .run();
      } else {
        tx.update(subtasks)
          .set({ position: sql`${subtasks.position} + 1` })
          .where(
            and(
              eq(subtasks.taskId, taskId),
              gte(subtasks.position, toPosition),
              lt(subtasks.position, fromPosition),
            ),
          )
          .run();
      }
      tx.update(subtasks)
        .set({ position: toPosition })
        .where(eq(subtasks.id, id))
        .run();
    });
  },
};
