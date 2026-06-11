import { asc, eq, max } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { subtasks } from "@/shared/infra/db/schema";
import type { NewSubtask, Subtask } from "@/shared/types/subtask";

export interface SubtaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly done?: boolean;
  readonly position?: number;
}

export interface SubtaskPositionUpdate {
  readonly id: string;
  readonly position: number;
}

export const subtasksRepository = {
  create(data: NewSubtask): Subtask {
    return db.insert(subtasks).values(data).returning().get();
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

  updatePositions(updates: ReadonlyArray<SubtaskPositionUpdate>): void {
    db.transaction((tx) => {
      for (const update of updates) {
        tx.update(subtasks)
          .set({ position: update.position })
          .where(eq(subtasks.id, update.id))
          .run();
      }
    });
  },
};
