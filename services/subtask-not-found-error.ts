export class SubtaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Subtask not found: ${id}`);
    this.name = "SubtaskNotFoundError";
  }
}
