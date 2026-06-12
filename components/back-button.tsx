import { RiArrowLeftLine } from "@remixicon/react";
import Link from "next/link";
import type React from "react";
import { Button } from "@/shared/ui/button";

// Standalone task pages are reachable by direct link / refresh, so "back" routes
// to the board (/) rather than relying on browser history.
export function BackButton(): React.JSX.Element {
  return (
    <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
      <Link href="/">
        <RiArrowLeftLine />
        Back
      </Link>
    </Button>
  );
}
