import { and, asc, eq, gt, gte, lt, lte, max, sql } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { tasks } from "@/shared/infra/db/schema";
import type {
  NewTask,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/shared/types/task";

export interface TaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly position?: number;
}

export const tasksRepository = {
  create(data: NewTask): Task {
    return db.insert(tasks).values(data).returning().get();
  },

  findById(id: string): Task | undefined {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  },

  list(): Task[] {
    return db.select().from(tasks).all();
  },

  listByStatus(status: TaskStatus): Task[] {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.status, status))
      .orderBy(asc(tasks.position))
      .all();
  },

  update(id: string, patch: TaskPatch): Task | undefined {
    return db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  },

  delete(id: string): boolean {
    return db.delete(tasks).where(eq(tasks.id, id)).run().changes > 0;
  },

  getMaxPosition(status: TaskStatus): number | null {
    const row = db
      .select({ value: max(tasks.position) })
      .from(tasks)
      .where(eq(tasks.status, status))
      .get();
    return row?.value ?? null;
  },

  /** After a row leaves `position` in `status`, pull its followers down by one. */
  closeGapAfterDelete(status: TaskStatus, position: number): void {
    db.update(tasks)
      .set({ position: sql`${tasks.position} - 1` })
      .where(and(eq(tasks.status, status), gt(tasks.position, position)))
      .run();
  },

  /**
   * Reorder via relative shifts: one ranged UPDATE closes/opens the gap, a
   * second places the moved row. Callers pass already-clamped, dense positions.
   */
  move(
    id: string,
    fromStatus: TaskStatus,
    fromPosition: number,
    toStatus: TaskStatus,
    toPosition: number,
  ): void {
    if (fromStatus === toStatus && fromPosition === toPosition) {
      return;
    }
    db.transaction((tx) => {
      if (fromStatus === toStatus) {
        if (fromPosition < toPosition) {
          tx.update(tasks)
            .set({ position: sql`${tasks.position} - 1` })
            .where(
              and(
                eq(tasks.status, fromStatus),
                gt(tasks.position, fromPosition),
                lte(tasks.position, toPosition),
              ),
            )
            .run();
        } else {
          tx.update(tasks)
            .set({ position: sql`${tasks.position} + 1` })
            .where(
              and(
                eq(tasks.status, fromStatus),
                gte(tasks.position, toPosition),
                lt(tasks.position, fromPosition),
              ),
            )
            .run();
        }
      } else {
        tx.update(tasks)
          .set({ position: sql`${tasks.position} - 1` })
          .where(
            and(eq(tasks.status, fromStatus), gt(tasks.position, fromPosition)),
          )
          .run();
        tx.update(tasks)
          .set({ position: sql`${tasks.position} + 1` })
          .where(
            and(eq(tasks.status, toStatus), gte(tasks.position, toPosition)),
          )
          .run();
      }
      tx.update(tasks)
        .set({ position: toPosition, status: toStatus })
        .where(eq(tasks.id, id))
        .run();
    });
  },
};
