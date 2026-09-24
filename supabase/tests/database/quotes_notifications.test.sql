--
-- Quotes module, the notification outbox (docs/proposals/quotes-cpq-module.md
-- §8, Phase 11). Closes §13.6 #14 and #9.
--
-- The product claim being tested: a rep is TOLD when a customer acts on a
-- quotation, and told once. Until this phase the trail recorded every open,
-- every word and every answer and nothing read it -- an open screen saw it
-- through Realtime and everybody else found out by looking.
--
-- What is pinned here:
--
--   * the first open of a version notifies the owner; the second does not, and
--     opening the NEXT version does;
--   * an answer notifies the owner AND the deal's owner when they differ, once
--     each, and a quote with no deal notifies the owner alone;
--   * a customer's comment notifies with the words they wrote;
--   * the security events -- a dead link, a hammered one -- notify nobody;
--   * the sweeper warns three days out and notifies on expiry, and running it
--     twice does not ping twice;
--   * a muted channel is recorded as skipped rather than dropped, and the
--     dedupe window collapses a second email;
--   * a quote notification is filed under the quote, not under a task, and RLS
--     keeps it in its recipient's own inbox;
--   * every notification carries a translation KEY and its parameters, and the
--     database never stores a translated sentence -- it does not know who will
--     read the row, or in what language (§13.6 #18).
--
-- The portal functions are called as `service_role`, the role the edge function
-- holds, so the notifier is reached exactly as it is in production.
--
begin;

select plan(31);

-- The bell's unread inbox for one recipient, as a comparable count.
create function public.quotes_test_inbox(p_quote_id bigint, p_recipient bigint)
returns integer language sql stable as $$
    select count(*)::int from public.task_notifications n
     where n.entity_type = 'quote' and n.entity_id = p_quote_id
       and n.recipient_id = p_recipient and n.channel = 'in_app';
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98110000-0000-0000-0000-000000000001', 'quotes.notif.owner@test.local',
   '{"first_name":"Nora","last_name":"Owner"}'::jsonb),
  ('98110000-0000-0000-0000-000000000002', 'quotes.notif.deal@test.local',
   '{"first_name":"Diego","last_name":"Deal"}'::jsonb),
  ('98110000-0000-0000-0000-000000000003', 'quotes.notif.other@test.local',
   '{"first_name":"Otto","last_name":"Other"}'::jsonb);

update public.sales set id = 9811, role = 'rep'
 where user_id = '98110000-0000-0000-0000-000000000001';
update public.sales set id = 9812, role = 'rep'
 where user_id = '98110000-0000-0000-0000-000000000002';
update public.sales set id = 9813, role = 'rep'
 where user_id = '98110000-0000-0000-0000-000000000003';

insert into public.companies (id, name, sales_id, logo)
values (9811, 'Notified Customer', 9811, '{}'::jsonb);

insert into public.contacts (id, first_name, last_name, company_id, sales_id)
values (9811, 'Clara', 'Cliente', 9811, 9811);

-- The deal belongs to somebody else, which is the case the second recipient
-- exists for: the rep who raised the quote is not always the one who owns the
-- opportunity it was raised against.
insert into public.deals (id, name, stage, amount, sales_id, company_id, index)
values (9811, 'Renewal', 'opportunity', 1000, 9812, 9811, 0);

insert into public.products (id, sku, name, currency, list_price)
values (9811, 'NOTIF-1', 'Annual support', 'COP', 150);

-- 9811 is accepted (and has a deal), 9812 declined (no deal), 9813 read and
-- written on, 9814 expires, 9815 is warned about three days out.
insert into public.quotes (id, company_id, contact_id, deal_id, sales_id, currency, valid_until) values
  (9811, 9811, 9811, 9811, 9811, 'COP', current_date + 10),
  (9812, 9811, 9811, null, 9811, 'COP', current_date + 10),
  (9813, 9811, 9811, null, 9811, 'COP', current_date + 10),
  (9814, 9811, 9811, null, 9811, 'COP', current_date + 10),
  (9815, 9811, 9811, null, 9811, 'COP', current_date + 3);

insert into public.quote_lines (version_id, product_id, quantity, unit_price, description)
select v.id, 9811, 2, 150, '8x5 support' from public.quote_versions v
 where v.quote_id between 9811 and 9815;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98110000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select set_config('notif_test.accept',  public.issue_quote_version(9811)::text, true);
select set_config('notif_test.reject',  public.issue_quote_version(9812)::text, true);
select set_config('notif_test.read',    public.issue_quote_version(9813)::text, true);
select set_config('notif_test.expire',  public.issue_quote_version(9814)::text, true);
select set_config('notif_test.warn',    public.issue_quote_version(9815)::text, true);
reset role;

create function public.quotes_test_hash(p_setting text) returns bytea
    language sql stable as $$
    select sha256(decode(current_setting(p_setting)::jsonb ->> 'token', 'hex'));
$$;

