import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { subtasksKey } from "@/app/_components/hooks/use-subtasks-query";
import { createSubtaskAction } from "@/app/actions/subtasks";
import type { Subtask } from "@/shared/types/subtask";

export interface UseCreateSubtaskMutationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// Non-optimistic: an optimistic insert would need a temporary id inside the
// SortableContext; the create awaits the action, then invalidates.
export function useCreateSubtaskMutation(
  taskId: string,
  options: UseCreateSubtaskMutationOptions = {},
): UseMutationResult<Subtask, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string): Promise<Subtask> => {
      const result = await createSubtaskAction({ taskId, title });
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
