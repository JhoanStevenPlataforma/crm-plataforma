--
-- Task module — Phase 1, step 5: seed the history with honest synthetic
-- origin events (Appendix C step 5).
--
-- Existing tasks predate the event stream, so their history is unknowable
-- (no `created_at` existed — W5). Each pre-migration task gets:
--
--   1. a `task.created` event dated from the reconstructed `created_at`,
--      flagged `migrated = true` with a note that the timestamp is inferred;
--   2. a `task.completed` event for tasks that were done (`done_date`), so a
--      completion is never retroactively lost.
--
-- The `tasks_audit` trigger does NOT fire here: we write `task_events`
-- directly, with `actor_kind = 'import'`.
--

insert into public.task_events (task_id, event_type, occurred_at, actor_sales_id,
                                actor_kind, new_value, metadata, seq)
select id, 'task.created', created_at, created_by, 'import',
       to_jsonb(t) - 'search_tsv',
       jsonb_build_object('migrated', true,
                          'note', 'pre-migration task; created_at is inferred, not observed'),
       1
from public.tasks t;

insert into public.task_events (task_id, event_type, occurred_at, actor_sales_id,
                                actor_kind, field, new_value, metadata, seq)
select id, 'task.completed', done_date, completed_by, 'import',
       'status_id', to_jsonb((select id from public.task_statuses where key = 'completed')),
       jsonb_build_object('migrated', true), 2
from public.tasks
where done_date is not null;
