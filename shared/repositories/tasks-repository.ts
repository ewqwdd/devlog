import { asc, eq, max } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { tasks } from "@/shared/infra/db/schema";
import type {
  NewTask,
  Task,
  TaskPositionUpdate,
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

  updatePositions(updates: ReadonlyArray<TaskPositionUpdate>): void {
    db.transaction((tx) => {
      for (const update of updates) {
        tx.update(tasks)
          .set({ position: update.position, status: update.status })
          .where(eq(tasks.id, update.id))
          .run();
      }
    });
  },
};
