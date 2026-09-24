--
-- Functions
-- This file declares all PL/pgSQL functions in the public schema.
--

CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;

-- Access helpers used by the RLS policies.
--
-- All three are SQL (inlinable by the planner), STABLE (evaluated once per
-- statement when wrapped in a scalar subquery inside a policy) and SECURITY
-- DEFINER (they read public.sales, which is itself protected by RLS, so a
-- plain invoker function would recurse).
--
-- Disabled users resolve to NULL / false: a banned account whose access token
-- has not expired yet still loses every row.

CREATE OR REPLACE FUNCTION "public"."current_sale_id"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id
  from public.sales
  where user_id = auth.uid()
    and disabled = false;
$$;

CREATE OR REPLACE FUNCTION "public"."current_sales_role"() RETURNS "public"."sales_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select role
  from public.sales
  where user_id = auth.uid()
    and disabled = false;
$$;

-- True for admins and sales managers: the users allowed to see every record
-- and to reassign ownership.
CREATE OR REPLACE FUNCTION "public"."can_manage_all"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.sales
    where user_id = auth.uid()
      and disabled = false
      and role in ('admin'::public.sales_role, 'manager'::public.sales_role)
  );
$$;

-- §7.3 access rule for tasks: true if you are an active owner/collaborator/
-- watcher, a member of an assigned team, the creator (of a task that is not
-- deleted), the owner of a linked record, or can_manage_all().
-- Deal visibility as a callable predicate, mirroring `can_see_task`.
--
-- The `deal-attachments` storage policy has to give the same answer the select
-- policy on public.deals gives, and a policy cannot join to a table the reader
-- may not read -- hence SECURITY DEFINER with a pinned search_path.
CREATE OR REPLACE FUNCTION "public"."can_see_deal"("p_deal_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select (select public.can_manage_all())
        or exists (
            select 1
              from public.deals d
             where d.id = p_deal_id
               and d.sales_id = (select public.current_sale_id())
        );
$$;

CREATE OR REPLACE FUNCTION "public"."can_see_task"("p_task_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select (select public.can_manage_all())
        or exists (select 1 from public.task_assignments a
                    where a.task_id = p_task_id and a.unassigned_at is null
                      and (a.sales_id = (select public.current_sale_id())
                           or a.team_id in (select team_id from public.team_members
                                             where sales_id = (select public.current_sale_id()))))
        or exists (select 1 from public.tasks t
                    where t.id = p_task_id and t.created_by = (select public.current_sale_id())
                      and t.deleted_at is null)
        or exists (select 1 from public.task_links l
                    where l.task_id = p_task_id and l.unlinked_at is null
                      and ((l.entity_type = 'contact'
                            and exists (select 1 from public.contacts c
                                        where c.id = l.entity_id
                                          and c.sales_id = (select public.current_sale_id())))
                           or (l.entity_type = 'lead'
                               and exists (select 1 from public.leads ld
                                           where ld.id = l.entity_id
                                             and ld.sales_id = (select public.current_sale_id())))
                           or (l.entity_type = 'company'
                               and exists (select 1 from public.companies co
                                           where co.id = l.entity_id
                                             and co.sales_id = (select public.current_sale_id())))
                           or (l.entity_type = 'deal'
                               and exists (select 1 from public.deals d
                                           where d.id = l.entity_id
                                             and d.sales_id = (select public.current_sale_id())))));
$$;

CREATE OR REPLACE FUNCTION "public"."get_avatar_for_email"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(extensions.digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from extensions.http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_domain_favicon"("domain_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare domain_status int8;

begin
    if exists (select from favicons_excluded_domains as fav where fav.domain = domain_name) then
        return null;
    end if;

    return concat(
        'https://favicon.show/',
        (regexp_matches(domain_name, '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)', 'i'))[1]
    );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_note_attachments_function_url"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."handle_company_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare company_logo text;

begin
    if new.logo is not null then
        return new;
    end if;

    company_logo = get_domain_favicon(new.website);
    if company_logo is null then
        return new;
    end if;

    new.logo = concat('{"src":"', company_logo, '","title":"Company favicon"}');
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_note_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  insert into public.sales (first_name, last_name, email, user_id, role)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then 'rep'::public.sales_role else 'admin'::public.sales_role end
  );
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.sales
    where user_id = auth.uid()
      and disabled = false
      and role = 'admin'::public.sales_role
  );
$$;

CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$$;

-- Turns a qualified lead into a company + contact, and optionally a deal.
--
-- SECURITY INVOKER on purpose: the caller must already be allowed to read the
-- lead and to create the records, so row level security decides who may
-- convert what. Runs as one statement, so a failure half-way leaves nothing
-- behind, and takes a row lock on the lead so two people clicking "convert"
-- at once cannot produce two contacts.
CREATE OR REPLACE FUNCTION "public"."convert_lead"("lead_id" bigint, "create_deal" boolean DEFAULT false, "deal_name" "text" DEFAULT NULL::"text", "deal_amount" bigint DEFAULT 0) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."lowercase_email_jsonb"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email_jsonb IS NOT NULL THEN
    NEW.email_jsonb = COALESCE((
      SELECT jsonb_agg(
        jsonb_set(elem, '{email}', to_jsonb(LOWER(elem->>'email')))
      )
      FROM jsonb_array_elements(NEW.email_jsonb) AS elem
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_sales_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sales_id IS NULL THEN
    NEW.sales_id := public.current_sale_id();
  END IF;
  RETURN NEW;
END;
$$;

--
-- Task module
--

-- Request context (§5.3): the request headers injected by PostgREST.
CREATE OR REPLACE FUNCTION "public"."request_context"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
    select jsonb_build_object(
        'ip', nullif(split_part(
                coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
                ',', 1), ''),
        'user_agent', current_setting('request.headers', true)::json ->> 'user-agent',
        'request_id', current_setting('request.headers', true)::json ->> 'x-request-id'
    );
$$;

-- Maps a changed column to its task event type. Returns NULL for columns that
-- do not carry their own event.
CREATE OR REPLACE FUNCTION "public"."event_type_for_field"("p_field" "text", "p_old" "public"."tasks", "p_new" "public"."tasks") RETURNS "public"."task_event_type"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
    case p_field
        when 'title'      then return 'task.title_changed';
        when 'description' then return 'task.description_changed';
        when 'due_date'   then return 'task.rescheduled';
        when 'start_at'   then return 'task.scheduled';
        when 'priority_id' then return 'task.priority_changed';
        when 'task_type_id' then return 'task.type_changed';
        when 'owner_sales_id' then return 'task.reassigned';
        when 'deleted_at' then return 'task.deleted';
        when 'status_id'  then return 'task.updated';
        else return null;
    end case;
end;
$$;

-- Keeps `task_events` supplied with monthly partitions (§5.1).
--
-- The table shipped with five hard-coded months and a comment claiming a
-- scheduled job created more. There was no such job, so the first insert after
-- the last bound would have raised `no partition of relation task_events found
-- for row` -- and since `tasks_audit` writes here AFTER INSERT OR UPDATE on
-- tasks, that aborts the task write itself. pg_cron calls this on the 1st.
--
-- Skips months that already exist, and warns rather than raising when a
-- partition cannot be attached, so one bad month does not take the rest of the
-- run down with it.
CREATE OR REPLACE FUNCTION "public"."ensure_task_events_partitions"("p_months_ahead" integer DEFAULT 3) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_month   date;
    v_name    text;
    v_created integer := 0;
    i         integer;
begin
    for i in 0..greatest(p_months_ahead, 0) loop
        v_month := (date_trunc('month', now()) + make_interval(months => i))::date;
        v_name  := 'task_events_' || to_char(v_month, 'YYYY_MM');

        if exists (select 1
                     from pg_catalog.pg_class c
                     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public'
                      and c.relname = v_name) then
            continue;
        end if;

        begin
            execute format(
                'create table public.%I partition of public.task_events '
                'for values from (%L) to (%L)',
                v_name,
                v_month,
                (v_month + interval '1 month')::date);
            v_created := v_created + 1;
        exception
            when others then
                -- The realistic cause is rows already sitting in the default
                -- partition for this month: Postgres refuses to attach a
                -- partition it would have to steal rows for. Those rows are
                -- safe where they are, so warn and keep going.
                raise warning
                    'task_events: could not create partition % (%). Rows for that month are probably in task_events_default and must be moved before the partition can be attached.',
                    v_name, sqlerrm;
        end;
    end loop;

    return v_created;
end;
$$;

-- Append-only event writer (§5.4). Computes the per-task sequence number and
-- captures the request context. SECURITY DEFINER so triggers can write rows on
-- behalf of the triggering statement; callers with `select` on task_events get
-- the row back.
CREATE OR REPLACE FUNCTION "public"."emit_task_event"("p_task_id" bigint, "p_event_type" "public"."task_event_type", "p_actor" bigint, "p_old_value" "jsonb", "p_new_value" "jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_note" "text" DEFAULT NULL::"text", "p_actor_kind" "text" DEFAULT 'user'::"text") RETURNS "public"."task_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_event public.task_events;
    v_seq   bigint;
    v_ctx   jsonb := public.request_context();
    v_field text;
begin
    select coalesce(max(seq), 0) + 1 into v_seq
    from public.task_events
    where task_id = p_task_id;

    -- `field` is the changed column. The trigger passes a single-key payload
    -- ({field: value}); a full-row snapshot (task.created) has no single key.
    if jsonb_typeof(p_new_value) = 'object'
       and jsonb_array_length((select coalesce(jsonb_agg(k), '[]'::jsonb)
                               from jsonb_object_keys(p_new_value) k)) = 1 then
        v_field := (select k from jsonb_object_keys(p_new_value) k limit 1);
    end if;

    insert into public.task_events (
        task_id, event_type, occurred_at,
        actor_sales_id, actor_kind,
        field, old_value, new_value, metadata, note,
        ip_address, user_agent, request_id,
        seq
    )
    values (
        p_task_id, p_event_type, clock_timestamp(),
        p_actor, p_actor_kind,
        v_field,
        p_old_value, p_new_value, p_metadata, p_note,
        nullif(v_ctx ->> 'ip', '')::inet,
        v_ctx ->> 'user_agent',
        nullif(v_ctx ->> 'request_id', '')::uuid,
        v_seq
    )
    returning * into v_event;

    return v_event;
end;
$$;

-- AFTER INSERT/UPDATE on tasks: emits the task.created snapshot and one event
-- per watched field change (§5.4).
CREATE OR REPLACE FUNCTION "public"."log_task_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_actor  bigint := public.current_sale_id();
    v_ctx    jsonb  := public.request_context();
    v_field  text;
    v_type   public.task_event_type;
    v_watched text[] := array['title', 'description', 'due_date', 'start_at', 'priority_id',
                              'status_id', 'task_type_id', 'owner_sales_id', 'deleted_at'];
begin
    if tg_op = 'INSERT' then
        -- Do not snapshot `search_tsv` (generated) nor legacy shims: the
        -- snapshot is the durable record of the new task.
        perform public.emit_task_event(
            new.id, 'task.created', v_actor, null,
            to_jsonb(new) - 'search_tsv',
            jsonb_build_object('source', new.source),
            null,
            case when v_actor is null then 'system' else 'user' end
        );
        return new;
    end if;

    foreach v_field in array v_watched loop
        if to_jsonb(old) -> v_field is distinct from to_jsonb(new) -> v_field then
            v_type := public.event_type_for_field(v_field, old, new);
            if v_type is not null then
                perform public.emit_task_event(
                    new.id,
                    v_type,
                    v_actor,
                    jsonb_build_object(v_field, to_jsonb(old) -> v_field),
                    jsonb_build_object(v_field, to_jsonb(new) -> v_field),
                    case when v_field = 'due_date' then jsonb_build_object(
                             'delta_seconds', extract(epoch from (new.due_date - old.due_date)),
                             'was_overdue', old.due_date < now())
                         when v_field = 'deleted_at' then jsonb_build_object(
                             'reason', 'deleted')
                         else '{}'::jsonb end,
                    null,
                    case when v_actor is null then 'system' else 'user' end
                );
            end if;
        end if;
    end loop;
    return new;
end;
$$;

-- Counter maintenance: reschedule/reassign counts, blocked clock (§4.2).
CREATE OR REPLACE FUNCTION "public"."tasks_maintain_counters"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
    -- reschedule_count: every due-date move, regardless of which column the
    -- caller used (the legacy `due_date` and the shim are the same physical
    -- column here).
    if tg_op = 'UPDATE' and old.due_date is distinct from new.due_date then
        new.reschedule_count := old.reschedule_count + 1;
    end if;

    -- reassign_count: every owner change.
    if tg_op = 'UPDATE' and old.owner_sales_id is distinct from new.owner_sales_id then
        new.reassign_count := old.reassign_count + 1;
    end if;

    -- blocked_seconds clock (§10.2): entering `blocked` records the instant,
    -- leaving it accumulates the elapsed time. Phase 1 deferred this to a
    -- scheduled job that was never written, so the counter stayed at zero;
    -- doing the arithmetic on the way out is exact and needs no job.
    if tg_op = 'UPDATE' and old.status_id is distinct from new.status_id then
        if not exists (select 1 from public.task_statuses s
                       where s.id = old.status_id and s.key = 'blocked')
           and exists (select 1 from public.task_statuses s
                       where s.id = new.status_id and s.key = 'blocked') then
            new.blocked_since := now();
        elsif exists (select 1 from public.task_statuses s
                      where s.id = old.status_id and s.key = 'blocked')
             and not exists (select 1 from public.task_statuses s
                             where s.id = new.status_id and s.key = 'blocked') then
            new.blocked_seconds := old.blocked_seconds
                + greatest(0, extract(epoch from (now() - coalesce(old.blocked_since, now())))::bigint);
            new.blocked_since := null;
        end if;
    end if;

    return new;
end;
$$;

-- The event stream is append-only (§5.5).
CREATE OR REPLACE FUNCTION "public"."reject_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
    raise exception 'task_events is append-only (attempted %)', tg_op
        using errcode = 'insufficient_privilege';
end;
$$;

-- BEFORE INSERT on tasks: fills the new NOT NULL columns from the legacy shims
-- (text/type/done_date/sales_id) and the current user, so the not-yet-migrated
-- frontend keeps working.
CREATE OR REPLACE FUNCTION "public"."tasks_defaults_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
    -- title/description split (§3.3): `title` is the whole text until the
    -- frontend sends both columns.
    if new.title is null then
        new.title := left(coalesce(nullif(new.text, ''), '(sin título)'), 120);
    end if;

    if new.task_type_id is null then
        select id into new.task_type_id from public.task_types
        where key = coalesce(nullif(new.type, ''), 'none');
    end if;

    if new.status_id is null then
        select id into new.status_id from public.task_statuses
        where key = case when new.done_date is null then 'pending' else 'completed' end;
    end if;

    if new.priority_id is null then
        select id into new.priority_id from public.task_priorities where key = 'normal';
    end if;

    if new.owner_sales_id is null then
        new.owner_sales_id := coalesce(new.sales_id, (select public.current_sale_id()));
    end if;

    if new.created_by is null then
        new.created_by := coalesce(new.sales_id, (select public.current_sale_id()));
    end if;

    if new.completed_at is null and new.done_date is not null then
        new.completed_at := new.done_date;
        new.completed_by := coalesce(new.created_by, (select public.current_sale_id()));
    end if;

    return new;
end;
$$;

-- BEFORE INSERT/UPDATE on tasks: keeps the legacy `type`/`done_date` shims in
-- sync with the new FK columns (two-way).
CREATE OR REPLACE FUNCTION "public"."tasks_keep_legacy_shims"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_status_key text;
begin
    -- type <-> task_type_id
    if new.type is distinct from old.type or old.task_type_id is null then
        if new.type is not null and new.type <> '' then
            select id into new.task_type_id from public.task_types where key = new.type;
        end if;
    elsif new.task_type_id is distinct from old.task_type_id then
        select key into new.type from public.task_types where id = new.task_type_id;
    end if;

    -- status <-> done_date (read shim only; real completion lives in status_id)
    select key into v_status_key from public.task_statuses where id = new.status_id;
    if v_status_key = 'completed' and new.done_date is null then
        new.done_date := coalesce(new.completed_at, now());
    elsif v_status_key <> 'completed' then
        new.done_date := null;
    end if;

    return new;
end;
$$;

-- AFTER INSERT on tasks: seeds the owner assignment and the primary contact
-- link from the legacy columns. Idempotent, so a dataProvider that sends the
-- rows explicitly does not double them up.
CREATE OR REPLACE FUNCTION "public"."tasks_seed_assignments_links"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
    insert into public.task_assignments (task_id, sales_id, role, assigned_by, assigned_at)
    select new.id, new.owner_sales_id, 'owner', new.created_by, new.created_at
    where new.owner_sales_id is not null
      and not exists (select 1 from public.task_assignments a
                      where a.task_id = new.id and a.role = 'owner' and a.unassigned_at is null);

    insert into public.task_links (task_id, entity_type, entity_id, is_primary, linked_by, entity_label)
    select new.id, 'contact', new.contact_id, true, new.created_by,
           nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '')
    from public.contacts c
    where new.contact_id is not null and c.id = new.contact_id
      and not exists (select 1 from public.task_links l
                      where l.task_id = new.id and l.unlinked_at is null);

    return new;
end;
$$;

-- BEFORE DELETE on tasks: converts a hard delete into a soft delete (§17.1).
-- The follow-up UPDATE fires `tasks_audit`, which emits `task.deleted`; RETURN
-- NULL suppresses the actual hard delete.
create or replace function public.tasks_soft_delete() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    -- The retention path, and only it, may actually remove the row (§4.4).
    if coalesce(current_setting('app.purge_tasks', true), '') = 'on' then
        return old;
    end if;

    update public.tasks
    set deleted_at = now(),
        deleted_by = coalesce((select public.current_sale_id()), deleted_by)
    where id = old.id;
    return null;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."tasks_status_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
    if old.status_id is distinct from new.status_id
       and coalesce(current_setting('app.task_transition_to', true), '') = '' then
        raise exception 'status changes must go through public.transition_task()'
            using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

-- The single status-change write path (§4.5): validates the transition against
-- `task_transitions`, enforces capabilities (§17.1), updates the task columns,
-- and emits the transition's own event.
CREATE OR REPLACE FUNCTION "public"."transition_task"("p_task_id" bigint, "p_to_status" "text", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."tasks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_task      public.tasks;
    v_from      text;
    v_actor     bigint := public.current_sale_id();
    v_status_id bigint;
    v_event     public.task_event_type;
    v_meta      jsonb := p_metadata;
begin
    select * into v_task from public.tasks where id = p_task_id for update;
    if not found then
        raise exception 'task % not found or not visible', p_task_id
            using errcode = 'no_data_found';
    end if;

    select key into v_from from public.task_statuses where id = v_task.status_id;

    if not exists (select 1 from public.task_transitions
                   where from_status_key = v_from and to_status_key = p_to_status) then
        raise exception 'illegal transition % -> %', v_from, p_to_status
            using errcode = 'check_violation';
    end if;

    if p_to_status in ('canceled') and coalesce(p_reason, '') = '' then
        raise exception 'a reason is required to cancel a task'
            using errcode = 'check_violation';
    end if;

    -- Capabilities (§17.1): owner / collaborator / manager may transition.
    -- Cancellation additionally requires the owner (or a manager), never a
    -- mere collaborator. `can_manage_all()` covers admins and managers.
    if not (select public.can_manage_all())
       and not exists (select 1 from public.task_assignments a
                       where a.task_id = v_task.id and a.unassigned_at is null
                         and a.sales_id = v_actor
                         and a.role in ('owner', 'collaborator'))
       and v_task.created_by <> v_actor then
        raise exception 'no permission to transition task %', p_task_id
            using errcode = 'insufficient_privilege';
    end if;

    if p_to_status = 'canceled'
       and not (select public.can_manage_all())
       and not exists (select 1 from public.task_assignments a
                       where a.task_id = v_task.id and a.unassigned_at is null
                         and a.sales_id = v_actor and a.role = 'owner')
       and v_task.created_by <> v_actor then
        raise exception 'only the owner or a manager may cancel task %', p_task_id
            using errcode = 'insufficient_privilege';
    end if;

    select id into v_status_id from public.task_statuses where key = p_to_status;

    -- Which event does this transition emit?
    case p_to_status
        when 'completed'   then v_event := 'task.completed';
        when 'canceled'    then v_event := 'task.canceled';
        when 'archived'    then v_event := 'task.archived';
        when 'blocked'     then v_event := 'task.blocked';
        when 'waiting'     then v_event := 'task.waiting';
        when 'rescheduled' then v_event := 'task.rescheduled';
        when 'scheduled'   then v_event := 'task.scheduled';
        else
            if v_from = 'completed' or v_from = 'canceled' then
                v_event := 'task.reopened';
            elsif v_from = 'waiting' then
                v_event := 'task.resumed';
            elsif v_from = 'blocked' then
                v_event := 'task.unblocked';
            else
                v_event := 'task.started';
            end if;
    end case;

    if coalesce(p_reason, '') <> '' then
        v_meta := v_meta || jsonb_build_object('reason', p_reason);
    end if;

    -- The row update. `tasks_keep_legacy_shims` keeps `done_date` in sync with
    -- the completed state, `tasks_maintain_counters` bumps the counters, and
    -- `tasks_audit` emits per-field events. The GUC tells the guard trigger
    -- this status change is legitimate.
    perform set_config('app.task_transition_to', p_to_status, true);

    update public.tasks set
        status_id      = v_status_id,
        completed_at   = case when p_to_status = 'completed' then now() else null end,
        completed_by   = case when p_to_status = 'completed' then v_actor else null end,
        canceled_at    = case when p_to_status = 'canceled' then now() else null end,
        cancel_reason  = case when p_to_status = 'canceled' then p_reason else null end,
        start_at       = case when p_to_status = 'in_progress'
                               and v_task.start_at is null then now()
                          else v_task.start_at end,
        archived_at    = case when p_to_status = 'archived' then now()
                          when v_from = 'archived' then null
                          else v_task.archived_at end
    where id = v_task.id
    returning * into v_task;

    perform set_config('app.task_transition_to', '', false);

    -- The transition's own event, with the reason and the from/to keys.
    perform public.emit_task_event(
        v_task.id,
        v_event,
        v_actor,
        jsonb_build_object('status_id', to_jsonb((select id from public.task_statuses where key = v_from))),
        jsonb_build_object('status_id', to_jsonb(v_status_id)),
        v_meta || jsonb_build_object(
            'from_status', v_from,
            'to_status',   p_to_status
        ),
        p_reason,
        case when v_actor is null then 'system' else 'user' end
    );

    return v_task;
end;
$$;

-- BEFORE DELETE on contacts/leads/companies/deals: closes the record's active
-- task links (emitting `link.removed`) and nulls the legacy contact shim.
CREATE OR REPLACE FUNCTION "public"."close_task_links_for_entity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_entity_type public.task_entity := tg_argv[0]::public.task_entity;
    v_actor       bigint             := (select public.current_sale_id());
    v_link        record;
begin
    -- Keep the legacy shim coherent: when the linked contact is deleted, the
    -- old frontend must no longer see a contact_id on the task.
    if v_entity_type = 'contact' then
        update public.tasks set contact_id = null where contact_id = old.id;
    end if;

    -- Close every active link to the record being deleted, emitting one
    -- `link.removed` event per affected task.
    for v_link in
        select id, task_id from public.task_links
        where entity_type = v_entity_type
          and entity_id = old.id
          and unlinked_at is null
    loop
        update public.task_links
        set unlinked_at = now()
        where id = v_link.id;

        perform public.emit_task_event(
            v_link.task_id,
            'link.removed',
            v_actor,
            jsonb_build_object(
                'entity_type', v_entity_type,
                'entity_id',   old.id
            ),
            null,
            jsonb_build_object(
                'entity_type', v_entity_type,
                'reason',      'parent record deleted'
            ),
            null,
            case when v_actor is null then 'system' else 'user' end
        );
    end loop;

    return old;
end;
$$;

--
-- Task module — attaching a task to any record (proposal §14.2).
--
-- A task can hang off a contact, a lead, a company or a deal. Creating that
-- link from the client would need three statements (demote the current primary,
-- insert the new row, emit the event) with no way to keep them consistent, and
-- `linked_by` would be whatever the client claimed. This function does the lot
-- server-side and resolves the actor from the session, exactly like
-- `transition_task()` does for status.
--
-- Idempotent: re-linking a record that is already attached promotes it instead
-- of creating a duplicate, so a double click cannot corrupt the graph.
--
create or replace function public.link_task_to_entity(
    p_task_id     bigint,
    p_entity_type public.task_entity,
    p_entity_id   bigint,
    p_label       text default null,
    p_primary     boolean default true
) returns public.task_links
    language plpgsql security invoker
    set search_path to ''
as $$
declare
    v_actor bigint := public.current_sale_id();
    v_link  public.task_links;
begin
    if not public.can_see_task(p_task_id) then
        raise exception 'no permission to link task %', p_task_id
            using errcode = 'insufficient_privilege';
    end if;

    -- Only one primary link at a time (enforced by task_links_single_primary).
    if coalesce(p_primary, false) then
        update public.task_links
           set is_primary = false
         where task_id = p_task_id
           and unlinked_at is null
           and is_primary
           and not (entity_type = p_entity_type and entity_id = p_entity_id);
    end if;

    insert into public.task_links (
        task_id, entity_type, entity_id, is_primary, linked_by, entity_label
    )
    values (
        p_task_id, p_entity_type, p_entity_id,
        coalesce(p_primary, false), v_actor, p_label
    )
    on conflict do nothing
    returning * into v_link;

    if v_link.id is null then
        -- Already linked: promote and refresh the label snapshot instead.
        update public.task_links
           set is_primary   = coalesce(p_primary, is_primary),
               entity_label = coalesce(p_label, entity_label)
         where task_id = p_task_id
           and entity_type = p_entity_type
           and entity_id = p_entity_id
           and unlinked_at is null
        returning * into v_link;
    else
        perform public.emit_task_event(
            p_task_id,
            'link.added',
            v_actor,
            null,
            jsonb_build_object(
                'entity_type', p_entity_type,
                'entity_id', p_entity_id
            ),
            jsonb_build_object('is_primary', coalesce(p_primary, false)),
            null,
            case when v_actor is null then 'system' else 'user' end
        );
    end if;

    return v_link;
end;
$$;

--
-- Task module — attribute a soft delete to whoever performed it (§5, §17.1).
--
-- `tasks_soft_delete` converts a real DELETE into an update and stamps
-- `deleted_by` on the way. But a real DELETE returns no rows through PostgREST
-- (the BEFORE trigger suppresses it), so the client issues the soft delete as
-- an explicit UPDATE instead — and that path had nobody filling `deleted_by`.
--
-- Without this, "who deleted this task?" is answerable from `task_events` but
-- not from the row itself, and the two could disagree. Stamping it in a trigger
-- means every write path agrees, whichever one the client used.
--
create or replace function public.tasks_stamp_deleted_by() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if old.deleted_at is null
       and new.deleted_at is not null
       and new.deleted_by is null then
        new.deleted_by := (select public.current_sale_id());
    end if;

    -- Restoring a task clears the attribution: it is no longer deleted, and the
    -- history keeps the record of both events.
    if new.deleted_at is null then
        new.deleted_by := null;
    end if;

    return new;
end;
$$;

--
-- Task module — collaboration (proposal §8).
--

--
-- Resolve the @mentions written in a comment body (§8.2).
--
-- Mentions are parsed here, server-side, and never taken from a client-supplied
-- list: the body is the only thing a reader can see, so anything derived from
-- something else could claim a mention that is not in the text (or hide one
-- that is). The editor writes an unambiguous token, `@[Name](sales:12)`, so
-- resolution is exact instead of guessing at a display name that two people
-- may share.
--
-- Idempotent: re-running it after an edit adds the new mentions, drops the ones
-- the author removed, and leaves the untouched ones (with their `read_at`)
-- alone.
--
create or replace function public.sync_comment_mentions(
    p_comment_id bigint,
    p_task_id    bigint,
    p_body       text,
    p_actor      bigint
) returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_sales_ids bigint[];
    v_team_ids  bigint[];
    v_inserted  bigint[];
    v_new_id    bigint;
begin
    select coalesce(array_agg(distinct m[1]::bigint), '{}')
      into v_sales_ids
      from regexp_matches(coalesce(p_body, ''), '\(sales:(\d+)\)', 'g') m;

    select coalesce(array_agg(distinct m[1]::bigint), '{}')
      into v_team_ids
      from regexp_matches(coalesce(p_body, ''), '\(team:(\d+)\)', 'g') m;

    -- Mentions the author removed from the body are no longer mentions.
    delete from public.task_comment_mentions
     where comment_id = p_comment_id
       and (
            (mentioned_sales_id is not null
             and not (mentioned_sales_id = any (v_sales_ids)))
         or (mentioned_team_id is not null
             and not (mentioned_team_id = any (v_team_ids)))
       );

    -- Only real, active people: a stale id in the body must not create an
    -- inbox row nobody can ever read. The insert is drained into an array
    -- before any event is emitted, so the emitting loop never runs while the
    -- insert that feeds it is still in flight.
    with inserted as (
        insert into public.task_comment_mentions (comment_id, mentioned_sales_id)
        select p_comment_id, s.id
          from public.sales s
         where s.id = any (v_sales_ids)
           and s.disabled = false
        on conflict do nothing
        returning mentioned_sales_id
    )
    select coalesce(array_agg(mentioned_sales_id), '{}')
      into v_inserted from inserted;

    foreach v_new_id in array v_inserted loop
        perform public.emit_task_event(
            p_task_id, 'mention.created', p_actor, null, null,
            jsonb_build_object('comment_id', p_comment_id,
                               'mentioned_sales_id', v_new_id),
            null,
            case when p_actor is null then 'system' else 'user' end
        );
    end loop;

    with inserted as (
        insert into public.task_comment_mentions (comment_id, mentioned_team_id)
        select p_comment_id, t.id
          from public.teams t
         where t.id = any (v_team_ids)
        on conflict do nothing
        returning mentioned_team_id
    )
    select coalesce(array_agg(mentioned_team_id), '{}')
      into v_inserted from inserted;

    foreach v_new_id in array v_inserted loop
        perform public.emit_task_event(
            p_task_id, 'mention.created', p_actor, null, null,
            jsonb_build_object('comment_id', p_comment_id,
                               'mentioned_team_id', v_new_id),
            null,
            case when p_actor is null then 'system' else 'user' end
        );
    end loop;
end;
$$;

--
-- BEFORE INSERT on task_comments: authorship and thread depth.
--
-- The author is resolved from the session exactly like `set_sales_id_default`
-- does elsewhere, so a client cannot post as someone else. A reply to a reply
-- is re-parented to the thread root rather than rejected: one level of nesting
-- is a rendering decision (§8.2), and dropping the user's comment to enforce it
-- would be a worse outcome than losing the indentation.
--
create or replace function public.task_comments_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_grandparent bigint;
    v_parent_task bigint;
begin
    new.author_id := coalesce((select public.current_sale_id()), new.author_id);

    if new.parent_id is not null then
        select parent_id, task_id into v_grandparent, v_parent_task
          from public.task_comments
         where id = new.parent_id;

        if v_parent_task is distinct from new.task_id then
            raise exception 'comment % belongs to another task', new.parent_id
                using errcode = 'check_violation';
        end if;

        new.parent_id := coalesce(v_grandparent, new.parent_id);
    end if;

    return new;
end;
$$;

--
-- AFTER INSERT on task_comments: counter, event, mentions.
--
create or replace function public.task_comments_after_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    update public.tasks
       set comment_count = comment_count + 1
     where id = new.task_id;

    -- The body goes in `note`, not in `new_value`: `emit_task_event` reads a
    -- single-key `new_value` as a field-level diff, and a comment is not one.
    perform public.emit_task_event(
        new.task_id, 'comment.created', new.author_id, null, null,
        jsonb_build_object('comment_id', new.id,
                           'parent_id', new.parent_id,
                           'is_private', new.is_private),
        left(new.body, 500),
        case when new.author_id is null then 'system' else 'user' end
    );

    perform public.sync_comment_mentions(new.id, new.task_id, new.body, new.author_id);

    return new;
end;
$$;

--
-- BEFORE UPDATE on task_comments: record the previous body before it is lost.
--
-- The revision is written from the trigger rather than the client so that no
-- write path can edit a comment without leaving the old text behind. `edited_at`
-- and `edit_count` are stamped here too, so "editado ×2" cannot be faked.
--
create or replace function public.task_comments_before_update() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
begin
    if new.body is distinct from old.body then
        insert into public.task_comment_revisions (comment_id, body, edited_by, revision)
        values (old.id, old.body, coalesce(v_actor, old.author_id), old.edit_count + 1);

        new.edit_count := old.edit_count + 1;
        new.edited_at  := now();
    end if;

    if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_by := coalesce(v_actor, new.deleted_by);
    end if;

    -- Authorship and the creation date are not editable, whatever the client
    -- sends: they are the two facts the whole audit trail hangs off.
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    new.task_id    := old.task_id;

    return new;
end;
$$;

--
-- AFTER UPDATE on task_comments: events, counter, mention re-parse.
--
create or replace function public.task_comments_after_update() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
begin
    if old.deleted_at is null and new.deleted_at is not null then
        update public.tasks
           set comment_count = greatest(comment_count - 1, 0)
         where id = new.task_id;

        perform public.emit_task_event(
            new.task_id, 'comment.deleted', coalesce(v_actor, new.deleted_by),
            null, null,
            jsonb_build_object('comment_id', new.id),
            null,
            case when coalesce(v_actor, new.deleted_by) is null then 'system' else 'user' end
        );

    elsif old.deleted_at is not null and new.deleted_at is null then
        update public.tasks
           set comment_count = comment_count + 1
         where id = new.task_id;
    end if;

    if new.body is distinct from old.body then
        -- A single-key old/new pair renders as a before/after diff in the
        -- history tab, which is exactly what "ver cambios" needs to show.
        perform public.emit_task_event(
            new.task_id, 'comment.edited', coalesce(v_actor, new.author_id),
            jsonb_build_object('body', old.body),
            jsonb_build_object('body', new.body),
            jsonb_build_object('comment_id', new.id, 'revision', new.edit_count),
            null,
            case when v_actor is null then 'system' else 'user' end
        );

        perform public.sync_comment_mentions(
            new.id, new.task_id, new.body, coalesce(v_actor, new.author_id));
    end if;

    return new;
end;
$$;

--
-- Reactions (§8.2): a 👍 is an "acknowledged" signal, so it belongs in the
-- audit trail like any other acknowledgement.
--
create or replace function public.task_comment_reactions_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_row     public.task_comment_reactions := coalesce(new, old);
    v_task_id bigint;
    v_actor   bigint := (select public.current_sale_id());
begin
    select task_id into v_task_id
      from public.task_comments where id = v_row.comment_id;

    -- The cast is required: a CASE yields `text`, and unlike a bare literal
    -- `text` does not implicitly coerce to the enum parameter.
    perform public.emit_task_event(
        v_task_id,
        (case when tg_op = 'INSERT' then 'comment.reaction_added'
              else 'comment.reaction_removed' end)::public.task_event_type,
        coalesce(v_actor, v_row.sales_id),
        null, null,
        jsonb_build_object('comment_id', v_row.comment_id, 'emoji', v_row.emoji),
        null,
        case when coalesce(v_actor, v_row.sales_id) is null then 'system' else 'user' end
    );

    return v_row;
end;
$$;

--
-- BEFORE INSERT on task_comment_reactions: a reaction is always your own.
--
create or replace function public.task_comment_reactions_set_sale() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    new.sales_id := coalesce((select public.current_sale_id()), new.sales_id);
    return new;
end;
$$;

--
-- Task module — attachments (proposal §3.2, §8.2).
--

--
-- Recomputes `tasks.attachment_count` from the live rows.
--
-- Recomputed rather than incremented, for the same reason as the checklist
-- counters: a list view reads the counter instead of the child table (§3.4),
-- and a counter that can drift from the rows it summarises is worse than no
-- counter at all. A task has a handful of files, so the aggregate is cheap.
--
create or replace function public.refresh_attachment_counter(p_task_id bigint)
    returns void
    language plpgsql security definer
    set search_path to ''
as $$
begin
    update public.tasks t
       set attachment_count = a.total
      from (
        select count(*) as total
          from public.task_attachments
         where task_id = p_task_id
           and deleted_at is null
      ) a
     where t.id = p_task_id
       and t.attachment_count is distinct from a.total;
end;
$$;

--
-- BEFORE INSERT on task_attachments: authorship and path integrity.
--
-- The path check is not cosmetic. The storage policy grants a download by
-- reading the task id out of the object's first folder, so a row pointing at
-- `<other_task>/secret.pdf` would be an audit record that describes a file
-- nobody can open — or worse, a file belonging to a task the reader cannot
-- see. Row and object must agree on which task owns the bytes.
--
create or replace function public.task_attachments_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_comment_task bigint;
begin
    new.uploaded_by := coalesce((select public.current_sale_id()), new.uploaded_by);

    if new.storage_path !~ ('^' || new.task_id::text || '/.+') then
        raise exception 'attachment path % is not under task %',
            new.storage_path, new.task_id
            using errcode = 'check_violation';
    end if;

    if new.comment_id is not null then
        select task_id into v_comment_task
          from public.task_comments where id = new.comment_id;

        if v_comment_task is distinct from new.task_id then
            raise exception 'comment % belongs to another task', new.comment_id
                using errcode = 'check_violation';
        end if;
    end if;

    return new;
end;
$$;

--
-- BEFORE UPDATE on task_attachments: soft-delete attribution, and the facts
-- that must not move. Everything a file is — which task, which object, who
-- uploaded it and when — is fixed at insert; the only legitimate update is
-- the soft delete.
--
create or replace function public.task_attachments_before_update() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
begin
    if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_by := coalesce(v_actor, new.deleted_by);
    elsif new.deleted_at is null then
        new.deleted_by := null;
    end if;

    new.task_id      := old.task_id;
    new.comment_id   := old.comment_id;
    new.storage_path := old.storage_path;
    new.uploaded_by  := old.uploaded_by;
    new.uploaded_at  := old.uploaded_at;
    new.checksum     := old.checksum;

    return new;
end;
$$;

--
-- AFTER INSERT OR UPDATE on task_attachments: counter and event stream.
--
create or replace function public.task_attachments_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
    v_type  public.task_event_type;
begin
    if tg_op = 'INSERT' then
        v_type := 'attachment.added';
    elsif old.deleted_at is null and new.deleted_at is not null then
        v_type := 'attachment.removed';
    elsif old.deleted_at is not null and new.deleted_at is null then
        v_type := 'attachment.added';
    else
        -- A rename is the only other editable field, and it is not worth a
        -- line in a timeline that already has to hide noise to stay readable.
        perform public.refresh_attachment_counter(new.task_id);
        return new;
    end if;

    perform public.emit_task_event(
        new.task_id, v_type,
        coalesce(v_actor, new.uploaded_by), null, null,
        jsonb_build_object('attachment_id', new.id,
                           'comment_id', new.comment_id,
                           'file_name', new.file_name,
                           'mime_type', new.mime_type,
                           'size_bytes', new.size_bytes),
        null,
        case when coalesce(v_actor, new.uploaded_by) is null
             then 'system' else 'user' end
    );

    perform public.refresh_attachment_counter(new.task_id);

    return new;
end;
$$;

--
-- Task module — checklists (proposal §11).
--

--
-- Recomputes `tasks.checklist_total` / `checklist_done` from the items.
--
-- Recomputed rather than incremented: the counters exist so a list view can
-- render "3/7" without touching the child table (§3.4), and a counter that can
-- drift from the rows it summarises is worse than no counter at all. A
-- checklist is a handful of rows, so the aggregate is cheap.
--
create or replace function public.refresh_checklist_counters(p_task_id bigint)
    returns void
    language plpgsql security definer
    set search_path to ''
as $$
begin
    update public.tasks t
       set checklist_total = c.total,
           checklist_done  = c.done
      from (
        select count(*) as total,
               count(*) filter (where is_done) as done
          from public.task_checklist_items
         where task_id = p_task_id
           and deleted_at is null
      ) c
     where t.id = p_task_id
       and (t.checklist_total, t.checklist_done) is distinct from (c.total, c.done);
end;
$$;

--
-- BEFORE INSERT on task_checklist_items: authorship and default ordering.
--
-- The position defaults to "after everything else", so the common path — typing
-- steps one after another — never has to compute a rank client-side.
--
create or replace function public.task_checklist_items_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    new.created_by := coalesce((select public.current_sale_id()), new.created_by);

    if new.position is null then
        select coalesce(max(position), 0) + 1 into new.position
          from public.task_checklist_items
         where task_id = new.task_id
           and deleted_at is null;
    end if;

    -- An item created already ticked still needs its attribution.
    if new.is_done and new.done_at is null then
        new.done_at := now();
        new.done_by := coalesce(new.done_by, new.created_by);
    end if;

    return new;
end;
$$;

--
-- BEFORE UPDATE on task_checklist_items: stamp (and clear) the completion.
--
-- Ticking the box is what records who did it and when — the client never sends
-- `done_by`, so it cannot be claimed on somebody else's behalf. Un-ticking
-- clears the stamp on the row, and the event stream keeps both facts.
--
create or replace function public.task_checklist_items_before_update() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
begin
    if new.is_done is distinct from old.is_done then
        if new.is_done then
            new.done_at := now();
            new.done_by := coalesce(v_actor, old.created_by);
        else
            new.done_at := null;
            new.done_by := null;
        end if;
    end if;

    new.task_id    := old.task_id;
    new.created_at := old.created_at;

    return new;
end;
$$;

--
-- AFTER INSERT/UPDATE on task_checklist_items: events and counters.
--
-- Checklist items emit into the SAME `task_events` stream as everything else
-- (§11.3): one stream means one timeline, one retention policy, one
-- immutability guarantee — no second history table to keep in step.
--
create or replace function public.task_checklist_items_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
    v_type  public.task_event_type;
begin
    if tg_op = 'INSERT' then
        v_type := 'checklist.item_added';
    elsif old.deleted_at is null and new.deleted_at is not null then
        v_type := 'checklist.item_removed';
    elsif new.is_done is distinct from old.is_done then
        v_type := case when new.is_done then 'checklist.item_completed'
                       else 'checklist.item_reopened' end;
    elsif new.position is distinct from old.position then
        v_type := 'checklist.item_reordered';
    elsif new.label is distinct from old.label then
        -- A relabelled step is a content change, recorded as an add of the new
        -- text; there is no dedicated event type for it in the enum (§5.2).
        v_type := 'checklist.item_added';
    else
        -- Nothing worth a line in the timeline (an assignee or due-date tweak).
        perform public.refresh_checklist_counters(new.task_id);
        return new;
    end if;

    perform public.emit_task_event(
        new.task_id, v_type, coalesce(v_actor, new.created_by), null, null,
        jsonb_build_object('item_id', new.id, 'label', new.label),
        null,
        case when coalesce(v_actor, new.created_by) is null then 'system' else 'user' end
    );

    perform public.refresh_checklist_counters(new.task_id);

    return new;
end;
$$;

--
-- Task module — dependencies (proposal §10).
--

--
-- Moves a task's status without a user behind it (auto-block / auto-unblock).
--
-- `transition_task()` is the path for a person: it checks that the caller may
-- act on the task. A blocker clearing is not a person's action — the owner of
-- the blocked task often cannot even see the blocker — so it gets its own
-- path, attributed to the system rather than to whoever happened to complete
-- the other task. The status guard's GUC is set here for the same reason it
-- exists: no status change may bypass the state machine (§4.5).
--
create or replace function public.set_task_status_system(
    p_task_id    bigint,
    p_to_status  text,
    p_event_type public.task_event_type,
    p_metadata   jsonb default '{}'::jsonb
) returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_from      text;
    v_status_id bigint;
begin
    select s.key into v_from
      from public.tasks t join public.task_statuses s on s.id = t.status_id
     where t.id = p_task_id;

    select id into v_status_id
      from public.task_statuses where key = p_to_status;

    if v_status_id is null or v_from is null or v_from = p_to_status then
        return;
    end if;

    perform set_config('app.task_transition_to', p_to_status, true);
    update public.tasks set status_id = v_status_id where id = p_task_id;
    perform set_config('app.task_transition_to', '', false);

    perform public.emit_task_event(
        p_task_id, p_event_type, null, null, null,
        p_metadata || jsonb_build_object('from_status', v_from,
                                         'to_status', p_to_status),
        null,
        'system'
    );
end;
$$;

--
-- True when a task still has at least one unsatisfied blocker (§10.2).
--
create or replace function public.task_has_open_blockers(p_task_id bigint)
    returns boolean
    language sql stable security definer
    set search_path to ''
as $$
    select exists (
        select 1
          from public.task_dependencies d
          join public.tasks t on t.id = d.source_task_id
          join public.task_statuses s on s.id = t.status_id
         where d.target_task_id = p_task_id
           and d.kind = 'blocks'
           and d.removed_at is null
           and t.deleted_at is null
           and s.is_open
    );
$$;

--
-- Rejects a dependency that would close a cycle (§10.3).
--
-- Depth-capped so a pathological graph cannot hold the table: 50 hops is far
-- beyond any real chain of sales work, and a cycle within that depth is
-- exactly what this is meant to catch.
--
create or replace function public.assert_no_dependency_cycle() returns trigger
    language plpgsql
    set search_path to ''
as $$
begin
    if new.kind not in ('blocks', 'parent') or new.removed_at is not null then
        return new;
    end if;

    if exists (
        with recursive walk(id, depth) as (
            select new.target_task_id, 1
            union all
            select d.target_task_id, w.depth + 1
              from public.task_dependencies d
              join walk w on d.source_task_id = w.id
             where d.removed_at is null
               and d.kind in ('blocks', 'parent')
               and w.depth < 50
        )
        select 1 from walk where id = new.source_task_id
    ) then
        raise exception 'dependency cycle detected (% -> %)',
              new.source_task_id, new.target_task_id
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

--
-- BEFORE INSERT on task_dependencies: the edge is created by the session.
--
create or replace function public.task_dependencies_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    new.created_by := coalesce((select public.current_sale_id()), new.created_by);
    return new;
end;
$$;

--
-- AFTER INSERT/UPDATE on task_dependencies: events, and the block itself.
--
-- Adding a `blocks` edge whose source is still open blocks the target there and
-- then. That is the difference between a dependency the user has to remember
-- and one the system enforces (§10.2).
--
create or replace function public.task_dependencies_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
    v_meta  jsonb;
begin
    v_meta := jsonb_build_object(
        'dependency_id', new.id,
        'kind', new.kind,
        'source_task_id', new.source_task_id,
        'target_task_id', new.target_task_id);

    if tg_op = 'INSERT' then
        -- Recorded on BOTH tasks: each timeline should show the relationship.
        perform public.emit_task_event(
            new.target_task_id, 'dependency.added', v_actor, null, null, v_meta, null,
            case when v_actor is null then 'system' else 'user' end);
        perform public.emit_task_event(
            new.source_task_id, 'dependency.added', v_actor, null, null, v_meta, null,
            case when v_actor is null then 'system' else 'user' end);

        if new.kind = 'blocks' and public.task_has_open_blockers(new.target_task_id) then
            perform public.set_task_status_system(
                new.target_task_id, 'blocked', 'task.blocked', v_meta);
        end if;

    elsif old.removed_at is null and new.removed_at is not null then
        perform public.emit_task_event(
            new.target_task_id, 'dependency.removed', v_actor, null, null, v_meta, null,
            case when v_actor is null then 'system' else 'user' end);

        -- Removing the last blocker releases the task, like satisfying it would.
        if new.kind = 'blocks'
           and not public.task_has_open_blockers(new.target_task_id) then
            perform public.set_task_status_system(
                new.target_task_id, 'pending', 'task.unblocked', v_meta);
        end if;
    end if;

    return new;
end;
$$;

--
-- AFTER UPDATE on tasks: release whatever this task was blocking (§10.4).
--
-- This is where a task module stops being a to-do list: the rep waiting on a
-- colleague is released the moment the blocker closes, and the duration of the
-- block is already measured (`blocked_seconds`) rather than guessed at.
--
create or replace function public.tasks_unblock_dependents() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_dependent bigint;
    v_was_open  boolean;
    v_is_open   boolean;
begin
    select s.is_open into v_was_open
      from public.task_statuses s where s.id = old.status_id;
    select s.is_open into v_is_open
      from public.task_statuses s where s.id = new.status_id;

    -- Only the open -> closed edge releases anything.
    if not coalesce(v_was_open, false) or coalesce(v_is_open, false) then
        return new;
    end if;

    for v_dependent in
        select d.target_task_id
          from public.task_dependencies d
         where d.source_task_id = new.id
           and d.kind = 'blocks'
           and d.removed_at is null
    loop
        perform public.emit_task_event(
            v_dependent, 'dependency.satisfied', null, null, null,
            jsonb_build_object('source_task_id', new.id), null, 'system');

        -- A task with another open blocker stays blocked; only the last one
        -- to clear actually releases it.
        if not public.task_has_open_blockers(v_dependent) then
            perform public.set_task_status_system(
                v_dependent, 'pending', 'task.unblocked',
                jsonb_build_object('source_task_id', new.id));
        end if;
    end loop;

    return new;
end;
$$;

--
-- Reminders (§9)
--

--
-- Next occurrence of an RFC 5545 RRULE, in the reminder's own timezone.
--
-- A deliberately partial implementation: FREQ (HOURLY/DAILY/WEEKLY/MONTHLY),
-- INTERVAL, BYHOUR, BYMINUTE, BYDAY and BYMONTHDAY — exactly the subset the
-- schedules in §9.2 need. Anything else in the string is ignored rather than
-- rejected, so a rule copied from a calendar client still works for the parts
-- we understand. The alternative, a full RRULE engine in plpgsql, is a library
-- nobody asked for.
--
-- The walk is day-by-day and capped at 400 days: a rule whose next occurrence
-- is further out than that returns null (the reminder stops) instead of
-- spinning the scheduler.
--
create or replace function public.next_rrule_occurrence(
    p_rrule    text,
    p_after    timestamp with time zone,
    p_timezone text default 'UTC',
    p_anchor   timestamp with time zone default null
) returns timestamp with time zone
    language plpgsql stable
    set search_path to ''
as $$
declare
    v_part       text;
    v_key        text;
    v_val        text;
    v_freq       text := 'DAILY';
    v_interval   integer := 1;
    v_byhour     integer[];
    v_byminute   integer[];
    v_byday      text[];
    v_bymonthday integer[];
    v_tz         text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
    v_anchor     timestamp with time zone := coalesce(p_anchor, p_after);
    v_anchor_local timestamp;
    v_after_local  timestamp;
    v_day        date;
    v_hour       integer;
    v_minute     integer;
    v_cand       timestamp with time zone;
    v_i          integer;
    v_dow        text;
    v_dow_names  text[] := array['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
begin
    if btrim(coalesce(p_rrule, '')) = '' then
        return null;
    end if;

    foreach v_part in array string_to_array(
        upper(replace(btrim(p_rrule), ' ', '')), ';')
    loop
        v_key := split_part(v_part, '=', 1);
        v_val := split_part(v_part, '=', 2);
        if v_val = '' then
            continue;
        end if;
        case v_key
            when 'FREQ'       then v_freq := v_val;
            when 'INTERVAL'   then v_interval := greatest(1, v_val::integer);
            when 'BYHOUR'     then v_byhour := string_to_array(v_val, ',')::integer[];
            when 'BYMINUTE'   then v_byminute := string_to_array(v_val, ',')::integer[];
            when 'BYDAY'      then v_byday := string_to_array(v_val, ',');
            when 'BYMONTHDAY' then v_bymonthday := string_to_array(v_val, ',')::integer[];
            else null;
        end case;
    end loop;

    v_anchor_local := timezone(v_tz, v_anchor);
    v_after_local  := timezone(v_tz, p_after);
    v_byminute := coalesce(
        (select array_agg(x order by x) from unnest(v_byminute) x), array[0]);

    -- "Every N hours" is the one shape the day walk cannot express.
    if v_freq = 'HOURLY' and v_byhour is null then
        v_cand := timezone(v_tz, date_trunc('hour', v_anchor_local)
                                 + make_interval(mins => v_byminute[1]));
        while v_cand <= p_after loop
            v_cand := v_cand + make_interval(hours => v_interval);
        end loop;
        return v_cand;
    end if;

    -- No BYHOUR at all: keep the anchor's own time of day, minutes included.
    if v_byhour is null then
        v_byhour := array[extract(hour from v_anchor_local)::integer];
        if array_length(v_byminute, 1) = 1 and v_byminute[1] = 0 then
            v_byminute := array[extract(minute from v_anchor_local)::integer];
        end if;
    else
        v_byhour := (select array_agg(x order by x) from unnest(v_byhour) x);
    end if;

    for v_i in 0..400 loop
        v_day := v_after_local::date + v_i;

        if v_freq = 'WEEKLY' then
            v_dow := v_dow_names[extract(dow from v_day)::integer + 1];
            if v_byday is not null then
                if not (v_dow = any(v_byday)) then
                    continue;
                end if;
            elsif extract(dow from v_day) <> extract(dow from v_anchor_local) then
                continue;
            end if;
            if v_interval > 1
               and (floor((v_day - v_anchor_local::date) / 7.0)::integer % v_interval) <> 0 then
                continue;
            end if;

        elsif v_freq = 'MONTHLY' then
            if v_bymonthday is not null then
                if not (extract(day from v_day)::integer = any(v_bymonthday)) then
                    continue;
                end if;
            elsif extract(day from v_day) <> extract(day from v_anchor_local) then
                continue;
            end if;
            if v_interval > 1
               and (((extract(year from v_day)::integer * 12 + extract(month from v_day)::integer)
                     - (extract(year from v_anchor_local)::integer * 12
                        + extract(month from v_anchor_local)::integer)) % v_interval) <> 0 then
                continue;
            end if;

        elsif v_freq = 'DAILY' then
            if v_interval > 1
               and ((v_day - v_anchor_local::date) % v_interval) <> 0 then
                continue;
            end if;
        end if;

        foreach v_hour in array v_byhour loop
            foreach v_minute in array v_byminute loop
                v_cand := timezone(v_tz, v_day + make_time(v_hour, v_minute, 0));
                if v_cand > p_after then
                    return v_cand;
                end if;
            end loop;
        end loop;
    end loop;

    return null;
end;
$$;

--
-- When does this reminder fire next?
--
-- The rule row is passed as jsonb rather than as `public.task_reminders`: a
-- composite parameter type makes every later `alter table` on the reminder
-- table require dropping and recreating this function first. jsonb costs one
-- cast per call and buys a schema that can evolve.
--
create or replace function public.compute_reminder_next_fire(
    p_reminder jsonb,
    p_after    timestamp with time zone default null
) returns timestamp with time zone
    language plpgsql stable security definer
    set search_path to ''
as $$
declare
    v_after    timestamp with time zone := coalesce(p_after, now());
    v_kind     text := p_reminder ->> 'schedule_kind';
    v_fired    integer := coalesce((p_reminder ->> 'fired_count')::integer, 0);
    v_max      integer := (p_reminder ->> 'max_occurrences')::integer;
    v_until    timestamp with time zone := (p_reminder ->> 'until_at')::timestamp with time zone;
    v_offset   integer := (p_reminder ->> 'offset_minutes')::integer;
    v_due      timestamp with time zone;
    v_next     timestamp with time zone;
begin
    if v_max is not null and v_fired >= v_max then
        return null;
    end if;

    if v_kind = 'absolute' then
        -- A one-shot that has already fired never fires again.
        if v_fired = 0 then
            v_next := (p_reminder ->> 'absolute_at')::timestamp with time zone;
        end if;

    elsif v_kind in ('relative_before_due', 'relative_after_due') then
        select t.due_date into v_due
          from public.tasks t
         where t.id = (p_reminder ->> 'task_id')::bigint;

        if v_due is null or v_fired > 0 then
            v_next := null;
        elsif v_kind = 'relative_before_due' then
            v_next := v_due - make_interval(mins => v_offset);
            -- "One hour before" a due date that is already past is not a
            -- reminder, it is noise. Dropped, not fired late.
            if v_next <= v_after then
                v_next := null;
            end if;
        else
            -- The chase reminder is the opposite: if the due date slipped past
            -- while nobody was looking, it fires on the next tick.
            v_next := v_due + make_interval(mins => v_offset);
        end if;

    elsif v_kind = 'recurring' then
        v_next := public.next_rrule_occurrence(
            p_reminder ->> 'rrule',
            greatest(v_after, coalesce(
                (p_reminder ->> 'created_at')::timestamp with time zone, v_after)),
            coalesce(p_reminder ->> 'timezone', 'UTC'),
            (p_reminder ->> 'created_at')::timestamp with time zone);
    end if;

    if v_next is not null and v_until is not null and v_next > v_until then
        return null;
    end if;

    return v_next;
end;
$$;

--
-- Who does this reminder reach?
--
-- Team assignments expand to their members: "notify the assignees" must mean
-- the humans, not a row in `task_assignments` nobody reads. Disabled accounts
-- are skipped — chasing a deactivated user is how an outbox fills with rows
-- that can never be acted on.
--
create or replace function public.reminder_recipient_ids(p_reminder jsonb)
returns setof bigint
    language sql stable security definer
    set search_path to ''
as $$
    select distinct q.sales_id
    from (
        select t.owner_sales_id as sales_id
          from public.tasks t
         where t.id = (p_reminder ->> 'task_id')::bigint
           and (p_reminder ->> 'recipients') in ('owner', 'assignees', 'all')

        union all

        select a.sales_id
          from public.task_assignments a
         where a.task_id = (p_reminder ->> 'task_id')::bigint
           and a.unassigned_at is null
           and a.sales_id is not null
           and ((p_reminder ->> 'recipients') = 'all'
             or ((p_reminder ->> 'recipients') = 'assignees'
                 and a.role in ('owner', 'collaborator'))
             or ((p_reminder ->> 'recipients') = 'watchers' and a.role = 'watcher'))

        union all

        select tm.sales_id
          from public.task_assignments a
          join public.team_members tm on tm.team_id = a.team_id
         where a.task_id = (p_reminder ->> 'task_id')::bigint
           and a.unassigned_at is null
           and a.team_id is not null
           and (p_reminder ->> 'recipients') in ('assignees', 'all')

        union all

        select e.value::bigint
          from jsonb_array_elements_text(
                 coalesce(p_reminder -> 'custom_recipients', '[]'::jsonb)
               ) as e(value)
         where (p_reminder ->> 'recipients') = 'custom'
    ) q
    join public.sales s on s.id = q.sales_id and s.disabled is not true;
$$;

--
-- The scheduler entry point (§9.3). Called every minute by pg_cron.
--
-- `for update skip locked` is what lets several workers (or a slow tick
-- overlapping the next one) run concurrently without double sending — the
-- standard Postgres queue pattern, no extra infrastructure. Idempotency is
-- carried by `dedupe_key`, so even a replayed dispatch is a no-op.
--
create or replace function public.dispatch_due_reminders(p_limit integer default 200)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_reminder   public.task_reminders;
    v_occurrence timestamp with time zone;
    v_recipient  bigint;
    v_channel    public.reminder_channel;
    v_task       public.tasks;
    v_is_open    boolean;
    v_next       timestamp with time zone;
    v_sent       integer := 0;
    v_prefs      public.notification_preferences;
    v_send_at    timestamp with time zone;
    v_status     text;
    v_error      text;
begin
    for v_reminder in
        select r.*
          from public.task_reminders r
         where r.is_active
           and r.next_fire_at is not null
           and r.next_fire_at <= now()
         order by r.next_fire_at
         limit p_limit
           for update skip locked
    loop
        v_occurrence := v_reminder.next_fire_at;

        select * into v_task from public.tasks where id = v_reminder.task_id;
        select s.is_open into v_is_open
          from public.task_statuses s where s.id = v_task.status_id;

        -- A closed or deleted task stops chasing its owner. `stop_on_complete`
        -- is the default precisely because the opposite is how a reminder
        -- system gets muted (§9.5).
        if v_task.id is null
           or v_task.deleted_at is not null
           or (v_reminder.stop_on_complete and not coalesce(v_is_open, false)) then
            update public.task_reminders
               set is_active = false, next_fire_at = null
             where id = v_reminder.id;
            continue;
        end if;

        for v_recipient in
            select * from public.reminder_recipient_ids(to_jsonb(v_reminder))
        loop
            v_prefs := public.notification_prefs_for(v_recipient);

            foreach v_channel in array v_reminder.channels loop
                v_send_at := v_occurrence;
                v_status  := 'queued';
                v_error   := null;

                if v_channel = any (v_prefs.muted_channels) then
                    v_status := 'skipped';
                    v_error  := format('channel %s muted by recipient', v_channel);

                elsif v_channel <> 'in_app' then
                    -- Several rules firing on one task inside the window are
                    -- one ping, not N. The row still exists, marked, so the
                    -- suppression is auditable.
                    if v_prefs.dedupe_window_minutes > 0
                       and exists (select 1 from public.task_notifications n
                                    where n.task_id = v_reminder.task_id
                                      and n.recipient_id = v_recipient
                                      and n.channel = v_channel
                                      and n.status <> 'skipped'
                                      and n.created_at > now()
                                          - make_interval(mins => v_prefs.dedupe_window_minutes))
                    then
                        v_status := 'skipped';
                        v_error  := 'deduplicated: same task already notified in this window';
                    else
                        v_send_at := public.next_allowed_send_at(
                            v_send_at, v_prefs.timezone,
                            v_prefs.quiet_hours_start, v_prefs.quiet_hours_end);

                        if v_prefs.digest_mode then
                            v_send_at := greatest(
                                v_send_at,
                                public.next_digest_at(v_send_at, v_prefs.timezone,
                                                      v_prefs.digest_at));
                        end if;
                    end if;
                end if;

                insert into public.task_notifications (
                    reminder_id, task_id, recipient_id, channel, scheduled_for,
                    title, body, dedupe_key, status,
                    -- An in-app notification IS the row: inserting it delivers
                    -- it, because Realtime pushes it to the client. Only the
                    -- external channels need a worker to move them along.
                    sent_at, delivered_at, error)
                values (
                    v_reminder.id, v_reminder.task_id, v_recipient, v_channel,
                    v_send_at, v_task.title,
                    coalesce(nullif(btrim(v_reminder.message_template), ''),
                             v_task.description),
                    format('%s:%s:%s:%s', v_reminder.id,
                           extract(epoch from v_occurrence)::bigint,
                           v_recipient, v_channel),
                    case when v_status <> 'queued' then v_status
                         when v_channel = 'in_app' then 'delivered'
                         else 'queued' end,
                    case when v_status = 'queued' and v_channel = 'in_app' then now() end,
                    case when v_status = 'queued' and v_channel = 'in_app' then now() end,
                    v_error)
                on conflict (dedupe_key) do nothing;
            end loop;
        end loop;

        v_reminder.fired_count := v_reminder.fired_count + 1;
        v_next := public.compute_reminder_next_fire(
            to_jsonb(v_reminder), v_occurrence);

        update public.task_reminders
           set fired_count  = v_reminder.fired_count,
               next_fire_at = v_next,
               is_active    = (v_next is not null)
         where id = v_reminder.id;

        perform public.emit_task_event(
            v_reminder.task_id, 'reminder.sent', null, null, null,
            jsonb_build_object('reminder_id', v_reminder.id,
                               'occurrence', v_occurrence,
                               'channels', to_jsonb(v_reminder.channels)),
            null, 'system');

        v_sent := v_sent + 1;
    end loop;

    return v_sent;
end;
$$;

--
-- BEFORE INSERT/UPDATE on task_reminders: authorship and the materialized
-- `next_fire_at`.
--
-- The recompute is deliberately conditional: the dispatcher writes
-- `next_fire_at` itself when it advances a recurring rule, and an
-- unconditional trigger would immediately overwrite that with a value computed
-- from `now()`, silently re-firing the occurrence it had just consumed.
--
create or replace function public.task_reminders_before_write() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if tg_op = 'INSERT' then
        new.created_by := coalesce((select public.current_sale_id()), new.created_by);
        new.next_fire_at := public.compute_reminder_next_fire(to_jsonb(new), now());
        new.is_active := new.is_active and new.next_fire_at is not null;
        return new;
    end if;

    if (new.schedule_kind, new.absolute_at, new.offset_minutes, new.rrule,
        new.timezone, new.until_at, new.max_occurrences)
       is distinct from
       (old.schedule_kind, old.absolute_at, old.offset_minutes, old.rrule,
        old.timezone, old.until_at, old.max_occurrences)
       or (new.is_active and not old.is_active) then
        new.next_fire_at := public.compute_reminder_next_fire(to_jsonb(new), now());
    end if;

    if not new.is_active then
        new.next_fire_at := null;
    end if;

    return new;
end;
$$;

create or replace function public.task_reminders_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := (select public.current_sale_id());
    v_meta  jsonb;
begin
    v_meta := jsonb_build_object(
        'reminder_id', new.id,
        'schedule_kind', new.schedule_kind,
        'channels', to_jsonb(new.channels),
        'recipients', new.recipients,
        'next_fire_at', new.next_fire_at);

    if tg_op = 'INSERT' then
        perform public.emit_task_event(
            new.task_id, 'reminder.created', v_actor, null, null, v_meta, null,
            case when v_actor is null then 'system' else 'user' end);
    elsif old.is_active and not new.is_active then
        perform public.emit_task_event(
            new.task_id, 'reminder.canceled', v_actor, null, null, v_meta, null,
            case when v_actor is null then 'system' else 'user' end);
    -- The dispatcher's own bookkeeping already emits `reminder.sent`; emitting
    -- `reminder.updated` for the same write would double every line.
    elsif new.fired_count = old.fired_count then
        perform public.emit_task_event(
            new.task_id, 'reminder.updated', v_actor, null, null, v_meta, null,
            case when v_actor is null then 'system' else 'user' end);
    end if;

    return new;
end;
$$;

--
-- A failed delivery is a visible fact, not a silent gap (O6).
--
create or replace function public.task_notifications_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    -- A quote row has no task timeline to write into, and `emit_task_event(null,
    -- ...)` would raise -- taking the settlement down with it, so a failed quote
    -- email would sit at `sending` forever. The quote's own trail is
    -- `quote_portal_events` and `quote_status_changes`; a delivery failure is
    -- not a commercial act and does not belong on it.
    if new.task_id is null then
        return new;
    end if;

    if new.status in ('failed', 'bounced') and old.status is distinct from new.status then
        perform public.emit_task_event(
            new.task_id, 'reminder.failed', null, null, null,
            jsonb_build_object('notification_id', new.id,
                               'channel', new.channel,
                               'recipient_id', new.recipient_id,
                               'attempt', new.attempt,
                               'error', new.error),
            null, 'system');
    elsif new.acknowledged_at is not null and old.acknowledged_at is null then
        perform public.emit_task_event(
            new.task_id, 'reminder.acknowledged', new.recipient_id, null, null,
            jsonb_build_object('notification_id', new.id, 'channel', new.channel),
            null, 'user');
    end if;

    return new;
end;
$$;

--
-- Moving a due date moves every reminder defined relative to it.
--
-- Without this a "one day before" reminder silently keeps pointing at the old
-- date — the exact class of silent staleness W4 is about.
--
create or replace function public.tasks_refresh_relative_reminders() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_reminder public.task_reminders;
begin
    for v_reminder in
        select r.* from public.task_reminders r
         where r.task_id = new.id
           and r.schedule_kind in ('relative_before_due', 'relative_after_due')
           and r.fired_count = 0
    loop
        update public.task_reminders
           set next_fire_at = public.compute_reminder_next_fire(
                                  to_jsonb(v_reminder), now())
         where id = v_reminder.id;
    end loop;

    return new;
end;
$$;

--
-- Closing a task cancels what was still queued for it (§9.3).
--
create or replace function public.tasks_cancel_reminders_on_close() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_is_open boolean;
begin
    select s.is_open into v_is_open
      from public.task_statuses s where s.id = new.status_id;

    if coalesce(v_is_open, false) and new.deleted_at is null then
        return new;
    end if;

    update public.task_notifications
       set status = 'canceled'
     where task_id = new.id
       and status in ('queued', 'sending');

    update public.task_reminders
       set is_active = false, next_fire_at = null
     where task_id = new.id
       and is_active
       and (stop_on_complete or new.deleted_at is not null);

    return new;
end;
$$;

--
-- Participants (§7)
--
-- BEFORE INSERT/UPDATE on task_assignments: authorship. A row that records who
-- joined a task but not who put them there is not an audit trail.
--
create or replace function public.task_assignments_before_write() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if tg_op = 'INSERT' then
        new.assigned_by := coalesce(new.assigned_by, public.current_sale_id());
        new.assigned_at := coalesce(new.assigned_at, now());
    elsif new.unassigned_at is not null and old.unassigned_at is null then
        new.unassigned_by := coalesce(new.unassigned_by, public.current_sale_id());
    end if;

    return new;
end;
$$;

--
-- Joining and leaving a task are events like any other (§5.2).
--
-- The `owner` role is deliberately silent here. An owner change already emits
-- `task.reassigned` from `tasks_audit`, and the assignment rows it opens and
-- closes are the same fact seen from the other side; emitting both would put
-- three entries in the timeline for one action.
--
create or replace function public.task_assignments_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_event public.task_event_type;
    v_actor bigint;
begin
    if tg_op = 'INSERT' then
        if new.role = 'owner' then
            return new;
        end if;
        v_event := case new.role
                       when 'watcher' then 'task.watcher_added'
                       when 'team'    then 'task.team_assigned'
                       else 'task.assigned'
                   end;
        v_actor := new.assigned_by;
    elsif new.unassigned_at is not null and old.unassigned_at is null then
        if new.role = 'owner' then
            return new;
        end if;
        v_event := case new.role
                       when 'watcher' then 'task.watcher_removed'
                       else 'task.unassigned'
                   end;
        v_actor := new.unassigned_by;
    else
        return new;
    end if;

    perform public.emit_task_event(
        new.task_id, v_event, v_actor, null, null,
        jsonb_build_object('assignment_id', new.id,
                           'role', new.role,
                           'sales_id', new.sales_id,
                           'team_id', new.team_id),
        nullif(btrim(coalesce(new.reason, '')), ''),
        case when v_actor is null then 'system' else 'user' end);

    return new;
end;
$$;

--
-- The projection and the history cannot drift (§7.2).
--
-- `tasks.owner_sales_id` is the hot-path column ("my tasks" must not join a
-- history table); `task_assignments` is the record of how it got there. This
-- trigger is the only thing that keeps the second true when the first changes.
--
create or replace function public.tasks_sync_owner_assignment() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor bigint := coalesce(public.current_sale_id(), new.owner_sales_id);
begin
    update public.task_assignments
       set unassigned_at = now(),
           unassigned_by = v_actor
     where task_id = new.id
       and role = 'owner'
       and unassigned_at is null
       and sales_id is distinct from new.owner_sales_id;

    if new.owner_sales_id is not null then
        insert into public.task_assignments (task_id, sales_id, role, assigned_by)
        select new.id, new.owner_sales_id, 'owner', coalesce(v_actor, new.owner_sales_id)
        where not exists (select 1 from public.task_assignments a
                          where a.task_id = new.id
                            and a.role = 'owner'
                            and a.unassigned_at is null);
    end if;

    return new;
end;
$$;

--
-- External-channel delivery (deliverable 2.5, §9.3)
--
-- The claim/settle pair a worker needs. `security definer`, granted to
-- `service_role` only: an edge function calls these, a browser never does.
--
--
-- 1. Claim a batch.
--
-- `for update skip locked` is the standard Postgres queue idiom: N workers can
-- run concurrently and no row is ever handed out twice. Marking the row
-- `sending` before returning it means a worker that dies mid-send leaves
-- evidence rather than a silent gap.
--
create or replace function public.claim_task_notifications(
    p_channels public.reminder_channel[] default
        array['email', 'push', 'whatsapp', 'sms', 'webhook']::public.reminder_channel[],
    p_limit integer default 50
)
returns table (
    id            bigint,
    task_id       bigint,
    channel       public.reminder_channel,
    recipient_id  bigint,
    recipient_email text,
    recipient_name  text,
    recipient_digest boolean,
    title         text,
    body          text,
    scheduled_for timestamp with time zone,
    attempt       smallint,
    task_title    text,
    task_due_date timestamp with time zone,
    -- Appended, never inserted mid-list: the worker reads these by name, and a
    -- reordered `returns table` is the kind of change that compiles and then
    -- delivers the wrong field.
    entity_type   public.task_entity,
    entity_id     bigint
)
    language plpgsql security definer
    set search_path to ''
as $$
begin
    return query
    with claimed as (
        update public.task_notifications n
           set status  = 'sending',
               attempt = n.attempt + 1
         where n.id in (
                   select c.id
                     from public.task_notifications c
                    where c.status = 'queued'
                      and c.channel = any (p_channels)
                      and c.scheduled_for <= now()
                      and (select count(*)
                             from public.task_notifications s
                            where s.recipient_id = c.recipient_id
                              and s.status in ('sent', 'delivered')
                              and s.sent_at > now() - interval '1 hour')
                          < (public.notification_prefs_for(c.recipient_id)).max_per_hour
                    order by c.scheduled_for
                    limit p_limit
                      for update skip locked)
        returning n.*
    )
    select c.id, c.task_id, c.channel, c.recipient_id,
           -- `sales.email` is citext; the declared return type is text, and
           -- Postgres compares those structurally, not by implicit cast.
           s.email::text,
           nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
           (public.notification_prefs_for(c.recipient_id)).digest_mode,
           -- The row's own title wins. A task row that left it null falls back
           -- to the task's, exactly as before; a quote row always writes one,
           -- because there is no second place to take it from.
           coalesce(c.title, t.title),
           c.body, c.scheduled_for, c.attempt,
           t.title, t.due_date,
           c.entity_type, c.entity_id
      from claimed c
      join public.sales s on s.id = c.recipient_id
      -- LEFT, so a row whose subject is not a task is claimed instead of
      -- silently dropped. This one word is the whole risk of the widening
      -- (quotes §8).
      left join public.tasks t on t.id = c.task_id;
end;
$$;

--
-- 2. Settle one.
--
-- A failure is not final until the retries are exhausted: below `p_max_attempts`
-- the row goes back to `queued` with an exponential backoff, above it the row
-- is `failed` — which is what makes `task_notifications_audit` emit
-- `reminder.failed` into the task's timeline.
--
create or replace function public.complete_task_notification(
    p_id                  bigint,
    p_status              text,
    p_provider_message_id text default null,
    p_error               text default null,
    p_max_attempts        integer default 5
)
returns public.task_notifications
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_row     public.task_notifications;
    v_status  text := p_status;
    v_backoff interval;
begin
    select * into v_row from public.task_notifications where id = p_id for update;
    if not found then
        raise exception 'notification % not found', p_id
            using errcode = 'no_data_found';
    end if;

    if v_status not in ('sent', 'delivered', 'failed', 'bounced', 'skipped') then
        raise exception 'illegal notification status %', v_status
            using errcode = 'check_violation';
    end if;

    -- A transient failure with attempts left is a retry, not a verdict.
    if v_status = 'failed' and v_row.attempt < p_max_attempts then
        v_backoff := make_interval(secs => least(3600, power(2, v_row.attempt)::int * 60));
        update public.task_notifications
           set status        = 'queued',
               scheduled_for = now() + v_backoff,
               error         = p_error
         where id = p_id
        returning * into v_row;
        return v_row;
    end if;

    update public.task_notifications
       set status              = v_status,
           sent_at             = case when v_status in ('sent', 'delivered')
                                      then coalesce(v_row.sent_at, now()) end,
           delivered_at        = case when v_status = 'delivered'
                                      then coalesce(v_row.delivered_at, now()) end,
           provider_message_id = coalesce(p_provider_message_id, v_row.provider_message_id),
           error               = p_error
     where id = p_id
    returning * into v_row;

    return v_row;
end;
$$;

--
-- 3. Requeue whatever a crashed worker left mid-flight.
--
-- Without this, a row that was claimed and never settled stays `sending`
-- forever — the same invisible-failure mode this whole deliverable exists to
-- remove.
--
create or replace function public.requeue_stale_task_notifications(
    p_older_than interval default '15 minutes'
)
returns integer
    language sql security definer
    set search_path to ''
as $$
    with requeued as (
        update public.task_notifications
           set status = 'queued',
               error  = 'worker did not settle this delivery; requeued'
         where status = 'sending'
           and scheduled_for < now() - p_older_than
        returning 1
    )
    select count(*)::int from requeued;
$$;

--
-- Anti-fatigue helpers (§9.5)
--
create or replace function public.notification_prefs_for(p_sales_id bigint)
returns public.notification_preferences
    language plpgsql stable security definer
    set search_path to ''
as $$
declare
    v_prefs public.notification_preferences;
begin
    select * into v_prefs
      from public.notification_preferences
     where sales_id = p_sales_id;

    if found then
        return v_prefs;
    end if;

    v_prefs.sales_id              := p_sales_id;
    v_prefs.timezone              := 'UTC';
    v_prefs.digest_mode           := false;
    v_prefs.digest_at             := '08:00';
    v_prefs.muted_channels        := '{}';
    v_prefs.max_per_hour          := 20;
    v_prefs.dedupe_window_minutes := 60;

    return v_prefs;
end;
$$;

--
-- 3. When may this actually be sent?
--
-- Handles the wrap-around case, which is the one people actually configure:
-- 22:00–07:00 is a window that crosses midnight, and treating it as a plain
-- `between` silences the whole day instead of the night.
--
create or replace function public.next_allowed_send_at(
    p_at          timestamp with time zone,
    p_timezone    text,
    p_quiet_start time,
    p_quiet_end   time
)
returns timestamp with time zone
    language plpgsql immutable
    set search_path to ''
as $$
declare
    v_local timestamp;
    v_time  time;
    v_day   date;
begin
    if p_quiet_start is null or p_quiet_end is null
       or p_quiet_start = p_quiet_end then
        return p_at;
    end if;

    v_local := p_at at time zone coalesce(p_timezone, 'UTC');
    v_time  := v_local::time;
    v_day   := v_local::date;

    if p_quiet_start < p_quiet_end then
        -- A window inside one day, e.g. 13:00–14:00.
        if v_time >= p_quiet_start and v_time < p_quiet_end then
            return (v_day + p_quiet_end) at time zone coalesce(p_timezone, 'UTC');
        end if;
    else
        -- A window that crosses midnight, e.g. 22:00–07:00.
        if v_time >= p_quiet_start then
            return ((v_day + 1) + p_quiet_end) at time zone coalesce(p_timezone, 'UTC');
        elsif v_time < p_quiet_end then
            return (v_day + p_quiet_end) at time zone coalesce(p_timezone, 'UTC');
        end if;
    end if;

    return p_at;
end;
$$;

--
-- 4. The next digest slot at or after a given instant.
--
create or replace function public.next_digest_at(
    p_at        timestamp with time zone,
    p_timezone  text,
    p_digest_at time
)
returns timestamp with time zone
    language plpgsql immutable
    set search_path to ''
as $$
declare
    v_local timestamp;
    v_slot  timestamp;
begin
    v_local := p_at at time zone coalesce(p_timezone, 'UTC');
    v_slot  := v_local::date + coalesce(p_digest_at, '08:00'::time);

    if v_slot < v_local then
        v_slot := v_slot + interval '1 day';
    end if;

    return v_slot at time zone coalesce(p_timezone, 'UTC');
end;
$$;

--
-- Retention: the only path that physically removes a task (§4.4).
--
create or replace function public.purge_tasks(
    p_task_ids       bigint[] default null,
    -- History is append-only and retention MOVES partitions rather than
    -- deleting rows (§5.1). Truncating it is only ever right for a disposable
    -- database — the e2e harness — so it is opt-in and named at the call site.
    p_purge_history  boolean default false
)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    delete from public.task_notifications
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_reminders
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_attachments
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_checklist_items
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_comments
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_dependencies
     where p_task_ids is null
        or source_task_id = any (p_task_ids)
        or target_task_id = any (p_task_ids);
    delete from public.task_assignments
     where p_task_ids is null or task_id = any (p_task_ids);
    delete from public.task_links
     where p_task_ids is null or task_id = any (p_task_ids);

    -- `task_events` is NOT touched. It is append-only (§5.1, §5.5) and carries
    -- no foreign key to tasks precisely so the history can outlive the row:
    -- retention moves its partitions to cold storage, it never deletes them.

    perform set_config('app.purge_tasks', 'on', true);
    delete from public.tasks
     where p_task_ids is null or id = any (p_task_ids);
    get diagnostics v_count = row_count;
    perform set_config('app.purge_tasks', 'off', true);

    -- `task_events.actor_sales_id` references sales, so history that outlives
    -- every task also pins every user who ever touched one. That is correct in
    -- production and impossible to reset around, hence the flag.
    if p_purge_history then
        truncate public.task_events;
    end if;

    return v_count;
end;
$$;

--
-- Deal stage history (kanban "why did this move?")
--

-- AFTER UPDATE OF stage ON deals: records the transition.
--
-- The single insertion point for `deal_stage_changes`, so the history cannot
-- disagree with the deals table: every path that writes `stage` lands here,
-- including the edit form and an import. `move_deal_stage()` puts the reason
-- and the attachments in transaction-local settings first; anything else
-- records the move with a null reason, which is how an undocumented change
-- stays visible as one instead of leaving no trace at all.
--
-- SECURITY DEFINER because the table grants no INSERT to `authenticated`: the
-- caller was already authorised by the deals UPDATE policy, and going through
-- the trigger is what stops a client from forging or back-dating an entry.
create or replace function public.deals_log_stage_change() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_reason      text  := nullif(btrim(coalesce(current_setting('app.deal_stage_reason', true), '')), '');
    v_attachments jsonb := nullif(coalesce(current_setting('app.deal_stage_attachments', true), ''), '')::jsonb;
    v_override    text  := nullif(btrim(coalesce(current_setting('app.deal_stage_override', true), '')), '');
    v_for_deal    text  := coalesce(current_setting('app.deal_stage_deal_id', true), '');
begin
    -- The settings belong to one specific deal. Without this check a second
    -- deal updated later in the same transaction (the kanban reindexes its
    -- neighbours on every drop) would inherit the first one's reason.
    if v_for_deal <> new.id::text then
        v_reason := null;
        v_attachments := null;
        v_override := null;
    end if;

    insert into public.deal_stage_changes
        (deal_id, from_stage, to_stage, reason, sales_id, attachments, override_reason)
    values (
        new.id,
        old.stage,
        new.stage,
        v_reason,
        public.current_sale_id(),
        case
            when v_attachments is null or jsonb_typeof(v_attachments) <> 'array' then null
            else (select array_agg(element)
                    from jsonb_array_elements(v_attachments) as element)
        end,
        v_override
    );

    return null;
end;
$$;

-- "Has this deal earned the next stage?" — the completed-task rule, in one place.
--
-- Both the enforcement inside `move_deal_stage()` and the readiness the kanban
-- dialog displays call THIS function. Two implementations of the same rule
-- drift, and the direction they drift in is always the same: a dialog that
-- enables its button for a move the server then refuses.
--
-- The count is anchored on the deal's entry into its CURRENT stage. Counting
-- every completed task the deal ever had would satisfy the rule permanently
-- after the first one — the deal would then cross the whole pipeline on the
-- strength of a single call logged months earlier, which is precisely the
-- inspection this rule exists to force.
--
-- "Completed" is read off the task columns, not off `task_statuses.counts_as_done`:
-- the same choice `team_workload_summary` documents, so this counter agrees with
-- the task lists the user is looking at.
--
-- SECURITY DEFINER to read `deals` and `tasks` regardless of who asks, so the
-- number is the same for a rep and for the manager auditing them. The deals
-- select policy is therefore restated here — without it this is a probe for the
-- existence of other people's deals.
create or replace function public.deal_stage_gate(
    p_deal_id  bigint,
    p_to_stage text
) returns jsonb
    language plpgsql stable security definer
    set search_path to ''
as $$
declare
    v_deal      public.deals;
    v_req       public.deal_stage_requirements;
    v_since     timestamp with time zone;
    v_task_ids  bigint[];
    v_completed integer;
begin
    select * into v_deal from public.deals where id = p_deal_id;
    if not found or not (select public.can_see_deal(p_deal_id)) then
        raise exception 'deal % not found', p_deal_id
            using errcode = 'no_data_found';
    end if;

    -- When the deal entered the stage it is in now. A deal that has never moved
    -- has no history row, so its creation is the start of its first stage.
    v_since := coalesce(
        (select max(changed_at)
           from public.deal_stage_changes
          where deal_id = p_deal_id
            and to_stage = v_deal.stage),
        v_deal.created_at);

    select * into v_req
      from public.deal_stage_requirements
     where to_stage = p_to_stage;

    -- No row for this stage, no requirement configured, the rule not switched
    -- on yet, or a deal that entered its current stage before the rule existed:
    -- the move is free. `required` is reported as 0 so a caller can tell "no
    -- rule applies here" from "the rule is satisfied".
    if not found
       or v_req.min_completed_tasks = 0
       or v_req.enforced_from is null
       or v_since < v_req.enforced_from then
        return jsonb_build_object(
            'deal_id', p_deal_id,
            'to_stage', p_to_stage,
            'required', 0,
            'completed', 0,
            'ok', true,
            'since', v_since,
            'qualifying_task_ids', '[]'::jsonb);
    end if;

    -- Any active link to the deal, not just the primary one: a task can be
    -- primary on the contact and still be the work that moved this deal.
    select coalesce(array_agg(t.id order by t.completed_at), '{}'::bigint[])
      into v_task_ids
      from public.tasks t
     where t.completed_at is not null
       and t.completed_at >= v_since
       and t.canceled_at is null
       and t.deleted_at is null
       and exists (
           select 1
             from public.task_links l
            where l.task_id = t.id
              and l.entity_type = 'deal'
              and l.entity_id = p_deal_id
              and l.unlinked_at is null);

    v_completed := coalesce(array_length(v_task_ids, 1), 0);

    return jsonb_build_object(
        'deal_id', p_deal_id,
        'to_stage', p_to_stage,
        'required', v_req.min_completed_tasks,
        'completed', v_completed,
        'ok', v_completed >= v_req.min_completed_tasks,
        'since', v_since,
        'qualifying_task_ids', to_jsonb(v_task_ids));
end;
$$;

-- The documented write path for a stage change (the kanban's drop handler).
--
-- One call rather than "update the deal, then insert the history": two client
-- writes can half-fail, and the half that survives is always the one that
-- moves the card, leaving a transition nobody can explain. Here the reason is
-- part of the same transaction as the move, or neither happens.
--
-- The reason is mandatory, exactly as `transition_task()` demands one to
-- cancel a task. `p_attachments` is the JSON array the client already uploaded
-- to the attachments bucket, in `deal_notes.attachments` shape.
--
-- This is also where the completed-task rule is enforced (`deal_stage_gate()`).
-- `p_override_reason` is the escape valve, and it is deliberately narrow: only
-- an admin — not a manager, who is otherwise allowed to move anybody's deal —
-- and only with a written motive, which is stored on the history row. Anyone
-- else passing it is ignored and still refused, so the parameter cannot be used
-- to probe for the privilege.
create or replace function public.move_deal_stage(
    p_deal_id         bigint,
    p_to_stage        text,
    p_reason          text,
    p_index           integer default null,
    p_attachments     jsonb   default '[]'::jsonb,
    p_override_reason text    default null
) returns public.deals
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_deal     public.deals;
    v_actor    bigint := public.current_sale_id();
    v_gate     jsonb;
    v_override text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
    if coalesce(btrim(p_to_stage), '') = '' then
        raise exception 'a target stage is required'
            using errcode = 'check_violation';
    end if;

    if coalesce(btrim(p_reason), '') = '' then
        raise exception 'a reason is required to move a deal to another stage'
            using errcode = 'check_violation';
    end if;

    select * into v_deal from public.deals where id = p_deal_id for update;
    if not found then
        raise exception 'deal % not found', p_deal_id
            using errcode = 'no_data_found';
    end if;

    -- Same rule as the deals UPDATE policy. Restated because SECURITY DEFINER
    -- bypasses RLS: without this a rep could move somebody else's deal.
    if not (select public.can_manage_all()) and v_deal.sales_id is distinct from v_actor then
        raise exception 'no permission to move deal %', p_deal_id
            using errcode = 'insufficient_privilege';
    end if;

    if v_deal.stage = p_to_stage then
        raise exception 'deal % is already in stage %', p_deal_id, p_to_stage
            using errcode = 'check_violation';
    end if;

    -- Evaluated inside the row lock taken above, so two concurrent moves cannot
    -- both pass the gate on the strength of the same single completed task.
    v_gate := public.deal_stage_gate(p_deal_id, p_to_stage);

    if not (v_gate->>'ok')::boolean then
        -- Only an admin overrides, and only in writing. A manager can move the
        -- deal, but not past the rule.
        if v_override is null
           or (select public.current_sales_role()) is distinct from 'admin'::public.sales_role then
            -- `detail` is the stable machine-readable key the client maps to a
            -- translated message; `hint` carries the counts so the UI can say
            -- "1 of 2" without asking a second time.
            raise exception 'deal % needs % completed task(s) since it entered stage % to move to %',
                    p_deal_id, v_gate->>'required', v_deal.stage, p_to_stage
                using errcode = 'check_violation',
                      detail  = 'deal_stage_requires_completed_tasks',
                      hint    = v_gate::text;
        end if;
    else
        -- The gate was satisfied, so nothing was overridden. Recording a motive
        -- here would put a skipped-the-rule marker on a move that met it.
        v_override := null;
    end if;

    -- Handed to the trigger, which is what actually writes the history row.
    perform set_config('app.deal_stage_deal_id', p_deal_id::text, true);
    perform set_config('app.deal_stage_reason', p_reason, true);
    perform set_config('app.deal_stage_attachments', coalesce(p_attachments, '[]'::jsonb)::text, true);
    perform set_config('app.deal_stage_override', coalesce(v_override, ''), true);

    update public.deals
       set stage = p_to_stage,
           index = coalesce(p_index, index),
           updated_at = now()
     where id = p_deal_id
    returning * into v_deal;

    -- Cleared so a later statement in the same transaction cannot reuse them.
    perform set_config('app.deal_stage_deal_id', '', true);
    perform set_config('app.deal_stage_reason', '', true);
    perform set_config('app.deal_stage_attachments', '', true);
    perform set_config('app.deal_stage_override', '', true);

    return v_deal;
end;
$$;

--
-- Analytics module aggregation functions (see the migration of the same name
-- for the full rationale). SECURITY INVOKER on every one of them -- the
-- default, deliberately not spelled out, because pg_dump omits it and writing
-- it produces a phantom diff. RLS does the role scoping.
--
-- ---------------------------------------------------------------------------
-- Deals: stage distribution (stock)
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT date-filtered, and deliberately OPEN deals only.
--
-- "Where is the live pipeline right now" has no month, so applying the period
-- filter to it would make a stock figure move for a reason the label does not
-- explain. And excluding won/lost is what keeps the chart honest: with the
-- terminal stages in, the bars mix a snapshot of the pipeline against the
-- lifetime total of everything ever closed, on one axis.
--
-- `not in ('won', 'lost')` is the same definition as
-- `teams_summary.pipeline_amount`. `<> 'won'` booked dead deals as forecast,
-- which is the exact bug the team dashboard migration fixed; the two screens
-- must not disagree about what the word pipeline means. The literals match
-- `defaultDealStages`, so renaming a stage in the application configuration
-- needs this function updated too.
--
create or replace function public.deal_stage_stats(
    p_sales_id bigint default null,
    p_team_id  bigint default null
) returns table (
    stage    text,
    nb_deals bigint,
    amount   numeric
)
language sql
stable
set search_path to ''
as $$
    select d.stage,
           count(*)::bigint,
           coalesce(sum(d.amount), 0)::numeric
      from public.deals d
     where d.archived_at is null
       and d.stage not in ('won', 'lost')
       and (p_sales_id is null or d.sales_id = p_sales_id)
       and (p_team_id  is null or d.team_id  = p_team_id)
     group by d.stage;
$$;

-- ---------------------------------------------------------------------------
-- Deals: monthly flow
-- ---------------------------------------------------------------------------
--
-- Two date bases in one result, carried by a `union all` -- the same shape
-- `team_task_stats` uses for created-vs-completed. A deal belongs to the month
-- it was OPENED and, separately, to the month it was DECIDED, and those are
-- rarely the same month. Folding them into one row per month is what lets the
-- chart put creation next to outcome; the UI labels each series with its own
-- basis, because a chart whose series measure different dates and says only
-- "this quarter" is how a dashboard loses credibility.
--
-- DECISION DATE, and this is the honest limitation of the MVP: it uses
-- `expected_closing_date`, not the real transition date. There is no
-- `deals.closed_at`, and the real answer lives in `deal_stage_changes`, which
-- has only recorded transitions since 2026-08-18 -- days, not quarters. Using
-- it now would chart noise. `deal_cycle_stats` swaps this basis in phase 2,
-- once that table has accumulated a period; until then the UI must say
-- "expected" and never "actual".
--
-- A won/lost deal with no `expected_closing_date` therefore contributes to no
-- month at all. That gap is visible rather than papered over: coalescing it to
-- `created_at` would invent a close date that nobody entered.
--
create or replace function public.deal_flow_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null,
    p_team_id  bigint default null
) returns table (
    month          date,
    nb_created     bigint,
    amount_created numeric,
    nb_won         bigint,
    amount_won     numeric,
    nb_lost        bigint,
    amount_lost    numeric,
    nb_forecast          bigint,
    forecast_days_total  numeric
)
language sql
stable
set search_path to ''
as $$
    with events as (
        select date_trunc('month', d.created_at)::date as m,
               1                                as created,
               coalesce(d.amount, 0)::numeric   as amt_created,
               0                                as won,
               0::numeric                       as amt_won,
               0                                as lost,
               0::numeric                       as amt_lost,
               -- Forecast cycle length, carried as a SUM and a COUNT rather
               -- than as an average. Averaging monthly averages weights a month
               -- with three deals like a month with three hundred; a sum and a
               -- count divide exactly, at any grouping the UI chooses.
               case when d.expected_closing_date is not null
                    then 1 else 0 end            as fc_n,
               case when d.expected_closing_date is not null
                    then (d.expected_closing_date - d.created_at::date)::numeric
                    else 0::numeric end          as fc_days
          from public.deals d
         where d.archived_at is null
           and d.created_at::date between p_from and p_to
           and (p_sales_id is null or d.sales_id = p_sales_id)
           and (p_team_id  is null or d.team_id  = p_team_id)
        union all
        select date_trunc('month', d.expected_closing_date)::date,
               0,
               0::numeric,
               case when d.stage = 'won'  then 1 else 0 end,
               case when d.stage = 'won'  then coalesce(d.amount, 0)::numeric
                    else 0::numeric end,
               case when d.stage = 'lost' then 1 else 0 end,
               case when d.stage = 'lost' then coalesce(d.amount, 0)::numeric
                    else 0::numeric end,
               0,
               0::numeric
          from public.deals d
         where d.archived_at is null
           and d.stage in ('won', 'lost')
           and d.expected_closing_date between p_from and p_to
           and (p_sales_id is null or d.sales_id = p_sales_id)
           and (p_team_id  is null or d.team_id  = p_team_id)
    )
    select e.m,
           sum(e.created)::bigint,
           sum(e.amt_created)::numeric,
           sum(e.won)::bigint,
           sum(e.amt_won)::numeric,
           sum(e.lost)::bigint,
           sum(e.amt_lost)::numeric,
           sum(e.fc_n)::bigint,
           sum(e.fc_days)::numeric
      from events e
     group by e.m
     order by e.m;
$$;

-- ---------------------------------------------------------------------------
-- Deals: per owner
-- ---------------------------------------------------------------------------
--
-- Mixed bases in one row, on purpose: `nb_open` / `pipeline_amount` are stock
-- (what this person is carrying right now) while the won and lost figures are
-- flow inside the period. The chart labels each series; putting them in one
-- row is what makes the total and its breakdown come from a single call, so
-- they cannot disagree because a write landed between two requests.
--
-- Aggregated from `deals` and then joined to `sales`, so an owner with no deals
-- simply does not appear. Starting from `sales` instead would list every
-- account, including disabled ones, as a row of zeroes -- a roster, which is
-- not what this answers.
--
create or replace function public.deal_owner_stats(
    p_from    date,
    p_to      date,
    p_team_id bigint default null
) returns table (
    sales_id        bigint,
    owner_name      text,
    nb_open         bigint,
    pipeline_amount numeric,
    nb_won          bigint,
    won_amount      numeric,
    nb_lost         bigint,
    lost_amount     numeric
)
language sql
stable
set search_path to ''
as $$
    with agg as (
        select d.sales_id as owner_id,
               count(*) filter (
                   where d.stage not in ('won', 'lost')) as open_deals,
               coalesce(sum(d.amount) filter (
                   where d.stage not in ('won', 'lost')), 0)::numeric as pipeline,
               count(*) filter (
                   where d.stage = 'won'
                     and d.expected_closing_date between p_from and p_to) as won_deals,
               coalesce(sum(d.amount) filter (
                   where d.stage = 'won'
                     and d.expected_closing_date between p_from and p_to), 0)::numeric as won_amt,
               count(*) filter (
                   where d.stage = 'lost'
                     and d.expected_closing_date between p_from and p_to) as lost_deals,
               coalesce(sum(d.amount) filter (
                   where d.stage = 'lost'
                     and d.expected_closing_date between p_from and p_to), 0)::numeric as lost_amt
          from public.deals d
         where d.archived_at is null
           and d.sales_id is not null
           and (p_team_id is null or d.team_id = p_team_id)
         group by d.sales_id
    )
    select a.owner_id,
           nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
           a.open_deals::bigint,
           a.pipeline,
           a.won_deals::bigint,
           a.won_amt,
           a.lost_deals::bigint,
           a.lost_amt
      from agg a
      join public.sales s on s.id = a.owner_id;
$$;

-- ---------------------------------------------------------------------------
-- Leads: monthly flow
-- ---------------------------------------------------------------------------
--
-- `nb_converted` is COHORT-scoped, not flow-scoped: of the leads created in
-- this month, how many have converted since. That is what makes a monthly
-- conversion rate mean anything -- dividing conversions that happened in March
-- by leads created in March compares two different populations.
--
-- The consequence is worth printing next to the chart: the most recent months
-- always look worse, because their leads have not had time to convert yet. A
-- cohort rate that is still filling in is not a decline.
--
create or replace function public.lead_flow_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    month               date,
    nb_created          bigint,
    nb_converted        bigint,
    avg_conversion_days numeric
)
language sql
stable
set search_path to ''
as $$
    select date_trunc('month', l.created_at)::date,
           count(*)::bigint,
           count(*) filter (where l.converted_at is not null)::bigint,
           round(
               avg(extract(epoch from (l.converted_at - l.created_at)) / 86400.0)
                   filter (where l.converted_at is not null),
               1)
      from public.leads l
     where l.created_at::date between p_from and p_to
       and (p_sales_id is null or l.sales_id = p_sales_id)
     group by 1
     order by 1;
$$;

-- ---------------------------------------------------------------------------
-- Leads: breakdown by source, status and owner
-- ---------------------------------------------------------------------------
--
-- Three dimensions in one call, discriminated by a `dimension` column -- the
-- same `union all` trick `team_task_stats` uses for its two date bases. One
-- round trip serves five charts, and every rate on the Leads tab is computed
-- over the same cohort, so the breakdowns reconcile with each other by
-- construction instead of by luck.
--
-- ATTRIBUTION, and its limit. `won_amount` is the only path in this schema from
-- an origin to revenue: `leads.converted_deal_id` -> `deals`. It exists ONLY
-- for leads converted with `create_deal := true`; a deal typed straight into
-- the kanban has no traceable origin at all, because `deals` has no `source`
-- column. So this answers "of the revenue we CAN attribute, which channel
-- produced it" -- the UI must show the attributable share beside the figure or
-- it will be read as the whole business.
--
-- `bucket` carries a raw key for source and status (the frontend resolves the
-- label from the application configuration) but a resolved NAME for owner,
-- because the client cannot turn a `sales_id` into a person without a second
-- query.
--
create or replace function public.lead_breakdown_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    dimension           text,
    bucket              text,
    nb_leads            bigint,
    nb_converted        bigint,
    nb_won_deals        bigint,
    won_amount          numeric,
    pipeline_amount     numeric,
    avg_conversion_days numeric
)
language sql
stable
set search_path to ''
as $$
    with cohort as (
        select l.id,
               l.source,
               l.status,
               l.sales_id,
               l.created_at,
               l.converted_at,
               l.converted_deal_id
          from public.leads l
         where l.created_at::date between p_from and p_to
           and (p_sales_id is null or l.sales_id = p_sales_id)
    ),
    enriched as (
        select c.source,
               c.status,
               c.sales_id,
               c.created_at,
               c.converted_at,
               d.stage                        as deal_stage,
               coalesce(d.amount, 0)::numeric as deal_amount
          from cohort c
          left join public.deals d
                 on d.id = c.converted_deal_id
                and d.archived_at is null
    )
    select 'source'::text,
           coalesce(nullif(btrim(e.source), ''), 'unknown'),
           count(*)::bigint,
           count(*) filter (where e.converted_at is not null)::bigint,
           count(*) filter (where e.deal_stage = 'won')::bigint,
           coalesce(sum(e.deal_amount) filter (where e.deal_stage = 'won'), 0)::numeric,
           coalesce(sum(e.deal_amount) filter (
               where e.deal_stage is not null
                 and e.deal_stage not in ('won', 'lost')), 0)::numeric,
           round(avg(extract(epoch from (e.converted_at - e.created_at)) / 86400.0)
                     filter (where e.converted_at is not null), 1)
      from enriched e
     group by 1, 2
    union all
    select 'status'::text,
           coalesce(nullif(btrim(e.status), ''), 'unknown'),
           count(*)::bigint,
           count(*) filter (where e.converted_at is not null)::bigint,
           count(*) filter (where e.deal_stage = 'won')::bigint,
           coalesce(sum(e.deal_amount) filter (where e.deal_stage = 'won'), 0)::numeric,
           coalesce(sum(e.deal_amount) filter (
               where e.deal_stage is not null
                 and e.deal_stage not in ('won', 'lost')), 0)::numeric,
           round(avg(extract(epoch from (e.converted_at - e.created_at)) / 86400.0)
                     filter (where e.converted_at is not null), 1)
      from enriched e
     group by 1, 2
    union all
    select 'owner'::text,
           coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
                    'unassigned'),
           count(*)::bigint,
           count(*) filter (where e.converted_at is not null)::bigint,
           count(*) filter (where e.deal_stage = 'won')::bigint,
           coalesce(sum(e.deal_amount) filter (where e.deal_stage = 'won'), 0)::numeric,
           coalesce(sum(e.deal_amount) filter (
               where e.deal_stage is not null
                 and e.deal_stage not in ('won', 'lost')), 0)::numeric,
           round(avg(extract(epoch from (e.converted_at - e.created_at)) / 86400.0)
                     filter (where e.converted_at is not null), 1)
      from enriched e
      left join public.sales s on s.id = e.sales_id
     group by 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: monthly flow
-- ---------------------------------------------------------------------------
--
-- The company-wide counterpart of `team_task_stats`, and it exists separately
-- for a reason that is not duplication: that cube resolves tasks through
-- `team_members`, so a rep who is in no team is invisible in it, and a rep in
-- two teams is counted twice. This one hangs tasks off their owner directly.
--
-- Two date bases again: a task belongs to the month it was created AND to the
-- month it was completed. The gap between the two series IS the backlog
-- forming, which is the only shape that shows a team accumulating work rather
-- than working it.
--
-- ON TIME: a task with no due date counts as on time, so the denominator is
-- exactly `nb_completed`. Excluding it instead would make the two counters look
-- comparable while they are not, which is how a rate ends up above 100 %.
--
-- CYCLE: measured `completed_at - created_at`, never from
-- `tasks.total_open_seconds`. That counter is trigger-maintained and reads 0 on
-- every task predating the trigger, and a chart cannot tell "instant" from
-- "never recorded". The subtraction is exact for every row, always.
--
create or replace function public.task_flow_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    month                date,
    nb_created           bigint,
    nb_completed         bigint,
    nb_completed_on_time bigint,
    avg_cycle_hours      numeric
)
language sql
stable
set search_path to ''
as $$
    with events as (
        select date_trunc('month', tk.created_at)::date as m,
               1              as created,
               0              as completed,
               0              as on_time,
               null::numeric  as cycle_seconds
          from public.tasks tk
         where tk.deleted_at is null
           and tk.created_at::date between p_from and p_to
           and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
        union all
        select date_trunc('month', tk.completed_at)::date,
               0,
               1,
               case when tk.due_date is null or tk.completed_at <= tk.due_date
                    then 1 else 0 end,
               extract(epoch from (tk.completed_at - tk.created_at))::numeric
          from public.tasks tk
         where tk.deleted_at is null
           and tk.completed_at is not null
           and tk.completed_at::date between p_from and p_to
           and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
    )
    select e.m,
           sum(e.created)::bigint,
           sum(e.completed)::bigint,
           sum(e.on_time)::bigint,
           -- Null, not 0, for a month where nothing was completed: `avg` over
           -- no rows has no answer, and 0 would draw a bar claiming tasks
           -- closed instantly.
           round(avg(e.cycle_seconds) / 3600.0, 1)
      from events e
     group by e.m
     order by e.m;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: stock, per owner
