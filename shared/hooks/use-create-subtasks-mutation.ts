import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createSubtasksAction } from "@/app/actions/subtasks";
import { subtasksKey } from "@/shared/hooks/use-subtasks-query";
import type { Subtask } from "@/shared/types/subtask";

export interface UseCreateSubtasksMutationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// Bulk persist the decomposition draft in one write, then invalidate so the real
// subtask list re-fetches and shows the new rows.
export function useCreateSubtasksMutation(
  taskId: string,
  options: UseCreateSubtasksMutationOptions = {},
): UseMutationResult<Subtask[], Error, string[]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (titles: string[]): Promise<Subtask[]> => {
      const result = await createSubtasksAction({ taskId, titles });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subtasksKey(taskId) });
      options.onSuccess?.();
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