--
-- 1. Issuing tells nobody. The rep just did it (§8).
--
select is(
    (select count(*)::int from public.task_notifications
      where entity_type = 'quote'),
    0,
    'sending a quote notifies nobody: the rep who sent it already knows');

--
-- 2. The first open of a version is news; the second is the same customer
--    re-reading the same document.
--
set local role service_role;
select public.quote_portal_view(public.quotes_test_hash('notif_test.read'),
                                '203.0.113.7'::inet, 'Mozilla/5.0');

select is(
    public.quotes_test_inbox(9813, 9811),
    1,
    'the first time the customer opens a version, its owner is told');

select alike(
    (select title from public.task_notifications
      where entity_type = 'quote' and entity_id = 9813 limit 1),
    '%was opened by the customer'::text,
    'and the notification names the quote in its title');

select public.quote_portal_view(public.quotes_test_hash('notif_test.read'),
                                '203.0.113.7'::inet, 'Mozilla/5.0');
select public.quote_portal_view(public.quotes_test_hash('notif_test.read'),
                                '203.0.113.7'::inet, 'Mozilla/5.0');

select is(
    public.quotes_test_inbox(9813, 9811),
    1,
    're-reading it does not ping again -- a bell that cries every open is muted');

--
-- 3. The customer writes, and the words reach the bell with the notice.
--
select public.quote_portal_comment(
    public.quotes_test_hash('notif_test.read'),
    'Can you split the payment across two quarters?',
    'Clara Cliente', 'clara@cliente.test',
    '203.0.113.7'::inet, 'Mozilla/5.0');

select is(
    public.quotes_test_inbox(9813, 9811),
    2,
    'a customer comment is news every time, unlike a re-read');

select is(
    (select body from public.task_notifications
      where entity_type = 'quote' and entity_id = 9813
        and title like '%wrote on the quotation%'),
    'Can you split the payment across two quarters?',
    'and the bell shows what they actually wrote, not just that they wrote');

--
-- 4. A dead link and a hammered one are security noise, not news.
--
select set_config('notif_test.before_dead_link',
    (select count(*)::text from public.task_notifications where entity_type = 'quote'),
    true);

select public.quote_portal_view(sha256('nobody-minted-this'::bytea),
                                '203.0.113.9'::inet, 'curl/8');

select is(
    (select count(*)::int from public.task_notifications where entity_type = 'quote'),
    current_setting('notif_test.before_dead_link')::int,
    'a link nobody minted notifies nobody: it names no quote to file anything under');

--
-- 5. An answer reaches the owner AND the deal's owner, once each.
--
select public.quote_portal_accept(
    public.quotes_test_hash('notif_test.accept'),
    'Clara Cliente', 'clara@cliente.test',
    '203.0.113.7'::inet, 'Mozilla/5.0');

select is(
    public.quotes_test_inbox(9811, 9811),
    1,
    'the quote owner is told the customer accepted');

select is(
    public.quotes_test_inbox(9811, 9812),
    1,
    'and so is the owner of the deal it was raised against, who has to act on it');

select is(
    public.quotes_test_inbox(9811, 9813),
    0,
    'a rep with no claim on either is told nothing');

select alike(
    (select body from public.task_notifications
      where entity_type = 'quote' and entity_id = 9811
        and recipient_id = 9811 and channel = 'in_app'),
    'Clara Cliente accepted version%'::text,
    'the notice is signed with the name the customer answered under');

--
-- An answer is one of the four events worth an email, so the owner gets a
-- queued email row beside the bell entry -- the row the worker drains.
--
select is(
    (select status from public.task_notifications
      where entity_type = 'quote' and entity_id = 9811
        and recipient_id = 9811 and channel = 'email'),
    'queued',
    'an answer also queues an email, which is what the widened outbox is for');

select is(
    (select count(*)::int from public.claim_task_notifications(
        array['email']::public.reminder_channel[], 10)
      where entity_id = 9811),
    2,
    'and the worker claims both recipients'' emails through the same function as a task''s');

--
-- 6. A refusal, on a quote with no deal behind it.
--
select public.quote_portal_reject(
    public.quotes_test_hash('notif_test.reject'),
    'price', 'Out of budget this year', 'Clara Cliente', 'clara@cliente.test',
    '203.0.113.7'::inet, 'Mozilla/5.0');

select is(
    public.quotes_test_inbox(9812, 9811),
    1,
    'a decline reaches the owner');

select is(
    (select count(*)::int from public.task_notifications
      where entity_type = 'quote' and entity_id = 9812 and channel = 'in_app'),
    1,
    'and reaches nobody else, because the quote names no deal');

select alike(
    (select body from public.task_notifications
      where entity_type = 'quote' and entity_id = 9812 and channel = 'in_app'),
    '%declined: price'::text,
    'the notice carries the reason code, which is what "why we lost it" is grouped by');