-- ---------------------------------------------------------------------------
--
-- "How many are open" has no month, which is why none of this lives in the
-- flow function above. Returned per owner rather than as three scalars so the
-- tab's headline tiles and its per-owner chart come from ONE call and cannot
-- contradict each other; the tiles are the sum of these rows.
--
-- OPEN is counted on the COLUMNS (`completed_at`, `canceled_at`, `deleted_at`,
-- `archived_at` all null), never on `task_statuses.is_open`. The two disagree
-- on an archived task and on a task completed without its status following, and
-- the columns are what every partial index and every task-list filter use -- so
-- this counter equals the list a user lands on when they click it
-- (`OPEN_TASK_FILTER` in `taskBuckets.ts`).
--
-- `nb_overdue` is a SUBSET of `nb_open`, never a sibling. Anything stacking
-- them must subtract first or every late task is drawn twice; `workloadOf()`
-- does that subtraction once, for every caller.
--
-- One pass per owner with `count(*) filter (...)`, not three subqueries over
-- the same rows -- the shape `team_workload_summary` settled on after measuring
-- 330 ms against 35 ms.
--
create or replace function public.task_stock_stats(
    p_sales_id bigint default null
) returns table (
    sales_id       bigint,
    owner_name     text,
    nb_open        bigint,
    nb_overdue     bigint,
    nb_due_next_7d bigint
)
language sql
stable
set search_path to ''
as $$
    with agg as (
        select tk.owner_sales_id as owner_id,
               count(*) filter (
                   where tk.archived_at is null
                     and tk.completed_at is null
                     and tk.canceled_at is null) as open_tasks,
               count(*) filter (
                   where tk.archived_at is null
                     and tk.completed_at is null
                     and tk.canceled_at is null
                     and tk.due_date < now()) as overdue,
               count(*) filter (
                   where tk.archived_at is null
                     and tk.completed_at is null
                     and tk.canceled_at is null
                     and tk.due_date >= now()
                     and tk.due_date < now() + interval '7 days') as due_next_7d
          from public.tasks tk
         where tk.deleted_at is null
           and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
         group by tk.owner_sales_id
    )
    select a.owner_id,
           nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
           a.open_tasks::bigint,
           a.overdue::bigint,
           a.due_next_7d::bigint
      from agg a
      join public.sales s on s.id = a.owner_id;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: activity mix by type
