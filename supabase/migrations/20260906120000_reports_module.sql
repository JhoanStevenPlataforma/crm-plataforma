--
-- Reports module: a configurable reporting layer on top of /analytics.
--
-- /analytics answers a fixed set of questions with eight purpose-built
-- aggregates. This adds the layer that answers questions nobody wrote a
-- function for -- pick an entity, metrics, dimensions, filters, a period --
-- plus saved reports.
--
-- The whole design exists to make ONE thing safe: dynamic SQL assembled from
-- client input. The client never sends SQL, only keys, and every key is
-- resolved against a catalogue that only `service_role` can write.
--

--
-- Reports module (§ reports): the catalogue, and the saved reports.
--
-- `/analytics` answers a fixed set of questions with eight purpose-built
-- aggregate functions. This module answers questions nobody wrote a function
-- for: pick an entity, some metrics, one or two dimensions, filters, a period.
-- That is dynamic SQL, and dynamic SQL built from client input is the single
-- most dangerous thing this schema could grow -- so the shape below exists to
-- make the dangerous version unrepresentable.
--
-- THE RULE: the client never sends SQL. It sends KEYS. Every key is resolved
-- against `report_fields`, whose `sql_expr` values are authored in migrations
-- and can only be written by `service_role`. A key that is not in the
-- catalogue raises an exception, so the set of programs `run_report()` can be
-- persuaded to run is exactly the set this table describes.
--
-- The catalogue is also what the builder UI renders itself from
-- (`report_catalog()`), so the picker cannot offer a field the executor would
-- refuse. One source of truth, no drift possible -- the same reason
-- `deal_stage_requirements` is a table rather than an `if`.
--

--
-- One row per reportable entity.
--
create table public.report_datasets (
    key   text primary key,
    label text not null,
    --
    -- The FROM clause, authored here. Every join is LEFT and every join key is
    -- the target's primary key, which lets Postgres drop the ones a given
    -- report does not reference (join elimination) -- so the wide base costs
    -- nothing when a report groups by stage alone.
    --
    from_sql text not null,
    --
    -- Rows no report on this dataset may ever see: soft deletes, archives.
    -- Applied before any user filter, so "deleted" is not something a report
    -- can be built to reveal.
    --
    base_where text not null default 'true',
    -- Which date field the period filter uses when the report does not say.
    default_date_field text,
    rank smallint not null default 0
);

--
-- One row per selectable field.
--
-- `role` splits the two things a field can be. A dimension is something to
-- GROUP BY; a metric is an aggregate. `stage` is a dimension, `amount_sum` is
-- a metric, and the executor will not let them swap places.
--
create table public.report_fields (
    dataset_key text not null
        references public.report_datasets(key) on delete cascade,
    key   text not null,
    label text not null,
    role  text not null check (role in ('dimension', 'metric')),
    --
    -- Drives the operators the filter builder offers and how the value is
    -- cast. `month` is a date already truncated by `sql_expr`; it exists so the
    -- UI knows to format it as a month label rather than a day.
    --
    data_type text not null
        check (data_type in ('text', 'number', 'money', 'date', 'month')),
    --
    -- THE TRUSTED STRING. Interpolated into the generated statement verbatim,
    -- which is safe for exactly one reason: it is written in a migration and
    -- no role but `service_role` may write this table. Never build a row here
    -- from user input, and never expose a write path to it.
    --
    sql_expr text not null,
    --
    -- Metrics only. For everything but `raw`, `sql_expr` is the ARGUMENT and
    -- this names the function wrapped around it. `raw` means `sql_expr` is
    -- already a complete aggregate expression -- the escape hatch that lets a
    -- ratio like win rate be one field instead of two plus arithmetic in the
    -- browser, where it would be computed over whatever page happened to load.
    --
    aggregate text
        check (aggregate in ('sum', 'count', 'count_distinct', 'avg', 'raw')),
    -- Whether this field may appear in a `filters[]` entry.
    filterable boolean not null default true,
    --
    -- Names a frontend configuration list (`dealStages`, `leadSources`,
    -- `taskTypes`) that resolves this dimension's raw key to a human label.
    -- Resolved in the browser, not here: `deals.stage` is free text and its
    -- vocabulary lives in application configuration, so a join to a labels
    -- table would be wrong for the first customer who renames a stage.
    --
    label_source text,
    rank smallint not null default 0,
    primary key (dataset_key, key),
    -- A dimension with an aggregate, or a metric without one, is a catalogue
    -- bug that would surface as malformed SQL at run time instead of here.
    constraint report_fields_aggregate_matches_role check (
        (role = 'metric'    and aggregate is not null) or
        (role = 'dimension' and aggregate is null)
    )
);

--
-- A saved report: the definition, never the data.
--
-- `spec` is the same jsonb the builder produces, the URL carries and
-- `run_report()` consumes. Storing the definition rather than a result is what
-- makes sharing safe: two people opening one shared report each execute it
-- under their own row level security, so a rep with whom a manager shared the
-- company pipeline sees their own pipeline, not the manager's. It also means
-- the two see different numbers under one title, which the UI has to say out
-- loud.
--
create table public.reports (
    id bigint generated by default as identity primary key,
    name text not null,
    description text,
    spec jsonb not null,
    --
    -- Author and owner. Null only for the seeded library reports, which belong
    -- to the installation rather than to a person.
    --
    -- Set by the CLIENT from the signed-in identity, not by a column default.
    -- `default public.current_sale_id()` would read better, but this file is
    -- applied before `02_functions.sql` in the declarative schema, so the
    -- default would reference a function that does not exist yet and a clean
    -- `supabase db reset` would fail. No other table here uses a function
    -- default, and this is not the place to become the first.
    --
    -- Forging it is still impossible: the insert policy requires
    -- `sales_id = current_sale_id()`, so passing somebody else's id is refused
    -- rather than accepted.
    --
    sales_id bigint references public.sales(id) on delete cascade,
    --
    -- 'private'  -- only the owner (and admins/managers) may read it
    -- 'shared'   -- any authenticated user may read it
    --
    -- Deliberately two values and not an ACL. A per-user share list is a
    -- permission system, and this schema already has one; a report that could
    -- be shared with a subset would invite the reading that the SUBSET sees the
    -- same numbers, which is exactly what row level security guarantees they do
    -- not.
    --
    visibility text not null default 'private'
        check (visibility in ('private', 'shared')),
    -- True for the reports the migration seeds. They cannot be edited or
    -- deleted, only duplicated -- so the library always has a working example
    -- of every visualisation, whatever users do to their own copies.
    is_builtin boolean not null default false,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    constraint reports_name_not_blank check (btrim(name) <> ''),
    -- A built-in has no owner; a user report must have one. Without this a
    -- personal report could be written with a null owner and become readable
    -- by everyone through the built-in branch of the read policy.
    constraint reports_builtin_has_no_owner check (
        (is_builtin and sales_id is null) or (not is_builtin and sales_id is not null)
    )
);

