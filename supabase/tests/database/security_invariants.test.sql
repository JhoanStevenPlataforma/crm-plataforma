--
-- Schema-wide security invariants (audit AUD-008: the durable guard).
--
-- The root cause behind the task-audit holes (AUD-002 / AUD-003) is that this
-- project grants `anon` by default (`alter default privileges ... to anon` in
-- 06_grants.sql) and every new function keeps Postgres' EXECUTE-to-PUBLIC grant.
-- Safety then depends on remembering, for every object, to enable RLS and revoke
-- the surplus grants. Nothing fails when that is forgotten -- until a partition
-- or a SECURITY DEFINER function quietly exposes the whole table.
--
-- This one file is the net. It generalises quotes_anon_grants.test.sql to the
-- whole schema, so the NEXT object somebody adds without securing it turns this
-- red instead of shipping a hole. The three invariants:
--   1. every base table and partition in public has row level security;
--   2. anon can execute no SECURITY DEFINER function (no anon path exists);
--   3. authenticated can execute only the reviewed set of them.
--
-- When you add an object on purpose, add it to the allowlist here -- that edit
-- is the conscious decision the default-grant model otherwise skips.
--
begin;

select plan(3);

--
-- 1. Row level security is on for every base table and partition.
--
-- `relkind in ('r','p')` covers ordinary tables and partitioned parents;
-- partitions are 'r' with relispartition. Nothing is exempt today, so the
-- allowlist is empty. Add a table name here only with a comment saying why it
-- is safe to read without RLS.
--
select is(
    (select coalesce(array_agg(c.relname order by c.relname), '{}')
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity
        and c.relname <> all (array[]::name[])),  -- allowlist: intentionally RLS-free tables
    '{}'::name[],
    'every base table and partition in public has row level security enabled');

--
-- 2. anon executes no SECURITY DEFINER function. The customer portal reaches the
--    database through an edge function holding service_role, never as anon, so
--    anon has no business executing any definer routine (predicate or write).
--    Scoped to non-trigger functions: a trigger function cannot be called
--    usefully by a client and keeps its EXECUTE-to-PUBLIC grant until the
--    structural follow-up (documented) flips the default.
--
select is(
    (select coalesce(array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                               order by p.proname), '{}')
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'execute')),
    '{}'::text[],
    'anon can execute no non-trigger SECURITY DEFINER function in public');

--
-- 3. authenticated executes only the reviewed set of SECURITY DEFINER functions
--    (non-trigger). This is the list a signed-in user legitimately needs: read
--    predicates, the task/deal write RPCs, the quote RPCs. The actual set is
--    compared to this allowlist directly, so adding a definer function reachable
--    by authenticated -- or dropping one -- turns this red until the list is
--    updated on purpose. Regenerate the list with:
--      select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
--        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype
--         and has_function_privilege('authenticated',p.oid,'execute') order by 1;
--
select is(
    (select coalesce(array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                               order by p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'), '{}')
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('authenticated', p.oid, 'execute')),
    array[
        'can_manage_all()',
        'can_see_deal(p_deal_id bigint)',
        'can_see_quote(p_quote_id bigint)',
        'can_see_task(p_task_id bigint)',
        'compute_reminder_next_fire(p_reminder jsonb, p_after timestamp with time zone)',
        'create_quote_link(p_quote_id bigint, p_token_days integer, p_token_label text)',
        'current_sale_id()',
        'current_sales_role()',
        'deal_stage_gate(p_deal_id bigint, p_to_stage text)',
        'is_admin()',
        'issue_quote_version(p_quote_id bigint, p_token_days integer, p_token_label text, p_override_reason text, p_reason text)',
        'mark_quote_comments_read(p_quote_id bigint)',
        'move_deal_stage(p_deal_id bigint, p_to_stage text, p_reason text, p_index integer, p_attachments jsonb, p_override_reason text)',
        'notification_prefs_for(p_sales_id bigint)',
        'quote_discount_gate(p_quote_id bigint)',
        'revise_quote(p_quote_id bigint, p_reason text)',
        'revoke_quote_token(p_token_id bigint)',
        'task_has_open_blockers(p_task_id bigint)',
        'transition_quote(p_quote_id bigint, p_to_status text, p_reason text, p_attachments jsonb)',
        'transition_task(p_task_id bigint, p_to_status text, p_reason text, p_metadata jsonb)'
    ]::text[],
    'authenticated can execute only the reviewed set of SECURITY DEFINER functions');

select * from finish();
rollback;