-- ---------------------------------------------------------------------------
--
-- Counted on COMPLETED tasks, not on created ones: the question is what work
-- actually happened, and a planned call that never took place is not activity.
-- `task_types` is the only activity-type vocabulary in the schema -- there are
-- no call, email or meeting records, so "a meeting" here means "a task of type
-- meeting that somebody closed".
--
create or replace function public.task_type_stats(
    p_from     date,
    p_to       date,
    p_sales_id bigint default null
) returns table (
    type_key     text,
    type_label   text,
    nb_completed bigint
)
language sql
stable
set search_path to ''
as $$
    select ty.key,
           ty.label,
           count(*)::bigint
      from public.tasks tk
      join public.task_types ty on ty.id = tk.task_type_id
     where tk.deleted_at is null
       and tk.completed_at is not null
       and tk.completed_at::date between p_from and p_to
       and (p_sales_id is null or tk.owner_sales_id = p_sales_id)
     group by ty.key, ty.label;
$$;

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

-- ===========================================================================
-- Quotes / CPQ module (docs/proposals/quotes-cpq-module.md, Phase 2)
-- ===========================================================================

-- Quote visibility as a callable predicate, mirroring `can_see_deal`.
--
-- The `quote-attachments` storage policy has to give the same answer the select
-- policy on public.quotes gives, and a policy cannot join to a table the reader
-- may not read -- hence SECURITY DEFINER with a pinned search_path.
create or replace function public.can_see_quote(p_quote_id bigint) returns boolean
    language sql stable security definer
    set search_path to ''