-- The library lists a user's own reports plus the shared ones, newest first.
create index reports_sales_id_idx on public.reports (sales_id, updated_at desc);
create index reports_visibility_idx on public.reports (visibility)
    where visibility = 'shared';

-- ---------------------------------------------------------------------------
-- Reports: the catalogue, as the builder sees it
-- ---------------------------------------------------------------------------
--
-- One call, one document, so the builder cannot render a picker that disagrees
-- with the executor's allowlist -- they read the same two tables.
--
-- Open to every authenticated user, and that is not a leak: it describes which
-- FIELDS exist, never which rows. A rep learning that `owner` is a groupable
-- dimension still aggregates only their own deals when they group by it,
-- because `run_report()` runs under their own row level security.
--
create or replace function public.report_catalog()
returns jsonb
language sql
stable
set search_path to ''
as $$
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'key',   d.key,
                'label', d.label,
                'default_date_field', d.default_date_field,
                'fields', coalesce(f.fields, '[]'::jsonb)
            )
            order by d.rank, d.key
        ),
        '[]'::jsonb
    )
      from public.report_datasets d
      left join lateral (
          select jsonb_agg(
                     jsonb_build_object(
                         'key',          x.key,
                         'label',        x.label,
                         'role',         x.role,
                         'data_type',    x.data_type,
                         'aggregate',    x.aggregate,
                         'filterable',   x.filterable,
                         'label_source', x.label_source
                     )
                     order by x.rank, x.key
                 ) as fields
            from public.report_fields x
           where x.dataset_key = d.key
      ) f on true;
$$;

-- ---------------------------------------------------------------------------
-- Reports: one filter predicate
-- ---------------------------------------------------------------------------
--
-- Split out of `run_report()` so the operator allowlist is one readable table
-- that pgTAP can hit directly, rather than a branch buried in a 200-line
-- procedure.
--
-- `p_expr` is trusted: it arrives from `report_fields.sql_expr`, which only
-- `service_role` can write. Everything else arrives from the client and is
-- therefore either matched against a fixed set (`p_op`) or passed through
-- `quote_literal` (`p_value`). There is no third category, which is what makes
-- this reviewable.
--
create or replace function public.report_filter_sql(
    p_expr      text,
    p_data_type text,
    p_op        text,
    p_value     jsonb
) returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
    v_cast     text;
    v_items    text[];
    v_low      text;
    v_high     text;
    v_operator text;
