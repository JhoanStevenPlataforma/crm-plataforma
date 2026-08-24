--
-- The external-channel delivery pipeline (deliverable 2.5, §9.3).
--
-- `dispatch_due_reminders()` already fills the outbox. In-app needs no worker —
-- the row IS the delivery and Realtime streams it — but every external channel
-- has been sitting at `queued` since Phase 2 shipped, because nothing claimed
-- it. That is worse than a missing feature: the product promises "a reminder
-- that was not delivered is visible AS SUCH" (O6), and a row stuck at `queued`
-- forever looks exactly like one that is about to go out.
--
-- These two functions are the claim/settle pair a worker needs. They are
-- `security definer` and granted to `service_role` only: an edge function calls
-- them, a browser never does.
--
-- Hand-written, ADD-only: `public.tasks` is untouched, so `db diff` gets no
-- excuse to drop the views that read it.
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

revoke all on function public.claim_task_notifications(public.reminder_channel[], integer) from public, anon, authenticated;
revoke all on function public.complete_task_notification(bigint, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.requeue_stale_task_notifications(interval) from public, anon, authenticated;

grant all on function public.claim_task_notifications(public.reminder_channel[], integer) to service_role;
grant all on function public.complete_task_notification(bigint, text, text, text, integer) to service_role;
grant all on function public.requeue_stale_task_notifications(interval) to service_role;

--
-- 4. The stale sweep, on the same tick as the dispatcher. Guarded exactly like
--    `20260805121000`: a bare Postgres without `pg_cron` must degrade to "the
--    sweep does not run", not to a half-applied migration chain.
--
do $$
begin
    create extension if not exists pg_cron;

    perform cron.unschedule('requeue-stale-task-notifications')
      where exists (select 1 from cron.job
                     where jobname = 'requeue-stale-task-notifications');

    perform cron.schedule(
        'requeue-stale-task-notifications',
        '*/5 * * * *',
        $cron$select public.requeue_stale_task_notifications();$cron$);
exception
    when others then
        raise warning
            'pg_cron unavailable (%): stale notifications will not be requeued automatically',
            sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