as $$
    select (select public.can_manage_all())
        or exists (
            select 1
              from public.quotes q
             where q.id = p_quote_id
               and q.sales_id = (select public.current_sale_id())
        );
$$;

--
-- Derived columns the client never supplies
--
-- Several columns here exist only to carry a composite foreign key
-- (`quote_versions.currency`, `quote_lines.quote_id`, `quote_comments.currency`).
-- They are derived from the parent rather than posted, because a client that
-- had to supply them could supply the WRONG one -- which is the exact row the
-- composite keys exist to make unrepresentable. Deriving them here means the
-- constraint never has to fire in normal operation.
--

-- BEFORE INSERT on quotes: the document number and the author.
create or replace function public.quotes_set_defaults() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    -- A sequence rather than `max(quote_number) + 1`: the latter locks the
    -- whole table and still collides under concurrency, and a gap in a quote
    -- number is not a problem worth a lock.
    if new.quote_number is null or btrim(new.quote_number) = '' then
        new.quote_number := 'Q-' || to_char(now(), 'YYYY') || '-'
            || lpad(nextval('public.quote_number_seq')::text, 5, '0');
    end if;

    -- A quote is born a draft, whatever the request body says. The status guard
    -- only watches UPDATE, so without this an INSERT would be the one way to put
    -- a quote straight into 'accepted' with not a single history row behind it.
    new.status_key := 'draft';

    if new.created_by is null then
        new.created_by := public.current_sale_id();
    end if;

    return new;