begin
    -- Null tests take no value, so they are settled before anything tries to
    -- read one.
    if p_op = 'is_null' then
        return format('(%s) is null', p_expr);
    elsif p_op = 'is_not_null' then
        return format('(%s) is not null', p_expr);
    end if;

    if p_value is null or p_value = 'null'::jsonb then
        raise exception 'report: operator % needs a value', p_op
            using errcode = '22023';
    end if;

    -- How a literal is spelled for this family of types. `month` is a date the
    -- catalogue has already truncated, so it compares as a date.
    v_cast := case p_data_type
                  when 'number' then '::numeric'
                  when 'money'  then '::numeric'
                  when 'date'   then '::date'
                  when 'month'  then '::date'
                  else ''
              end;

    if p_data_type in ('text') then
        case p_op
            when 'eq'  then
                return format('(%s) = %L', p_expr, p_value #>> '{}');
            when 'neq' then
                return format('(%s) is distinct from %L', p_expr, p_value #>> '{}');
            when 'contains' then
                -- `%` and `_` are escaped so a filter reads as text the user
                -- typed, not as a pattern they did not know they were writing.
                return format(
                    '(%s) ilike %L escape ''\''',
                    p_expr,
                    '%' || replace(replace(replace(p_value #>> '{}', '\', '\\'),
                                           '%', '\%'), '_', '\_') || '%');
            when 'not_contains' then
                return format(
                    '((%s) is null or (%s) not ilike %L escape ''\'')',
                    p_expr, p_expr,
                    '%' || replace(replace(replace(p_value #>> '{}', '\', '\\'),
                                           '%', '\%'), '_', '\_') || '%');
            when 'in', 'not_in' then
                if jsonb_typeof(p_value) <> 'array' then
                    raise exception 'report: operator % needs an array', p_op
                        using errcode = '22023';
                end if;
                -- An empty `in` is not "match everything": it is a filter the
                -- user has not finished writing, and silently dropping it would
                -- report the whole company under a label that says otherwise.
                if jsonb_array_length(p_value) = 0 then
                    raise exception 'report: operator % needs a non-empty array', p_op
                        using errcode = '22023';
                end if;
                select array_agg(quote_literal(e.value))
                  into v_items
                  from jsonb_array_elements_text(p_value) as e(value);
                return format('(%s) %s (%s)', p_expr,
                              case when p_op = 'in' then 'in' else 'not in' end,
                              array_to_string(v_items, ', '));
            else
                raise exception 'report: operator % is not allowed on text', p_op
                    using errcode = '22023';
        end case;
    end if;

    if p_data_type in ('number', 'money', 'date', 'month') then
        if p_op = 'between' then
            if jsonb_typeof(p_value) <> 'array'
               or jsonb_array_length(p_value) <> 2 then
                raise exception 'report: between needs a two-element array'
                    using errcode = '22023';
            end if;
            v_low  := p_value ->> 0;
            v_high := p_value ->> 1;
            return format('(%s) between %L%s and %L%s',
                          p_expr, v_low, v_cast, v_high, v_cast);
        end if;

        -- Validated BEFORE the expression is built, not inside it: a `case`
        -- with no matching branch yields null and would compose
        -- `(expr) <null> '5'`, which is a syntax error at execution time rather
        -- than a rejected operator here.
        v_operator := case p_op
                          when 'eq'     then '='
                          when 'neq'    then '<>'
                          when 'gt'     then '>'
                          when 'gte'    then '>='
                          when 'lt'     then '<'
                          when 'lte'    then '<='
                          -- Date vocabulary mapped onto the same comparisons,
                          -- so the UI can say "before" without a second code
                          -- path behind it.
                          when 'before' then '<'
                          when 'after'  then '>'
                      end;

        if v_operator is null then
            raise exception 'report: operator % is not allowed on %', p_op, p_data_type
                using errcode = '22023';
        end if;

        return format('(%s) %s %L%s',
                      p_expr, v_operator, p_value #>> '{}', v_cast);
    end if;

    raise exception 'report: unknown data type %', p_data_type
        using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports: the executor
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER, and this one matters more than on any other function in
-- the schema. The eight `/analytics` aggregates are invoker so that a rep sees
-- their own figures; this one is invoker so that a GENERIC query engine cannot
-- become a way to read the whole company. A `security definer` here would not
-- leak one report -- it would leak every report anyone can express, which is
-- every row of five tables. `reports_module.test.sql` asserts `prosecdef` is
-- false rather than trusting this paragraph.
--
-- The composed statement contains no client text. It is assembled from:
--   * `from_sql` / `base_where` / `sql_expr` -- migration-authored, service
--     role writable only;
--   * operators matched against a fixed set in `report_filter_sql`;
--   * values passed through `quote_literal`.
-- A key that is not in the catalogue raises, so the reachable statement space
-- is exactly the catalogue.
--
-- Returns ONE jsonb document rather than a set of rows, for two reasons: the
-- column list is different for every report, so a `returns table` would have to
-- be a lie or a cursor; and the totals travel with the rows, so a reader cannot
-- catch a page where the two disagree.
--
create or replace function public.run_report(p_spec jsonb)
returns jsonb
language plpgsql
stable
set search_path to ''
as $$
declare
    v_dataset      public.report_datasets%rowtype;
    v_field        public.report_fields%rowtype;
    v_key          text;
    v_dims         text[] := '{}';
    v_dim_keys     text[] := '{}';
    v_metric_keys  text[] := '{}';
    v_select       text[] := '{}';
    v_group        text[] := '{}';
    v_where        text[] := '{}';
    v_json_dims    text[] := '{}';
    v_json_metrics text[] := '{}';
    v_filter       jsonb;
    v_period       jsonb;
    v_period_field text;
    v_sort         jsonb;
    v_sort_key     text;
    v_order        text;
    v_limit        int;
    v_sql          text;
    v_rows         jsonb;
    i              int;
begin
    -- ---- dataset ----------------------------------------------------------
    select * into v_dataset
      from public.report_datasets
     where key = p_spec ->> 'dataset';

    if not found then
        raise exception 'report: unknown dataset %', coalesce(p_spec ->> 'dataset', '(null)')
            using errcode = '22023';
    end if;

    -- ---- dimensions -------------------------------------------------------
    --
    -- Two at most. A third turns every chart into a table nobody reads, and it
    -- multiplies the row count by a cardinality the period filter does not
    -- bound.
    --
    if jsonb_typeof(p_spec -> 'dimensions') = 'array' then
        if jsonb_array_length(p_spec -> 'dimensions') > 2 then
            raise exception 'report: at most two dimensions'
                using errcode = '22023';
        end if;

        for v_key in
            select value from jsonb_array_elements_text(p_spec -> 'dimensions')
        loop
            select * into v_field
              from public.report_fields
             where dataset_key = v_dataset.key
               and key = v_key
               and role = 'dimension';

            if not found then
                raise exception 'report: % is not a dimension of %', v_key, v_dataset.key
                    using errcode = '22023';
            end if;

            if v_key = any (v_dim_keys) then
                raise exception 'report: dimension % repeated', v_key
                    using errcode = '22023';
            end if;

            v_dim_keys := v_dim_keys || v_key;
            v_dims     := v_dims || v_field.sql_expr;
            -- Positional alias, never the user's key: an alias built from
            -- client text is the one place an identifier could still be
            -- smuggled into the statement.
            v_select   := v_select || format('(%s) as d%s', v_field.sql_expr,
                                             array_length(v_dim_keys, 1));
            v_group    := v_group || format('%s', array_length(v_dim_keys, 1));
            v_json_dims := v_json_dims ||
                format('%L, d%s', v_key, array_length(v_dim_keys, 1));
        end loop;
    end if;

    -- ---- metrics ----------------------------------------------------------
    if jsonb_typeof(p_spec -> 'metrics') <> 'array'
       or jsonb_array_length(p_spec -> 'metrics') = 0 then
        raise exception 'report: at least one metric is required'
            using errcode = '22023';
    end if;

    if jsonb_array_length(p_spec -> 'metrics') > 6 then
        raise exception 'report: at most six metrics'
            using errcode = '22023';
    end if;

    for v_key in
        select value from jsonb_array_elements_text(p_spec -> 'metrics')
    loop
        select * into v_field
          from public.report_fields
         where dataset_key = v_dataset.key
           and key = v_key
           and role = 'metric';

        if not found then
            raise exception 'report: % is not a metric of %', v_key, v_dataset.key
                using errcode = '22023';
        end if;

        if v_key = any (v_metric_keys) then
            raise exception 'report: metric % repeated', v_key
                using errcode = '22023';
        end if;

        v_metric_keys := v_metric_keys || v_key;
        i := array_length(v_metric_keys, 1);

        v_select := v_select || format('(%s) as m%s',
            case v_field.aggregate
                when 'raw'            then v_field.sql_expr
                when 'count'          then format('count(%s)', v_field.sql_expr)
                when 'count_distinct' then format('count(distinct %s)', v_field.sql_expr)
                when 'sum'            then format('coalesce(sum(%s), 0)', v_field.sql_expr)
                -- avg stays null on an empty set on purpose: 0 would draw a bar
                -- claiming an average of nothing.
                when 'avg'            then format('avg(%s)', v_field.sql_expr)
            end, i);

        v_json_metrics := v_json_metrics || format('%L, m%s', v_key, i);
    end loop;

    -- ---- base predicate ---------------------------------------------------
    v_where := v_where || format('(%s)', v_dataset.base_where);

    -- ---- period -----------------------------------------------------------
    --
    -- Bounds the scan, and it is what keeps a report on three years of deals
    -- from being one sequential scan per open tab. Optional only for datasets
    -- that declare no date field at all.
    --
    v_period := p_spec -> 'period';

    if v_period is not null and jsonb_typeof(v_period) = 'object' then
        v_period_field := coalesce(v_period ->> 'field', v_dataset.default_date_field);

        if v_period_field is null then
            raise exception 'report: % has no date field to filter on', v_dataset.key
                using errcode = '22023';
        end if;

        select * into v_field
          from public.report_fields
         where dataset_key = v_dataset.key
           and key = v_period_field
           and data_type in ('date', 'month')
           and filterable;

        if not found then
            raise exception 'report: % is not a filterable date field of %',
                v_period_field, v_dataset.key
                using errcode = '22023';
        end if;

        if (v_period ->> 'from') is not null then
            v_where := v_where || public.report_filter_sql(
                v_field.sql_expr, 'date', 'gte',
                to_jsonb((v_period ->> 'from')));
        end if;

        if (v_period ->> 'to') is not null then
            v_where := v_where || public.report_filter_sql(
                v_field.sql_expr, 'date', 'lte',
                to_jsonb((v_period ->> 'to')));
        end if;
    end if;

    -- ---- filters ----------------------------------------------------------
    if jsonb_typeof(p_spec -> 'filters') = 'array' then
        if jsonb_array_length(p_spec -> 'filters') > 12 then
            raise exception 'report: at most twelve filters'
                using errcode = '22023';
        end if;

        for v_filter in
            select value from jsonb_array_elements(p_spec -> 'filters')
        loop
            select * into v_field
              from public.report_fields
             where dataset_key = v_dataset.key
               and key = v_filter ->> 'field'
               and filterable;

            if not found then
                raise exception 'report: % is not a filterable field of %',
                    coalesce(v_filter ->> 'field', '(null)'), v_dataset.key
                    using errcode = '22023';
            end if;

            -- A metric filter would be a HAVING clause, which is a different
            -- question ("groups whose total exceeds X") and is not offered
            -- rather than silently reinterpreted as a row filter.
            if v_field.role <> 'dimension' then
                raise exception 'report: % is a metric and cannot be filtered',
                    v_field.key using errcode = '22023';
            end if;

            v_where := v_where || public.report_filter_sql(
                v_field.sql_expr,
                v_field.data_type,
                coalesce(v_filter ->> 'op', ''),
                v_filter -> 'value');
        end loop;
    end if;

    -- ---- order and limit --------------------------------------------------
    v_sort := p_spec -> 'sort';
    v_order := null;

    if v_sort is not null and jsonb_typeof(v_sort) = 'object' then
        v_sort_key := v_sort ->> 'field';

        -- Ordering is expressed positionally against what was already
        -- selected, so a sort key is only ever an integer in the statement.
        i := array_position(v_metric_keys, v_sort_key);
        if i is not null then
            v_order := format('m%s', i);
        else
            i := array_position(v_dim_keys, v_sort_key);
            if i is not null then
                v_order := format('d%s', i);
            else
                raise exception 'report: cannot sort on %, it is not selected',
                    coalesce(v_sort_key, '(null)') using errcode = '22023';
            end if;
        end if;

        v_order := v_order || case
            when lower(coalesce(v_sort ->> 'direction', 'desc')) = 'asc'
            then ' asc nulls last'
            else ' desc nulls last'
        end;
    elsif array_length(v_dim_keys, 1) is not null then
        -- No sort asked for: order by the first dimension so a month axis comes
        -- back in calendar order rather than in whatever order the scan
        -- produced.
        v_order := 'd1 asc nulls last';
    end if;

    -- One over the cap, so "there is more than this" is knowable without a
    -- second count query over the same scan.
    v_limit := least(greatest(coalesce((p_spec ->> 'limit')::int, 500), 1), 1000);

    -- ---- compose ----------------------------------------------------------
    v_sql := format(
        'select %s from %s where %s',
        array_to_string(v_select, ', '),
        v_dataset.from_sql,
        array_to_string(v_where, ' and '));

    if array_length(v_group, 1) is not null then
        v_sql := v_sql || ' group by ' || array_to_string(v_group, ', ');
    end if;

    if v_order is not null then
        v_sql := v_sql || ' order by ' || v_order;
    end if;

    v_sql := v_sql || format(' limit %s', v_limit + 1);

    -- The generated statement is wrapped so the whole result comes back as one
    -- document; the object keys are the report keys the caller asked for rather
    -- than the positional aliases.
    --
    -- TWO wrappers, not one, and the inner one is load-bearing. `jsonb_agg` has
    -- no inherent order: feeding it a subquery that carries `order by` happens
    -- to preserve that order today, but nothing in the standard or the planner
    -- promises it, and the failure mode is a month axis that comes back
    -- shuffled for one report and not another. `row_number() over ()` numbers
    -- the rows in the order they arrive from the ordered, limited subquery, and
    -- the aggregate then orders on that number explicitly.
    v_sql := format(
        'select coalesce(jsonb_agg(jsonb_build_object(
             ''dimensions'', jsonb_build_object(%s),
             ''metrics'',    jsonb_build_object(%s)) order by x.rn), ''[]''::jsonb)
           from (select t.*, row_number() over () as rn from (%s) t) x',
        array_to_string(v_json_dims, ', '),
        array_to_string(v_json_metrics, ', '),
        v_sql);

    execute v_sql into v_rows;

    return jsonb_build_object(
        -- `with ordinality` + an explicit `order by`: dropping the extra row
        -- must not also reshuffle the ones that are kept, and jsonb_agg has no
        -- inherent order to rely on.
        'rows',      case when jsonb_array_length(v_rows) > v_limit
                          then (select coalesce(jsonb_agg(s.value order by s.n),
                                                '[]'::jsonb)
                                  from jsonb_array_elements(v_rows)
                                       with ordinality as s(value, n)
                                 where s.n <= v_limit)
                          else v_rows end,
        'row_count', least(jsonb_array_length(v_rows), v_limit),
        -- The UI says so rather than quietly showing a prefix: a truncated
        -- report that looks complete is a wrong answer with a chart on it.
        'truncated', jsonb_array_length(v_rows) > v_limit);
end;
$$;

--
-- Report catalogue (readable by everyone, writable by nobody)
--
-- Read is open because the builder renders its pickers from it, and a picker
-- that cannot describe itself is a broken screen. It exposes which FIELDS
-- exist, never which rows: grouping by `owner` still aggregates only the deals
-- the reader's own policies expose.
--
-- There is no write policy, and that is the load-bearing part. `sql_expr` is
-- interpolated into the statement `run_report()` executes, so a user who could
-- write this table could run arbitrary SQL as themselves -- a privilege
-- escalation that starts at "can edit a dropdown". Seeded by migration and
-- reachable only by `service_role`, which bypasses row level security. The
-- grants in 06_grants.sql withhold the privileges as well, so this does not
-- rest on the absence of a policy alone.
--
alter table public.report_datasets enable row level security;
alter table public.report_fields enable row level security;

create policy "Report datasets are readable by everyone"
    on public.report_datasets for select to authenticated
    using (true);

create policy "Report fields are readable by everyone"
    on public.report_fields for select to authenticated
    using (true);

--
-- Saved reports (own, shared, and the built-in library)
--
-- What is protected here is the DEFINITION, not the data. Every report is
-- executed by `run_report()` under the reader's own row level security, so a
-- shared report hands over a question, never an answer -- a rep opening the
-- manager's "pipeline by owner" sees their own pipeline. The library screen
-- says so, because two people reading different numbers under one title is
-- surprising unless it is stated.
--
alter table public.reports enable row level security;

create policy "Reports are readable by their owner, or when shared"
    on public.reports for select to authenticated
    using (
        is_builtin
        or visibility = 'shared'
        or sales_id = (select public.current_sale_id())
        or (select public.can_manage_all())
    );

-- Creation is for yourself only. Without the `sales_id` check a user could
-- author a report attributed to somebody else, which is how a shared library
-- acquires entries nobody admits to writing.
create policy "Reports are created for their own owner"
    on public.reports for insert to authenticated
    with check (
        not is_builtin
        and sales_id = (select public.current_sale_id())
    );

-- Managers may fix or retire a colleague's report, the same reassignment
-- privilege they already have over leads, contacts, companies and deals.
create policy "Reports are updated by their owner or a manager"
    on public.reports for update to authenticated
    using (
        not is_builtin
        and (sales_id = (select public.current_sale_id())
             or (select public.can_manage_all()))
    )
    with check (
        not is_builtin
        and (sales_id = (select public.current_sale_id())
             or (select public.can_manage_all()))
    );

create policy "Reports are deleted by their owner or a manager"
    on public.reports for delete to authenticated
    using (
        not is_builtin
        and (sales_id = (select public.current_sale_id())
             or (select public.can_manage_all()))
    );

-- `is_builtin` is excluded from every write policy above rather than guarded by
-- a trigger: the seeded library is the one place a user can always find a
-- working example of each visualisation, so it survives whatever they do to
-- their own copies. Duplicating one produces an ordinary owned report.

--
-- Reports module
--
-- The catalogue is read-only for users at the PRIVILEGE level, not only at the
-- policy level. `report_fields.sql_expr` reaches the statement `run_report()`
-- executes, so write access to this table is write access to the database
-- under your own identity. Two independent mechanisms withhold it.
--
grant select on table public.report_datasets to authenticated;
grant select on table public.report_fields to authenticated;

revoke insert, update, delete, truncate on table public.report_datasets
    from authenticated, anon;
revoke insert, update, delete, truncate on table public.report_fields
    from authenticated, anon;

grant all on table public.report_datasets to service_role;
grant all on table public.report_fields to service_role;

-- Saved reports are ordinary user data: the policies do the scoping.
grant select, insert, update, delete on table public.reports to authenticated;
grant usage, select on sequence public.reports_id_seq to authenticated;
grant all on table public.reports to service_role;

grant execute on function public.report_catalog() to authenticated;
grant execute on function public.run_report(jsonb) to authenticated;

-- Granted, and it HAS to be: `run_report()` is SECURITY INVOKER, so its body
-- runs with the caller's privileges and an internal call to a function the
-- caller may not execute fails at run time. Withholding this grant would break
-- every report while looking like a tightening.
--
-- Exposing it costs nothing. It is immutable, it executes no SQL, and it
-- returns a string: a user calling it directly gets back a predicate they still
-- have no way to run.
grant execute on function
    public.report_filter_sql(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------
--
-- Five datasets, and every join below is LEFT with the target's primary key on
-- the inner side. That is not cosmetic: Postgres removes a left join whose
-- inner side is unique and unreferenced, so a report grouping by `stage` alone
-- never pays for the companies, sales or teams joins that sit in the FROM.
--
-- `base_where` is the invariant no report may opt out of. Soft-deleted and
-- archived rows are excluded here rather than in each field, so "show me the
-- deleted ones" is not a report anybody can build.
--

insert into public.report_datasets (key, label, from_sql, base_where, default_date_field, rank) values
('deals', 'Deals',
 'public.deals d
    left join public.companies co on co.id = d.company_id
    left join public.sales s on s.id = d.sales_id
    left join public.teams tm on tm.id = d.team_id',
 'd.archived_at is null',
 'created_at', 10),

('leads', 'Leads',
 'public.leads l
    left join public.sales s on s.id = l.sales_id
    left join public.deals cd on cd.id = l.converted_deal_id and cd.archived_at is null',
 'true',
 'created_at', 20),

('tasks', 'Tasks',
 'public.tasks tk
    left join public.sales s on s.id = tk.owner_sales_id
    left join public.task_types ty on ty.id = tk.task_type_id
    left join public.task_priorities pr on pr.id = tk.priority_id
    left join public.task_statuses st on st.id = tk.status_id',
 'tk.deleted_at is null',
 'created_at', 30),

('contacts', 'Contacts',
 'public.contacts c
    left join public.companies co on co.id = c.company_id
    left join public.sales s on s.id = c.sales_id',
 'true',
 'first_seen', 40),

('companies', 'Companies',
 'public.companies co
    left join public.sales s on s.id = co.sales_id',
 'true',
 'created_at', 50);

--
-- DEALS
--
-- `won_amount` / `lost_amount` are `raw` aggregates rather than a metric plus a
-- filter, so one report can show won beside lost beside pipeline. Expressed as
-- filters they would need three reports, and the three could not be read as
-- shares of one total.
--
-- THE DATE BASIS IS THE THING TO GET RIGHT HERE. There is no `deals.closed_at`
-- in this schema, so `expected_closing_date` is the only date a won deal
-- carries -- a FORECAST, not a fact. Its label says "expected" for that reason
-- and must keep saying it until a real close date exists. A deal closed with no
-- expected date contributes to no month at all, which is visible rather than
-- papered over: coalescing to `created_at` would invent a close date nobody
-- entered.
--
insert into public.report_fields
    (dataset_key, key, label, role, data_type, sql_expr, aggregate, filterable, label_source, rank) values

-- dimensions
('deals', 'stage',        'Stage',           'dimension', 'text',  'd.stage',                                     null, true,  'dealStages',     10),
('deals', 'category',     'Category',        'dimension', 'text',  'd.category',                                  null, true,  'dealCategories', 20),
('deals', 'owner',        'Owner',           'dimension', 'text',  'nullif(btrim(concat_ws('' '', s.first_name, s.last_name)), '''')', null, true, null, 30),
('deals', 'team',         'Team',            'dimension', 'text',  'tm.name',                                     null, true,  null,             40),
('deals', 'company',      'Company',         'dimension', 'text',  'co.name',                                     null, true,  null,             50),
('deals', 'sector',       'Company sector',  'dimension', 'text',  'co.sector',                                   null, true,  null,             60),
('deals', 'country',      'Company country', 'dimension', 'text',  'co.country',                                  null, true,  null,             70),
('deals', 'created_month','Created month',   'dimension', 'month', 'date_trunc(''month'', d.created_at)::date',   null, true,  null,             80),
('deals', 'closing_month','Expected closing month', 'dimension', 'month', 'date_trunc(''month'', d.expected_closing_date)::date', null, true, null, 90),
('deals', 'created_at',   'Created date',    'dimension', 'date',  'd.created_at::date',                          null, true,  null,            100),
('deals', 'expected_closing_date', 'Expected closing date', 'dimension', 'date', 'd.expected_closing_date',       null, true,  null,            110),

-- metrics
('deals', 'deal_count',     'Number of deals',   'metric', 'number', '*',            'count', false, null, 200),
('deals', 'amount_sum',     'Total value',       'metric', 'money',  'd.amount',     'sum',   false, null, 210),
('deals', 'amount_avg',     'Average value',     'metric', 'money',  'd.amount',     'avg',   false, null, 220),
('deals', 'pipeline_amount','Open pipeline',     'metric', 'money',
    'coalesce(sum(d.amount) filter (where d.stage not in (''won'', ''lost'')), 0)', 'raw', false, null, 230),
('deals', 'won_amount',     'Won value',         'metric', 'money',
    'coalesce(sum(d.amount) filter (where d.stage = ''won''), 0)', 'raw', false, null, 240),
('deals', 'lost_amount',    'Lost value',        'metric', 'money',
    'coalesce(sum(d.amount) filter (where d.stage = ''lost''), 0)', 'raw', false, null, 250),
('deals', 'won_count',      'Deals won',         'metric', 'number',
    'count(*) filter (where d.stage = ''won'')', 'raw', false, null, 260),
('deals', 'lost_count',     'Deals lost',        'metric', 'number',
    'count(*) filter (where d.stage = ''lost'')', 'raw', false, null, 270),
--
-- Win rate as ONE field, computed in the database. Shipped as two counts and
-- divided in the browser it would be divided per PAGE, so a report showing the
-- top ten owners would print ten correct rates and one wrong total.
--
-- Open deals are excluded from the denominator deliberately, matching
-- `misc/reporting.ts`: counting them as not-yet-won drags every rate toward
-- zero early in a period and makes the number describe the calendar rather than
-- the selling. Null, not zero, when nothing has been decided.
--
('deals', 'win_rate',       'Win rate',          'metric', 'number',
    'round(count(*) filter (where d.stage = ''won'')::numeric
           / nullif(count(*) filter (where d.stage in (''won'', ''lost'')), 0), 4)',
    'raw', false, null, 280),
--
-- Forecast cycle length in days, and it is a forecast for the same reason as
-- above: measured to the EXPECTED close, because no real one is recorded.
--
('deals', 'cycle_days',     'Avg days to expected close', 'metric', 'number',
    'round(avg(d.expected_closing_date - d.created_at::date)
           filter (where d.expected_closing_date is not null), 1)',
    'raw', false, null, 290);

--
-- LEADS
--
-- `nb_converted` and everything derived from it is COHORT-scoped: of the leads
-- created in the period, how many have converted since. Dividing conversions
-- that happened in March by leads created in March compares two different
-- populations. The consequence belongs next to the chart: the most recent
-- months always look worse because their leads have not had time to convert.
--
-- ATTRIBUTION AND ITS LIMIT. `leads.converted_deal_id -> deals` is the only
-- path in this schema from an origin to revenue, and it exists only for leads
-- converted with `create_deal := true`. A deal typed straight into the kanban
-- has no traceable origin, because `deals` has no `source` column. So
-- `won_amount` here answers "of the revenue we CAN attribute, which channel
-- produced it" -- never "which channel produced our revenue".
--
insert into public.report_fields
    (dataset_key, key, label, role, data_type, sql_expr, aggregate, filterable, label_source, rank) values

('leads', 'source',        'Source',        'dimension', 'text',  'coalesce(nullif(btrim(l.source), ''''), ''unknown'')', null, true, 'leadSources',  10),
('leads', 'status',        'Status',        'dimension', 'text',  'l.status',                                    null, true,  'leadStatuses', 20),
('leads', 'owner',         'Owner',         'dimension', 'text',  'nullif(btrim(concat_ws('' '', s.first_name, s.last_name)), '''')', null, true, null, 30),
('leads', 'company_name',  'Company',       'dimension', 'text',  'l.company_name',                              null, true,  null,           40),
('leads', 'created_month', 'Created month', 'dimension', 'month', 'date_trunc(''month'', l.created_at)::date',   null, true,  null,           50),
('leads', 'created_at',    'Created date',  'dimension', 'date',  'l.created_at::date',                          null, true,  null,           60),
('leads', 'converted_at',  'Converted date','dimension', 'date',  'l.converted_at::date',                        null, true,  null,           70),

('leads', 'lead_count',      'Number of leads',   'metric', 'number', '*',        'count', false, null, 200),
('leads', 'converted_count', 'Converted',         'metric', 'number',
    'count(*) filter (where l.converted_at is not null)', 'raw', false, null, 210),
('leads', 'conversion_rate', 'Conversion rate',   'metric', 'number',
    'round(count(*) filter (where l.converted_at is not null)::numeric
           / nullif(count(*), 0), 4)', 'raw', false, null, 220),
('leads', 'conversion_days', 'Avg days to convert','metric', 'number',
    'round(avg(extract(epoch from (l.converted_at - l.created_at)) / 86400.0)
           filter (where l.converted_at is not null), 1)', 'raw', false, null, 230),
('leads', 'won_deal_count',  'Deals won',         'metric', 'number',
    'count(*) filter (where cd.stage = ''won'')', 'raw', false, null, 240),
('leads', 'won_amount',      'Attributed won value','metric','money',
    'coalesce(sum(cd.amount) filter (where cd.stage = ''won''), 0)', 'raw', false, null, 250),
('leads', 'pipeline_amount', 'Attributed pipeline','metric','money',
    'coalesce(sum(cd.amount) filter (where cd.stage is not null
                                       and cd.stage not in (''won'', ''lost'')), 0)',
    'raw', false, null, 260),
('leads', 'avg_score',       'Average score',     'metric', 'number', 'l.score', 'avg', false, null, 270);

--
-- TASKS
--
-- OPEN is counted on the COLUMNS (`completed_at`, `canceled_at`, `archived_at`
-- all null), never on `task_statuses.is_open`. The two disagree on an archived
-- task and on a task completed without its status following, and the columns
-- are what every partial index and every task-list filter use -- so a counter
-- here equals the list a user lands on when they click it.
--
-- `overdue_count` is a SUBSET of `open_count`, never a sibling. Anything
-- stacking the two must subtract first or every late task is drawn twice;
-- `workloadOf()` in `taskWorkload.ts` does that subtraction once for every
-- caller, and the report UI routes through it.
--
-- ON TIME: a task with no due date counts as on time, so the denominator is
-- exactly `completed_count`. Excluding it would make the two counters look
-- comparable while they are not, which is how a rate ends up above 100 %.
--
-- CYCLE is measured `completed_at - created_at`, never from
-- `tasks.total_open_seconds`: that counter is trigger-maintained and reads 0 on
-- every task predating the trigger, and a chart cannot tell "instant" from
-- "never recorded".
--
insert into public.report_fields
    (dataset_key, key, label, role, data_type, sql_expr, aggregate, filterable, label_source, rank) values

('tasks', 'owner',          'Owner',           'dimension', 'text',  'nullif(btrim(concat_ws('' '', s.first_name, s.last_name)), '''')', null, true, null, 10),
('tasks', 'task_type',      'Type',            'dimension', 'text',  'ty.label',                                    null, true, null, 20),
('tasks', 'priority',       'Priority',        'dimension', 'text',  'pr.label',                                    null, true, null, 30),
('tasks', 'status',         'Status',          'dimension', 'text',  'st.label',                                    null, true, null, 40),
('tasks', 'source',         'Origin',          'dimension', 'text',  'tk.source',                                   null, true, null, 50),
('tasks', 'created_month',  'Created month',   'dimension', 'month', 'date_trunc(''month'', tk.created_at)::date',  null, true, null, 60),
('tasks', 'completed_month','Completed month', 'dimension', 'month', 'date_trunc(''month'', tk.completed_at)::date',null, true, null, 70),
('tasks', 'created_at',     'Created date',    'dimension', 'date',  'tk.created_at::date',                         null, true, null, 80),
('tasks', 'completed_at',   'Completed date',  'dimension', 'date',  'tk.completed_at::date',                        null, true, null, 90),
('tasks', 'due_date',       'Due date',        'dimension', 'date',  'tk.due_date::date',                            null, true, null, 100),

('tasks', 'task_count',      'Number of tasks', 'metric', 'number', '*', 'count', false, null, 200),
('tasks', 'open_count',      'Open',            'metric', 'number',
    'count(*) filter (where tk.archived_at is null and tk.completed_at is null
                        and tk.canceled_at is null)', 'raw', false, null, 210),
('tasks', 'overdue_count',   'Overdue',         'metric', 'number',
    'count(*) filter (where tk.archived_at is null and tk.completed_at is null
                        and tk.canceled_at is null and tk.due_date < now())',
    'raw', false, null, 220),
('tasks', 'completed_count', 'Completed',       'metric', 'number',
    'count(*) filter (where tk.completed_at is not null)', 'raw', false, null, 230),
('tasks', 'on_time_count',   'Completed on time','metric','number',
    'count(*) filter (where tk.completed_at is not null
                        and (tk.due_date is null or tk.completed_at <= tk.due_date))',
    'raw', false, null, 240),
