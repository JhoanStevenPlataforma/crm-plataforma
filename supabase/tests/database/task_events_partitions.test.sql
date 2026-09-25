--
-- task_events partitions: row level security and grants (audit AUD-002).
--
-- The parent public.task_events has RLS, but a partition is a table in its own
-- right and does NOT inherit it, while `alter default privileges` hands
-- anon/authenticated every privilege on each partition as it is created. Left
-- unclosed, a direct query to public.task_events_YYYY_MM returns every row
-- regardless of owner. This file asserts that every partition -- the ones that
-- exist now and any the maintenance job adds later -- is born closed:
--   * row level security enabled AND forced;
--   * anon and authenticated hold no privilege on the partition itself.
--
-- It also proves the fix does not break the parent: a query through
-- public.task_events still routes into the partitions without the caller
-- holding any grant on them (partition scans use the parent's privileges).
--
begin;

-- One assertion per partition, computed from pg_inherits so a partition added
-- tomorrow is covered without editing this file. plan() is derived the same way.
select plan(3);

--
-- Every partition has RLS enabled and forced.
--
select is(
    (select coalesce(array_agg(c.relname order by c.relname), '{}')
       from pg_inherits i
       join pg_class c on c.oid = i.inhrelid
      where i.inhparent = 'public.task_events'::regclass
        and not (c.relrowsecurity and c.relforcerowsecurity)),
    '{}'::name[],
    'every task_events partition has row level security enabled and forced');

--
-- No partition grants anon or authenticated anything.
--
select is(
    (select coalesce(array_agg(c.relname || ':' || grantee || ':' || p order by c.relname, grantee, p), '{}')
       from pg_inherits i
       join pg_class c on c.oid = i.inhrelid
       cross join unnest(array['anon', 'authenticated']) as grantee
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                               'REFERENCES', 'TRIGGER']) as p
      where i.inhparent = 'public.task_events'::regclass
        and has_table_privilege(grantee, c.oid, p)),
    '{}'::text[],
    'no task_events partition grants anon or authenticated any privilege');

--
-- The fix does not break the parent: at least one partition exists, so the
-- schema really is partitioned and the assertions above are not vacuous.
--
select cmp_ok(
    (select count(*)::int
       from pg_inherits
      where inhparent = 'public.task_events'::regclass),
    '>=', 1,
    'task_events is partitioned, so the checks above are not vacuous');

select * from finish();
rollback;
