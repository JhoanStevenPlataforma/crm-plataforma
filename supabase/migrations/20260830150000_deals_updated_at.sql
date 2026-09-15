--
-- `deals.updated_at` starts being true.
--
-- The column has existed since the initial schema with `default now()`, and
-- nothing has ever moved it: there is no trigger, and the client never writes
-- it. So for practically every row in the table `updated_at` equals
-- `created_at`, and every question of the form "which deals were touched
-- recently" has been unanswerable while looking perfectly answerable.
--
-- `leads` and `tasks` already carry exactly this trigger with exactly this
-- function; deals were simply missed.
--
-- NO BACKFILL, deliberately. The information is gone -- there is no record of
-- when any existing deal was last edited -- and inventing one (from
-- `created_at`, or from the newest `deal_stage_changes` row) would produce a
-- column that looks authoritative and is fiction. Rows written from today
-- onwards are correct; older ones keep saying "created", which is the honest
-- answer. Anything reading this column should treat pre-deploy values as
-- unknown rather than as a last-touched date.
--
-- Consequence worth stating: the kanban reindexes a card's neighbours on every
-- drop, so those deals now get a fresh `updated_at` too. That is correct --
-- their `index` column really did change -- but it means `updated_at` tracks
-- "the row was written", not "somebody edited the deal", and a staleness report
-- wants the latter. Real staleness still needs `deal_stage_changes.changed_at`
-- and `deal_notes.date`, which is what the phase-2 stalled-deals view uses.
--
create or replace trigger set_deal_updated_at_trigger
    before update on public.deals
    for each row execute function public.set_updated_at();
