# ADR-7dcff21a-PHASE-7 — The quote portal is an edge function, not an `anon` policy

- **Date**: 2026-09-14
- **Ticket**: Phase 7 of `docs/proposals/quotes-cpq-module.md` (no harness ticket)
- **Session**: 7dcff21a

## Context

A customer who is not a CRM user must open an issued quotation from a link and accept or decline it. No policy in this repository grants `anon` (F2), and Realtime honours RLS, so an anonymous PostgREST client could read nothing without breaking that invariant.

## Decision

The portal is the `quote-portal` edge function (`verify_jwt = false`, service role), a thin HTTP shim over seven `quote_portal_*` SQL functions granted to `service_role` alone. The token is the whole credential: carried in the link's fragment, sent by POST in the body, hashed in the function, and never stored or sent to the database raw.

## Consequences

- Still no `anon` policy; `quotes_anon_grants.test.sql` fails if a portal function becomes callable by `anon` or a user.
- Every payload key is a deliberate disclosure: `quote_portal.test.sql` pins each group's key set and asserts what must never appear.
- The token never sits in a URL path, a server access log, a `Referer` header or a database row.
- The portal cannot use Realtime; its live updates must poll (Phase 9).

## Alternatives considered

- `anon` RLS policies over PostgREST: exposes column selection and neighbouring tables to an unauthenticated caller.
- `GET /:token` routes (the proposal's draft): a view is recorded on a "safe" verb, and the token lands in gateway logs.
- `/quote/<token>` as the page path: the web host's access log would hold every live link.
