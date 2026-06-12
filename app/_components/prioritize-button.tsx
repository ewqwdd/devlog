"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { PrioritizationResultDialog } from "@/app/_components/prioritization-result-dialog";
import { usePrioritization } from "@/shared/hooks/use-prioritization";
import { Button } from "@/shared/ui/button";

export function PrioritizeButton(): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mutation = usePrioritization();

  function handleClick(): void {
    setOpen(true);
    mutation.mutate();
  }

  return (
    <>
      <Button
        variant="outline"
        data-testid="prioritize-button"
        onClick={handleClick}
      >
        ✨ What should I work on?
      </Button>
      <PrioritizationResultDialog
        open={open}
        onOpenChange={setOpen}
        isPending={mutation.isPending}
        isError={mutation.isError}
        result={mutation.data ?? null}
        onGoToTask={(id): void => {
          setOpen(false);
          router.push(`/tasks/${id}`);
        }}
        onRetry={(): void => {
          mutation.mutate();
        }}
      />
    </>
  );
}
