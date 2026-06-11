import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { BOARD_KEY } from "@/app/_components/hooks/use-board-query";
import { updateTaskAction } from "@/app/actions/tasks";
import type { Task, TaskPriority } from "@/shared/types/task";

export interface UpdateTaskPatch {
  title?: string;
  description?: string;
  priority?: TaskPriority;
}

export interface UseUpdateTaskMutationOptions {
  onError?: (error: Error) => void;
}

export function useUpdateTaskMutation(
  id: string,
  options: UseUpdateTaskMutationOptions = {},
): UseMutationResult<Task, Error, UpdateTaskPatch> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateTaskPatch): Promise<Task> => {
      const result = await updateTaskAction({ id, ...patch });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
