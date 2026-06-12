import { z } from "zod";

// The structured-output contract for generateObject. An empty `subtasks` array is
// the "too vague" signal; the 12-item cap is a runaway guard. `reasoning` is always
// present.
export const decomposeSchema = z.object({
  subtasks: z
    .array(z.object({ title: z.string().trim().min(1).max(200) }))
    .max(12),
  reasoning: z.string().trim().min(1),
});