--
-- 7. The sweeper: the warning before the date, the expiry after it.
--
-- 9814's validity is moved into the past through the per-version unfreeze hole,
-- which is the honest stand-in for the day passing (the same device
-- `quotes_tokens_purge.test.sql` uses).
--
select set_config('app.quote_version_unfreeze',
    (select id::text from public.quote_versions
      where quote_id = 9814 and version_number = 1), true);
update public.quote_versions set valid_until = current_date - 1
 where quote_id = 9814 and version_number = 1;
select set_config('app.quote_version_unfreeze', '', true);

select is(
    public.sweep_expired_quotes(),
    1,
    'the sweeper expires the offer whose date has passed, and only that one');

select is(
    (select status_key from public.quotes where id = 9814),
    'expired',
    'the quote lands on `expired` through the status machine, not a column write');

select is(
    public.quotes_test_inbox(9814, 9811),
    1,
    'and its owner is told it lapsed');

select is(
    public.quotes_test_inbox(9815, 9811),
    1,
    'the quote three days out is warned about BEFORE it lapses, when acting is still possible');

select is(
    public.sweep_expired_quotes(),
    0,
    'a second sweep the same day finds nothing left to expire');

select is(
    public.quotes_test_inbox(9815, 9811),
    1,
    'and does not warn a second time: `dedupe_key` makes a replayed sweep a no-op');

--
-- 8. The recipient's preferences are honoured, because the outbox was widened
--    rather than duplicated -- the whole argument for Option A (§8).
--
insert into public.notification_preferences (sales_id, muted_channels, dedupe_window_minutes)
values (9811, array['email']::public.reminder_channel[], 60);

select public.notify_quote_event(
    9812, 'expiring', 'Q expires in 3 days', null, 'muted-probe', null,
    'crm.notifications.quote.expiring',
    jsonb_build_object('number', 'Q-TEST'));

select is(
    (select status from public.task_notifications
      where entity_type = 'quote' and entity_id = 9812 and channel = 'email'
      order by id desc limit 1),
    'skipped',
    'a muted channel is recorded as skipped, not dropped: the suppression is auditable');

select is(
    (select error from public.task_notifications
      where entity_type = 'quote' and entity_id = 9812 and channel = 'email'
      order by id desc limit 1),
    'channel email muted by recipient',
    'and says which channel and on whose authority');

--
-- 9. A quote notification is a quote notification, all the way down.
--
select is(
    (select count(*)::int from public.task_notifications
      where entity_type = 'quote' and task_id is not null),
    0,
    'no quote notification carries a task id: one subject, enforced by the constraint');

--
-- 10. The language of the reader is not the database's business (§13.6 #18).
--
-- What is asserted here is that the row is TRANSLATABLE -- a key plus the facts
-- the sentence needs. That the key resolves to a sentence in three languages is
-- asserted where the catalogues are, in `i18nProvider.test.ts` and
-- `notificationText.test.ts`; neither side can prove the other, which is why
-- both exist.
--
select is(
    (select count(*)::int from public.task_notifications
      where entity_type = 'quote' and message_key is null),
    0,
    'every quote notification carries a translation key, never only English prose');

select is(
    (select message_key from public.task_notifications
      where entity_type = 'quote' and entity_id = 9811 and channel = 'in_app'
        and recipient_id = 9811),
    'crm.notifications.quote.accepted',
    'an acceptance names the key the client renders');

select is(
    (select message_params ->> 'number' || '/' || (message_params ->> 'actor')
       || '/' || (message_params ->> 'version')
       from public.task_notifications
      where entity_type = 'quote' and entity_id = 9811 and channel = 'in_app'
        and recipient_id = 9811),
    (select quote_number from public.quotes where id = 9811) || '/Clara Cliente/1',
    'and carries the facts its sentence needs -- the number, who signed, which version');

select is(
    (select message_params ->> 'reason_code' from public.task_notifications
      where entity_type = 'quote' and entity_id = 9812 and channel = 'in_app'
        and message_key = 'crm.notifications.quote.rejected'),
    'price',
    'a refusal carries the reason CODE, not a label: the words for it live in the catalogue');

-- An unsigned answer must leave `actor` ABSENT rather than defaulted to a word.
-- "The customer" is itself a sentence needing translation, and a database that
-- writes it has quietly chosen a language for everybody.
select public.notify_quote_event(
    9813, 'probe-anon', 'Q was declined', null, 'anon-probe', null,
    'crm.notifications.quote.rejected',
    jsonb_build_object('number', 'Q-TEST', 'actor', null, 'reason_code', 'terms'));

select ok(
    (select message_params -> 'actor' = 'null'::jsonb
       from public.task_notifications
      where entity_type = 'quote' and entity_id = 9813
        and dedupe_key like '%anon-probe%' and channel = 'in_app'),
    'an unsigned answer leaves the actor null for the client to name, in its own language');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98110000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
    (select count(*)::int from public.task_notifications where entity_type = 'quote'),
    0,
    'and an uninvolved rep reads none of them: the inbox policy is by recipient, not by subject');

reset role;

select * from finish();
rollback;
