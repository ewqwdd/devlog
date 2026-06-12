import type * as React from "react";

import { cn } from "@/shared/lib/utils";

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">): React.JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-[90px] w-full resize-none rounded-[6px] border border-input bg-card px-3 py-2.5 text-sm transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