('tasks', 'on_time_rate',    'On-time rate',    'metric', 'number',
    'round(count(*) filter (where tk.completed_at is not null
                              and (tk.due_date is null or tk.completed_at <= tk.due_date))::numeric
           / nullif(count(*) filter (where tk.completed_at is not null), 0), 4)',
    'raw', false, null, 250),
('tasks', 'cycle_hours',     'Avg hours to complete', 'metric', 'number',
    'round(avg(extract(epoch from (tk.completed_at - tk.created_at)) / 3600.0)
           filter (where tk.completed_at is not null), 1)', 'raw', false, null, 260);

--
-- CONTACTS
--
-- `first_seen` is the creation date, and it is a PROXY: `contacts` has no
-- `created_at` column. It is what `activity_log` already files a contact under,
-- so the two screens agree -- but it is user-editable and optional on import,
-- so a contacts-per-month report is approximate in a way a deals-per-month
-- report is not. The field label says "first seen" rather than "created" so the
-- reader is not told otherwise.
--
insert into public.report_fields
    (dataset_key, key, label, role, data_type, sql_expr, aggregate, filterable, label_source, rank) values

('contacts', 'status',           'Status',          'dimension', 'text',  'c.status',                                    null, true, null, 10),
('contacts', 'owner',            'Owner',           'dimension', 'text',  'nullif(btrim(concat_ws('' '', s.first_name, s.last_name)), '''')', null, true, null, 20),
('contacts', 'company',          'Company',         'dimension', 'text',  'co.name',                                     null, true, null, 30),
('contacts', 'sector',           'Company sector',  'dimension', 'text',  'co.sector',                                   null, true, null, 40),
('contacts', 'country',          'Company country', 'dimension', 'text',  'co.country',                                  null, true, null, 50),
('contacts', 'title',            'Job title',       'dimension', 'text',  'c.title',                                     null, true, null, 60),
('contacts', 'first_seen_month', 'First seen month','dimension', 'month', 'date_trunc(''month'', c.first_seen)::date',   null, true, null, 70),
('contacts', 'first_seen',       'First seen',      'dimension', 'date',  'c.first_seen::date',                          null, true, null, 80),
('contacts', 'last_seen',        'Last seen',       'dimension', 'date',  'c.last_seen::date',                           null, true, null, 90),

('contacts', 'contact_count',    'Number of contacts', 'metric', 'number', '*', 'count', false, null, 200),
('contacts', 'company_count',    'Distinct companies', 'metric', 'number', 'c.company_id', 'count_distinct', false, null, 210),
('contacts', 'newsletter_count', 'Newsletter subscribers', 'metric', 'number',
    'count(*) filter (where c.has_newsletter)', 'raw', false, null, 220);

--
-- COMPANIES
--
-- `revenue` is deliberately absent as a metric: the column is `text` in this
-- schema, so summing or ordering by it is not possible without inventing a
-- parse. `size` is a smallint and is offered.
--
insert into public.report_fields
    (dataset_key, key, label, role, data_type, sql_expr, aggregate, filterable, label_source, rank) values

('companies', 'sector',        'Sector',        'dimension', 'text',  'co.sector',                                   null, true, null, 10),
('companies', 'country',       'Country',       'dimension', 'text',  'co.country',                                  null, true, null, 20),
('companies', 'city',          'City',          'dimension', 'text',  'co.city',                                     null, true, null, 30),
('companies', 'owner',         'Owner',         'dimension', 'text',  'nullif(btrim(concat_ws('' '', s.first_name, s.last_name)), '''')', null, true, null, 40),
('companies', 'created_month', 'Created month', 'dimension', 'month', 'date_trunc(''month'', co.created_at)::date',  null, true, null, 50),
('companies', 'created_at',    'Created date',  'dimension', 'date',  'co.created_at::date',                         null, true, null, 60),

