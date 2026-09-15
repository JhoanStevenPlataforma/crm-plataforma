--
-- Per-user report preferences: how each person left a report they cannot edit.
--

--
-- How each person left a report they cannot edit.
--
-- The library's built-ins belong to the installation, not to anybody, and a
-- report somebody shared belongs to its author. Neither can be written by the
-- reader -- which used to mean that adjusting one and coming back tomorrow lost
-- the adjustment, or forced a duplicate into the library for what was really
-- just "I prefer to look at this by month".
--
-- So the report keeps its definition and the READER keeps their view of it.
-- The rule is one line: if you cannot edit a report, your changes to it are
-- remembered as yours. That covers the built-ins and other people's shared
-- reports with the same mechanism, and it leaves the original permanently
-- recoverable -- deleting the preference row restores it, which is what makes
-- the built-in library still able to guarantee a working example of every
-- visualisation.
--
-- Per user and NEVER shared, exactly like `notification_preferences`. A global
-- "last configuration wins" was the alternative: one rep regrouping the team's
-- pipeline report would silently rewrite what their director opens, and the
-- director would have no way to know it changed or who did it.
--
create table public.report_preferences (
    sales_id  bigint not null references public.sales(id) on delete cascade,
    report_id bigint not null references public.reports(id) on delete cascade,
    -- The same jsonb shape as `reports.spec`. Deliberately a full spec rather
    -- than a diff against the original: a diff would have to be re-applied
    -- against a built-in that a later migration may have amended, and the two
    -- would silently disagree about what the user actually asked to see.
    spec jsonb not null,
    updated_at timestamp with time zone not null default now(),
    primary key (sales_id, report_id)
);

--
-- Row level security: yours, and only ever yours.
--
-- No `can_manage_all()` branch anywhere here, which is a deliberate departure
-- from every other table in this schema. A manager has no business reading how
-- a rep prefers to look at a chart, and an admin quietly changing somebody's
-- saved view would be indistinguishable from a bug. `notification_preferences`
-- made the same call for the same reason.
--
alter table public.report_preferences enable row level security;

create policy "Report preferences are read by their owner"
    on public.report_preferences for select to authenticated
    using (sales_id = (select public.current_sale_id()));

create policy "Report preferences are written by their owner"
    on public.report_preferences for all to authenticated
    using (sales_id = (select public.current_sale_id()))
    with check (sales_id = (select public.current_sale_id()));

grant select, insert, update, delete
    on table public.report_preferences to authenticated;
grant all on table public.report_preferences to service_role;

create or replace trigger report_preferences_set_updated_at
    before update on public.report_preferences
    for each row execute function public.set_updated_at();
