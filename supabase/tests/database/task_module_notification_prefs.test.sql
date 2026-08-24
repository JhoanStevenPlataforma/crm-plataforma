--
-- Task module — anti-fatigue rules for reminders (§9.5).
--
-- The product claim being tested: reminders can be lived with. Quiet hours,
-- digest mode, per-channel mutes, deduplication and an hourly ceiling are what
-- stand between "useful nudge" and "the thing everybody muted in week two".
--
-- The invariant that runs through every test below: **a suppressed
-- notification is still a row**. Nothing here is allowed to make a missing
-- ping unexplainable — that is the failure mode O6 exists to remove.
--
begin;

select plan(22);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('98111111-0000-0000-0000-000000000001', 'prefs.owner@test.local', '{"first_name":"Pia","last_name":"Owner"}'::jsonb);

update public.sales set id = 9801, role = 'admin'
where user_id = '98111111-0000-0000-0000-000000000001';

insert into public.contacts (id, first_name, last_name, sales_id)
values (9801, 'Ana', 'Ruiz', 9801);

insert into public.tasks (id, contact_id, text, type, due_date, owner_sales_id, created_by)
values (9801, 9801, 'Llamar sobre la renovacion', 'call',
        '2026-09-01 09:00:00+00', 9801, 9801);

--
-- 1. Defaults. A user who never opened the settings screen must behave
--    sensibly, and the function's literals must match the column defaults —
--    they are written twice, so this is what keeps them honest.
--
insert into public.notification_preferences (sales_id) values (9801);

select is(
    (select max_per_hour from public.notification_prefs_for(9802)),
    (select max_per_hour from public.notification_preferences where sales_id = 9801),
    'the synthesized defaults match the column defaults (max_per_hour)');

select is(
    (select dedupe_window_minutes from public.notification_prefs_for(9802)),
    (select dedupe_window_minutes from public.notification_preferences where sales_id = 9801),
    'the synthesized defaults match the column defaults (dedupe window)');

select is(
    (select timezone from public.notification_prefs_for(9802)),
    (select timezone from public.notification_preferences where sales_id = 9801),
    'the synthesized defaults match the column defaults (timezone)');

select is(
    (select digest_at from public.notification_prefs_for(9802)),
    (select digest_at from public.notification_preferences where sales_id = 9801),
    'the synthesized defaults match the column defaults (digest hour)');

--
-- 2. Quiet hours, including the window everybody actually configures: one that
--    crosses midnight. Treating 22:00–07:00 as a plain BETWEEN silences the
--    whole day instead of the night — the classic bug here.
--
select is(
    public.next_allowed_send_at(
        '2026-09-01 23:30:00+00'::timestamptz, 'UTC', '22:00'::time, '07:00'::time),
    '2026-09-02 07:00:00+00'::timestamptz,
    'a ping at 23:30 inside a 22:00-07:00 window waits for 07:00 the NEXT day');

select is(
    public.next_allowed_send_at(
        '2026-09-01 03:00:00+00'::timestamptz, 'UTC', '22:00'::time, '07:00'::time),
    '2026-09-01 07:00:00+00'::timestamptz,
    'a ping at 03:00 in the same window waits for 07:00 the SAME day');

select is(
    public.next_allowed_send_at(
        '2026-09-01 12:00:00+00'::timestamptz, 'UTC', '22:00'::time, '07:00'::time),
    '2026-09-01 12:00:00+00'::timestamptz,
    'a ping at midday is not delayed at all');

select is(
    public.next_allowed_send_at(
        '2026-09-01 13:30:00+00'::timestamptz, 'UTC', '13:00'::time, '14:00'::time),
    '2026-09-01 14:00:00+00'::timestamptz,
    'a same-day window works too');

select is(
    public.next_allowed_send_at(
        '2026-09-01 23:30:00+00'::timestamptz, 'UTC', null, null),
    '2026-09-01 23:30:00+00'::timestamptz,
    'no quiet hours configured means no delay');

--
-- 3. Quiet hours are per-user local time — that is the whole reason the
--    timezone is stored next to them.
--
select is(
    public.next_allowed_send_at(
        '2026-09-01 12:00:00+00'::timestamptz, 'America/Bogota',
        '22:00'::time, '07:00'::time),
    '2026-09-01 12:00:00+00'::timestamptz,
    '12:00 UTC is 07:00 in Bogota — just outside the quiet window');

