--
-- The catalogue's retention path (proposal §13.6 #8 and #19, Phase 12).
--
-- `purge_quotes()` has existed since Phase 2 because `e2e/fixtures.ts`
-- `resetDb()` cannot reset a database whose quote history refuses a
-- service-role DELETE. The catalogue has the same problem and was left for this
-- phase: `products` carries append-only `product_events`, so a plain
-- `delete from products` hits `reject_quote_history_mutation()` through the
-- cascade, and `products.sales_id` then pins every user who ever created one.
-- Until now the reset deleted `sales` LAST and would have failed there the
-- first time a spec created a product.
--
-- THE PRODUCT DECISION, which §13.6 #19 named as the real question: a product
-- that has ever been quoted may NOT be removed by anybody using the
-- application. That is already true on both layers and stays true --
-- `canAccess` refuses `products/delete` for every role including admin, and the
-- database refuses it for everyone through the trigger above. This function is
-- the RETENTION path, not a delete anybody can reach: `security definer`,
-- `service_role` only, exactly the status `purge_quotes()` and `purge_tasks()`
-- have. What is no longer sold is DEACTIVATED (`is_active = false`), which is
-- what the catalogue UI offers and what keeps `quote_lines.product_id`
-- resolvable for "what did we sell, at what price" (D6).
--
-- The deletion order is a real constraint rather than tidiness:
-- `price_list_items.product_id` is `on delete restrict` on purpose (losing a
-- price row silently would change what a list means without anybody editing
-- it), so the price rows go first or nothing goes at all.
--
-- `tax_rates` is NOT cleared wholesale, and the asymmetry is deliberate. The
-- seeded rates are reference data in the same sense `quote_statuses` and
-- `quote_transitions` are -- `resetDb()` has never deleted those either -- and
-- a reset that took `iva_19` with it would leave every later spec quoting at 0%
-- without saying so. Only what a test created (`is_system = false`) is removed.
--
create or replace function public.purge_catalogue(
    p_product_ids  bigint[] default null,
    p_purge_lists  boolean  default false
) returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    perform set_config('app.quote_purge', 'on', true);

    -- `on delete restrict`: the price rows are what stands between a product
    -- and its own deletion.
    delete from public.price_list_items
     where p_product_ids is null or product_id = any (p_product_ids);

    delete from public.products
     where p_product_ids is null or id = any (p_product_ids);
    get diagnostics v_count = row_count;

    if p_purge_lists then
        -- Every delete here carries a WHERE clause because it has to:
        -- the API roles run with `safeupdate` preloaded, which refuses an
        -- unqualified DELETE outright -- and this function is only ever
        -- called through PostgREST. A pgTAP run as `postgres` does not
        -- have it loaded and would never notice.
        delete from public.price_lists where id is not null;
        -- Reference data survives; test residue does not.
        delete from public.tax_rates where not is_system;
    end if;

    perform set_config('app.quote_purge', 'off', true);

    return v_count;
end;
$$;

comment on function public.purge_catalogue(bigint[], boolean) is
    'Retention path for the commercial catalogue: removes products (and their '
    'price rows and append-only history) through the app.quote_purge hatch. '
    'service_role only -- no user-facing path deletes a product, which is '
    'deactivated instead. Proposal section 13.6 items 8 and 19.';

revoke all on function public.purge_catalogue(bigint[], boolean) from public, anon, authenticated;
grant execute on function public.purge_catalogue(bigint[], boolean) to service_role;
