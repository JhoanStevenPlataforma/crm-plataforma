--
-- Deleting a tag becomes a manager/admin action.
--
-- `public.tags` was the only table left with `using (true)` on update and
-- delete. Creating and renaming stay open on purpose: tagging is a rep's daily
-- work, and routing "add congreso-2027" through a manager just makes people
-- stop tagging.
--
-- Deletion is the asymmetric one. Tags are referenced from `contacts.tags`, so
-- removing one silently edits records across the whole organisation -- including
-- records the deleting rep is not allowed to see -- and there is no undo. That
-- is a manager's call, and it is the only part of the tag lifecycle where being
-- wrong is not recoverable by typing the name again.
--

drop policy if exists "Enable delete for authenticated users only" on public.tags;
drop policy if exists "Tags are deleted by managers and admins" on public.tags;

create policy "Tags are deleted by managers and admins"
    on public.tags for delete to authenticated
    using ((select public.can_manage_all()));

notify pgrst, 'reload schema';
