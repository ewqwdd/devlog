// One response shape across all Server Actions. Actions never throw to the client.
export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };
