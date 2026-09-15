--
-- Quotes / CPQ module, Phase 4: the line snapshot becomes the server's.
--
-- docs/proposals/quotes-cpq-module.md §13.6 #10. Until now nothing copied
-- `sku` / `name` / `unit` from the product or `tax_rate_percent` from
-- `tax_rate_id`: the client did it, and a line posted with a `tax_rate_id` and
-- no percentage was taxed at 0% SILENTLY, because `tax_rate_percent` carried
-- `default 0` and the server could not tell an omitted value from a deliberate
-- exemption. A quotation that under-taxes without saying so is the worst kind
-- of wrong document, and the line editor Phase 4 ships is what would have
-- produced one on every save that forgot a column.
--
-- Two changes, and both are needed:
--
--   1. the column default is dropped, which is what makes "omitted" and
--      "explicitly zero" different facts again;
--   2. `quote_lines_snapshot_defaults` fills the blanks BEFORE INSERT, from the
--      product and from the tax rate -- the same place the generated columns
--      put the arithmetic (D8).
--
-- A line that names neither a rate nor a percentage still lands at 0, so
-- nothing that used to work stops working; a line that reaches the table with a
-- null percentage now fails loudly instead of under-taxing.
--
-- The function and the trigger are copied verbatim from
-- `supabase/schemas/0{2,4}_*.sql`, where the same objects now live.
--

--
-- 1. An omitted percentage is no longer a zero.
--
alter table public.quote_lines alter column tax_rate_percent drop default;

--
-- 2. The snapshot, filled by the server.
--
-- BEFORE INSERT on quote_lines: the snapshot the line IS (§2.4, D6, §13.6 #10).
--
-- Fires after `quote_lines_set_carrier` (triggers of one kind fire in name
-- order), and it exists because the snapshot used to be the client's job: a
-- line posted with a `tax_rate_id` and no `tax_rate_percent` was taxed at 0%
-- SILENTLY, because the column carried `default 0` and the server could not
-- tell an omitted percentage from a deliberate exemption. The default is gone
-- and this fills the columns instead, which keeps the arithmetic the server's
-- exactly as the generated columns above do.
create or replace function public.quote_lines_snapshot_defaults() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_product record;
begin
    if new.product_id is not null then
        select p.sku, p.name, p.unit, p.tax_rate_id
          into v_product
          from public.products p
         where p.id = new.product_id;

        -- `coalesce`, never an overwrite: a line quoted under a negotiated
        -- description or a renamed SKU is still that line, and the catalogue is
        -- only where the blanks come from.
        new.sku  := coalesce(new.sku, v_product.sku);
        new.name := coalesce(new.name, v_product.name);
        new.unit := coalesce(new.unit, v_product.unit);

        -- Provenance is taken from the product only when the client named
        -- NEITHER the rate nor its percentage. A line deliberately quoted at 0%
        -- must not end up carrying the product's IVA as its provenance, which
        -- would make the record contradict itself.
        if new.tax_rate_id is null and new.tax_rate_percent is null then
            new.tax_rate_id := v_product.tax_rate_id;
        end if;
    end if;

    -- One direction only: `tax_rate_percent` is the record and `tax_rate_id` is
    -- provenance, so an explicit percentage always wins over what the catalogue
    -- says today. That is what makes a year-old quote still print the rate that
    -- applied on the day it was issued.
    if new.tax_rate_percent is null then
        new.tax_rate_percent := coalesce(
            (select t.rate from public.tax_rates t where t.id = new.tax_rate_id),
            0);
    end if;

    return new;
end;
$$;

revoke all on function public.quote_lines_snapshot_defaults() from public, anon, authenticated;
grant execute on function public.quote_lines_snapshot_defaults() to service_role;

-- Named to sort AFTER the carrier: triggers of one kind fire in name order, and
-- the snapshot reads the product the carrier has nothing to do with, so the
-- order is incidental -- but a snapshot that ran first would be one rename away
-- from mattering.
create or replace trigger quote_lines_snapshot_defaults
    before insert on public.quote_lines
    for each row execute function public.quote_lines_snapshot_defaults();
