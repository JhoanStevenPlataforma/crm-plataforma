import type { SupabaseClient } from "@supabase/supabase-js";
import type { Identifier } from "ra-core";

/** Stops listening. */
export type Unsubscribe = () => void;

/**
 * A number per subscription, so no two share a channel. `client.channel()`
 * hands back the EXISTING channel for a topic it already has, so a page mounted
 * twice (StrictMode does it on purpose) would share one channel, and the first
 * mount leaving would silence the second.
 */
let subscriptions = 0;

const QUOTE_ID = /^\d+$/;

/**
 * Tells a quote's page that its quote changed on the server (quotes §6.5, D2):
 * a status move, a comment written, edited or deleted — the customer's
 * included — and anything the customer did through the portal.
 *
 * Supabase Realtime `postgres_changes` on the three tables
 * `20260919120000_quote_realtime.sql` publishes, each filtered to this quote.
 * Realtime applies row level security to every change before it sends it, so
 * the filter narrows what the page hears and RLS decides whether it may hear
 * it at all: a rep listening to a colleague's quote is sent nothing (measured
 * against the local stack when the publication was added).
 *
 * `onChange` gets no payload, on purpose. The page refetches through the data
 * provider, the one place that knows how a quote is read — the summary view,
 * the derived columns. A row applied by hand would be a second reader of the
 * schema, and the one nobody updates.
 *
 * Async because react-admin's `useDataProvider` treats every method as one
 * that returns a promise.
 */
export const subscribeToQuoteChanges = async (
  client: SupabaseClient,
  quoteId: Identifier,
  onChange: () => void,
): Promise<Unsubscribe> => {
  // The id ends up inside a filter string: anything but digits is not a quote.
  if (!QUOTE_ID.test(String(quoteId))) return () => {};

  subscriptions += 1;
  const channel = client
    .channel(`quote-${quoteId}-${subscriptions}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "quotes",
        filter: `id=eq.${quoteId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "quote_comments",
        filter: `quote_id=eq.${quoteId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "quote_portal_events",
        filter: `quote_id=eq.${quoteId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
};
