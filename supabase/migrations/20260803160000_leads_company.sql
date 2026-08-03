--
-- Let a lead point at a company record, not just name one.
--
-- Both fields coexist on purpose:
--
--   company_id   - the lead was recognised as belonging to a company already
--                  in the CRM. Set by a rep, or by whoever qualifies the lead.
--   company_name - free text, as typed into a web form. The usual state of a
--                  fresh lead, before anybody has looked at it.
--
-- `convert_lead()` prefers the link when there is one, and falls back to
-- resolving (or creating) a company from the name.
--

alter table public.leads
    add column company_id bigint;

alter table public.leads
    add constraint leads_company_id_fkey foreign key (company_id) references public.companies(id) on delete set null;

create index if not exists leads_company_id_idx on public.leads using btree (company_id);

create or replace function public.convert_lead(
    lead_id bigint,
    create_deal boolean default false,
    deal_name text default null,
    deal_amount bigint default 0
) returns bigint
    language plpgsql
    set search_path to ''
    as $$
declare
  l public.leads%rowtype;
  v_company_id bigint;
  v_contact_id bigint;
  v_deal_id bigint;
begin
  select * into l from public.leads where id = lead_id for update;

  if not found then
    raise exception 'Lead % not found', lead_id using errcode = 'no_data_found';
  end if;

  if l.converted_at is not null then
    raise exception 'Lead % has already been converted', lead_id using errcode = 'unique_violation';
  end if;

  -- An explicit link wins: somebody already decided which company this is.
  v_company_id := l.company_id;

  -- Otherwise reuse an existing company with the same name before creating a
  -- new one: lead forms are the main source of duplicate company records.
  if v_company_id is null
     and nullif(btrim(coalesce(l.company_name, '')), '') is not null then
    select id into v_company_id
    from public.companies
    where lower(name) = lower(btrim(l.company_name))
    limit 1;

    if v_company_id is null then
      insert into public.companies (name, sales_id)
      values (btrim(l.company_name), l.sales_id)
      returning id into v_company_id;
    end if;
  end if;

  insert into public.contacts (
    first_name, last_name, title, company_id, sales_id, status, tags,
    email_jsonb, phone_jsonb, first_seen, last_seen, background
  )
  values (
    l.first_name,
    l.last_name,
    l.title,
    v_company_id,
    l.sales_id,
    'warm',
    coalesce(l.tags, '{}'::bigint[]),
    case when l.email is null then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('email', l.email::text, 'type', 'Work')) end,
    case when l.phone is null then '[]'::jsonb
         else jsonb_build_array(jsonb_build_object('number', l.phone, 'type', 'Work')) end,
    coalesce(l.created_at, now()),
    now(),
    l.notes
  )
  returning id into v_contact_id;

  if create_deal then
    insert into public.deals (name, company_id, contact_ids, stage, amount, sales_id, index)
    values (
      coalesce(
        nullif(btrim(coalesce(deal_name, '')), ''),
        btrim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, ''))
      ),
      v_company_id,
      array[v_contact_id],
      'opportunity',
      coalesce(deal_amount, 0),
      l.sales_id,
      0
    )
    returning id into v_deal_id;
  end if;

  update public.leads
  set converted_at = now(),
      status = 'converted',
      converted_contact_id = v_contact_id,
      converted_company_id = v_company_id,
      converted_deal_id = v_deal_id
  where id = lead_id;

  return v_contact_id;
end;
$$;
