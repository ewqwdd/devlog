import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { moveTaskAction } from "@/app/actions/tasks";
import { BOARD_KEY } from "@/shared/hooks/use-board-query";
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
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      options.onError?.(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
    },
  });
}
