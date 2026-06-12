// Fixed "en-US" locale so the output is identical on server and client
// (no hydration mismatch) — e.g. "Jun 12, 2026".
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
