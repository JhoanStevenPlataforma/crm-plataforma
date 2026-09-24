--
-- Task module — the external-channel delivery pipeline (§9.3, deliverable 2.5).
--
-- The product claim being tested: "a reminder that was not delivered is visible
-- AS SUCH" (O6). Before this, every email/WhatsApp/SMS row sat at `queued`
-- forever because nothing claimed it — indistinguishable from one about to go
-- out. These tests pin the three states that make the difference: claimed,
-- settled, and retried-then-failed.
--
begin;

select plan(28);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('97111111-0000-0000-0000-000000000001', 'worker.owner@test.local', '{"first_name":"Wendy","last_name":"Owner"}'::jsonb);

update public.sales set id = 9701, role = 'admin'
where user_id = '97111111-0000-0000-0000-000000000001';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9701, 'Ana', 'Ruiz', 9701);

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9701, 9701, 'Llamar sobre la renovacion', 'call',
        '2026-09-01 09:00:00+00', 9701, 9701);

-- Four outbox rows: one deliverable, one already delivered in-app, one due in
-- the future, one on a channel with no provider.
insert into public.task_notifications
    (id, task_id, recipient_id, channel, scheduled_for, title, body, status, dedupe_key)
values
  (9701, 9701, 9701, 'email',    now() - interval '1 minute', 'Llamar a Ana', 'Pidio que la llamaran', 'queued',    'w:1'),
  (9702, 9701, 9701, 'in_app',   now() - interval '1 minute', 'Llamar a Ana', null, 'delivered', 'w:2'),
  (9703, 9701, 9701, 'email',    now() + interval '1 hour',   'Mas tarde',    null, 'queued',    'w:3'),
  (9704, 9701, 9701, 'whatsapp', now() - interval '1 minute', 'Por WhatsApp', null, 'queued',    'w:4');

--
-- 1. The claim: exactly the rows that are due, on the channels asked for.
--
select is(
    (select count(*)::int from public.claim_task_notifications(
        array['email']::public.reminder_channel[], 10)),
    1,
    'the claim returns only the due email row');

select is(
    (select status from public.task_notifications where id = 9701),
    'sending',
    'a claimed row is marked sending, so a crashed worker leaves evidence');

select is(
    (select attempt::int from public.task_notifications where id = 9701),
    1,
    'the attempt counter advances on claim, not on success');

select is(
    (select status from public.task_notifications where id = 9703),
    'queued',
    'a delivery scheduled for later is left alone');

select is(
    (select status from public.task_notifications where id = 9702),
    'delivered',
    'an in-app row is already delivered and is never claimed');

--
-- 2. Exclusivity. This is the whole reason for `for update skip locked`:
--    a scheduled run and a manual run must not double-send.
--
select is(
    (select count(*)::int from public.claim_task_notifications(
        array['email']::public.reminder_channel[], 10)),
    0,
    'a second claim finds nothing — no row is handed out twice');

--
-- 3. The payload carries what a provider needs, resolved server-side.
--
create temporary table claimed_whatsapp as
select * from public.claim_task_notifications(
    array['whatsapp']::public.reminder_channel[], 10);

select is(
    (select recipient_email from claimed_whatsapp),
    'worker.owner@test.local',
    'the claim resolves the recipient address — the worker never asks for it');

select is(
    (select task_title from claimed_whatsapp),
    (select title from public.tasks where id = 9701),
    'and the title of the task it belongs to');

--
-- 4. Settling a success.
--
select is(
    (select status from public.complete_task_notification(9701, 'sent', 'pm-123')),
    'sent',
    'a successful delivery is settled as sent');

select isnt(
    (select sent_at from public.task_notifications where id = 9701),
    null,
    'and stamped with the moment it went out');

select is(
    (select provider_message_id from public.task_notifications where id = 9701),
    'pm-123',
    'the provider id is kept, so a bounce can be traced back');

--
-- 5. A transient failure is a retry, not a verdict.
--
select is(
    (select status from public.complete_task_notification(9704, 'failed', null, 'smtp timeout')),
    'queued',
    'a failure with attempts left goes back to the queue');

select ok(
    (select scheduled_for from public.task_notifications where id = 9704) > now(),
    'and is backed off rather than retried immediately');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9701 and event_type = 'reminder.failed'),
    0,
    'a retry does not cry wolf in the timeline');

