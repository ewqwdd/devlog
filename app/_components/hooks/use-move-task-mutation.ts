import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { BOARD_KEY } from "@/app/_components/hooks/use-board-query";
import { moveTaskAction } from "@/app/actions/tasks";
import { applyMove } from "@/services/compute-move";
import type { Board, TaskStatus } from "@/shared/types/task";

export interface MoveTaskVars {
  id: string;
  toStatus: TaskStatus;
  toIndex: number;
}

export interface MoveTaskContext {
  previous: Board | undefined;
}

export interface UseMoveTaskMutationOptions {
  onError?: (error: Error) => void;
}

export function useMoveTaskMutation(
  options: UseMoveTaskMutationOptions = {},
): UseMutationResult<Board, Error, MoveTaskVars, MoveTaskContext> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MoveTaskVars): Promise<Board> => {
      const result = await moveTaskAction(vars);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: async (vars): Promise<MoveTaskContext> => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<Board>(BOARD_KEY);
      if (previous) {
        queryClient.setQueryData<Board>(
          BOARD_KEY,
          applyMove(previous, vars.id, vars.toStatus, vars.toIndex),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
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
