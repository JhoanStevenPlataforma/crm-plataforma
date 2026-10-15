--
-- Task module -- attaching a task to a record, AS A BROWSER SESSION.
--
-- The other task files set the JWT claims but keep running as `postgres`, so
-- they never exercise a function's EXECUTE grants. That is how
-- `link_task_to_entity()` shipped broken: as an invoker it called
-- `emit_task_event()`, which `authenticated` may not execute, and every task
-- added from a deal was refused its link. This file switches to the
-- `authenticated` role for the calls, which is the only way to see it.
--
begin;

select plan(7);

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'rep@test.local',
        '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
       ('22222222-2222-2222-2222-222222222222', 'other@test.local',
        '{"first_name":"Otto","last_name":"Other"}'::jsonb);

update public.sales set id = 9001, role = 'rep'
where user_id = '11111111-1111-1111-1111-111111111111';
update public.sales set id = 9002, role = 'rep'
where user_id = '22222222-2222-2222-2222-222222222222';

insert into public.companies (id, name, sales_id) values (9001, 'Acme', 9001);
insert into public.deals (id, name, company_id, sales_id, stage)
values (9001, 'Renewal', 9001, 9001, 'opportunity');

insert into public.tasks (id, title, type, due_date, sales_id)
values (9001, 'Diagnostic call', 'call', now(), 9001),
       (9002, 'Somebody else''s task', 'call', now(), 9002);

-- The owner of task 9001, as the browser reaches the database.
select set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
    true);
set local role authenticated;

select lives_ok(
    $$ select public.link_task_to_entity(9001, 'deal', 9001, 'Renewal', true) $$,
    'a signed-in user links their own task to a deal');

select throws_ok(
    $$ select public.link_task_to_entity(9002, 'deal', 9001, 'Renewal', true) $$,
    '42501',
    null,
    'a task the user cannot see is still refused');

select throws_ok(
    $$ select public.emit_task_event(9001, 'link.added', 9001, null, null, null, null, 'user') $$,
    '42501',
    null,
    'the audit helper itself stays out of reach of a browser session');

reset role;

select is(
    (select count(*)::int from public.task_links
      where task_id = 9001 and entity_type = 'deal' and entity_id = 9001
        and is_primary and unlinked_at is null),
    1,
    'the link row is written, as the primary link');

select is(
    (select linked_by from public.task_links where task_id = 9001),
    9001::bigint,
    'the link is attributed to the session, not to a claim of the client');

select is(
    (select count(*)::int from public.task_events
      where task_id = 9001 and event_type = 'link.added'),
    1,
    'the link is in the audit trail');

select is(
    (select count(*)::int from public.task_links where task_id = 9002),
    0,
    'the refused link wrote nothing');

select * from finish();
rollback;
