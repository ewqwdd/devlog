import type React from "react";
import type { TaskPriority } from "@/shared/types/task";

// Atlassian-style priority glyph: stacked chevrons up (high), two bars (medium),
// chevrons down (low). Paths/colors are taken verbatim from the design source.
const COLOR: Record<TaskPriority, string> = {
  high: "#e2483d",
  medium: "#e07b18",
  low: "#1d7afc",
};

const PATHS: Record<TaskPriority, readonly string[]> = {
  high: ["M3 8 L7 4.5 L11 8", "M3 11.5 L7 8 L11 11.5"],
  medium: ["M3.5 6 L10.5 6", "M3.5 10 L10.5 10"],
  low: ["M3 4.5 L7 8 L11 4.5", "M3 8 L7 11.5 L11 8"],
};

const LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function PriorityIcon({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      width="15"
      height="15"
      fill="none"
      role="img"
      aria-label={`${LABEL[priority]} priority`}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      {PATHS[priority].map((d) => (
        <path
          key={d}
          d={d}
          stroke={COLOR[priority]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