select is(
    public.next_digest_at(
        '2026-09-01 09:00:00+00'::timestamptz, 'UTC', '08:00'::time),
    '2026-09-02 08:00:00+00'::timestamptz,
    'a reminder that fires after the digest hour waits for tomorrow');

--
-- 4. A muted channel: skipped WITH THE REASON, never a silent non-insert.
--
update public.notification_preferences
   set muted_channels = array['email']::public.reminder_channel[]
 where sales_id = 9801;

insert into public.task_reminders
    (id, task_id, created_by, schedule_kind, absolute_at, channels, recipients, next_fire_at)
values (9801, 9801, 9801, 'absolute', now() - interval '1 minute',
        array['email']::public.reminder_channel[], 'owner', now() - interval '1 minute');

select is(public.dispatch_due_reminders(), 1, 'the reminder fires');

select is(
    (select status from public.task_notifications
      where reminder_id = 9801 and channel = 'email'),
    'skipped',
    'a muted channel is skipped');

select alike(
    (select error from public.task_notifications
      where reminder_id = 9801 and channel = 'email'),
    '%muted%',
    'and the row says why, so "I got nothing" is answerable');

--
-- 5. In-app ignores quiet hours and the digest — it is a badge in a page the
--    user opened, not something that buzzes a phone at 03:00 — but it still
--    honours an explicit mute.
--
update public.notification_preferences
   set muted_channels = '{}'::public.reminder_channel[],
       quiet_hours_start = '00:00', quiet_hours_end = '23:59',
       digest_mode = true
 where sales_id = 9801;

insert into public.task_reminders
    (id, task_id, created_by, schedule_kind, absolute_at, channels, recipients, next_fire_at)
values (9802, 9801, 9801, 'absolute', now() - interval '1 minute',
        array['in_app']::public.reminder_channel[], 'owner', now() - interval '1 minute');

select is(public.dispatch_due_reminders(), 1, 'the in-app reminder fires');

select is(
    (select status from public.task_notifications
      where reminder_id = 9802 and channel = 'in_app'),
    'delivered',
    'in-app is delivered immediately despite quiet hours and digest mode');

--
-- 6. An external channel under the same settings IS deferred rather than sent.
--
insert into public.task_reminders
    (id, task_id, created_by, schedule_kind, absolute_at, channels, recipients, next_fire_at)
values (9803, 9801, 9801, 'absolute', now() - interval '1 minute',
        array['sms']::public.reminder_channel[], 'owner', now() - interval '1 minute');

select is(public.dispatch_due_reminders(), 1, 'the sms reminder fires');

select ok(
    (select scheduled_for from public.task_notifications
      where reminder_id = 9803 and channel = 'sms') > now(),
    'an external channel inside quiet hours is deferred, not dropped');

select is(
    (select status from public.task_notifications
      where reminder_id = 9803 and channel = 'sms'),
    'queued',
    'and it stays queued — deferring must not look like a failure');

--
-- 7. Deduplication: two rules on the same task inside the window are one ping.
--
update public.notification_preferences
   set quiet_hours_start = null, quiet_hours_end = null, digest_mode = false
 where sales_id = 9801;

insert into public.task_reminders
    (id, task_id, created_by, schedule_kind, absolute_at, channels, recipients, next_fire_at)
values (9804, 9801, 9801, 'absolute', now() - interval '1 minute',
        array['email']::public.reminder_channel[], 'owner', now() - interval '1 minute'),
       (9805, 9801, 9801, 'absolute', now() - interval '1 minute',
        array['email']::public.reminder_channel[], 'owner', now() - interval '1 minute');

select is(public.dispatch_due_reminders(), 2, 'both rules fire');

select is(
    (select count(*)::int from public.task_notifications
      where reminder_id in (9804, 9805) and channel = 'email' and status = 'queued'),
    1,
    'only the first of two rules on one task actually queues');

select alike(
    (select error from public.task_notifications
      where reminder_id in (9804, 9805) and channel = 'email' and status = 'skipped'),
    '%deduplicated%',
    'the second is recorded as deduplicated rather than vanishing');

select * from finish();
rollback;
