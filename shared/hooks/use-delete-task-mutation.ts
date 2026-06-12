import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { deleteTaskAction } from "@/app/actions/tasks";
import { BOARD_KEY } from "@/shared/hooks/use-board-query";
import { TASK_STATUSES } from "@/shared/lib/task-constants";
import type { Board } from "@/shared/types/task";

export interface DeleteTaskContext {
  previous: Board | undefined;
}

export interface UseDeleteTaskMutationOptions {
  /** Remove the task from the cached board immediately (rolled back on error). */
  optimistic?: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useDeleteTaskMutation(
  options: UseDeleteTaskMutationOptions = {},
): UseMutationResult<{ id: string }, Error, string, DeleteTaskContext> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string }> => {
      const result = await deleteTaskAction({ id });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (id): Promise<DeleteTaskContext> => {
      if (!options.optimistic) {
        return { previous: undefined };
      }
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<Board>(BOARD_KEY);
      if (previous) {
        const next: Board = { todo: [], "in-progress": [], done: [] };
        for (const status of TASK_STATUSES) {
          next[status] = previous[status]
            .filter((t) => t.id !== id)
            .map((t, index) => ({ ...t, position: index }));
        }
        queryClient.setQueryData<Board>(BOARD_KEY, next);
      }
      return { previous };
    },
    onSuccess: () => {
      options.onSuccess?.();
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BOARD_KEY, context.previous);
      }
      options.onError?.(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    },
  });
}
