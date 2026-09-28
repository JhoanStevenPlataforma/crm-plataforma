type NamedContact = {
  id?: string | number;
  first_name?: string | number | null;
  last_name?: string | number | null;
  email_jsonb?: { email?: string | null }[] | null;
};

const clean = (value: string | number | null | undefined) =>
  value == null ? "" : String(value).trim();

/** "First Last", with whichever half exists; empty when neither does. */
export const contactFullName = (contact: NamedContact | null | undefined) =>
  [clean(contact?.first_name), clean(contact?.last_name)]
    .filter(Boolean)
    .join(" ");

/**
 * The name to show for a contact anywhere in the UI. A contact without a name
 * (older imports, API writes) falls back to its first email, then to its id,
 * so it never renders as "undefined undefined" and two of them can still be
 * told apart.
 */
export const contactDisplayName = (
  contact: NamedContact | null | undefined,
): string => {
  const name = contactFullName(contact);
  if (name) return name;
  const email = contact?.email_jsonb?.find((entry) => entry?.email)?.email;
  if (email) return email;
  return contact?.id != null ? `#${contact.id}` : "";
};
