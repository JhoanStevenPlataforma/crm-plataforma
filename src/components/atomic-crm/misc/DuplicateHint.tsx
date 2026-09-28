import { useGetList, useRecordContext, useTranslate } from "ra-core";
import { useEffect, useState } from "react";
import { Link } from "react-router";

// Enough characters for a meaningful lookup, and a pause long enough not to
// query on every keystroke.
const MIN_LENGTH = 3;
const DEBOUNCE_MS = 400;
const CANDIDATES = { page: 1, perPage: 10 };

const useDebounced = (value: string, delay: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

export type DuplicateHintProps<T extends { id: string | number }> = {
  resource: string;
  /** The value being typed (an email, a company name). */
  value: string | null | undefined;
  /** Whether a candidate returned by the search is really the same record. */
  isSame: (candidate: T, value: string) => boolean;
  /** How to name the existing record in the hint. */
  labelOf: (candidate: T) => string;
  /** i18n key of the sentence; receives no arguments, the link follows it. */
  messageKey: string;
};

/**
 * A non-blocking "this already exists" hint for create forms.
 *
 * Nothing stopped a second contact with the same email or a second company
 * with the same name, and the duplicates then showed up as identical rows in
 * every picker (merge, quotes) with no way to tell them apart. Two records can
 * legitimately share a name, so this warns and links instead of refusing:
 * the person decides. Shown only when creating — on an edit form the "match"
 * would be the record itself.
 */
export const DuplicateHint = <T extends { id: string | number }>({
  resource,
  value,
  isSame,
  labelOf,
  messageKey,
}: DuplicateHintProps<T>) => {
  const record = useRecordContext();
  const translate = useTranslate();
  const typed = useDebounced((value ?? "").trim(), DEBOUNCE_MS);
  const enabled = record?.id == null && typed.length >= MIN_LENGTH;

  const { data } = useGetList<T>(
    resource,
    {
      filter: { q: typed },
      pagination: CANDIDATES,
      sort: { field: "id", order: "ASC" },
    },
    { enabled },
  );

  const match = enabled
    ? data?.find((candidate) => isSame(candidate, typed))
    : undefined;
  if (!match) return null;

  return (
    <p role="status" className="text-sm text-warning">
      {translate(messageKey)}{" "}
      <Link
        to={`/${resource}/${match.id}/show`}
        className="font-medium underline"
        target="_blank"
        rel="noreferrer"
      >
        {labelOf(match)}
      </Link>
    </p>
  );
};
