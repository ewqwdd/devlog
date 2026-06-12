"use client";

import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /**
   * Element that opens the dialog (uncontrolled usage). Omit when driving the
   * dialog via `open`/`onOpenChange`.
   */
  trigger?: React.ReactNode;
  /** Controlled open state. Leave undefined for uncontrolled (trigger) usage. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Test id forwarded to the confirm button. */
  confirmTestId?: string;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  trigger,
  open,
  onOpenChange,
  confirmTestId,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <AlertDialog
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-bold">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            data-testid={confirmTestId}
            className="border-transparent !bg-destructive !text-white hover:!bg-[#ae2a1a]"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