('companies', 'company_count', 'Number of companies', 'metric', 'number', '*',        'count', false, null, 200),
('companies', 'avg_size',      'Average headcount',   'metric', 'number', 'co.size',  'avg',   false, null, 210);

-- ---------------------------------------------------------------------------
-- The built-in library
-- ---------------------------------------------------------------------------
--
-- Every one of these is a `spec`, not a component. Adding a report to the
-- library is an insert, not a deploy, and any user can duplicate one and edit
-- the copy -- which is also how the builder gets discovered by people who would
-- never open an empty one.
--
-- The period is stored as a PRESET, not as two dates. A saved report that
-- resolved to absolute dates would keep reporting last March forever; the
-- frontend resolves the preset against today and sends `from`/`to` to
-- `run_report()`, which never sees a preset.
--
-- Ids are assigned explicitly so a later migration can amend a built-in in
-- place rather than inserting a second copy of it.
--
insert into public.reports (id, name, description, spec, sales_id, visibility, is_builtin) values

(1, 'Pipeline by stage',
 'Where the open pipeline is sitting right now.',
 '{"dataset":"deals",
   "metrics":["amount_sum","deal_count"],
   "dimensions":["stage"],
   "filters":[{"field":"stage","op":"not_in","value":["won","lost"]}],
   "sort":{"field":"amount_sum","direction":"desc"},
   "visualisation":"funnel"}'::jsonb,
 null, 'shared', true),

