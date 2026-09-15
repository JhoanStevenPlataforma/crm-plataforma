--
-- Tags — shared vocabulary, and who may destroy it.
--
-- Tags are the one thing in the CRM nobody owns: they are referenced from
-- `contacts.tags`, so a tag belongs to everybody at once. That shapes the rule
-- these assertions pin down, and the rule is deliberately asymmetric:
--
--   * creating and renaming stay open to every authenticated user. Tagging is a
--     rep's daily work, and routing "add congreso-2027" through a manager just
--     teaches people to stop tagging;
--   * deleting is admin/manager. Removing a tag edits records across the whole
--     organisation -- including records the deleting rep may not even read --
--     and nothing brings it back. It is the only step of the lifecycle where
--     being wrong is not fixed by typing the name again.
--
-- Before this, all three were `using (true)`: any rep could empty the shared
-- vocabulary for everyone.
--
begin;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('7a677777-0000-0000-0000-000000000001', 'tag.rep@test.local', '{"first_name":"Tomás","last_name":"Rep"}'::jsonb),
  ('7a677777-0000-0000-0000-000000000002', 'tag.mgr@test.local', '{"first_name":"Marta","last_name":"Manager"}'::jsonb);

update public.sales set id = 9701, role = 'rep'     where user_id = '7a677777-0000-0000-0000-000000000001';
update public.sales set id = 9702, role = 'manager' where user_id = '7a677777-0000-0000-0000-000000000002';

insert into public.tags (id, name, color) values (9701, 'renovacion', '#eddcd2');

--
-- As a rep.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"7a677777-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
    $$insert into public.tags (id, name, color) values (9702, 'congreso-2027', '#c9e4de')$$,
    'a rep can create a tag: tagging is their daily work');

select lives_ok(
    $$update public.tags set name = 'renovacion-2027' where id = 9701$$,
    'a rep can rename a tag');

-- A denied DELETE under RLS matches no rows rather than raising, so the row
-- count is the only thing that actually proves anything here.
delete from public.tags where id = 9701;

select is(
    (select count(*)::int from public.tags where id = 9701),
    1,
    'a rep cannot delete a tag the whole organisation references');

reset role;

--
-- As a manager.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"7a677777-0000-0000-0000-000000000002","role":"authenticated"}', true);

delete from public.tags where id = 9701;

select is(
    (select count(*)::int from public.tags where id = 9701),
    0,
    'a manager can delete a tag');

reset role;

select is(
    (select count(*)::int from pg_policies
      where schemaname = 'public' and tablename = 'tags'
        and cmd = 'DELETE' and qual = 'true'),
    0,
    'no delete policy on tags is left wide open');

select * from finish();

rollback;
