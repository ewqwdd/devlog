// A single suggested subtask before it is persisted. The agent returns these and
// the Save path turns them into real subtask rows.
export interface SubtaskDraft {
  readonly title: string;
}

// The result of one decomposition call. `subtasks: []` is the "too vague" signal;
// `reasoning` is always present (a split summary on success, the why on refusal).
export interface DecomposeResult {
  readonly subtasks: SubtaskDraft[];
  readonly reasoning: string;
}

// The decomposition section's UI state machine.
export type DecomposeStatus =
  | "idle"
  | "loading"
  | "preview"
  | "refused"
  | "error";

// One editable draft row in the preview. `key` is a client-only React key with no
// relation to any DB id.
export interface DraftRow {
  readonly key: string;
  readonly title: string;
}