(2, 'Sales performance by owner',
 'Won, lost and open pipeline for each member of the team.',
 '{"dataset":"deals",
   "metrics":["won_amount","pipeline_amount","lost_amount","win_rate"],
   "dimensions":["owner"],
   "period":{"field":"expected_closing_date","preset":"last_6_months"},
   "sort":{"field":"won_amount","direction":"desc"},
   "visualisation":"ranking"}'::jsonb,
 null, 'shared', true),

(3, 'Sales trend',
 'Won against lost value, month by month.',
 '{"dataset":"deals",
   "metrics":["won_amount","lost_amount"],
   "dimensions":["closing_month"],
   "period":{"field":"expected_closing_date","preset":"last_12_months"},
   "sort":{"field":"closing_month","direction":"asc"},
   "visualisation":"bar"}'::jsonb,
 null, 'shared', true),

(4, 'Win rate by stage reached',
 'Which stages convert, and which ones the business leaks out of.',
 '{"dataset":"deals",
   "metrics":["won_count","lost_count","win_rate"],
   "dimensions":["stage"],
   "period":{"field":"expected_closing_date","preset":"last_12_months"},
   "sort":{"field":"lost_count","direction":"desc"},
   "visualisation":"table"}'::jsonb,
 null, 'shared', true),

(5, 'Pipeline by sector',
 'Which industries the open pipeline is concentrated in.',
 '{"dataset":"deals",
   "metrics":["pipeline_amount","deal_count"],
   "dimensions":["sector"],
   "sort":{"field":"pipeline_amount","direction":"desc"},
   "limit":15,
   "visualisation":"ranking"}'::jsonb,
 null, 'shared', true),

