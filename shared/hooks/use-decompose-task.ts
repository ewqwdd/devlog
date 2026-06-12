import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { decomposeTaskAction } from "@/app/actions/decompose";
import type { DecomposeResult } from "@/shared/types/decompose";

export interface UseDecomposeTaskOptions {
  onError?: (error: Error) => void;
}

// Generation is read-only: no cache invalidation here. The caller handles the
// returned DecomposeResult (preview vs. refusal) via mutate's onSuccess.
export function useDecomposeTask(
  taskId: string,
  options: UseDecomposeTaskOptions = {},
): UseMutationResult<DecomposeResult, Error, void> {
  return useMutation({
    mutationFn: async (): Promise<DecomposeResult> => {
      const result = await decomposeTaskAction(taskId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });
}
