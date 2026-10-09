-- Currencies & exchange rates: the rates a quotation's LINES are converted at
-- (docs/proposals/multi-currency-fx.md §4 and §10, 2026-10-02).
--
-- Validated before writing (§10): a base-currency quotation could not refresh
-- the rates its USD lines were converted at, and was issued with one 9 days
-- stale; a line carried a later day's EUR than its version's USD; the resolver
-- and the view called a rate stale that the issue gate let through (and the
-- reverse for an expired commercial rate); and a client could post the rate a
-- line converts at. This migration:
--
--   * records WHICH observation a line was converted at
--     (`quote_lines.source_exchange_rate_id`) and keeps one per source
--     currency per version;
--   * resolves a line's rate on the version's rate day, never a later one;
--   * lets `set_quote_version_rate(v, 'base')` re-price a base quotation's
--     lines (drafts only, audited);
--   * puts ONE staleness rule in `fx_rate_is_stale()`, used by the resolver
--     (hence the view) and by `issue_quote_version()`, for the version's rate
--     and every line's;
--   * makes the line's rate the server's (`quote_lines_fx_convert`), with a
--     hatch only `set_quote_version_rate()` and `revise_quote()` open;
--   * exposes `fx_line_source_rate()` (security invoker) so the picker's
--     preview is the stored figure.
--
-- Hand-written: `supabase db diff` emits destructive drift here.
-- No backfill: a draft line converted before this carries no observation and
-- is refused at issue until its rate is refreshed -- no observation is guessed.

alter table public.quote_lines
    add column source_exchange_rate_id bigint references public.exchange_rates(id),
    add constraint quote_lines_source_rate_has_source
        check (source_exchange_rate_id is null or source_currency is not null);

comment on column public.quote_lines.source_exchange_rate_id is
    'The exchange_rates row source_exchange_rate was read from; null for the base currency, a hand-typed price, or a line converted before 2026-10-02.';

-- The old resolver of a line's rate took a kind and today's date; the new one
-- takes the version (its kind AND its rate day) and is a different signature.
drop function public.fx_line_source_rate(character, public.quote_rate_kind);

-- Whether a rate is stale on a day: THE rule, for the resolver (and so the
-- `current_exchange_rates` view), the issue gate on a version's rate and on
-- every line's, and -- mirrored digit for digit in `fxMath.ts` -- the screens.
--
--   official, with a validity the source states (the TRM covers weekends and
--   Colombian holidays in one row): stale once `valid_until` has passed;
--   official, with none (the ECB publishes on TARGET days only): stale once
--   older than `stale_after_days` CALENDAR days. A four-day Easter closure
--   makes Thursday's fixing stale on Easter Monday on purpose: it is four days
--   old, and the threshold is the company's to raise;
--   commercial: stale once its own expiry has passed (none: never);
--   custom and base: never -- a custom rate is a written, audited agreement,
--   and the base is 1.
create or replace function public.fx_rate_is_stale(
    p_kind           text,
    p_effective_date date,
    p_valid_until    date,
    p_on             date default current_date
) returns boolean
    language sql stable security invoker
    set search_path to ''
as $$
    select case p_kind
        when 'official' then
            coalesce(p_valid_until < p_on,
                     p_on - p_effective_date
                         > coalesce((select s.stale_after_days
                                       from public.exchange_rate_settings s
                                      where s.id = 1), 3))
        when 'commercial' then coalesce(p_valid_until < p_on, false)
        else false
    end;
$$;

-- The rate of one currency, of one kind, on one day.
--
-- Official: the newest official row whose `effective_date` is on or before the
-- day, whatever its age -- the last valid rate is kept and REPORTED stale
-- (`fx_rate_is_stale()`), never hidden and never presented as current. Ties on
-- a day go to a manual row, then to the provider with the lowest priority.
--
-- Commercial: the newest commercial row in force on the day; none, or only
-- expired ones, falls back to the official rate (and says so in `kind`).
--
-- The base currency resolves to 1. No row at all returns no row: the caller
-- decides whether that is an error. Never a row from after the day.
create or replace function public.fx_resolve_rate(
    p_currency character(3),
    p_kind     public.fx_rate_kind default 'official',
    p_on       date default current_date
) returns table (
    rate             numeric,
    exchange_rate_id bigint,
    kind             text,
    provider_key     text,
    effective_date   date,
    valid_until      date,
    is_stale         boolean
)
    language plpgsql stable security invoker
    set search_path to ''
