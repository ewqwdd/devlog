import type { statusUpdates } from "@/shared/infra/db/schema";

export type StatusUpdate = typeof statusUpdates.$inferSelect;
export type NewStatusUpdate = typeof statusUpdates.$inferInsert;
