--
-- Data integrity rules from the QA audit (migration 20260929120000).
--
-- Each of these rows was saved from the browser before the rules existed:
-- a nameless contact from a shifted CSV, a deal worth -1000, a completely blank
-- lead, and a second "vip" tag. The UI now refuses them too, but the UI is not
-- the only writer (imports, the API, other clients), so the database has to.
--
begin;

select plan(12);

-- Contacts: a name, an email or a phone.
select throws_ok(
    $$insert into public.contacts (first_name, last_name, email_jsonb, phone_jsonb)
      values ('  ', null, '[]', '[]')$$,
    '23514', null,
    'a contact with no name, email or phone is refused'
);
select lives_ok(
    $$insert into public.contacts (first_name, last_name) values ('Ada', null)$$,
    'a first name alone is enough'
);
select lives_ok(
    $$insert into public.contacts (email_jsonb) values ('[{"email":"ada@example.com","type":"Work"}]')$$,
    'an email alone is enough'
);
select lives_ok(
    $$insert into public.contacts (phone_jsonb) values ('[{"number":"+34600000000","type":"Work"}]')$$,
    'a phone alone is enough (convert_lead copies it)'
);

-- Deals: never a negative amount.
select throws_ok(
    $$insert into public.deals (name, stage, amount) values ('QA negative', 'opportunity', -1000)$$,
    '23514', null,
    'a negative deal amount is refused'
);
select lives_ok(
    $$insert into public.deals (name, stage, amount) values ('QA zero', 'opportunity', 0)$$,
    'a zero amount is allowed'
);

-- Leads: something to follow up on.
select throws_ok(
    $$insert into public.leads (first_name, company_name) values ('', ' ')$$,
    '23514', null,
    'an entirely blank lead is refused'
);
select lives_ok(
    $$insert into public.leads (company_name) values ('Acme')$$,
    'a company name alone is enough for a lead'
);
select lives_ok(
    $$insert into public.leads (email) values ('lead@example.com')$$,
    'an email alone is enough for a lead'
);

-- Tags: one per name, whatever the case or the spaces.
insert into public.tags (name, color) values ('qa-vip', '#eddcd2');
select throws_ok(
    $$insert into public.tags (name, color) values (' QA-VIP ', '#c9e4de')$$,
    '23505', null,
    'a tag differing only in case and spaces is a duplicate'
);
select lives_ok(
    $$insert into public.tags (name, color) values ('qa-vip-2', '#c9e4de')$$,
    'a different tag name is fine'
);

select is(
    (select count(*)::int from pg_constraint
     where conname in ('contacts_has_identity', 'deals_amount_not_negative', 'leads_has_identity')
       and convalidated),
    3,
    'the three checks are validated, not left NOT VALID'
);

select * from finish();
rollback;