as $$
begin
    if p_currency = public.fx_base_currency() then
        return query select 1::numeric, null::bigint, 'base'::text, null::text,
                            p_on, null::date, false;
        return;
    end if;

    if p_kind = 'commercial' then
        return query
            select r.rate, r.id, 'commercial'::text, null::text,
                   r.effective_date, r.valid_until,
                   public.fx_rate_is_stale('commercial', r.effective_date, r.valid_until, p_on)
              from public.exchange_rates r
             where r.currency_code = p_currency
               and r.kind = 'commercial'
               and r.effective_date <= p_on
               and (r.valid_until is null or r.valid_until >= p_on)
             order by r.effective_date desc, r.id desc
             limit 1;
        if found then
            return;
        end if;
    end if;

    return query
        select r.rate, r.id, 'official'::text, p.key,
               r.effective_date, r.valid_until,
               public.fx_rate_is_stale('official', r.effective_date, r.valid_until, p_on)
          from public.exchange_rates r
          left join public.exchange_rate_providers p on p.id = r.provider_id
         where r.currency_code = p_currency
           and r.kind = 'official'
           and r.effective_date <= p_on
         order by r.effective_date desc,
                  coalesce(p.priority, -1),
                  r.id desc
         limit 1;
end;
$$;

-- The rate a line priced in another currency converts at, and WHICH
-- observation that is. One implementation, called by `quote_lines_fx_convert`,
-- by `set_quote_version_rate()` and, read-only, by the line picker's preview,
-- so what the rep is shown is what will be stored.
--
--   * the version's base resolves to 1;
--   * one observation per source currency per version: a line reuses the one
--     another line of the same currency already carries (`p_reuse => false` is
--     how a re-pricing asks for a fresh one);
--   * otherwise the newest observation ON OR BEFORE the version's rate day --
--     the day its official rate was observed, or the day a commercial, custom
--     or base rate was set -- so a cross conversion never pairs one day's EUR
--     with another day's USD. Never a later one: with none, no row, and the
--     caller refuses (`fx_rate_missing`);
--   * `is_stale` is `fx_rate_is_stale()` today, the issue gate's question. A
--     rate carried with no recorded observation cannot be vouched for.
--
-- Security invoker: a preview reads only a version RLS lets the caller read.
create or replace function public.fx_line_source_rate(
    p_version_id      bigint,
    p_source_currency character(3),
    p_reuse           boolean default true
) returns table (
    rate             numeric,
    exchange_rate_id bigint,
    kind             text,
    effective_date   date,
    valid_until      date,
    is_stale         boolean
)
    language plpgsql stable security invoker
    set search_path to ''
as $$
declare
    v_version public.quote_versions;
    v_kind    public.fx_rate_kind;
    v_on      date;
begin
    select * into v_version from public.quote_versions v where v.id = p_version_id;
    if not found or p_source_currency is null
       or p_source_currency = v_version.currency then
        return;
    end if;

    if p_source_currency = v_version.base_currency then
        return query select 1::numeric, null::bigint, 'base'::text,
                            null::date, null::date, false;
        return;
    end if;

    if p_reuse then
        return query
            select l.source_exchange_rate, l.source_exchange_rate_id,
                   r.kind::text, r.effective_date, r.valid_until,
                   coalesce(public.fx_rate_is_stale(r.kind::text, r.effective_date, r.valid_until), true)
              from public.quote_lines l
              left join public.exchange_rates r on r.id = l.source_exchange_rate_id
             where l.version_id = p_version_id
               and l.source_currency = p_source_currency
               and l.source_exchange_rate is not null
             order by l.id
             limit 1;
        if found then
            return;
        end if;
    end if;

    if v_version.rate_kind = 'official' then
        v_kind := 'official';
        v_on := v_version.rate_effective_date;
    elsif v_version.rate_kind = 'commercial' then
        v_kind := 'commercial';
        v_on := v_version.rate_set_at::date;
    else
        v_kind := (select s.quote_rate_kind_default
                     from public.exchange_rate_settings s where s.id = 1);
        v_on := v_version.rate_set_at::date;
    end if;

    return query
        select r.rate, r.exchange_rate_id, r.kind, r.effective_date, r.valid_until,
               public.fx_rate_is_stale(r.kind, r.effective_date, r.valid_until)
          from public.fx_resolve_rate(p_source_currency, v_kind,
                                      coalesce(v_on, current_date)) r;