(6, 'Deal value by stage and owner',
 'Two dimensions at once: who is carrying what, and how far along.',
 '{"dataset":"deals",
   "metrics":["amount_sum"],
   "dimensions":["owner","stage"],
   "filters":[{"field":"stage","op":"not_in","value":["won","lost"]}],
   "sort":{"field":"amount_sum","direction":"desc"},
   "visualisation":"stacked"}'::jsonb,
 null, 'shared', true),

(7, 'Lead generation',
 'How many prospects arrive each month, and how many of them convert.',
 '{"dataset":"leads",
   "metrics":["lead_count","converted_count","conversion_rate"],
   "dimensions":["created_month"],
   "period":{"field":"created_at","preset":"last_12_months"},
   "sort":{"field":"created_month","direction":"asc"},
   "visualisation":"bar"}'::jsonb,
 null, 'shared', true),

(8, 'Source quality',
 'Which channels produce leads that turn into money. Attributed revenue only.',
 '{"dataset":"leads",
   "metrics":["lead_count","converted_count","conversion_rate","won_amount"],
   "dimensions":["source"],
   "period":{"field":"created_at","preset":"last_12_months"},
   "sort":{"field":"won_amount","direction":"desc"},
   "visualisation":"table"}'::jsonb,
 null, 'shared', true),

