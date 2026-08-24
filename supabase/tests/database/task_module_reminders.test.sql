--
-- Task module — reminder rules, the outbox and the dispatcher (§9).
--
-- The product claim being tested: a follow-up chases its owner without anyone
-- remembering to, and every delivery — including one that never happened — is
-- a visible fact rather than a silent gap (O6). That is the difference between
-- a reminder system and a column nobody trusts.
--
-- The dispatcher is exercised directly rather than through pg_cron: the cron
-- job only calls `dispatch_due_reminders()`, so testing the function tests the
-- behaviour, and the test does not depend on an extension the CI container may
-- not preload.
--
begin;

select plan(22);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('93333333-0000-0000-0000-000000000001', 'rem.owner@test.local', '{"first_name":"Rem","last_name":"Owner"}'::jsonb),
  ('93333333-0000-0000-0000-000000000002', 'rem.other@test.local', '{"first_name":"Rem","last_name":"Other"}'::jsonb);

update public.sales set id = 9701, role = 'admin'
where user_id = '93333333-0000-0000-0000-000000000001';
update public.sales set id = 9702, role = 'rep'
where user_id = '93333333-0000-0000-0000-000000000002';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9701, 'Ana', 'Ruiz', 9701);

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by) values
  (9701, 9701, 'Llamar a Ana sobre la renovacion', 'call',  '2026-09-01 09:00:00+00', 9701, 9701),
  (9702, 9701, 'Enviar la propuesta',              'email', '2026-09-02 09:00:00+00', 9701, 9701);

select set_config(
    'request.jwt.claims',
    '{"sub":"93333333-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

--
-- 1. The RRULE subset. These are the schedules the preset picker emits, so a
--    regression here is a reminder that silently never fires.
--
select is(
    public.next_rrule_occurrence(
        'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
        '2026-08-05 10:00:00+00', 'UTC'),
    '2026-08-06 09:00:00+00'::timestamptz,
    'a daily rule whose slot has passed today moves to tomorrow');

select is(
    public.next_rrule_occurrence(
        'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
        '2026-08-05 07:00:00+00', 'UTC'),
    '2026-08-05 09:00:00+00'::timestamptz,
    'a daily rule whose slot is still ahead fires today');

-- 2026-08-05 is a Wednesday.
select is(
    public.next_rrule_occurrence(
        'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
        '2026-08-05 10:00:00+00', 'UTC'),
    '2026-08-10 09:00:00+00'::timestamptz,
    'a weekly Monday rule skips to the next Monday');

select is(
    public.next_rrule_occurrence(
        'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=8;BYMINUTE=0',
        '2026-08-05 10:00:00+00', 'UTC'),
    '2026-09-01 08:00:00+00'::timestamptz,
    'a monthly rule lands on the next matching day of month');

select is(
    public.next_rrule_occurrence('', '2026-08-05 10:00:00+00', 'UTC'),
    null,
    'an empty rule has no next occurrence instead of raising');

-- The timezone is the rule's, not the server's: "every day at 9" must mean 9
-- in the author's morning.
select is(
    public.next_rrule_occurrence(
        'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
        '2026-08-05 10:00:00+00', 'Europe/Madrid'),
    '2026-08-06 07:00:00+00'::timestamptz,
    'the rule fires at 09:00 local, which is 07:00 UTC in Madrid in August');

--
-- 2. Creating a rule materializes `next_fire_at` and lands in the timeline.
--
insert into public.task_reminders (id, task_id, created_by, schedule_kind, offset_minutes, channels)
values (9801, 9701, 9701, 'relative_before_due', 60, '{in_app}');

select is(
    (select next_fire_at from public.task_reminders where id = 9801),
    '2026-09-01 08:00:00+00'::timestamptz,
    'a "one hour before" rule is scheduled one hour before the due date');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9701 and event_type = 'reminder.created'),
    1,
    'creating a reminder is recorded in the task timeline');

--
-- 3. Moving the due date moves the reminder with it. Without this the rule
--    silently keeps pointing at the old date — the staleness W4 is about.
--
update public.tasks set due_date = '2026-09-05 09:00:00+00' where id = 9701;

select is(
    (select next_fire_at from public.task_reminders where id = 9801),
    '2026-09-05 08:00:00+00'::timestamptz,
    'rescheduling the task reschedules its relative reminders');

--
-- 4. A "before due" moment that has already passed is dropped, not fired late.
--
insert into public.task_reminders (id, task_id, created_by, schedule_kind, offset_minutes, channels)
values (9802, 9702, 9701, 'relative_before_due', 100000, '{in_app}');

select is(
    (select next_fire_at from public.task_reminders where id = 9802),
    null,
    'a before-due reminder whose moment is already past gets no fire time');

select is(
    (select is_active from public.task_reminders where id = 9802),
    false,
    'and it is created inactive rather than pretending it will fire');

--
-- 5. The dispatcher. Force a due occurrence and run it.
--
update public.task_reminders set next_fire_at = now() - interval '1 minute'
where id = 9801;

select ok(
    public.dispatch_due_reminders() >= 1,
    'the dispatcher reports the reminders it fired');

select is(
    (select count(*)::int from public.task_notifications
      where reminder_id = 9801 and recipient_id = 9701),
    1,
    'one notification per recipient per channel lands in the outbox');

select is(
    (select status from public.task_notifications where reminder_id = 9801),
    'delivered',
    'an in-app notification is delivered on insert: the row IS the delivery');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9701 and event_type = 'reminder.sent'),
    1,
    'the firing is in the task timeline');

select is(
    (select fired_count from public.task_reminders where id = 9801),
    1,
    'the rule counts its firing');

select is(
    (select next_fire_at from public.task_reminders where id = 9801),
    null,
    'a one-shot relative rule does not schedule itself again');

--
-- 6. Idempotency: a replayed dispatch must not double-send. This is what
--    `dedupe_key` buys, and it is the difference between a retry and spam.
--
update public.task_reminders
set is_active = true, fired_count = 0, next_fire_at = now() - interval '1 minute'
where id = 9801;

select lives_ok(
    $$select public.dispatch_due_reminders()$$,
    'the dispatcher runs again over the same occurrence');

select is(
    (select count(*)::int from public.task_notifications where reminder_id = 9801),
    1,
    'the replay is a no-op: still exactly one notification');

--
-- 7. Closing the task stops the chase (§9.3).
--
insert into public.task_reminders (id, task_id, created_by, schedule_kind, rrule, channels)
values (9803, 9702, 9701, 'recurring', 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0', '{in_app}');

select lives_ok(
    $$select public.transition_task(9702, 'completed')$$,
    'the task is completed');

select is(
    (select is_active from public.task_reminders where id = 9803),
    false,
    'completing the task deactivates its recurring reminder');

--
-- 8. The outbox is somebody's inbox, not everybody's. A rep must not read
--    another user's notifications — the delivery record names a person.
--
select set_config(
    'request.jwt.claims',
    '{"sub":"93333333-0000-0000-0000-000000000002","role":"authenticated"}',
    true);
set local role authenticated;

select is(
    (select count(*)::int from public.task_notifications where recipient_id = 9701),
    0,
    'a rep cannot read a notification addressed to someone else');

reset role;

select * from finish();
rollback;
