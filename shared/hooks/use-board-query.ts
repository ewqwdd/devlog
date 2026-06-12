import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { getBoardAction } from "@/app/actions/tasks";
import type { Board } from "@/shared/types/task";

export const BOARD_KEY = ["board"] as const;

export function useBoardQuery(): UseQueryResult<Board, Error> {
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: async (): Promise<Board> => {
      const result = await getBoardAction();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}