end;
$$;

-- AFTER INSERT on quotes: the working draft.
--
-- A quote with no version is a row the UI cannot render and the line editor
-- cannot write to, so version 1 is not something a client has to remember to
-- create. `issued_at` stays null, which is what makes it the editable draft.
create or replace function public.quotes_seed_first_version() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    insert into public.quote_versions
        (quote_id, currency, version_number, valid_until, terms)
    values (new.id, new.currency, 1, new.valid_until, new.terms);
    return new;
end;
$$;

-- BEFORE INSERT on quote_versions: the currency carrier and the next number.
create or replace function public.quote_versions_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if new.currency is null then
        select q.currency into new.currency
          from public.quotes q where q.id = new.quote_id;
    end if;

    if new.version_number is null then
        select coalesce(max(v.version_number), 0) + 1 into new.version_number
          from public.quote_versions v where v.quote_id = new.quote_id;
    end if;

    return new;
end;
$$;

-- The header's `valid_until` and `terms`, kept equal to the current version's.
--
-- Both columns exist on the quote AND on each version. The version is the
-- source: it is what the document prints and what a link's expiry is clamped
-- to. The header copy exists for `quotes_expiring_idx` -- the sweeper's only
-- query -- and for the list, so it must say what the CURRENT version says: the
-- draft while there is one, otherwise the newest issued document. Two writable
-- copies meant a quote could print one date and expire on another.
--
-- AFTER INSERT OR UPDATE OF valid_until, terms on quote_versions. Issued
-- versions are frozen, so the row firing this is always the newest one.
create or replace function public.quote_versions_sync_header() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    perform set_config('app.quote_header_sync', new.quote_id::text, true);

    update public.quotes q
       set valid_until = new.valid_until,
           terms       = new.terms
     where q.id = new.quote_id
       and (q.valid_until is distinct from new.valid_until
            or q.terms is distinct from new.terms);

    perform set_config('app.quote_header_sync', '', true);

    return null;
end;
$$;

-- BEFORE UPDATE on quotes: the header copy is not a second place to type.
--
-- A client writes `valid_until` / `terms` on INSERT, where they seed version 1,
-- and on the draft version after that. The trigger's WHEN clause compares
-- values, so a record posted back unchanged -- react-admin's habit -- passes.
create or replace function public.quotes_header_guard() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if coalesce(current_setting('app.quote_header_sync', true), '') <> old.id::text then
        raise exception 'valid_until and terms of quote % belong to its current version: edit the draft version',
                old.id
            using errcode = 'check_violation', detail = 'quote_header_derived';
    end if;
    return new;
end;
$$;

-- BEFORE INSERT on quote_lines: the quote carrier.
create or replace function public.quote_lines_set_carrier() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if new.quote_id is null then
        select v.quote_id into new.quote_id
          from public.quote_versions v where v.id = new.version_id;
    end if;
    return new;
end;
$$;

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

-- BEFORE INSERT on quote_comments: the currency carrier, the author, the thread
-- and the clock.
create or replace function public.quote_comments_before_insert() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_parent public.quote_comments;
begin
    if new.currency is null then
        select q.currency into new.currency
          from public.quotes q where q.id = new.quote_id;
    end if;

    -- Authorship comes from the session, never from the request body: a client
    -- that could name its own author could forge a colleague's remark. A
    -- CUSTOMER comment is not written through this path at all -- it arrives
    -- through the portal function, which holds the service role -- and the
    -- `quote_comments_author` constraint refuses to attribute one to a `sales`
    -- row whatever gets posted here.
    --
    -- An internal comment is signed by its `sales` row and by nothing else: a
    -- name typed into the request would be the name the portal shows the
    -- customer.
    if new.author_kind = 'internal' then
        new.author_sales_id := public.current_sale_id();
        new.author_name     := null;
        new.author_email    := null;
    end if;

    -- One level of replies (§2.5), on the same quote. A reply to a reply is
    -- re-parented to the root rather than refused, the rule
    -- `task_comments_before_insert()` follows. A parent on ANOTHER quote is
    -- refused: `parent_id` cascades on delete, so a thread spanning two quotes
    -- is one purge away from removing the other quote's messages.
    if new.parent_id is not null then
        select * into v_parent from public.quote_comments c where c.id = new.parent_id;
        if not found or v_parent.quote_id is distinct from new.quote_id then
            raise exception 'comment % is not on quote %', new.parent_id, new.quote_id
                using errcode = 'check_violation', detail = 'quote_comment_parent_invalid';
        end if;
        new.parent_id := coalesce(v_parent.parent_id, v_parent.id);
    end if;

    -- What the thread is read by comes from the server: a comment posted with
    -- last month's date would reorder a negotiation, and one posted as already
    -- read would never raise the attention badge.
    new.created_at          := now();
    new.edited_at           := null;
    new.deleted_at          := null;
    new.read_by_internal_at := null;

    return new;
end;
$$;

-- BEFORE UPDATE on quote_comments: what a written comment still accepts.
--
-- A comment is a message somebody may already have read, so the only changes
-- are the ones that say what happened to it:
--
--   * its author edits the BODY of an internal comment, which stamps
--     `edited_at` on the server's clock, so "edited" can be neither faked nor
--     hidden -- the portal shows it to the customer too;
--   * its author deletes it SOFTLY, `deleted_at` stamped the same way. There is
--     no hard delete (no policy, no privilege): the row stays as a tombstone in
--     the team's thread and leaves the customer's;
--   * somebody on the team marks a CUSTOMER comment read, through
--     `mark_quote_comments_read()` -- the only change a customer comment accepts
--     at all. A customer's words are the other side's record of the
--     negotiation, and nobody on this side rewrites or removes them.
--
-- Everything else -- the quote, the author, the audience, the thread, the date
-- -- is refused, and so is any change to a deleted comment. Values are compared
-- rather than column names refused, because react-admin posts the whole record
-- back.
--
-- WHO may update is the row level security's decision: the author, for an
-- internal comment; nobody signed in, for a customer's. That is why the read
-- mark is a function.
create or replace function public.quote_comments_before_update() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if old.deleted_at is not null
       or new.quote_id        is distinct from old.quote_id
       or new.currency        is distinct from old.currency
       or new.version_id      is distinct from old.version_id
       or new.parent_id       is distinct from old.parent_id
       or new.author_sales_id is distinct from old.author_sales_id
       or new.author_kind     is distinct from old.author_kind
       or new.author_name     is distinct from old.author_name
       or new.author_email    is distinct from old.author_email
       or new.visibility      is distinct from old.visibility
       or new.created_at      is distinct from old.created_at
       or new.edited_at       is distinct from old.edited_at
       or (old.author_kind = 'customer'
           and (new.body is distinct from old.body
                or new.deleted_at is distinct from old.deleted_at))
       or (old.author_kind = 'internal'
           and new.read_by_internal_at is distinct from old.read_by_internal_at) then
        raise exception 'quote comment % cannot be changed that way', old.id
            using errcode = 'check_violation', detail = 'quote_comment_column_protected';
    end if;

    if new.body is distinct from old.body then
        new.edited_at := now();
    end if;

    if new.deleted_at is not null then
        new.deleted_at := now();
    end if;

    return new;
end;
$$;

--
-- Totals (D8): computed by the server, never by the browser
--
-- The per-line arithmetic is in generated columns on `quote_lines`. This rolls
-- those lines up onto the version, so "the total" has exactly one definition
-- and it is the sum of what the document visibly shows.
create or replace function public.refresh_quote_version_totals(p_version_id bigint)
returns void
    language plpgsql security definer
    set search_path to ''
as $$
begin
    -- The totals are system-owned columns (see `quote_versions_freeze_guard`);
    -- this is the function that owns them.
    perform set_config('app.quote_version_system_write', p_version_id::text, true);

    update public.quote_versions v
       set subtotal       = coalesce(t.gross, 0),
           discount_total = coalesce(t.disc, 0),
           tax_total      = coalesce(t.tax, 0),
           total          = coalesce(t.total, 0)
      from (
        select sum(l.line_gross)    as gross,
               sum(l.line_discount) as disc,
               sum(l.line_tax)      as tax,
               sum(l.line_total)    as total
          from public.quote_lines l
         where l.version_id = p_version_id
      ) t
     where v.id = p_version_id;

    perform set_config('app.quote_version_system_write', '', true);
end;
$$;