(9, 'Leads by owner',
 'Prospect load and conversion for each member of the team.',
 '{"dataset":"leads",
   "metrics":["lead_count","converted_count","conversion_rate","conversion_days"],
   "dimensions":["owner"],
   "period":{"field":"created_at","preset":"last_6_months"},
   "sort":{"field":"lead_count","direction":"desc"},
   "visualisation":"ranking"}'::jsonb,
 null, 'shared', true),

(10, 'Lead status breakdown',
 'Where prospects are stalling before they convert.',
 '{"dataset":"leads",
   "metrics":["lead_count"],
   "dimensions":["status"],
   "period":{"field":"created_at","preset":"last_6_months"},
   "sort":{"field":"lead_count","direction":"desc"},
   "visualisation":"donut"}'::jsonb,
 null, 'shared', true),

(11, 'Team productivity',
 'Work created against work closed, and how much of it landed on time.',
 '{"dataset":"tasks",
   "metrics":["completed_count","on_time_count","on_time_rate","cycle_hours"],
   "dimensions":["owner"],
   "period":{"field":"completed_at","preset":"last_3_months"},
   "sort":{"field":"completed_count","direction":"desc"},
   "visualisation":"ranking"}'::jsonb,
 null, 'shared', true),

(12, 'Overdue workload',
 'Who is carrying late work right now. Not period-scoped: being late has no month.',
 '{"dataset":"tasks",
   "metrics":["open_count","overdue_count"],
   "dimensions":["owner"],
   "sort":{"field":"overdue_count","direction":"desc"},
   "visualisation":"ranking"}'::jsonb,
 null, 'shared', true),

(13, 'Activity mix',
 'What kind of work actually got done, counted on completion.',
 '{"dataset":"tasks",
   "metrics":["completed_count"],
   "dimensions":["task_type"],
   "period":{"field":"completed_at","preset":"last_3_months"},
   "sort":{"field":"completed_count","direction":"desc"},
   "visualisation":"donut"}'::jsonb,
 null, 'shared', true),

(14, 'Task flow',
 'Created against completed, month by month. The gap is the backlog forming.',
 '{"dataset":"tasks",
   "metrics":["task_count","completed_count"],
   "dimensions":["created_month"],
   "period":{"field":"created_at","preset":"last_12_months"},
   "sort":{"field":"created_month","direction":"asc"},
   "visualisation":"bar"}'::jsonb,
 null, 'shared', true),

(15, 'Customer growth',
 'New accounts per month.',
 '{"dataset":"companies",
   "metrics":["company_count"],
   "dimensions":["created_month"],
   "period":{"field":"created_at","preset":"last_12_months"},
   "sort":{"field":"created_month","direction":"asc"},
   "visualisation":"bar"}'::jsonb,
 null, 'shared', true),

(16, 'Portfolio by sector',
 'How the customer base is distributed across industries.',
 '{"dataset":"companies",
   "metrics":["company_count"],
   "dimensions":["sector"],
   "sort":{"field":"company_count","direction":"desc"},
   "limit":15,
   "visualisation":"ranking"}'::jsonb,
 null, 'shared', true),

(17, 'Contact growth',
 'New contacts per month. Dated on first seen, which is a proxy for creation.',
 '{"dataset":"contacts",
   "metrics":["contact_count"],
   "dimensions":["first_seen_month"],
   "period":{"field":"first_seen","preset":"last_12_months"},
   "sort":{"field":"first_seen_month","direction":"asc"},
   "visualisation":"bar"}'::jsonb,
 null, 'shared', true);

-- The identity sequence has to be moved past the hand-assigned ids, or the
-- first user-created report collides with a built-in.
select setval(pg_get_serial_sequence('public.reports', 'id'),
              (select max(id) from public.reports));

--
-- `reports.updated_at` maintains itself, like every other user-editable row.
--
-- The library sorts on this column, so without the trigger a report edited
-- today would keep sitting wherever its creation date put it -- the list would
-- look sorted and be wrong, which is the failure mode `deals.updated_at` spent
-- a whole migration fixing.
--
create or replace trigger reports_set_updated_at
    before update on public.reports
    for each row execute function public.set_updated_at();