end;
$$;

-- BEFORE INSERT/UPDATE on quote_lines: a converted price, and the rate it is
-- converted at, are the server's.
--
--     unit_price = round(source_unit_price * source_rate / version_rate,
--                        least(decimals of the quote currency, 2))
--
-- `source_exchange_rate` / `source_exchange_rate_id` are never taken from the
-- client: an inserted line gets them from `fx_line_source_rate()`, and an
-- updated one keeps the observation it has while its source currency stays.
-- Only `set_quote_version_rate()` and `revise_quote()` write them, through the
-- `app.fx_line_rate_write` hatch scoped to one version. A price typed by hand
-- arrives with no source and is the negotiated figure (§13.2).
create or replace function public.quote_lines_fx_convert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_version public.quote_versions;
    v_source  record;
    v_trusted boolean;
begin
    if new.source_currency is null then
        new.source_unit_price := null;
        new.source_exchange_rate := null;
        new.source_exchange_rate_id := null;
        return new;
    end if;

    select * into v_version from public.quote_versions v where v.id = new.version_id;

    if new.source_currency = v_version.currency then
        new.source_exchange_rate := null;
        new.source_exchange_rate_id := null;
        new.unit_price := new.source_unit_price;
        return new;
    end if;

    if v_version.exchange_rate is null then
        raise exception 'quote version % has no exchange rate for %',
                new.version_id, v_version.currency
            using errcode = 'check_violation', detail = 'fx_rate_missing';
    end if;

    v_trusted := current_setting('app.fx_line_rate_write', true) = new.version_id::text;

    if v_trusted and new.source_exchange_rate is not null then
        null;
    elsif tg_op = 'UPDATE'
          and new.source_currency is not distinct from old.source_currency
          and old.source_exchange_rate is not null then
        new.source_exchange_rate := old.source_exchange_rate;
        new.source_exchange_rate_id := old.source_exchange_rate_id;
    else
        select * into v_source
          from public.fx_line_source_rate(new.version_id, new.source_currency);
        if v_source.rate is null then
            raise exception 'no exchange rate for % on or before the rate day of quote version %',
                    new.source_currency, new.version_id
                using errcode = 'check_violation', detail = 'fx_rate_missing';
        end if;
        new.source_exchange_rate := v_source.rate;
        new.source_exchange_rate_id := v_source.exchange_rate_id;
    end if;

    new.unit_price := public.fx_round(
        new.source_unit_price * new.source_exchange_rate / v_version.exchange_rate,
        v_version.currency);

    return new;
end;
$$;

-- The rate of a DRAFT version, chosen. Official and commercial resolve the
-- rate in force today; custom takes the figure given, with a written reason,
-- from a manager or admin -- or from a rep within the configured tolerance of
-- the official rate; base (a quotation in the base currency) stays at 1.
-- Every converted line is re-priced at one fresh observation per source
-- currency -- for a base quotation that is its whole "update to today's
-- rate" -- and the totals follow. Logged in the module's audit trail.
create or replace function public.set_quote_version_rate(
    p_version_id bigint,
    p_kind       public.quote_rate_kind,
    p_rate       numeric default null,
    p_reason     text default null
) returns public.quote_versions
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor    bigint := public.current_sale_id();
    v_role     public.sales_role := public.current_sales_role();
    v_version  public.quote_versions;
    v_quote    public.quotes;
    v_kind     public.quote_rate_kind;
    v_rate     numeric;
    v_rate_id  bigint;
    v_provider text;
    v_eff      date;
    v_official numeric;
    v_tol      numeric;
    v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
    v_new      public.quote_versions;
    v_src      record;
    v_line     record;
