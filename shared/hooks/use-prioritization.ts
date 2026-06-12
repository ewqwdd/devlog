import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { prioritizeAction } from "@/app/actions/prioritize";
import type { PrioritizationResult } from "@/shared/types/prioritization";

export interface UsePrioritizationOptions {
  onError?: (error: Error) => void;
}

export function usePrioritization(
  options: UsePrioritizationOptions = {},
): UseMutationResult<PrioritizationResult, Error, void> {
  return useMutation({
    mutationFn: async (): Promise<PrioritizationResult> => {
      const result = await prioritizeAction();
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
