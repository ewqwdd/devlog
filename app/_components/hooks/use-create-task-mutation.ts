import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { BOARD_KEY } from "@/app/_components/hooks/use-board-query";
import { createTaskAction } from "@/app/actions/tasks";
import type { Task, TaskPriority, TaskStatus } from "@/shared/types/task";

export interface CreateTaskVars {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
}

export interface UseCreateTaskMutationOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useCreateTaskMutation(
  options: UseCreateTaskMutationOptions = {},
): UseMutationResult<Task, Error, CreateTaskVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateTaskVars): Promise<Task> => {
      const result = await createTaskAction(vars);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      options.onSuccess?.();
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