--
-- 6. Exhausting the retries is what makes the failure visible (O6).
--
update public.task_notifications set attempt = 5 where id = 9704;

select is(
    (select status from public.complete_task_notification(9704, 'failed', null, 'number unreachable')),
    'failed',
    'the last attempt settles as failed');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9701 and event_type = 'reminder.failed'),
    1,
    'and only then does the task timeline record it');

--
-- 7. A worker that died mid-send must not strand its row.
--
update public.task_notifications
   set status = 'sending', scheduled_for = now() - interval '1 hour'
 where id = 9703;

select is(
    (select public.requeue_stale_task_notifications('15 minutes'::interval)),
    1,
    'the sweep puts an unsettled claim back in the queue');

--
-- 8. A subject that is not a task (quotes §8, Option A).
--
-- The outbox was widened so the quote module could reuse this pipeline instead
-- of growing a second inbox. The risk named in the proposal is that widening it
-- SILENTLY stops task reminders -- silently, because nobody reports a
-- notification they never expected. Everything above this line is the task
-- path, unchanged; everything below is the new shape, and the two share one
-- function.
--
select throws_ok(
    $$insert into public.task_notifications
          (task_id, entity_type, entity_id, recipient_id, channel, scheduled_for, dedupe_key)
      values (9701, 'quote', 1, 9701, 'email', now(), 'w:bad-both')$$,
    '23514',
    null,
    'a row naming a task AND an entity is refused: one subject, never two');

select throws_ok(
    $$insert into public.task_notifications
          (recipient_id, channel, scheduled_for, dedupe_key)
      values (9701, 'email', now(), 'w:bad-neither')$$,
    '23514',
    null,
    'and a row naming no subject at all is refused too');

insert into public.task_notifications
    (id, task_id, entity_type, entity_id, recipient_id, channel, scheduled_for,
     title, body, status, dedupe_key)
values
  (9705, null, 'quote', 4242, 9701, 'email', now() - interval '1 minute',
   'Quote Q-2026-0042 accepted', 'Ana Ruiz accepted version 2', 'queued', 'w:5');

-- Test 17 requeued 9703 with a past schedule, so it is claimable again. Park it
-- so this section claims exactly the row it is about.
update public.task_notifications set status = 'canceled' where id = 9703;

create temporary table claimed_quote as
select * from public.claim_task_notifications(
    array['email']::public.reminder_channel[], 10);

select is(
    (select count(*)::int from claimed_quote),
    1,
    'a task-less row is claimed like any other -- the join to tasks no longer drops it');

select is(
    (select task_id from claimed_quote),
    null,
    'it carries no task id, because it has no task');

select is(
    (select entity_type::text || '/' || entity_id from claimed_quote),
    'quote/4242',
    'it names its subject instead, which is what the worker links back to');

select is(
    (select title from claimed_quote),
    'Quote Q-2026-0042 accepted',
    'the title is the one written on the row, since there is no task to take it from');

select is(
    (select task_title from claimed_quote),
    null,
    'and the task title comes back null rather than failing the claim');

select is(
    (select recipient_email from claimed_quote),
    'worker.owner@test.local',
    'the recipient is resolved exactly as on the task path');

select is(
    (select status from public.complete_task_notification(9705, 'sent', 'pm-q42')),
    'sent',
    'a task-less delivery settles as sent');

--
-- The audit trigger writes into the TASK timeline. A task-less row has no
-- timeline to write into, and a failed quote delivery must not take the
-- settlement down with it.
--
insert into public.task_notifications
    (id, task_id, entity_type, entity_id, recipient_id, channel, scheduled_for,
     title, status, attempt, dedupe_key)
values
  (9706, null, 'quote', 4242, 9701, 'email', now() - interval '1 minute',
   'Quote Q-2026-0042 expiring', 'queued', 5, 'w:6');

select is(
    (select status from public.complete_task_notification(9706, 'failed', null, 'no provider')),
    'failed',
    'a task-less delivery exhausting its retries settles rather than raising');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9701 and event_type = 'reminder.failed'),
    1,
    'and it files nothing in the timeline of the unrelated task beside it');

select * from finish();
rollback;
