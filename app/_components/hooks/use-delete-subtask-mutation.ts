import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { subtasksKey } from "@/app/_components/hooks/use-subtasks-query";
import { deleteSubtaskAction } from "@/app/actions/subtasks";
import type { Subtask } from "@/shared/types/subtask";

export interface DeleteSubtaskContext {
  previous: Subtask[] | undefined;
}

export interface UseDeleteSubtaskMutationOptions {
  onError?: (error: Error) => void;
}

// Optimistic: drop the row and renumber the tail densely; rolled back on error.
export function useDeleteSubtaskMutation(
  taskId: string,
  options: UseDeleteSubtaskMutationOptions = {},
): UseMutationResult<{ id: string }, Error, string, DeleteSubtaskContext> {
  const queryClient = useQueryClient();
  const queryKey = subtasksKey(taskId);
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string }> => {
      const result = await deleteSubtaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (id): Promise<DeleteSubtaskContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subtask[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Subtask[]>(
          queryKey,
          previous
            .filter((s) => s.id !== id)
            .map((s, index) => ({ ...s, position: index })),
        );
      }
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      options.onError?.(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
