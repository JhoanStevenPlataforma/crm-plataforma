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
    task_due_date timestamp with time zone
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
           c.title, c.body, c.scheduled_for, c.attempt,
           t.title, t.due_date
      from claimed c
      join public.sales s on s.id = c.recipient_id
      join public.tasks t on t.id = c.task_id;
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
    v_for_deal    text  := coalesce(current_setting('app.deal_stage_deal_id', true), '');
begin
    -- The settings belong to one specific deal. Without this check a second
    -- deal updated later in the same transaction (the kanban reindexes its
    -- neighbours on every drop) would inherit the first one's reason.
    if v_for_deal <> new.id::text then
        v_reason := null;
        v_attachments := null;
    end if;

    insert into public.deal_stage_changes
        (deal_id, from_stage, to_stage, reason, sales_id, attachments)
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
        end
    );

    return null;
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
create or replace function public.move_deal_stage(
    p_deal_id     bigint,
    p_to_stage    text,
    p_reason      text,
    p_index       integer default null,
    p_attachments jsonb   default '[]'::jsonb
) returns public.deals
    language plpgsql security definer
    set search_path to ''
as $$
declare
    v_deal  public.deals;
    v_actor bigint := public.current_sale_id();
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

    -- Handed to the trigger, which is what actually writes the history row.
    perform set_config('app.deal_stage_deal_id', p_deal_id::text, true);
    perform set_config('app.deal_stage_reason', p_reason, true);
    perform set_config('app.deal_stage_attachments', coalesce(p_attachments, '[]'::jsonb)::text, true);

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

    return v_deal;
end;
$$;