create or replace function public.quote_lines_refresh_totals() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if tg_op = 'DELETE' then
        perform public.refresh_quote_version_totals(old.version_id);
        return old;
    end if;

    perform public.refresh_quote_version_totals(new.version_id);

    -- A line moved between versions leaves one total stale behind it.
    if tg_op = 'UPDATE' and old.version_id is distinct from new.version_id then
        perform public.refresh_quote_version_totals(old.version_id);
    end if;

    return new;
end;
$$;

--
-- Immutability (§4)
--
-- `issued_at is not null` means "a customer was shown this". Two guards enforce
-- it, and both have to exist: one stops the lines from moving under a frozen
-- document, the other stops the header from being rewritten.
--
-- KNOWN CONSEQUENCE, accepted and handled rather than hidden: these fire on
-- CASCADE DELETE too, and a service-role DELETE holds the privilege and still
-- hits the trigger. `purge_quotes()` is what makes a database reset possible at
-- all, and `app.quote_purge` is the one documented way past these guards.
--

create or replace function public.quote_lines_freeze_guard() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_version_ids bigint[];
    v_version_id  bigint;
    v_issued      timestamp with time zone;
    v_status      text;
begin
    if coalesce(current_setting('app.quote_purge', true), '') = 'on' then
        if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    -- On UPDATE both ends are checked: moving a line OFF a frozen version
    -- rewrites that document just as surely as editing it in place.
    if tg_op = 'INSERT' then
        v_version_ids := array[new.version_id];
    elsif tg_op = 'DELETE' then
        v_version_ids := array[old.version_id];
    else
        v_version_ids := array[old.version_id, new.version_id];
    end if;

    foreach v_version_id in array v_version_ids loop
        -- Resolved through the version, not `quote_lines.quote_id`: on INSERT
        -- that carrier is filled by `quote_lines_set_carrier`, which fires AFTER
        -- this trigger (triggers of one kind fire in name order).
        select v.issued_at, q.status_key into v_issued, v_status
          from public.quote_versions v
          join public.quotes q on q.id = v.quote_id
         where v.id = v_version_id;

        if v_issued is not null then
            raise exception 'quote version % is issued: its lines are immutable',
                    v_version_id
                using errcode = 'check_violation', detail = 'quote_version_frozen';
        end if;

        -- The draft's lines are editable only while the QUOTE is a draft. Once it
        -- is pending approval or approved, the lines are what somebody is signing
        -- off on: editing them afterwards would let a rep get a discount approved
        -- and then raise it. Sending the quote back to draft is the way to edit.
        if v_status is distinct from 'draft' then
            raise exception 'quote lines are editable only while the quote is a draft (it is %)',
                    coalesce(v_status, 'missing')
                using errcode = 'check_violation', detail = 'quote_not_draft';
        end if;
    end loop;

    if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.quote_versions_freeze_guard() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if coalesce(current_setting('app.quote_purge', true), '') = 'on' then
        if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    -- An issued version is the document a customer was shown. The only columns
    -- any later statement may touch are the ones that record what HAPPENED to
    -- it (superseded, accepted, rejected), and only through the functions that
    -- own those facts.
    --
    -- The GUC carries the VERSION ID rather than a boolean, so a second version
    -- updated later in the same transaction is not unfrozen by the first one's
    -- flag.
    if old.issued_at is not null
       and coalesce(current_setting('app.quote_version_unfreeze', true), '')
           <> old.id::text then
        raise exception 'quote version % is issued and immutable', old.id
            using errcode = 'check_violation', detail = 'quote_version_frozen';
    end if;

    -- A DRAFT is editable, but not all of it. Its header -- validity, terms, the
    -- discount somebody asked for -- belongs to the person drafting; every other
    -- column belongs to a function. Without this a client could stamp
    -- `issued_at` onto its own draft, skipping the discount gate and the token,
    -- or write `total = 1` onto a figure the server is supposed to compute (D8).
    --
    -- Compared as "the row minus the editable keys" rather than by refusing
    -- column names, so a client posting the whole record back unchanged -- which
    -- is what react-admin does -- still passes.
    if tg_op = 'UPDATE'
       and old.issued_at is null
       and coalesce(current_setting('app.quote_version_system_write', true), '')
           <> old.id::text
       and (to_jsonb(old) - array['valid_until', 'terms', 'discount_percent'])
           is distinct from
           (to_jsonb(new) - array['valid_until', 'terms', 'discount_percent']) then
        raise exception 'only valid_until, terms and discount_percent of draft quote version % are editable',
                old.id
            using errcode = 'check_violation', detail = 'quote_version_column_protected';
    end if;

    if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- The two history tables are append-only (§5). `reject_history_mutation()`
-- exists already but names `task_events` in its message; this one reports the
-- table it actually fired on, and knows about the retention path.
create or replace function public.reject_quote_history_mutation() returns trigger
    language plpgsql
    set search_path to ''
as $$
begin
    if coalesce(current_setting('app.quote_purge', true), '') = 'on' then
        return old;
    end if;

    raise exception 'public.% is append-only (attempted %)', tg_table_name, tg_op
        using errcode = 'insufficient_privilege';
end;
$$;

--
-- Catalogue history (§2.2)
--
-- One row per watched field, the `log_task_changes()` idiom. Separate from the
-- quote history because mixing a catalogue's edits with a negotiation's events
-- makes both harder to read.
create or replace function public.products_audit() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_actor   bigint := public.current_sale_id();
    v_field   text;
    v_watched text[] := array['sku', 'name', 'description', 'kind', 'category',
                              'unit', 'list_price', 'currency', 'tax_rate_id'];
begin
    if tg_op = 'INSERT' then
        insert into public.product_events
            (product_id, event_type, sales_id, new_value)
        values (new.id, 'product.created', v_actor,
                to_jsonb(new) - 'search_tsv');
        return new;
    end if;

    -- Activation is its own event rather than a field change: "who took this
    -- off the price book" is the question this table is actually asked.
    if old.is_active is distinct from new.is_active then
        insert into public.product_events
            (product_id, event_type, sales_id, field, old_value, new_value)
        values (new.id,
                case when new.is_active then 'product.reactivated'
                     else 'product.deactivated' end,
                v_actor, 'is_active',
                to_jsonb(old.is_active), to_jsonb(new.is_active));
    end if;

    foreach v_field in array v_watched loop
        if to_jsonb(old) -> v_field is distinct from to_jsonb(new) -> v_field then
            insert into public.product_events
                (product_id, event_type, sales_id, field, old_value, new_value)
            values (new.id, 'product.updated', v_actor, v_field,
                    to_jsonb(old) -> v_field, to_jsonb(new) -> v_field);
        end if;
    end loop;

    return new;
end;
$$;

--
-- Status machine (§3)
--
-- Three mechanisms make the RPC the only write path, copied from the task
-- module: a guard trigger that refuses a bare UPDATE, a shared core that owns
-- the legality rules, and an authenticated wrapper that adds the capability
-- check the core cannot make.
--

create or replace function public.quotes_status_guard() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
begin
    if old.status_key is distinct from new.status_key
       and coalesce(current_setting('app.quote_transition_to', true), '') = '' then
        raise exception 'status changes must go through public.transition_quote()'
            using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

-- AFTER UPDATE OF status_key ON quotes: records the transition.
--
-- The single insertion point for `quote_status_changes`, so the history cannot
-- disagree with the quotes table. `apply_quote_status()` puts the reason and the
-- actor in transaction-local settings first.
--
-- The `app.quote_status_quote_id` guard is load-bearing here, exactly as it is
-- in `deals_log_stage_change()`: `revise_quote()` touches the quote twice in one
-- transaction, and without the scoping check the second update would inherit the
-- first one's reason.
create or replace function public.quotes_log_status_change() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_reason      text  := nullif(btrim(coalesce(current_setting('app.quote_status_reason', true), '')), '');
    v_actor_kind  text  := nullif(coalesce(current_setting('app.quote_status_actor_kind', true), ''), '');
    v_actor       text  := nullif(coalesce(current_setting('app.quote_status_sales_id', true), ''), '');
    v_attachments jsonb := nullif(coalesce(current_setting('app.quote_status_attachments', true), ''), '')::jsonb;
    v_override    text  := nullif(btrim(coalesce(current_setting('app.quote_status_override', true), '')), '');
    v_for_quote   text  := coalesce(current_setting('app.quote_status_quote_id', true), '');
    v_seq         bigint;
begin
    if v_for_quote <> new.id::text then
        v_reason := null;
        v_actor_kind := null;
        v_actor := null;
        v_attachments := null;
        v_override := null;
    end if;

    -- `changed_at` cannot order two moves made in one transaction: `now()` is
    -- the transaction timestamp and would be identical for both. The same
    -- per-entity counter `emit_task_event()` computes.
    select coalesce(max(sc.seq), 0) + 1 into v_seq
      from public.quote_status_changes sc where sc.quote_id = new.id;

    insert into public.quote_status_changes
        (quote_id, from_status, to_status, reason, sales_id, actor_kind,
         attachments, override_reason, seq)
    values (
        new.id,
        old.status_key,
        new.status_key,
        v_reason,
        nullif(v_actor, '')::bigint,
        coalesce(v_actor_kind, 'internal'),
        case
            when v_attachments is null or jsonb_typeof(v_attachments) <> 'array' then null
            else (select array_agg(element)
                    from jsonb_array_elements(v_attachments) as element)
        end,
        v_override,
        v_seq);

    return null;
end;
$$;

-- The shared core of every status change, `service_role` only.
--
-- It exists as a SEPARATE function from `transition_quote()` because the portal
-- path has no `current_sale_id()` and must not restate the legality rules:
-- without this split, `quote_portal_accept()` would duplicate them and the two
-- copies would drift. The caller is responsible for having established that the
-- actor is allowed to act at all; this function decides whether the MOVE is
-- legal.
create or replace function public.apply_quote_status(
    p_quote_id        bigint,
    p_to_status       text,
    p_reason          text    default null,
    p_actor_kind      text    default 'internal',
    p_actor_sales_id  bigint  default null,
    p_attachments     jsonb   default null,
    p_override_reason text    default null
) returns public.quotes
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote      public.quotes;
    v_transition public.quote_transitions;
begin
    -- Validated before anything else: a null actor would make the
    -- `allowed_actor` comparison below null, and a null condition does not
    -- raise -- the check would silently pass for exactly the caller it was
    -- written to stop.
    if p_actor_kind is null or p_actor_kind not in ('internal', 'customer', 'system') then
        raise exception 'unknown actor kind %', coalesce(p_actor_kind, 'null')
            using errcode = 'check_violation';
    end if;

    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    if v_quote.status_key = p_to_status then
        raise exception 'quote % is already in status %', p_quote_id, p_to_status
            using errcode = 'check_violation', detail = 'quote_status_unchanged';
    end if;

    select * into v_transition
      from public.quote_transitions t
     where t.from_status_key = v_quote.status_key
       and t.to_status_key = p_to_status;

    if not found then
        raise exception 'illegal transition % -> %', v_quote.status_key, p_to_status
            using errcode = 'check_violation', detail = 'quote_transition_illegal';
    end if;

    -- Without this check the portal function would be one parameter away from
    -- driving `draft -> approved`.
    if v_transition.allowed_actor <> 'any'
       and v_transition.allowed_actor <> p_actor_kind then
        raise exception '% may not move a quote from % to %',
                p_actor_kind, v_quote.status_key, p_to_status
            using errcode = 'insufficient_privilege',
                  detail = 'quote_transition_actor_not_allowed';
    end if;

    if v_transition.requires_reason and coalesce(btrim(p_reason), '') = '' then
        raise exception 'a reason is required to move a quote from % to %',
                v_quote.status_key, p_to_status
            using errcode = 'check_violation', detail = 'quote_reason_required';
    end if;

    -- "You cannot send what you never issued." Checked against the existence of
    -- an issued version rather than against a status, so it stays true whichever
    -- path reached this transition.
    if v_transition.requires_issued_version
       and not exists (select 1 from public.quote_versions v
                        where v.quote_id = p_quote_id and v.issued_at is not null) then
        raise exception 'quote % has no issued version', p_quote_id
            using errcode = 'check_violation', detail = 'quote_not_issued';
    end if;

    -- Handed to the trigger, which is what actually writes the history row.
    perform set_config('app.quote_status_quote_id', p_quote_id::text, true);
    perform set_config('app.quote_status_reason', coalesce(p_reason, ''), true);
    perform set_config('app.quote_status_actor_kind', p_actor_kind, true);
    perform set_config('app.quote_status_sales_id',
                       coalesce(p_actor_sales_id::text, ''), true);
    perform set_config('app.quote_status_attachments',
                       coalesce(p_attachments, '[]'::jsonb)::text, true);
    perform set_config('app.quote_status_override',
                       coalesce(p_override_reason, ''), true);
    -- Tells `quotes_status_guard()` this status change is legitimate.
    perform set_config('app.quote_transition_to', p_to_status, true);

    update public.quotes
       set status_key = p_to_status,
           updated_at = now()
     where id = p_quote_id
    returning * into v_quote;

    -- Cleared so a later statement in the same transaction cannot reuse them.
    perform set_config('app.quote_transition_to', '', true);
    perform set_config('app.quote_status_quote_id', '', true);
    perform set_config('app.quote_status_reason', '', true);
    perform set_config('app.quote_status_actor_kind', '', true);
    perform set_config('app.quote_status_sales_id', '', true);
    perform set_config('app.quote_status_attachments', '', true);
    perform set_config('app.quote_status_override', '', true);

    return v_quote;
end;
$$;

-- The authenticated status-change path.
--
-- `select … for update` first, then the capability check that RESTATES the RLS
-- predicate (because SECURITY DEFINER bypasses it), then delegation to
-- `apply_quote_status`. Without the restatement this is a way for a rep to move
-- somebody else's quote.
create or replace function public.transition_quote(
    p_quote_id    bigint,
    p_to_status   text,
    p_reason      text  default null,
    p_attachments jsonb default '[]'::jsonb
) returns public.quotes
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote public.quotes;
    v_actor bigint := public.current_sale_id();
begin
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to move quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    -- Approving is what raises the discount ceiling at issue time (see
    -- `quote_discount_gate`), so it is the one internal move an owner may not
    -- make: a rep approving their own quote would be a rep setting their own
    -- limit, and the board would show a sign-off nobody gave.
    if p_to_status = 'approved' and not (select public.can_manage_all()) then
        raise exception 'only a manager may approve quote %', p_quote_id
            using errcode = 'insufficient_privilege',
                  detail = 'quote_approval_requires_manager';
    end if;

    return public.apply_quote_status(
        p_quote_id, p_to_status, p_reason, 'internal', v_actor, p_attachments, null);
end;
$$;

--
-- Discount approval (§3.1)
--
-- ONE function with TWO callers -- the RPC that enforces it and the dialog that
-- explains it. Two implementations of one rule drift, and always in the same
-- direction: a dialog enabling a button for something the server then refuses.
--
-- `max_allowed: null` with `ok: true` reports "no rule applies" SEPARATELY from
-- "satisfied", because they are different facts and only one of them means the
-- control is working.
--
-- The effective discount is read off the LINES, not off
-- `quote_versions.discount_percent`: that column is a record of intent, and the
-- commercial control has to be based on what the document actually grants.
--
-- SECURITY DEFINER to read `quotes` and `quote_lines` regardless of who asks, so
-- the number is the same for a rep and for the manager auditing them. The quotes
-- select policy is therefore restated here -- without it this is a probe for the
-- existence of other people's quotes.
create or replace function public.quote_discount_gate(p_quote_id bigint)
returns jsonb
    language plpgsql stable security definer
    set search_path to ''
as $$
declare
    v_quote     public.quotes;
    v_role      public.sales_role;
    v_rule      public.quote_discount_rules;
    v_rule_found boolean;
    v_max       numeric(5,2);
    v_approver_max  numeric(5,2);
    v_approver_role public.sales_role;
    v_approval_reason text;
    v_version_id bigint;
    v_gross     numeric(14,2);
    v_disc      numeric(14,2);
    v_effective numeric(5,2);
    v_offending bigint[];
    v_reason_required boolean;
begin
    select * into v_quote from public.quotes where id = p_quote_id;
    if not found or not (select public.can_see_quote(p_quote_id)) then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- The role of the person ASKING, which is also the person who would issue.
    v_role := (select public.current_sales_role());

    -- The current version: the draft when there is one, otherwise the newest
    -- issued document. `revise_quote()` numbers a new draft max + 1, so the
    -- highest number is always the one being worked on.
    select v.id into v_version_id
      from public.quote_versions v
     where v.quote_id = p_quote_id
     order by v.version_number desc
     limit 1;

    select coalesce(sum(l.line_gross), 0), coalesce(sum(l.line_discount), 0)
      into v_gross, v_disc
      from public.quote_lines l
     where l.version_id = v_version_id;

    v_effective := case when coalesce(v_gross, 0) = 0 then 0
                        else round(v_disc * 100 / v_gross, 2) end;

    select * into v_rule
      from public.quote_discount_rules r where r.role = v_role;
    v_rule_found := found;

    -- No role (a service-role caller), no rule for it, the rule not switched on
    -- yet, or a quote created before it was: the issue is free. Reported with
    -- `max_allowed: null` so a caller can tell "no rule applies here" from
    -- "the rule is satisfied".
    if v_role is null
       or not v_rule_found
       or v_rule.enforced_from is null
       or v_quote.created_at < v_rule.enforced_from then
        return jsonb_build_object(
            'quote_id', p_quote_id,
            'role', v_role,
            'max_allowed', null,
            'effective_discount_percent', v_effective,
            'ok', true,
            'reason_required', false,
            'requires_reason_above', null,
            'since', v_rule.enforced_from,
            'offending_line_ids', '[]'::jsonb);
    end if;

    v_max := v_rule.max_discount_percent;

    -- AN APPROVAL RAISES THE CEILING TO THE APPROVER'S. That is what
    -- `pending_approval -> approved` is for: a rep whose limit is 10% sends the
    -- quote up, a manager signs off, and the rep may then issue at up to the
    -- manager's 25%. Never lower than the asker's own ceiling -- an approval by
    -- somebody with a smaller limit is not a reason to refuse what the asker
    -- could have issued alone.
    --
    -- The latest approval is the one that counts, and it certifies exactly the
    -- lines it saw: `quote_lines_freeze_guard` refuses line edits once the quote
    -- has left 'draft', so the only way to change them is to send the quote back,
    -- and the next approval is a new row.
    if v_quote.status_key = 'approved' then
        select r.max_discount_percent, s.role, nullif(btrim(sc.reason), '')
          into v_approver_max, v_approver_role, v_approval_reason
          from public.quote_status_changes sc
          join public.sales s on s.id = sc.sales_id
          left join public.quote_discount_rules r on r.role = s.role
         where sc.quote_id = p_quote_id
           and sc.to_status = 'approved'
         order by sc.seq desc
         limit 1;

        if v_approver_max is not null and v_approver_max > v_max then
            v_max := v_approver_max;
        end if;
    end if;

    -- Which lines to point the user at. The aggregate decides the verdict; this
    -- is what lets the dialog say WHERE the problem is instead of only that
    -- there is one.
    select coalesce(array_agg(l.id order by l."position", l.id), '{}'::bigint[])
      into v_offending
      from public.quote_lines l
     where l.version_id = v_version_id
       and l.discount_percent > v_max;

    -- THE REASON BAND. Inside the ceiling but above `requires_reason_above`, an
    -- issue still needs a written reason, which `issue_quote_version()` stores
    -- on the `sent` history row. A written approval already is one: the rep is
    -- not asked to restate a motive a manager signed off on. Reported here
    -- rather than recomputed by the caller, so the dialog and the RPC cannot
    -- disagree about when the reason box is mandatory.
    v_reason_required := coalesce(v_effective > v_rule.requires_reason_above, false)
        and v_approval_reason is null;

    return jsonb_build_object(
        'quote_id', p_quote_id,
        'role', v_role,
        'approved_by_role', v_approver_role,
        'max_allowed', v_max,
        'effective_discount_percent', v_effective,
        'ok', v_effective <= v_max,
        'reason_required', v_reason_required,
        'requires_reason_above', v_rule.requires_reason_above,
        'since', v_rule.enforced_from,
        'offending_line_ids', to_jsonb(v_offending));
end;
$$;

--
-- Versioning (§4)
--

-- "The customer's address on the day we sent it."
--
-- The one jsonb blob in this module. Every field is chosen for a printed
-- document: no `sales` email, no internal id, and the owner reduced to a display
-- name, because this object is rendered verbatim on a page an anonymous visitor
-- can open (§6.3).
create or replace function public.quote_party_snapshot(p_quote_id bigint)
returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select jsonb_build_object(
        'company', jsonb_build_object(
            'name',           c.name,
            'address',        c.address,
            'zipcode',        c.zipcode,
            'city',           c.city,
            'state_abbr',     c.state_abbr,
            'country',        c.country,
            'tax_identifier', c.tax_identifier,
            'phone_number',   c.phone_number,
            'website',        c.website),
        'contact', case when ct.id is null then null else jsonb_build_object(
            'first_name', ct.first_name,
            'last_name',  ct.last_name,
            'title',      ct.title,
            'email',      jsonb_path_query_first(ct.email_jsonb, '$[0]."email"'),
            'phone',      jsonb_path_query_first(ct.phone_jsonb, '$[0]."number"')) end,
        'owner', jsonb_build_object(
            'name', coalesce(
                nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
                'Sales team')),
        'snapshot_at', now())
      from public.quotes q
      join public.companies c on c.id = q.company_id
      left join public.contacts ct on ct.id = q.contact_id
      left join public.sales s on s.id = q.sales_id
     where q.id = p_quote_id;
$$;

-- Mint one link to an issued document, and return the raw token once.
--
-- `service_role` only: its callers (`issue_quote_version()`,
-- `create_quote_link()`) have already decided who may share the quote, and this
-- is the ONE place that decides how a link is made. "A link never outlives the
-- offer it points at" is a security property, and two copies of it drift.
create or replace function public.mint_quote_token(
    p_version_id  bigint,
    p_token_days  integer default 30,
    p_token_label text    default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_version  public.quote_versions;
    v_token    bytea := extensions.gen_random_bytes(32);
    v_token_id bigint;
    v_expires  timestamp with time zone;
begin
    -- A token pointing at a draft is a link whose contents change while the
    -- customer reads them.
    select * into v_version from public.quote_versions v where v.id = p_version_id;
    if not found or v_version.issued_at is null then
        raise exception 'quote version % is not an issued document', p_version_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    -- `least` ignores nulls, so a document with no `valid_until` simply gets the
    -- requested window.
    v_expires := least(
        now() + make_interval(days => greatest(coalesce(p_token_days, 30), 1)),
        (v_version.valid_until + 1)::timestamp with time zone);

    insert into public.quote_access_tokens
        (quote_id, version_id, token_hash, label, created_by, expires_at)
    values (v_version.quote_id, v_version.id, sha256(v_token), p_token_label,
            public.current_sale_id(), v_expires)
    returning id into v_token_id;

    return jsonb_build_object(
        'token_id',   v_token_id,
        'token',      encode(v_token, 'hex'),
        'expires_at', v_expires);
end;
$$;

-- Turn the working draft into a document, and mint the link that shows it.
--
-- Everything here happens in ONE transaction because the halves are not
-- independently meaningful: a version stamped issued with no token is a
-- document nobody can open, and a token pointing at a draft is a link whose
-- contents change while the customer reads them.
--
-- Returns the RAW TOKEN, exactly once. Only its sha256 is stored, so there is no
-- second chance to read it -- which is the whole point, and why the UI offers
-- "generate a new link" (`create_quote_link()`) rather than a copy button that
-- cannot work.
--
-- Two written motives, kept apart because they mean different things:
-- `p_override_reason` is an admin skipping the discount ceiling and lands on
-- `override_reason`; `p_reason` explains a discount inside the ceiling but above
-- the reason band and lands on `reason`.
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
           party_snapshot = public.quote_party_snapshot(p_quote_id)
     where v.id = v_version.id
    returning * into v_version;

    perform set_config('app.quote_version_system_write', '', true);

    v_link := public.mint_quote_token(v_version.id, p_token_days, p_token_label);

    perform public.apply_quote_status(
        p_quote_id, 'sent', v_reason, 'internal', v_actor, null, v_override);

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number) || v_link;
end;
$$;