begin
    select * into v_version from public.quote_versions v where v.id = p_version_id for update;
    if not found then
        raise exception 'quote version % not found', p_version_id
            using errcode = 'no_data_found';
    end if;

    select * into v_quote from public.quotes q where q.id = v_version.quote_id for update;

    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to change the rate of quote %', v_quote.id
            using errcode = 'insufficient_privilege';
    end if;

    if v_version.issued_at is not null then
        raise exception 'quote version % is issued and immutable', p_version_id
            using errcode = 'check_violation', detail = 'quote_version_frozen';
    end if;
    if v_quote.status_key is distinct from 'draft' then
        raise exception 'the rate is editable only while the quote is a draft (it is %)', v_quote.status_key
            using errcode = 'check_violation', detail = 'quote_not_draft';
    end if;

    if v_version.currency = v_version.base_currency then
        if p_kind <> 'base' then
            raise exception 'a quotation in the base currency has no exchange rate'
                using errcode = 'check_violation', detail = 'fx_rate_kind_invalid';
        end if;
        -- Rate 1, and "update to today's rate" re-prices the lines a
        -- list in another currency priced (below).
    elsif p_kind = 'base' then
        raise exception 'quote % is not in the base currency', v_quote.id
            using errcode = 'check_violation', detail = 'fx_rate_kind_invalid';
    end if;

    if p_kind in ('official', 'commercial') then
        select r.kind::public.quote_rate_kind, r.rate, r.exchange_rate_id,
               r.provider_key, r.effective_date
          into v_kind, v_rate, v_rate_id, v_provider, v_eff
          from public.fx_resolve_rate(v_version.currency, p_kind::text::public.fx_rate_kind) r;
        if v_rate is null then
            raise exception 'no exchange rate is available for %', v_version.currency
                using errcode = 'check_violation', detail = 'fx_rate_missing';
        end if;
    elsif p_kind = 'custom' then
        if p_rate is null or p_rate <= 0 then
            raise exception 'a custom rate must be a positive number'
                using errcode = 'check_violation', detail = 'fx_rate_invalid';
        end if;
        if v_reason is null then
            raise exception 'a custom rate needs a written reason'
                using errcode = 'check_violation', detail = 'fx_reason_required';
        end if;
        if v_role is distinct from 'admin' and v_role is distinct from 'manager' then
            v_tol := (select s.rep_custom_rate_tolerance_percent
                        from public.exchange_rate_settings s where s.id = 1);
            if coalesce(v_tol, 0) = 0 then
                raise exception 'custom exchange rates are reserved to managers and administrators'
                    using errcode = 'insufficient_privilege', detail = 'fx_custom_rate_forbidden';
            end if;
            select r.rate into v_official
              from public.fx_resolve_rate(v_version.currency, 'official') r;
            if v_official is null
               or abs(p_rate / v_official - 1) * 100 > v_tol then
                raise exception 'the custom rate is more than % percent away from the official rate', v_tol
                    using errcode = 'check_violation', detail = 'fx_custom_rate_out_of_tolerance',
                          hint = jsonb_build_object('official', v_official, 'tolerance', v_tol)::text;
            end if;
        end if;
    end if;

    if p_kind = 'custom' then
        v_kind     := 'custom';
        v_rate     := round(p_rate, 10);
        v_rate_id  := null;
        v_provider := null;
        v_eff      := current_date;
    end if;

    if p_kind = 'base' then
        v_kind     := 'base';
        v_rate     := 1;
        v_rate_id  := null;
        v_provider := null;
        v_eff      := current_date;
    end if;

    perform set_config('app.quote_version_system_write', p_version_id::text, true);
    update public.quote_versions v
       set rate_kind           = v_kind,
           exchange_rate       = v_rate,
           exchange_rate_id    = v_rate_id,
           rate_provider_key   = v_provider,
           rate_effective_date = v_eff,
           rate_reason         = case when p_kind = 'custom' then v_reason end,
           rate_set_at         = now(),
           rate_set_by         = v_actor
     where v.id = p_version_id
    returning * into v_new;
    perform set_config('app.quote_version_system_write', '', true);

    -- Re-price every converted line: ONE fresh observation per source
    -- currency, on the new rate's day (`fx_line_source_rate()`, the
    -- resolution the trigger and the preview use), written through the
    -- hatch `quote_lines_fx_convert` honours for this version only.
    for v_src in
        select distinct l.source_currency
          from public.quote_lines l
         where l.version_id = p_version_id
           and l.source_currency is not null
           and l.source_currency <> v_new.currency
    loop
        select * into v_line
          from public.fx_line_source_rate(p_version_id, v_src.source_currency, false);
        if v_line.rate is null then
            raise exception 'no exchange rate is available for %', v_src.source_currency
                using errcode = 'check_violation', detail = 'fx_rate_missing';
        end if;
        perform set_config('app.fx_line_rate_write', p_version_id::text, true);
        update public.quote_lines l
           set source_exchange_rate    = v_line.rate,
               source_exchange_rate_id = v_line.exchange_rate_id
         where l.version_id = p_version_id
           and l.source_currency = v_src.source_currency;
        perform set_config('app.fx_line_rate_write', '', true);
    end loop;

    perform public.refresh_quote_version_totals(p_version_id);

    insert into public.exchange_rate_audit_logs
        (sales_id, entity, entity_key, action, old_value, new_value, note)
    values (v_actor, 'quote_version', p_version_id::text, 'rate.set',
            jsonb_build_object('kind', v_version.rate_kind, 'rate', v_version.exchange_rate,
                               'effective_date', v_version.rate_effective_date),
            jsonb_build_object('kind', v_new.rate_kind, 'rate', v_new.exchange_rate,
                               'effective_date', v_new.rate_effective_date),
            v_reason);

    select * into v_new from public.quote_versions v where v.id = p_version_id;
    return v_new;
