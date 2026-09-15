import { useNotify } from "ra-core";

/**
 * True for `23505`, a unique violation, whichever shape the data provider
 * surfaced the PostgREST error in: the code on the error itself, or on the
 * response body it carries.
 */
export const isUniqueViolation = (error: unknown): boolean => {
  const err = error as { code?: string; body?: { code?: string } } | null;
  return (err?.body?.code ?? err?.code) === "23505";
};

/**
 * A save error handler that names the conflict instead of a generic failure.
 *
 * A unique violation means the write did its job -- the code, the SKU or the
 * default is already taken -- and "could not be saved" sends the user hunting a
 * broken form. Any other error keeps its own message.
 */
export const useConflictNotifier = (conflictMessage: string) => {
  const notify = useNotify();
  return (error: unknown) => {
    const message = isUniqueViolation(error)
      ? conflictMessage
      : error instanceof Error && error.message
        ? error.message
        : "ra.notification.http_error";
    notify(message, { type: "error" });
  };
};