-- Open a new draft from the last issued document.
--
-- COPYING rather than editing is what makes the snapshot hold: the customer's
-- copy stays byte-identical to what they were shown. This is also what Odoo and
-- Salesforce CPQ do, and the reason is the same -- an accepted quote is a
-- commercial commitment, and a commitment you can edit is not one.
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

    insert into public.quote_versions
        (quote_id, currency, version_number, valid_until, terms, discount_percent)
    select v.quote_id, v.currency, v.version_number + 1,
           v.valid_until, v.terms, v.discount_percent
      from public.quote_versions v where v.id = v_last.id
    returning * into v_new;

    insert into public.quote_lines
        (version_id, quote_id, product_id, sku, name, description, unit,
         quantity, unit_price, discount_percent, tax_rate_id, tax_rate_percent,
         "position")
    select v_new.id, l.quote_id, l.product_id, l.sku, l.name, l.description,
           l.unit, l.quantity, l.unit_price, l.discount_percent, l.tax_rate_id,
           l.tax_rate_percent, l."position"
      from public.quote_lines l
     where l.version_id = v_last.id
     order by l."position", l.id;

    -- The link that pointed at the superseded document stops working. Leaving it
    -- live would let a customer accept a version we have just replaced.
    update public.quote_access_tokens t
       set revoked_at = now(), revoked_by = v_actor
     where t.version_id = v_last.id and t.revoked_at is null;

    return v_new;
end;
$$;

-- "Generate a new link" (§6.2): another token for the document the customer is
-- currently being offered. Returns the raw token once, exactly like the issue;
-- older links keep working until somebody revokes them.
--
-- Refused while a revision is open: `revise_quote()` revoked the links to the
-- version it is replacing precisely so nobody accepts it, and a fresh link would
-- reopen that door. Refused for an elapsed offer too, because the expiry clamp
-- would hand back a link that is dead on arrival.
create or replace function public.create_quote_link(
    p_quote_id    bigint,
    p_token_days  integer default 30,
    p_token_label text    default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote   public.quotes;
    v_actor   bigint := public.current_sale_id();
    v_version public.quote_versions;
begin
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    -- Same rule as `issue_quote_version()`. Restated because SECURITY DEFINER
    -- bypasses RLS.
    if not (select public.can_manage_all())
       and v_quote.sales_id is distinct from v_actor then
        raise exception 'no permission to share quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_version
      from public.quote_versions v
     where v.quote_id = p_quote_id
       and v.issued_at is not null
       and v.superseded_at is null;
    if not found then
        raise exception 'quote % has no issued version to link to', p_quote_id
            using errcode = 'no_data_found', detail = 'quote_not_issued';
    end if;

    if exists (select 1 from public.quote_versions v
                where v.quote_id = p_quote_id and v.issued_at is null) then
        raise exception 'quote % has an open revision: issue it instead', p_quote_id
            using errcode = 'check_violation', detail = 'quote_draft_exists';
    end if;

    if v_version.valid_until < current_date then
        raise exception 'the offer in quote % expired on %', p_quote_id, v_version.valid_until
            using errcode = 'check_violation', detail = 'quote_validity_elapsed';
    end if;

    return jsonb_build_object(
        'quote_id',       p_quote_id,
        'version_id',     v_version.id,
        'version_number', v_version.version_number)
        || public.mint_quote_token(v_version.id, p_token_days, p_token_label);
end;
$$;

-- Withdraw one link. `authenticated`, restating the quote capability check.
--
-- Returns nothing: the token row carries `token_hash`, which must never reach a
-- browser -- that is what `quote_access_tokens_summary` is for. The caller
-- re-reads the summary.
create or replace function public.revoke_quote_token(p_token_id bigint)
returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote_id bigint;
    v_revoked  timestamp with time zone;
    v_actor    bigint := public.current_sale_id();
begin
    select t.quote_id, t.revoked_at into v_quote_id, v_revoked
      from public.quote_access_tokens t where t.id = p_token_id for update;
    if not found then
        raise exception 'token % not found', p_token_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_see_quote(v_quote_id)) then
        raise exception 'no permission to revoke token %', p_token_id
            using errcode = 'insufficient_privilege';
    end if;

    -- Idempotent: revoking twice is not an error, and re-stamping the date would
    -- rewrite when the link actually stopped working.
    if v_revoked is null then
        update public.quote_access_tokens t
           set revoked_at = now(), revoked_by = v_actor
         where t.id = p_token_id;
    end if;
end;
$$;

-- Somebody on the team has read what the customer wrote (§11's attention badge,
-- `quotes_summary.nb_unanswered_customer_comments`). `authenticated`, restating
-- the quote capability check.
--
-- A function because no policy can say it: a comment update belongs to its
-- author, and a customer comment has no author on this side. Marks every unread
-- customer comment of the quote and returns how many; an already-read thread is
-- 0, not an error.
create or replace function public.mark_quote_comments_read(p_quote_id bigint)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    if not exists (select 1 from public.quotes q where q.id = p_quote_id) then
        raise exception 'quote % not found', p_quote_id
            using errcode = 'no_data_found';
    end if;

    if not (select public.can_see_quote(p_quote_id)) then
        raise exception 'no permission on quote %', p_quote_id
            using errcode = 'insufficient_privilege';
    end if;

    update public.quote_comments c
       set read_by_internal_at = now()
     where c.quote_id = p_quote_id
       and c.author_kind = 'customer'
       and c.read_by_internal_at is null
       and c.deleted_at is null;
    get diagnostics v_count = row_count;

    return v_count;
end;
$$;

--
-- Retention (§4, F5)
--
-- The freeze guards and the append-only triggers fire on a service-role DELETE
-- too -- it holds the privilege and still hits the trigger. So `e2e/fixtures.ts`
-- `resetDb()` cannot reset the database without this function, which is why it
-- is Phase 2 work and not Phase 12 work. `resetDb` already routes around exactly
-- this for tasks.
--
-- ONE DIFFERENCE FROM `purge_tasks()`, worth stating because the signatures
-- match: `task_events` deliberately carries NO foreign key to `tasks`, so its
-- history outlives the row and `p_purge_history` is what destroys it. The quote
-- history DOES reference `quotes`, so it goes with the quote whatever the flag
-- says. The flag additionally truncates both tables, which is what a disposable
-- database wants and what nothing else should ever do.
create or replace function public.purge_quotes(
    p_quote_ids     bigint[] default null,
    p_purge_history boolean  default false
) returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_count integer;
begin
    perform set_config('app.quote_purge', 'on', true);

    delete from public.quote_portal_events
     where p_quote_ids is null or quote_id = any (p_quote_ids);
    delete from public.quote_access_tokens
     where p_quote_ids is null or quote_id = any (p_quote_ids);
    delete from public.quote_comments
     where p_quote_ids is null or quote_id = any (p_quote_ids);
    delete from public.quote_lines
     where p_quote_ids is null or quote_id = any (p_quote_ids);
    delete from public.quote_versions
     where p_quote_ids is null or quote_id = any (p_quote_ids);
    delete from public.quote_status_changes
     where p_quote_ids is null or quote_id = any (p_quote_ids);

    delete from public.quotes
     where p_quote_ids is null or id = any (p_quote_ids);
    get diagnostics v_count = row_count;

    if p_purge_history then
        truncate public.quote_portal_events, public.quote_status_changes;
    end if;

    perform set_config('app.quote_purge', 'off', true);

    return v_count;
end;
$$;

-- The catalogue's half of the retention path (§13.6 #8, #19).
--
-- `products` carries append-only `product_events`, so a plain service-role
-- DELETE hits `reject_quote_history_mutation()` through the cascade -- and
-- `products.sales_id` then pins every user who ever created one, which is what
-- made `e2e/fixtures.ts` `resetDb()` unable to reach `sales`.
--
-- No user-facing path deletes a product and none is added here: `canAccess`
-- refuses `products/delete` for every role, the trigger refuses it for
-- everyone, and what is no longer sold is DEACTIVATED. This is the retention
-- path, `service_role` only, exactly like `purge_quotes()` above.
--
-- `price_list_items` first, because `product_id` is `on delete restrict` on
-- purpose. `tax_rates` keeps its seeded rows: they are reference data like
-- `quote_statuses`, and a reset that took `iva_19` with it would leave every
-- later spec quoting at 0% in silence.
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

-- An offer nobody answered stops being an offer, and somebody is told before it
-- does.
--
-- Both loops run on `quotes_expiring_idx`, so the pass costs the size of the
-- pending work rather than the size of the quote history. The expiry goes
-- through `apply_quote_status()` like every other transition, so it lands in the
-- same audit trail as a move somebody made by hand -- attributed to 'system',
-- with no `sales_id`, because inventing an actor is worse than admitting there
-- was none.
--
-- Scheduled daily at 06:00 UTC by `20260921130000_quote_expiry_scheduler.sql`;
-- until Phase 11 it existed and nothing ever called it (§13.6 #9).
create or replace function public.sweep_expired_quotes()
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_id     bigint;
    v_number text;
    v_count  integer := 0;
begin
    -- The warning first: a quote expiring in exactly three days (§8). Keyed on
    -- the date rather than a range, so a sweep that ran twice in one day does
    -- not warn twice -- and `dedupe_key` catches it even if it does.
    for v_id, v_number in
        select q.id, q.quote_number from public.quotes q
         where q.valid_until = current_date + 3
           and q.status_key in ('sent', 'viewed', 'under_review')
         order by q.valid_until
    loop
        perform public.notify_quote_event(
            v_id, 'expiring',
            format('%s expires in 3 days', v_number),
            'The customer has not answered yet.',
            (current_date + 3)::text,
            null,
            'crm.notifications.quote.expiring',
            jsonb_build_object('number', v_number));
    end loop;

    for v_id, v_number in
        select q.id, q.quote_number from public.quotes q
         where q.valid_until is not null
           and q.valid_until < current_date
           and q.status_key in ('sent', 'viewed', 'under_review')
         order by q.valid_until
    loop
        perform public.apply_quote_status(
            v_id, 'expired', 'validity elapsed', 'system', null, null, null);

        -- After the transition, not before: a notification for a move that
        -- then failed is worse than none, because it is believed.
        perform public.notify_quote_event(
            v_id, 'expired',
            format('%s has expired', v_number),
            'The offer lapsed without an answer.',
            null,
            null,
            'crm.notifications.quote.expired',
            jsonb_build_object('number', v_number));

        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

--
-- The customer portal (§6, Phase 7)
--
-- `service_role` only, and the `quote-portal` edge function is their one
-- caller. That function authenticates by HOLDING THE TOKEN -- the entire
-- security model -- so the rules live here, where `make test-db` can defend
-- them (D7), rather than in TypeScript only an edge-function test could reach.
-- See adr/ADR-7dcff21a-PHASE-7-quote-portal-no-anon-rls.md.
--
-- The edge function hashes the token before calling: the raw token never
-- reaches the database, exactly as it is never stored in it.
--
-- TWO WAYS TO REFUSE, and the choice is not style. A refusal that must LEAVE A
-- TRACE -- a dead link somebody is still opening, a link pulled faster than a
-- person reads -- is RETURNED as `{"error": <key>}`, because raising would roll
-- the trace back with everything else. Every other refusal RAISES, with its key
-- in DETAIL like the rest of the module, so nothing it half-wrote survives.
--
-- LOCK ORDER: the quote, then the token. `revise_quote()` revokes tokens while
-- holding the quote's lock; taking the token first here would be one concurrent
-- revision away from a deadlock.
--

-- The one insertion point for `quote_portal_events`.
--
-- The caller holds the quote's row lock, and that lock is what serialises the
-- per-quote `seq`: two portal requests on one quote cannot compute the same
-- next value. The address and the browser arrive as PARAMETERS because a
-- service-role RPC has no request headers (§5) -- `request_context()` would
-- return nulls here, and an audit trail of nulls reads as complete.
create or replace function public.quote_portal_log(
    p_quote_id    bigint,
    p_version_id  bigint,
    p_token_id    bigint,
    p_event_type  text,
    p_ip_address  inet,
    p_user_agent  text,
    p_actor_name  text  default null,
    p_actor_email text  default null,
    p_payload     jsonb default '{}'::jsonb
) returns void
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_seq bigint;
begin
    select coalesce(max(e.seq), 0) + 1 into v_seq
      from public.quote_portal_events e where e.quote_id = p_quote_id;

    insert into public.quote_portal_events
        (quote_id, version_id, token_id, event_type, ip_address, user_agent,
         actor_name, actor_email, payload, seq)
    values (p_quote_id, p_version_id, p_token_id, p_event_type, p_ip_address,
            left(p_user_agent, 512), p_actor_name, p_actor_email,
            coalesce(p_payload, '{}'::jsonb), v_seq);
end;
$$;

-- Resolve a token hash to the document it opens, or to the reason it does not.
--
-- Returns `{token_id, quote_id, version_id}` with the quote and the token
-- locked, or `{error}` after recording why:
--
--   * `quote_link_invalid` for a hash nobody minted, a revoked link and an
--     expired one alike. ONE answer for all three, never a 403: a distinct
--     reply would confirm to whoever holds the value that it once was a link.
--     A dead link that names a quote leaves a `token_invalid` event on it, so
--     the rep can see the customer still trying the old one; an unknown hash
--     names no quote to file anything under.
--   * `quote_portal_throttled` once a link has made `v_max_events` requests in
--     `v_window`. This defends against SCRAPING, not guessing -- a 256-bit
--     token is not guessable -- by capping how fast one link can be pulled.
--     The refusal is recorded at most once per window, so a scraper cannot
--     turn the throttle into the flood of writes it exists to stop.
create or replace function public.quote_portal_resolve(
    p_token_hash bytea,
    p_ip_address inet,
    p_user_agent text
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_max_events constant integer  := 30;
    v_window     constant interval := interval '1 minute';
    v_token      public.quote_access_tokens;
    v_recent     integer;
begin
    -- Read without a lock, only to learn which quote to lock first.
    select t.* into v_token
      from public.quote_access_tokens t where t.token_hash = p_token_hash;
    if not found then
        return jsonb_build_object('error', 'quote_link_invalid');
    end if;

    perform 1 from public.quotes q where q.id = v_token.quote_id for update;

    -- Re-read under the lock: a revocation may have committed in between.
    select t.* into v_token
      from public.quote_access_tokens t where t.id = v_token.id for update;

    -- Counted up to the limit and no further, so a hammered link costs this
    -- query no more than a quiet one.
    select count(*) into v_recent
      from (select 1 from public.quote_portal_events e
             where e.token_id = v_token.id
               and e.occurred_at > clock_timestamp() - v_window
             limit v_max_events) recent;

    if v_recent >= v_max_events then
        if not exists (select 1 from public.quote_portal_events e
                        where e.token_id = v_token.id
                          and e.event_type = 'throttled'
                          and e.occurred_at > clock_timestamp() - v_window) then
            perform public.quote_portal_log(
                v_token.quote_id, v_token.version_id, v_token.id, 'throttled',
                p_ip_address, p_user_agent);
        end if;
        return jsonb_build_object(
            'error',               'quote_portal_throttled',
            'retry_after_seconds', extract(epoch from v_window)::integer);
    end if;

    if v_token.revoked_at is not null or v_token.expires_at <= now() then
        perform public.quote_portal_log(
            v_token.quote_id, v_token.version_id, v_token.id, 'token_invalid',
            p_ip_address, p_user_agent);
        return jsonb_build_object('error', 'quote_link_invalid');
    end if;

    return jsonb_build_object(
        'token_id',   v_token.id,
        'quote_id',   v_token.quote_id,
        'version_id', v_token.version_id);
end;
$$;

-- The payload: one issued version, as the customer may see it (§6.3).
--
-- EVERY KEY BUILT HERE IS A PUBLIC DISCLOSURE. There is no row level security
-- behind this read -- the service role reads everything -- so a column named
-- below reaches anybody holding the link, and a typo is a data leak. That is
-- the price of D1, and building the payload in SQL is what makes it payable:
-- `quote_portal.test.sql` pins the exact key set of every group and asserts
-- what must never appear (the internal notes of the quote and of every
-- product, internal and deleted comments, the team's emails, the commenting
-- customer's email, the deal, internal ids, the customer's address, the token
-- and its hash). A key added here without its assertion turns that test red on
-- purpose.
--
-- The groups are `QuoteDocumentData`'s (`quotes/quoteDocumentData.ts`), so the
-- portal renders the one document component through the one mapper.
--
-- `parties` is picked KEY BY KEY from `party_snapshot` rather than passed
-- through: the snapshot is built for the internal document, and a field added
-- to `quote_party_snapshot()` later must not reach the portal by accident.
-- `quote.title` is disclosed on purpose -- the printed quotation already
-- carries it -- and the owner appears only as the display name the snapshot
-- took.
--
-- `actions` reads the status machine, never a list of statuses: which answers
-- a customer may give is `quote_transitions`' decision, the same rule the
-- internal toolbar follows. The document conditions beside it are the ones
-- `quote_portal_begin_answer()` enforces, so the buttons and the refusals
-- cannot disagree.
--
-- `etag` (Phase 9, §6.5) is the sha256 of the rest of the payload, so it
-- changes exactly when what the customer can see changes, and for no other
-- reason. Not a list of columns: a second description of the payload is one
-- that drifts -- §6.3's `max(comment.created_at)` already missed an edit and a
-- soft delete -- and a column like `quotes.updated_at` would move on an
-- internal note, telling whoever holds the link that the team is at work on
-- something they cannot see. Nothing a portal request itself writes (a view, a
-- counter, `last_seen_at`) is in the payload, which is what keeps a poll from
-- refetching forever.
--
-- Null for a draft: a draft is not a document.
create or replace function public.quote_portal_document(p_version_id bigint)
returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select doc.body || jsonb_build_object(
               'etag', encode(sha256(convert_to(doc.body::text, 'UTF8')), 'hex'))
      from (
    select jsonb_build_object(
        'quote', jsonb_build_object(
            'number',         q.quote_number,
            'title',          q.title,
            'status',         q.status_key,
            'currency',       v.currency,
            'version_number', v.version_number,
            'issued_at',      v.issued_at,
            'valid_until',    v.valid_until,
            'is_superseded',  v.superseded_at is not null),
        'parties', jsonb_build_object(
            'company', case when jsonb_typeof(v.party_snapshot -> 'company') = 'object'
                then jsonb_build_object(
                    'name',           v.party_snapshot -> 'company' -> 'name',
                    'address',        v.party_snapshot -> 'company' -> 'address',
                    'zipcode',        v.party_snapshot -> 'company' -> 'zipcode',
                    'city',           v.party_snapshot -> 'company' -> 'city',
                    'state_abbr',     v.party_snapshot -> 'company' -> 'state_abbr',
                    'country',        v.party_snapshot -> 'company' -> 'country',
                    'tax_identifier', v.party_snapshot -> 'company' -> 'tax_identifier',
                    'phone_number',   v.party_snapshot -> 'company' -> 'phone_number',
                    'website',        v.party_snapshot -> 'company' -> 'website')
                end,
            'contact', case when jsonb_typeof(v.party_snapshot -> 'contact') = 'object'
                then jsonb_build_object(
                    'first_name', v.party_snapshot -> 'contact' -> 'first_name',
                    'last_name',  v.party_snapshot -> 'contact' -> 'last_name',
                    'title',      v.party_snapshot -> 'contact' -> 'title',
                    'email',      v.party_snapshot -> 'contact' -> 'email',
                    'phone',      v.party_snapshot -> 'contact' -> 'phone')
                end,
            'owner', jsonb_build_object(
                'name', v.party_snapshot -> 'owner' -> 'name')),
        'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'position',         l.position,
                       'sku',              l.sku,
                       'name',             l.name,
                       'description',      l.description,
                       'unit',             l.unit,
                       'quantity',         l.quantity,
                       'unit_price',       l.unit_price,
                       'discount_percent', l.discount_percent,
                       'tax_rate_percent', l.tax_rate_percent,
                       'line_total',       l.line_total)
                   order by l.position, l.id)
              from public.quote_lines l
             where l.version_id = v.id), '[]'::jsonb),
        'totals', jsonb_build_object(
            'subtotal',       v.subtotal,
            'discount_total', v.discount_total,
            'tax_total',      v.tax_total,
            'total',          v.total),
        'terms', v.terms,
        -- The shared thread of the QUOTE, every version's, oldest first (§2.5):
        -- a negotiation outlives the version it started on. Never an internal
        -- comment, never a deleted one, and of each author only what the page
        -- prints -- the kind and a display name. A team member is named by
        -- their `sales` row, as the owner is; a customer by the name they
        -- signed with. The customer's email stays with the team: whoever else
        -- holds the link has no business reading it.
        'comments', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'author_kind', c.author_kind,
                       'author_name', case c.author_kind
                                          when 'customer' then c.author_name
                                          else nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), '')
                                      end,
                       'body',        c.body,
                       'created_at',  c.created_at,
                       'edited_at',   c.edited_at)
                   order by c.created_at, c.id)
              from public.quote_comments c
              left join public.sales s on s.id = c.author_sales_id
             where c.quote_id = q.id
               and c.visibility = 'shared'
               and c.deleted_at is null), '[]'::jsonb),
        -- From the configuration singleton, because a page with no layout
        -- never loads it (F3). Null when the installation never set one; the
        -- page falls back to the build's own branding, never to a guess.
        'branding', jsonb_build_object(
            'title', (select nullif(btrim(c.config ->> 'title'), '')
                        from public.configuration c where c.id = 1),
            -- The settings screen stores the logo as `{src}`; a configuration
            -- written by hand holds a plain string.
            'logo_url', (select nullif(case jsonb_typeof(c.config -> 'lightModeLogo')
                                           when 'string' then c.config ->> 'lightModeLogo'
                                           when 'object' then c.config -> 'lightModeLogo' ->> 'src'
                                       end, '')
                           from public.configuration c where c.id = 1)),
        'actions', jsonb_build_object(
            'can_accept', answerable.is_answerable and exists (
                select 1 from public.quote_transitions t
                 where t.from_status_key = q.status_key
                   and t.to_status_key = 'accepted'
                   and t.allowed_actor in ('customer', 'any')),
            'can_reject', answerable.is_answerable and exists (
                select 1 from public.quote_transitions t
                 where t.from_status_key = q.status_key
                   and t.to_status_key = 'rejected'
                   and t.allowed_actor in ('customer', 'any')),
            -- The thread stays open while the negotiation does: the live
            -- version of a quote whose status is not terminal. Read off
            -- `quote_statuses.is_terminal`, never a list of statuses, and read
            -- HERE by `quote_portal_comment()` too, so the form and the refusal
            -- are one predicate.
            'can_comment', v.superseded_at is null and exists (
                select 1 from public.quote_statuses st
                 where st.key = q.status_key
                   and not st.is_terminal)),
        'acceptance', jsonb_build_object(
            'accepted_at',      v.accepted_at,
            'accepted_by_name', v.accepted_by_name,
            'rejected_at',      v.rejected_at)) as body
      from public.quote_versions v
      join public.quotes q on q.id = v.quote_id
     cross join lateral (
        select v.superseded_at is null
               and v.accepted_at is null
               and v.rejected_at is null
               and (v.valid_until is null or v.valid_until >= current_date)
               as is_answerable
     ) answerable
     where v.id = p_version_id
       and v.issued_at is not null
      ) doc;
$$;