end;
$$;

-- Restated whole (the schema file is the source); only the rate gate changed.
create or replace function public.issue_quote_version(
    p_quote_id        bigint,
    p_token_days      integer default 30,
    p_token_label     text    default null,
    p_override_reason text    default null,
    p_reason          text    default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote    public.quotes;
    v_actor    bigint := public.current_sale_id();
    v_version  public.quote_versions;
    v_prev     public.quote_versions;
    v_gate     jsonb;
    v_override text := nullif(btrim(coalesce(p_override_reason, '')), '');
    v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
    v_link     jsonb;
    v_stale    boolean;
    v_line     record;
begin
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- Same rule as the quotes UPDATE policy. Restated because SECURITY DEFINER
    -- bypasses RLS.
    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to issue quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_version
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is null
     for update;
    if not found then
        raise exception 'quote % has no editable draft to issue', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_no_draft';
    end if;

    -- An empty document is not a quotation. Caught here rather than by the
    -- customer.
    if not exists (select 1 from public.quote_lines l
                    where l.version_id = v_version.id) then
        raise exception 'quote % has no lines to issue', p_quote_id
            using errcode = 'check_violation', detail = 'quote_empty';
    end if;

    -- An offer that has already lapsed cannot be sent. `mint_quote_token()`
    -- clamps a link to the day after `valid_until`, so issuing this draft would
    -- hand the customer a link that is dead on arrival -- exactly the case
    -- `create_quote_link()` already refuses with the same key. The two paths
    -- mint the same token and now refuse on the same condition (§13.6 #12).
    if v_version.valid_until < current_date then
        raise exception 'the offer in quote % expired on %', p_quote_id, v_version.valid_until
            using errcode = 'check_violation', detail = 'quote_validity_elapsed';
    end if;

    -- The rate is frozen with the document, so it has to be one worth
    -- freezing: present, and not stale. A rep whose draft carries last week's
    -- rate refreshes it (`set_quote_version_rate()`) before sending; an
    -- official rate that cannot be refreshed because the provider is down is
    -- exactly the rate that must not be printed as today's.
    if v_version.exchange_rate is null then
        raise exception 'quote % has no exchange rate for %', p_quote_id, v_version.currency
            using errcode = 'check_violation', detail = 'fx_rate_missing';
    end if;
    -- One rule (`fx_rate_is_stale()`), the resolver's and the view's, for the
    -- version's own rate...
    v_stale := coalesce(
        (select public.fx_rate_is_stale(v_version.rate_kind::text, r.effective_date, r.valid_until)
           from public.exchange_rates r where r.id = v_version.exchange_rate_id),
        public.fx_rate_is_stale(v_version.rate_kind::text, v_version.rate_effective_date, null),
        false);
    if v_stale then
        raise exception 'the exchange rate of quote % is from % and stale', p_quote_id, v_version.rate_effective_date
            using errcode = 'check_violation', detail = 'fx_rate_stale';
    end if;
    -- ...and for every rate a line was converted at, whatever the
    -- quotation's currency (a COP quotation priced from a USD list has rate
    -- 1 and USD lines). A rate carried with no recorded observation (copied
    -- from before they were recorded) cannot be vouched for: refreshed first.
    select l.source_currency, r.effective_date into v_line
      from public.quote_lines l
      left join public.exchange_rates r on r.id = l.source_exchange_rate_id
     where l.version_id = v_version.id
       and l.source_exchange_rate is not null
       and l.source_currency is distinct from v_version.base_currency
       and coalesce(public.fx_rate_is_stale(r.kind::text, r.effective_date, r.valid_until), true)
     order by l."position", l.id
     limit 1;
    if found then
        raise exception 'quote % has a line priced at a stale % rate (%)', p_quote_id,
                v_line.source_currency, coalesce(v_line.effective_date::text, 'unrecorded')
            using errcode = 'check_violation', detail = 'fx_rate_stale';
    end if;

    -- Evaluated inside the row lock taken above, so two concurrent issues
    -- cannot both pass the gate on the strength of the same state.
    v_gate := public.quote_discount_gate(p_quote_id);

    if not (v_gate->>'ok')::boolean then
        -- Only an admin overrides, and only in writing. A manager may issue
        -- anybody's quote, but not past the rule.
        if v_override is null
           or (select public.current_sales_role())
              is distinct from 'admin'::public.sales_role then
            raise exception 'quote % grants % percent discount, above the % percent allowed for %',
                    p_quote_id,
                    v_gate->>'effective_discount_percent',
                    v_gate->>'max_allowed',
                    v_gate->>'role'
                using errcode = 'check_violation',
                      detail  = 'quote_discount_exceeds_limit',
                      hint    = v_gate::text;
        end if;
    else
        -- The gate was satisfied, so nothing was overridden. Recording a motive
        -- here would put a skipped-the-rule marker on an issue that met it.
        v_override := null;

        if (v_gate->>'reason_required')::boolean and v_reason is null then
            raise exception 'quote % grants % percent discount, above the % percent that needs a written reason',
                    p_quote_id,
                    v_gate->>'effective_discount_percent',
                    v_gate->>'requires_reason_above'
                using errcode = 'check_violation',
                      detail  = 'quote_discount_reason_required',
                      hint    = v_gate::text;
        end if;
    end if;

    -- The previous document stops being current. One row at a time, with the
    -- GUC carrying its id, because the unfreeze hole is per version.
    for v_prev in
        select * from public.quote_versions v
         where v.quote_id = p_quote_id
           and v.issued_at is not null
           and v.superseded_at is null
    loop
        perform set_config('app.quote_version_unfreeze', v_prev.id::text, true);
        update public.quote_versions set superseded_at = now() where id = v_prev.id;
        perform set_config('app.quote_version_unfreeze', '', true);
    end loop;

    -- Recomputed rather than trusted: the totals are about to be frozen, and
    -- the figure a customer signs must be the one the lines add up to.
    perform public.refresh_quote_version_totals(v_version.id);

    -- Still a draft at this point, so the freeze guard lets it through once
    -- this function identifies itself as the owner of the stamped columns. From
    -- the next statement on, this row is immutable.
    perform set_config('app.quote_version_system_write', v_version.id::text, true);

    -- `valid_until` and `terms` are left alone: the draft already carries the
    -- document's own, and the header mirrors them (`quote_versions_sync_header`).
    update public.quote_versions v
       set issued_at      = now(),
           issued_by      = v_actor,
           party_snapshot = public.quote_party_snapshot(p_quote_id),
           slides         = public.portal_slides_snapshot(),
           standard_presentation = coalesce((select t.is_system
                                               from public.portal_templates t
                                              where t.is_active), false)
     where v.id = v_version.id
    returning * into v_version;

    perform set_config('app.quote_version_system_write', '', true);

    v_link := public.ensure_quote_share_link(p_quote_id);

    perform public.apply_quote_status(
        p_quote_id, 'sent', v_reason, 'internal', v_actor, null, v_override);

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number) || v_link;
end;
$$;

