import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { getSubtasksAction } from "@/app/actions/subtasks";
import type { Subtask } from "@/shared/types/subtask";

// Per-task query key. Dynamic (depends on taskId), so it's a factory rather
// than a constant — declared once here, imported by the subtask mutation hooks.
export function subtasksKey(taskId: string): readonly ["subtasks", string] {
  return ["subtasks", taskId] as const;
}

export function useSubtasksQuery(
  taskId: string,
): UseQueryResult<Subtask[], Error> {
  return useQuery({
    queryKey: subtasksKey(taskId),
    queryFn: async (): Promise<Subtask[]> => {
      const result = await getSubtasksAction({ taskId });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}
