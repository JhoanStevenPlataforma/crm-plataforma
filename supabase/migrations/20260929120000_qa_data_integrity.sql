-- QA audit, data integrity (2026-09-28).
--
-- Four rules the UI enforced only partly, or not at all, and that the audit
-- broke from the browser:
--   * a contact with no name, email or phone (a shifted CSV import);
--   * a deal with a negative amount (it shrinks every pipeline total);
--   * a lead with nothing to follow up on;
--   * two tags with the same name ("vip vip" on one contact).
--
-- Each check is added NOT VALID and then validated, so the table is scanned
-- once without holding the heavier lock for the whole scan. Existing rows that
-- would fail are repaired first where a repair is unambiguous (duplicate tags);
-- otherwise the VALIDATE fails loudly and names the constraint, which is the
-- point: bad rows must be looked at by a person, not silently rewritten.

-- 1. Duplicate tags: keep the oldest tag of each name, point every contact and
--    lead at it, then drop the others. Every DELETE carries a WHERE clause:
--    the API roles preload `safeupdate`.
create temporary table tag_merge on commit drop as
select t.id as duplicate_id, k.keep_id
from public.tags t
join (
    select lower(btrim(name)) as tag_key, min(id) as keep_id
    from public.tags
    group by lower(btrim(name))
    having count(*) > 1
) k on lower(btrim(t.name)) = k.tag_key
where t.id <> k.keep_id;

update public.contacts c
set tags = (
    select array_agg(distinct coalesce(m.keep_id, tag_id) order by coalesce(m.keep_id, tag_id))
    from unnest(c.tags) as tag_id
    left join tag_merge m on m.duplicate_id = tag_id
)
where c.tags && (select coalesce(array_agg(duplicate_id), '{}') from tag_merge);

update public.leads l
set tags = (
    select array_agg(distinct coalesce(m.keep_id, tag_id) order by coalesce(m.keep_id, tag_id))
    from unnest(l.tags) as tag_id
    left join tag_merge m on m.duplicate_id = tag_id
)
where l.tags && (select coalesce(array_agg(duplicate_id), '{}') from tag_merge);

delete from public.tags t
using tag_merge m
where t.id = m.duplicate_id;

create unique index tags_name_unique on public.tags using btree (lower(btrim(name)));

-- 2. Contacts need a name, an email or a phone. `convert_lead()` copies the
--    lead's email and phone, so a lead with any of the three converts cleanly.
alter table public.contacts
    add constraint contacts_has_identity check (
        nullif(btrim(first_name), '') is not null
        or nullif(btrim(last_name), '') is not null
        or case
            when jsonb_typeof(email_jsonb) = 'array'
                then jsonb_array_length(email_jsonb) > 0
            else false
        end
        or case
            when jsonb_typeof(phone_jsonb) = 'array'
                then jsonb_array_length(phone_jsonb) > 0
            else false
        end
    ) not valid;
alter table public.contacts validate constraint contacts_has_identity;

-- 3. Deal amounts are never negative.
alter table public.deals
    add constraint deals_amount_not_negative check (amount >= 0) not valid;
alter table public.deals validate constraint deals_amount_not_negative;

-- 4. Leads carry at least one thing to follow up on.
alter table public.leads
    add constraint leads_has_identity check (
        nullif(btrim(first_name), '') is not null
        or nullif(btrim(last_name), '') is not null
        or email is not null
        or nullif(btrim(phone), '') is not null
        or nullif(btrim(company_name), '') is not null
        or company_id is not null
    ) not valid;
alter table public.leads validate constraint leads_has_identity;