-- Restated whole; only the copy of the lines changed.
create or replace function public.revise_quote(
    p_quote_id bigint,
    p_reason   text
) returns public.quote_versions
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote public.quotes;
    v_actor bigint := public.current_sale_id();
    v_last  public.quote_versions;
    v_new   public.quote_versions;
begin
    -- A revision without a stated motive leaves the version chain legible and
    -- the reason for it lost, which is half an audit trail.
    if coalesce(btrim(p_reason), '') = '' then
        raise exception 'a reason is required to revise a quote'
            using errcode = 'check_violation', detail = 'quote_reason_required';
    end if;

    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to revise quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    -- `quote_versions_one_draft` would refuse the insert anyway; saying so here
    -- turns a unique-violation into an answer the UI can render.
    if exists (select 1 from public.quote_versions v
                where v.quote_id = p_quote_id and v.issued_at is null) then
        raise exception 'quote % already has an editable draft', p_quote_id
            using errcode = 'check_violation', detail = 'quote_draft_exists';
    end if;

    select * into v_last
      from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is not null
     order by v.version_number desc
     limit 1;
    if not found then
        raise exception 'quote % has no issued version to revise', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    -- The status moves FIRST: lines may only be written while the quote is a
    -- draft (`quote_lines_freeze_guard`), and the clone below writes lines. It
    -- also means an illegal revision -- of an accepted quote, say -- is refused
    -- before anything has been copied.
    perform public.apply_quote_status(
        p_quote_id, 'draft', p_reason, 'internal', v_actor, null, null);

    -- The rate travels with the copy: the revision starts from the figures
    -- the customer last saw, and the rep refreshes the rate on purpose
    -- (`set_quote_version_rate()`) rather than by accident. A version issued
    -- before rates existed carries none, and gets the default one instead.
    insert into public.quote_versions
        (quote_id, currency, version_number, valid_until, terms, discount_percent,
         base_currency, exchange_rate, rate_kind, exchange_rate_id,
         rate_provider_key, rate_effective_date, rate_set_at, rate_set_by,
         rate_reason)
    select v.quote_id, v.currency, v.version_number + 1,
           v.valid_until, v.terms, v.discount_percent,
           v.base_currency, v.exchange_rate, v.rate_kind, v.exchange_rate_id,
           v.rate_provider_key, v.rate_effective_date, v.rate_set_at,
           v.rate_set_by, v.rate_reason
      from public.quote_versions v where v.id = v_last.id
    returning * into v_new;

    -- The lines keep the observation they were converted at, through the
    -- hatch `quote_lines_fx_convert` honours for the new version only.
    perform set_config('app.fx_line_rate_write', v_new.id::text, true);
    insert into public.quote_lines
        (version_id, quote_id, product_id, sku, name, description, unit,
         quantity, unit_price, discount_percent, tax_rate_id, tax_rate_percent,
         "position", source_currency, source_unit_price, source_exchange_rate,
         source_exchange_rate_id)
    select v_new.id, l.quote_id, l.product_id, l.sku, l.name, l.description,
           l.unit, l.quantity, l.unit_price, l.discount_percent, l.tax_rate_id,
           l.tax_rate_percent, l."position", l.source_currency,
           l.source_unit_price, l.source_exchange_rate, l.source_exchange_rate_id
      from public.quote_lines l
     where l.version_id = v_last.id
     order by l."position", l.id;
    perform set_config('app.fx_line_rate_write', '', true);

    -- The links are NOT revoked (they were, until links became the quote's).
    -- The customer keeps reading the last issued document while this draft is
    -- worked on, and cannot answer it: the quote is `draft` now, and the status
    -- machine has no customer edge out of `draft`. Issuing the draft supersedes
    -- that document and the same link shows the new one.
    return v_new;
end;
$$;

revoke all on function public.fx_rate_is_stale(text, date, date, date) from public, anon;
grant execute on function public.fx_rate_is_stale(text, date, date, date) to authenticated, service_role;
revoke all on function public.fx_line_source_rate(bigint, character, boolean) from public, anon;
grant execute on function public.fx_line_source_rate(bigint, character, boolean) to authenticated, service_role;
