--
-- Close the task_transitions hole.
--
-- `task_transitions` is the state machine: `transition_task()` refuses any
-- status change that is not declared here, and `requires_reason` decides
-- whether the move must be justified. It shipped as the only table in the task
-- module with NO row level security and NO policies, while carrying the same
-- `grant all ... to authenticated` as its three sibling catalogues -- which do
-- have RLS.
--
-- Verified against a live database with a rep's session: the rep could insert
-- `archived -> completed` (a transition the state machine exists to forbid),
-- flip `requires_reason` off, and `delete from public.task_transitions`
-- removing all 31 rows, breaking task workflow for every user.
--
-- The fix is the pattern already applied to task_statuses / task_priorities /
-- task_types, nothing new: read for everyone, write for admins. The grants are
-- already identical to the siblings', so only RLS was missing.
--
-- `transition_task()` is SECURITY DEFINER and its owner bypasses RLS, so the
-- state machine keeps working for every role; the select policy would allow
-- the read regardless.
--

alter table public.task_transitions enable row level security;

drop policy if exists "Catalogues are readable by every authenticated user"
    on public.task_transitions;
drop policy if exists "Catalogues are manageable by admins only"
    on public.task_transitions;

create policy "Catalogues are readable by every authenticated user"
    on public.task_transitions for select to authenticated
    using (true);

create policy "Catalogues are manageable by admins only"
    on public.task_transitions for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

notify pgrst, 'reload schema';
