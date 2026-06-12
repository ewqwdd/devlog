import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { subtasksKey } from "@/app/_components/hooks/use-subtasks-query";
import { updateSubtaskAction } from "@/app/actions/subtasks";
import type { Subtask } from "@/shared/types/subtask";

export interface UpdateSubtaskVars {
  id: string;
  patch: { title?: string; done?: boolean };
}

export interface UpdateSubtaskContext {
  previous: Subtask[] | undefined;
}

export interface UseUpdateSubtaskMutationOptions {
  onError?: (error: Error) => void;
}

export function useUpdateSubtaskMutation(
  taskId: string,
  options: UseUpdateSubtaskMutationOptions = {},
): UseMutationResult<Subtask, Error, UpdateSubtaskVars, UpdateSubtaskContext> {
  const queryClient = useQueryClient();
  const queryKey = subtasksKey(taskId);
  return useMutation({
    mutationFn: async (vars: UpdateSubtaskVars): Promise<Subtask> => {
      const result = await updateSubtaskAction({ id: vars.id, ...vars.patch });
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (vars): Promise<UpdateSubtaskContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subtask[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Subtask[]>(
          queryKey,
          previous.map((s) => (s.id === vars.id ? { ...s, ...vars.patch } : s)),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
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
