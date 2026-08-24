--
-- Task module — structural invariants (proposal §3, §5, §18.3).
--
-- These assertions guard the shape of the schema: the new entities exist, the
-- legacy columns survive as compatibility shims, and the indexes that every
-- list query depends on are present. A migration that silently drops one of
-- them fails here rather than in production.
--
begin;

select plan(41);

--
-- New entities (§3.2)
--
select has_table('public', 'tasks',             'tasks still exists');
select has_table('public', 'task_statuses',     'task_statuses exists');
select has_table('public', 'task_priorities',   'task_priorities exists');
select has_table('public', 'task_types',        'task_types exists');
select has_table('public', 'task_assignments',  'task_assignments exists');
select has_table('public', 'task_links',        'task_links exists');
select has_table('public', 'task_events',       'task_events exists');
select has_table('public', 'task_transitions',  'task_transitions exists');
select has_table('public', 'teams',             'teams exists');
select has_table('public', 'team_members',      'team_members exists');

--
-- The new task columns (§3.3)
--
select has_column('public', 'tasks', 'title',          'tasks.title exists');
select has_column('public', 'tasks', 'description',    'tasks.description exists');
select has_column('public', 'tasks', 'status_id',      'tasks.status_id exists');
select has_column('public', 'tasks', 'priority_id',    'tasks.priority_id exists');
select has_column('public', 'tasks', 'owner_sales_id', 'tasks.owner_sales_id exists');
select has_column('public', 'tasks', 'created_at',     'tasks.created_at exists (fixes W5)');
select has_column('public', 'tasks', 'deleted_at',     'tasks.deleted_at exists (soft delete)');
select has_column('public', 'tasks', 'reschedule_count',
                  'tasks.reschedule_count exists (fixes W4)');

select col_not_null('public', 'tasks', 'title',      'title is mandatory');
select col_not_null('public', 'tasks', 'created_at', 'created_at is mandatory');

--
-- Legacy shims must survive Phase 1: the current frontend still writes them
-- (§Appendix C step 7 defers the drop by one release).
--
select has_column('public', 'tasks', 'contact_id', 'legacy contact_id shim kept');
select has_column('public', 'tasks', 'text',       'legacy text shim kept');
select has_column('public', 'tasks', 'type',       'legacy type shim kept');
select has_column('public', 'tasks', 'done_date',  'legacy done_date shim kept');

select col_is_null('public', 'tasks', 'contact_id',
                   'contact_id is nullable now — tasks are no longer contact-bound (fixes W1)');

--
-- Referential integrity that the original schema was missing (W7).
--
select has_index('public', 'tasks', 'tasks_owner_open_due',
                 'the "my open tasks" index exists (§18.3)');
select has_index('public', 'tasks', 'tasks_overdue',
                 'the overdue triage index exists (§18.3)');
select has_index('public', 'tasks', 'tasks_search',
                 'the full-text index exists (§18.3)');
select has_index('public', 'task_links', 'task_links_entity',
                 'the reverse entity lookup index exists (§18.3)');
select has_index('public', 'task_assignments', 'task_assignments_active_by_sale',
                 'the "my work" assignment index exists (§18.3)');

select ok(
    exists (select 1 from pg_constraint
            where conname = 'tasks_sales_id_fkey' and contype = 'f'),
    'tasks.sales_id finally has a foreign key (fixes W7)');

--
-- task_events is partitioned by month (§18.6) and append-only (§5.5).
--
select ok(
    (select relkind from pg_class where relname = 'task_events') = 'p',
    'task_events is a partitioned table (§18.6)');

select ok(
    (select count(*) from pg_inherits i
      join pg_class c on c.oid = i.inhparent
     where c.relname = 'task_events') >= 5,
    'task_events has partitions provisioned ahead of time');

select ok(
    not has_table_privilege('authenticated', 'public.task_events', 'UPDATE'),
    'authenticated cannot UPDATE task_events (§5.5 immutability)');

select ok(
    not has_table_privilege('authenticated', 'public.task_events', 'DELETE'),
    'authenticated cannot DELETE task_events (§5.5 immutability)');

--
-- Anon must not reach the task module at all (§17.3 P1).
--
select ok(
    not has_table_privilege('anon', 'public.tasks', 'SELECT'),
    'anon has no grant on tasks (§17.3)');

--
-- Seeded catalogues (§4.1)
--
select is(
    (select count(*)::int from public.task_statuses),
    9,
    'the 9 lifecycle states are seeded (§4.1)');

select is(
    (select count(*)::int from public.task_statuses where is_terminal),
    3,
    'completed / canceled / archived are the terminal states');

select is(
    (select count(*)::int from public.task_priorities),
    4,
    'the 4 priorities are seeded');

select ok(
    (select count(*) from public.task_transitions) > 0,
    'the state machine has declared transitions (§4.4)');

select ok(
    not exists (select 1 from public.task_transitions
                where from_status_key = 'archived' and to_status_key = 'completed'),
    'archived -> completed is not a declared transition');

select * from finish();

rollback;
