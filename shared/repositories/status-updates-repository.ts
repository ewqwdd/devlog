import { desc, eq } from "drizzle-orm";
import { db } from "@/shared/infra/db";
import { statusUpdates } from "@/shared/infra/db/schema";
import type {
  NewStatusUpdate,
  StatusUpdate,
} from "@/shared/types/status-update";

export const statusUpdatesRepository = {
  create(data: NewStatusUpdate): StatusUpdate {
    return db.insert(statusUpdates).values(data).returning().get();
  },

  listAll(): StatusUpdate[] {
    return db
      .select()
      .from(statusUpdates)
      .orderBy(desc(statusUpdates.createdAt))
      .all();
  },

  listByTaskId(taskId: string): StatusUpdate[] {
    return db
      .select()
      .from(statusUpdates)
      .where(eq(statusUpdates.taskId, taskId))
      .all();
  },
};