-- The customer opens the link.
--
-- Every successful open is one `viewed` event and one more on the token's
-- `view_count`. The first look at the LIVE document also moves the quote to
-- `viewed`, when the status machine has that edge for the customer from where
-- the quote stands. Opening a superseded version moves nothing: an old link is
-- not news about the document the rep is negotiating now.
create or replace function public.quote_portal_view(
    p_token_hash bytea,
    p_ip_address inet default null,
    p_user_agent text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_access  jsonb;
    v_quote   public.quotes;
    v_version public.quote_versions;
begin
    v_access := public.quote_portal_resolve(p_token_hash, p_ip_address, p_user_agent);
    if v_access ? 'error' then
        return v_access;
    end if;

    select * into v_quote from public.quotes q
     where q.id = (v_access ->> 'quote_id')::bigint;
    select * into v_version from public.quote_versions v
     where v.id = (v_access ->> 'version_id')::bigint;

    update public.quote_access_tokens t
       set view_count = t.view_count + 1,
           last_seen_at = now()
     where t.id = (v_access ->> 'token_id')::bigint;

    perform public.quote_portal_log(
        v_quote.id, v_version.id, (v_access ->> 'token_id')::bigint, 'viewed',
        p_ip_address, p_user_agent, null, null,
        jsonb_build_object('version_number', v_version.version_number));

    if v_version.superseded_at is null
       and exists (select 1 from public.quote_transitions t
                    where t.from_status_key = v_quote.status_key
                      and t.to_status_key = 'viewed'
                      and t.allowed_actor in ('customer', 'any')) then
        perform public.apply_quote_status(
            v_quote.id, 'viewed', null, 'customer', null, null, null);
    end if;

    return public.quote_portal_document(v_version.id);
end;
$$;

-- What accepting and rejecting check before either writes anything (§6.4).
--
-- Returns what `quote_portal_resolve()` returns, plus the trimmed `name` and
-- `email` the answer is signed with. In this order, under the quote's lock --
-- so two tabs answering at once serialise there:
--
--   1. the input: the name and email, required to accept and optional to
--      reject, capped the way the edge function caps them. Checked before the
--      token is even looked up, so a malformed request reads nothing;
--   2. the link is alive;
--   3. the version is still answerable: not superseded
--      (`quote_version_superseded`, the "a newer version was issued" page), not
--      already answered (`quote_version_answered` -- a version is accepted or
--      rejected once, `quote_versions_one_outcome`), not past its validity
--      (`quote_validity_elapsed`, the key the issue already uses).
--
-- The status machine is the fourth check and the callers make it, through
-- `apply_quote_status()`: that is where a second click lands, so idempotency
-- comes from the state machine rather than from a mechanism that could
-- disagree with it.
create or replace function public.quote_portal_begin_answer(
    p_token_hash     bytea,
    p_name           text,
    p_email          text,
    p_party_required boolean,
    p_ip_address     inet,
    p_user_agent     text
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_name    text := nullif(btrim(coalesce(p_name, '')), '');
    v_email   text := nullif(btrim(coalesce(p_email, '')), '');
    v_access  jsonb;
    v_version public.quote_versions;
begin
    if char_length(coalesce(v_name, '')) > 200
       or char_length(coalesce(v_email, '')) > 320 then
        raise exception 'a portal answer exceeds its length limit'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_input_too_long';
    end if;

    if p_party_required and v_name is null then
        raise exception 'a name is required to answer a quote'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_name_required';
    end if;

    if (p_party_required and v_email is null)
       or (v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
        raise exception 'a valid email is required to answer a quote'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_email_invalid';
    end if;

    v_access := public.quote_portal_resolve(p_token_hash, p_ip_address, p_user_agent);
    if v_access ? 'error' then
        return v_access;
    end if;

    select * into v_version from public.quote_versions v
     where v.id = (v_access ->> 'version_id')::bigint;

    if v_version.superseded_at is not null then
        raise exception 'quote version % was superseded by a newer one', v_version.id
            using errcode = 'check_violation', detail = 'quote_version_superseded';
    end if;

    if v_version.accepted_at is not null or v_version.rejected_at is not null then
        raise exception 'quote version % has already been answered', v_version.id
            using errcode = 'check_violation', detail = 'quote_version_answered';
    end if;

    if v_version.valid_until < current_date then
        raise exception 'the offer in quote version % expired on %',
                v_version.id, v_version.valid_until
            using errcode = 'check_violation', detail = 'quote_validity_elapsed';
    end if;

    return v_access || jsonb_build_object('name', v_name, 'email', v_email);
end;
$$;

-- The customer accepts the version the link opens.
--
-- One transaction writes what §6.4 lists: the status move (through
-- `apply_quote_status()`, as 'customer'), the history row it triggers, the
-- acceptance columns on the version -- through the per-version unfreeze hole,
-- the only way past the freeze -- and the `accepted` portal event with the
-- address and the browser. The owner's notification is Phase 11.
create or replace function public.quote_portal_accept(
    p_token_hash bytea,
    p_name       text,
    p_email      text,
    p_ip_address inet default null,
    p_user_agent text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_answer  jsonb;
    v_version public.quote_versions;
begin
    v_answer := public.quote_portal_begin_answer(
        p_token_hash, p_name, p_email, true, p_ip_address, p_user_agent);
    if v_answer ? 'error' then
        return v_answer;
    end if;

    perform public.apply_quote_status(
        (v_answer ->> 'quote_id')::bigint, 'accepted', null, 'customer',
        null, null, null);

    perform set_config('app.quote_version_unfreeze', v_answer ->> 'version_id', true);

    update public.quote_versions v
       set accepted_at         = now(),
           accepted_by_name    = v_answer ->> 'name',
           accepted_by_email   = v_answer ->> 'email',
           accepted_ip         = p_ip_address,
           acceptance_method   = 'portal_click',
           -- What was agreed to, beside who agreed: the version and the figure
           -- as they stood at the click, and the browser that clicked. Internal
           -- only: no payload and no timeline row reads this column.
           acceptance_evidence = jsonb_build_object(
               'token_id',       (v_answer ->> 'token_id')::bigint,
               'version_number', v.version_number,
               'currency',       v.currency,
               'total',          v.total,
               'user_agent',     left(p_user_agent, 512))
     where v.id = (v_answer ->> 'version_id')::bigint
    returning * into v_version;

    perform set_config('app.quote_version_unfreeze', '', true);

    perform public.quote_portal_log(
        v_version.quote_id, v_version.id, (v_answer ->> 'token_id')::bigint,
        'accepted', p_ip_address, p_user_agent,
        v_answer ->> 'name', v_answer ->> 'email',
        jsonb_build_object('version_number', v_version.version_number,
                           'currency',       v_version.currency,
                           'total',          v_version.total));

    return public.quote_portal_document(v_version.id);
end;
$$;

-- The customer declines the version the link opens.
--
-- The same shape as accepting, with a reason instead of a signature: the code
-- is required, so "why we lost it" is reportable; the free text, the name and
-- the email are optional, because a customer asked to fill in a form to say no
-- mostly does not say anything at all.
create or replace function public.quote_portal_reject(
    p_token_hash  bytea,
    p_reason_code text,
    p_reason      text default null,
    p_name        text default null,
    p_email       text default null,
    p_ip_address  inet default null,
    p_user_agent  text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_code    text := nullif(btrim(coalesce(p_reason_code, '')), '');
    v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
    v_answer  jsonb;
    v_version public.quote_versions;
begin
    -- The list `quote_versions.rejected_reason_code` checks, restated so a bad
    -- code is refused with a key the portal can explain. Left to the
    -- constraint it would be a bare 23514 -- which the freeze guard raises too,
    -- so the two could not be told apart.
    if v_code is null
       or v_code not in ('price', 'terms', 'delivery_time', 'product', 'other') then
        raise exception 'unknown rejection reason %', coalesce(v_code, 'null')
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_reason_code_invalid';
    end if;

    if char_length(coalesce(v_reason, '')) > 2000 then
        raise exception 'a portal answer exceeds its length limit'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_input_too_long';
    end if;

    v_answer := public.quote_portal_begin_answer(
        p_token_hash, p_name, p_email, false, p_ip_address, p_user_agent);
    if v_answer ? 'error' then
        return v_answer;
    end if;

    perform public.apply_quote_status(
        (v_answer ->> 'quote_id')::bigint, 'rejected', v_reason, 'customer',
        null, null, null);

    perform set_config('app.quote_version_unfreeze', v_answer ->> 'version_id', true);

    update public.quote_versions v
       set rejected_at          = now(),
           rejected_reason      = v_reason,
           rejected_reason_code = v_code
     where v.id = (v_answer ->> 'version_id')::bigint
    returning * into v_version;

    perform set_config('app.quote_version_unfreeze', '', true);

    perform public.quote_portal_log(
        v_version.quote_id, v_version.id, (v_answer ->> 'token_id')::bigint,
        'rejected', p_ip_address, p_user_agent,
        v_answer ->> 'name', v_answer ->> 'email',
        jsonb_build_object('version_number', v_version.version_number,
                           'reason_code',    v_code,
                           'reason',         v_reason));

    return public.quote_portal_document(v_version.id);
end;
$$;

-- The customer writes to the team (§2.5, Phase 8).
--
-- The comment is `customer`-authored and `shared` -- the only shape
-- `quote_comments_author` lets a customer comment take -- signed with the name
-- the customer typed, and filed under the version the link opens. In the order
-- the answers use, under the quote's lock:
--
--   1. the input: a body, a name to sign it with (the table requires one), an
--      optional email that is one, and the lengths. The signature follows the
--      rules and keys of `quote_portal_begin_answer()`; the body is capped at
--      4000 characters, inside the table's 8000, so a message in any script
--      fits the edge function's 16 KB request;
--   2. the link is alive, through `quote_portal_resolve()` and its throttle;
--   3. the thread is open (`quote_portal_comments_closed`), which is the
--      payload's own `actions.can_comment` -- read from the document rather than
--      restated, so the form and the refusal cannot disagree. A customer who
--      accepted, declined or holds a superseded link still READS the thread;
--   4. the link has not written `v_max_comments` comments in `v_window`
--      (`quote_portal_comment_limit`). Nobody can edit or delete a customer
--      comment, so a leaked link must not be able to bury a negotiation under
--      messages nobody can remove -- and the request throttle is a reader's
--      pace, thirty a minute, not a writer's.
--
-- The `commented` event carries the address and the browser, as every act on
-- the portal does; the comment row carries neither. Notifying the owner is
-- Phase 11 -- until then `quotes_summary.nb_unanswered_customer_comments` is
-- the signal.
create or replace function public.quote_portal_comment(
    p_token_hash bytea,
    p_body       text,
    p_name       text,
    p_email      text default null,
    p_ip_address inet default null,
    p_user_agent text default null
) returns jsonb
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_max_comments constant integer  := 20;
    v_window       constant interval := interval '1 hour';
    v_body     text := nullif(btrim(coalesce(p_body, '')), '');
    v_name     text := nullif(btrim(coalesce(p_name, '')), '');
    v_email    text := nullif(btrim(coalesce(p_email, '')), '');
    v_access   jsonb;
    v_token_id bigint;
    v_version  public.quote_versions;
    v_recent   integer;
begin
    if char_length(coalesce(v_body, '')) > 4000
       or char_length(coalesce(v_name, '')) > 200
       or char_length(coalesce(v_email, '')) > 320 then
        raise exception 'a portal comment exceeds its length limit'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_input_too_long';
    end if;

    if v_body is null then
        raise exception 'a comment needs a body'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_body_required';
    end if;

    if v_name is null then
        raise exception 'a name is required to sign a comment'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_name_required';
    end if;

    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'the email a comment is signed with is not valid'
            using errcode = 'invalid_parameter_value',
                  detail  = 'quote_portal_email_invalid';
    end if;

    v_access := public.quote_portal_resolve(p_token_hash, p_ip_address, p_user_agent);
    if v_access ? 'error' then
        return v_access;
    end if;
    v_token_id := (v_access ->> 'token_id')::bigint;

    select * into v_version from public.quote_versions v
     where v.id = (v_access ->> 'version_id')::bigint;

    if not coalesce((public.quote_portal_document(v_version.id)
                       -> 'actions' ->> 'can_comment')::boolean, false) then
        raise exception 'the thread of quote % is closed to the customer', v_version.quote_id
            using errcode = 'check_violation',
                  detail  = 'quote_portal_comments_closed';
    end if;

    -- Counted up to the limit and no further, as the request throttle counts.
    select count(*) into v_recent
      from (select 1 from public.quote_portal_events e
             where e.token_id = v_token_id
               and e.event_type = 'commented'
               and e.occurred_at > clock_timestamp() - v_window
             limit v_max_comments) recent;

    if v_recent >= v_max_comments then
        raise exception 'link % has written % comments within %',
                v_token_id, v_max_comments, v_window
            using errcode = 'check_violation',
                  detail  = 'quote_portal_comment_limit';
    end if;

    insert into public.quote_comments
        (quote_id, version_id, author_kind, author_name, author_email, visibility, body)
    values (v_version.quote_id, v_version.id, 'customer', v_name, v_email, 'shared', v_body);

    perform public.quote_portal_log(
        v_version.quote_id, v_version.id, v_token_id, 'commented',
        p_ip_address, p_user_agent, v_name, v_email,
        jsonb_build_object('version_number', v_version.version_number));

    return public.quote_portal_document(v_version.id);
end;
$$;

-- Has the document changed? The portal's poll (Phase 9, §6.5).
--
-- The page asks every ten seconds while it is on screen, and fetches the
-- document again -- through `quote_portal_view()`, which records it -- only
-- when the answer differs from the `etag` of the payload it shows.
--
-- WRITES NOTHING, and takes no lock. A tab left open overnight asks 8,640
-- times; recorded as views, that is a trail nobody can read and a view counter
-- that means nothing. For the same reason it is not throttled: the throttle is
-- a count of what the portal WROTE. What this function discloses is one hash of
-- a document the caller can already open, so the cost of a hammered link is
-- one document built per call, bounded by the gateway in front.
--
-- A dead link gets the answer `quote_portal_resolve()` gives it, without the
-- trace: the page stops asking and says so, and it is a reload -- a real open
-- -- that records the attempt as `token_invalid`.
create or replace function public.quote_portal_version(p_token_hash bytea)
returns jsonb
    language sql stable security definer
    set search_path to ''
as $$
    select coalesce(
        (select jsonb_build_object(
                    'etag', public.quote_portal_document(t.version_id) ->> 'etag')
           from public.quote_access_tokens t
          where t.token_hash = p_token_hash
            and t.revoked_at is null
            and t.expires_at > now()),
        jsonb_build_object('error', 'quote_link_invalid'));
$$;

--
-- The quote notifier (§8, Phase 11)
--
-- One writer for every quote notification, so quiet hours, the mute list and
-- the dedupe window have ONE implementation rather than one per call site.
-- Modelled on the body of `dispatch_due_reminders()` and deliberately not
-- extracted from it: that loop also advances reminder schedules and fires task
-- events, and a shared helper would have to be passed a task or a quote and
-- branch internally -- which is the parallel system §8 Option C was rejected
-- for, arriving by another road.
--
-- CHANNELS. `in_app` always: the row IS the delivery, Realtime streams it to
-- the bell, and it costs nothing. `email` only for the four events a rep
-- cannot afford to miss while out of the app -- an answer, and the two
-- validity notices. A `viewed` or a customer comment is in-app only, because
-- an email per customer open is the fatigue this module's preferences exist to
-- prevent, and because those two are the high-frequency events.
--
-- A recipient with no `sales` row, or a disabled one, is skipped -- never
-- silently attributed to somebody else.
--
create or replace function public.notify_quote_event(
    p_quote_id        bigint,
    p_event           text,
    p_title           text,
    p_body            text    default null,
    p_dedupe_suffix   text    default null,
    p_extra_recipient bigint  default null,
    -- What the client renders. `p_title` / `p_body` remain the English
    -- fallback for a reader with no catalogue.
    p_message_key     text    default null,
    p_message_params  jsonb   default null
)
returns integer
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote     public.quotes;
    v_recipient bigint;
    v_prefs     public.notification_preferences;
    v_channel   public.reminder_channel;
    v_channels  public.reminder_channel[];
    v_send_at   timestamp with time zone;
    v_status    text;
    v_error     text;
    v_written   integer := 0;
begin
    select * into v_quote from public.quotes q where q.id = p_quote_id;
    if v_quote.id is null then
        return 0;
    end if;

    -- The events worth an email are the terminal ones and the two that carry a
    -- deadline. The rest stay in the bell.
    v_channels := case
        when p_event in ('accepted', 'rejected', 'expired', 'expiring')
            then array['in_app', 'email']::public.reminder_channel[]
        else array['in_app']::public.reminder_channel[]
    end;

    for v_recipient in
        select s.id
          from public.sales s
         where s.disabled is not true
           and s.id in (v_quote.sales_id, p_extra_recipient)
    loop
        v_prefs := public.notification_prefs_for(v_recipient);

        foreach v_channel in array v_channels loop
            v_send_at := now();
            v_status  := 'queued';
            v_error   := null;

            if v_channel = any (v_prefs.muted_channels) then
                -- The row still exists, marked, so the suppression is auditable
                -- rather than a gap somebody has to explain.
                v_status := 'skipped';
                v_error  := format('channel %s muted by recipient', v_channel);

            elsif v_channel <> 'in_app' then
                -- Several acts on one quote inside the window are one ping.
                -- Scoped to the quote, exactly as the task path scopes it to
                -- the task.
                if v_prefs.dedupe_window_minutes > 0
                   and exists (select 1 from public.task_notifications n
                                where n.entity_type = 'quote'
                                  and n.entity_id = p_quote_id
                                  and n.recipient_id = v_recipient
                                  and n.channel = v_channel
                                  and n.status <> 'skipped'
                                  and n.created_at > now()
                                      - make_interval(mins => v_prefs.dedupe_window_minutes))
                then
                    v_status := 'skipped';
                    v_error  := 'deduplicated: same quote already notified in this window';
                else
                    v_send_at := public.next_allowed_send_at(
                        v_send_at, v_prefs.timezone,
                        v_prefs.quiet_hours_start, v_prefs.quiet_hours_end);

                    if v_prefs.digest_mode then
                        v_send_at := greatest(
                            v_send_at,
                            public.next_digest_at(v_send_at, v_prefs.timezone,
                                                  v_prefs.digest_at));
                    end if;
                end if;
            end if;

            insert into public.task_notifications (
                task_id, entity_type, entity_id, recipient_id, channel,
                scheduled_for, title, body, message_key, message_params,
                dedupe_key, status, sent_at, delivered_at, error)
            values (
                null, 'quote', p_quote_id, v_recipient, v_channel,
                v_send_at, p_title, p_body, p_message_key, p_message_params,
                -- `quote:<id>:<event>:<suffix>:<recipient>:<channel>`. The
                -- suffix is what makes "first view of version 3" distinct from
                -- "first view of version 4" while both stay idempotent: a
                -- replayed call is a no-op, not a second ping.
                format('quote:%s:%s:%s:%s:%s', p_quote_id, p_event,
                       coalesce(p_dedupe_suffix, ''), v_recipient, v_channel),
                case when v_status <> 'queued' then v_status
                     when v_channel = 'in_app' then 'delivered'
                     else 'queued' end,
                case when v_status = 'queued' and v_channel = 'in_app' then now() end,
                case when v_status = 'queued' and v_channel = 'in_app' then now() end,
                v_error)
            on conflict (dedupe_key) do nothing;

            if found then
                v_written := v_written + 1;
            end if;
        end loop;
    end loop;

    return v_written;
end;
$$;

--
-- What the customer did, turned into a notification (§8, Phase 11)
--
-- A TRIGGER on the trail rather than a call in each portal function, and the
-- reason is §5's: the event row IS the record of what happened. Deriving the
-- notification from it means a portal path added later cannot forget to notify,
-- and "the first view of this version" is a count on the table the trigger is
-- already sitting on. The alternative -- four `perform notify_quote_event(...)`
-- lines inside four functions -- is four places to keep in step.
--
-- Only four of the seven event types notify. `token_invalid` and `throttled`
-- are security noise, not news about the document, and `downloaded` is a second
-- look at what `viewed` already reported. `sent` notifies nobody at all,
-- because the rep just did it (§8).
--
-- §8 calls the comment event `comment_added`; the column's check constraint
-- calls it `commented`, and the constraint is what exists.
--
create or replace function public.quote_portal_events_notify() returns trigger
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_quote   public.quotes;
    v_number  text;
    v_deal_owner bigint;
    v_actor   text;
    v_excerpt text;
begin
    if new.event_type not in ('viewed', 'accepted', 'rejected', 'commented') then
        return new;
    end if;

    select * into v_quote from public.quotes q where q.id = new.quote_id;
    if v_quote.id is null then
        return new;
    end if;
    v_number := v_quote.quote_number;

    -- A view is news the FIRST time a version is opened. Every later open is
    -- the same customer re-reading the same document, and a ping for each one
    -- is how a bell gets ignored.
    --
    -- "First time" is enforced by the `dedupe_key` ALONE -- the version id is
    -- the dedupe suffix, so every later view of that version computes the same
    -- key and `on conflict do nothing` drops it. An earlier draft also counted
    -- prior `viewed` events here and returned early; a mutation check could not
    -- make that guard matter, because the key had already done the work. Two
    -- mechanisms for one rule is the drift this module keeps refusing (§6.4):
    -- the one that is testable stays.
    if new.event_type = 'viewed' then
        perform public.notify_quote_event(
            new.quote_id, 'viewed',
            format('%s was opened by the customer', v_number),
            null,
            new.version_id::text,
            null,
            'crm.notifications.quote.viewed',
            jsonb_build_object('number', v_number));
        return new;
    end if;

    if new.event_type = 'commented' then
        v_actor := coalesce(nullif(btrim(coalesce(new.actor_name, '')), ''),
                            'The customer');

        -- The preview is read from the comment rather than copied into the
        -- event's payload: the trail would then hold a second copy of words
        -- that already have a home, and the two could only ever disagree.
        -- `quote_portal_comment()` writes the comment immediately before the
        -- event, in this transaction, so the newest customer comment on this
        -- version is the one that just arrived.
        select left(c.body, 140) into v_excerpt
          from public.quote_comments c
         where c.version_id = new.version_id
           and c.author_kind = 'customer'
           and c.deleted_at is null
         order by c.id desc
         limit 1;

        perform public.notify_quote_event(
            new.quote_id, 'commented',
            format('%s: %s wrote on the quotation', v_number, v_actor),
            v_excerpt,
            new.id::text,
            null,
            'crm.notifications.quote.commented',
            -- `actor` is left NULL rather than defaulted to a word: "The
            -- customer" is itself a sentence needing translation, and the
            -- client has the catalogue. The English fallback above keeps it.
            jsonb_build_object(
                'number', v_number,
                'actor',  nullif(btrim(coalesce(new.actor_name, '')), '')));
        return new;
    end if;

    -- An answer reaches the deal owner as well, when the quote was raised
    -- against somebody else's opportunity -- they are the one who has to act on
    -- it. `notify_quote_event()` resolves the pair, so one recipient named
    -- twice is still one notification.
    select d.sales_id into v_deal_owner
      from public.deals d where d.id = v_quote.deal_id;

    v_actor := nullif(btrim(coalesce(new.actor_name, '')), '');

    perform public.notify_quote_event(
        new.quote_id, new.event_type,
        case when new.event_type = 'accepted'
             then format('%s was accepted', v_number)
             else format('%s was declined', v_number) end,
        case when new.event_type = 'accepted'
             then nullif(btrim(concat_ws(' ', v_actor, 'accepted version',
                                         new.payload ->> 'version_number')), '')
             else nullif(btrim(concat_ws(' ',
                      coalesce(v_actor, 'The customer'), 'declined:',
                      coalesce(new.payload ->> 'reason_code', 'no reason given'))), '')
        end,
        new.version_id::text,
        v_deal_owner,
        case when new.event_type = 'accepted'
             then 'crm.notifications.quote.accepted'
             else 'crm.notifications.quote.rejected' end,
        jsonb_build_object(
            'number',      v_number,
            'actor',       v_actor,
            'version',     new.payload ->> 'version_number',
            -- The CODE, never a label: `price` is a value from a check
            -- constraint, and the words for it live in the catalogue beside
            -- the dialog that offered them.
            'reason_code', new.payload ->> 'reason_code'));

    return new;
end;
$$;
