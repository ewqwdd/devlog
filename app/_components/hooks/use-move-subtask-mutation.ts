import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { subtasksKey } from "@/app/_components/hooks/use-subtasks-query";
import { moveSubtaskAction } from "@/app/actions/subtasks";
import { applySubtaskMove } from "@/services/compute-subtask-move";
import type { Subtask } from "@/shared/types/subtask";

export interface MoveSubtaskVars {
  id: string;
  toPosition: number;
}

export interface MoveSubtaskContext {
  previous: Subtask[] | undefined;
}

export interface UseMoveSubtaskMutationOptions {
  onError?: (error: Error) => void;
}

export function useMoveSubtaskMutation(
  taskId: string,
  options: UseMoveSubtaskMutationOptions = {},
): UseMutationResult<
  { id: string },
  Error,
  MoveSubtaskVars,
  MoveSubtaskContext
> {
  const queryClient = useQueryClient();
  const queryKey = subtasksKey(taskId);
  return useMutation({
    mutationFn: async (vars: MoveSubtaskVars): Promise<{ id: string }> => {
      const result = await moveSubtaskAction(vars);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (vars): Promise<MoveSubtaskContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subtask[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Subtask[]>(
          queryKey,
          applySubtaskMove(previous, vars.id, vars.toPosition),
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
