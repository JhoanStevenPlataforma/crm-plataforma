--
-- Help centre (docs/proposals/help-center.md).
--
--   * everyone signed in reads the manual, only admins write it, and `anon`
--     holds nothing on either table;
--   * a tutorial that is not published is a draft only admins see;
--   * a tutorial cannot be published with nothing to play, and can only name
--     a file the uploader generated;
--   * media is uploaded by admins only, under `<kind>/<uuid>.<ext>`, into a
--     public bucket.
--
begin;

select plan(19);

create function public.help_test_error_of(p_sql text) returns text
    language plpgsql
as $$
begin
    execute p_sql;
    return 'no error';
exception when others then
    return sqlstate;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98300000-0000-0000-0000-000000000001', 'help.admin@test.local',
   '{"first_name":"Ada","last_name":"Admin"}'::jsonb),
  ('98300000-0000-0000-0000-000000000002', 'help.manager@test.local',
   '{"first_name":"Mia","last_name":"Manager"}'::jsonb),
  ('98300000-0000-0000-0000-000000000003', 'help.rep@test.local',
   '{"first_name":"Rui","last_name":"Rep"}'::jsonb);

update public.sales set id = 9831, role = 'admin'
 where user_id = '98300000-0000-0000-0000-000000000001';
update public.sales set id = 9832, role = 'manager'
 where user_id = '98300000-0000-0000-0000-000000000002';
update public.sales set id = 9833, role = 'rep'
 where user_id = '98300000-0000-0000-0000-000000000003';

--
-- 1. What the roles hold.
--
select ok(
    not has_table_privilege('anon', 'public.help_categories', 'select')
    and not has_table_privilege('anon', 'public.help_tutorials', 'select'),
    'anon reads neither table: the manual is for people signed in');

select is((select public from storage.buckets where id = 'help-media'), true,
    'the media bucket is public, so a recording has a stable address');

select has_trigger('public', 'help_tutorials', 'help_tutorials_set_updated_at',
    'the server keeps the date a tutorial was last updated');

--
-- 2. An admin writes the manual.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98300000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(public.help_test_error_of(
    $$insert into public.help_categories (id, slug, title) overriding system value
      values (98301, 'test-category', 'Test category')$$),
    'no error', 'an admin adds a category');

select is(public.help_test_error_of(
    $$insert into public.help_tutorials (id, category_id, slug, title) overriding system value
      values (98301, 98301, 'test-draft', 'A draft'),
             (98302, 98301, 'test-published', 'A published one')$$),
    'no error', 'an admin adds tutorials, drafts by default');

select is(public.help_test_error_of(
    $$update public.help_tutorials set is_published = true where id = 98302$$),
    '23514', 'a tutorial with nothing to play cannot be published');

select is(public.help_test_error_of(
    $$update public.help_tutorials set video_path = 'https://example.com/a.mp4' where id = 98302$$),
    '23514', 'a tutorial cannot point at an arbitrary address');

select is(public.help_test_error_of(
    $$update public.help_tutorials
         set video_path = 'video/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4',
             poster_path = 'poster/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp',
             captions_path = 'captions/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.vtt',
             is_published = true
       where id = 98302$$),
    'no error', 'with its recording attached it is published');

select is(public.help_test_error_of(
    $$insert into public.help_tutorials (category_id, slug, title)
      values (98301, 'Not A Slug', 'Bad slug')$$),
    '23514', 'a slug is lowercase words joined by dashes');

select is(
    (select count(*)::int from public.help_tutorials where id in (98301, 98302)), 2,
    'an admin sees drafts as well as published tutorials');

--
-- 3. Media uploads.
--
select is(public.help_test_error_of(
    $$insert into storage.objects (bucket_id, name)
      values ('help-media', 'video/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4')$$),
    'no error', 'an admin uploads a recording under video/<uuid>.mp4');

select is(public.help_test_error_of(
    $$insert into storage.objects (bucket_id, name)
      values ('help-media', 'video/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.vtt')$$),
    '42501', 'but not captions filed as a video, nor any name it did not generate');

select set_config('request.jwt.claims',
    '{"sub":"98300000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(public.help_test_error_of(
    $$insert into storage.objects (bucket_id, name)
      values ('help-media', 'poster/6e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp')$$),
    '42501', 'a manager cannot upload help media');

select is(public.help_test_error_of(
    $$insert into public.help_tutorials (category_id, slug, title)
      values (98301, 'by-a-manager', 'By a manager')$$),
    '42501', 'nor write a tutorial: the manual is the admins''');

--
-- 4. A rep reads what is published and writes nothing.
--
select set_config('request.jwt.claims',
    '{"sub":"98300000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
    (select array_agg(id order by id) from public.help_tutorials where id in (98301, 98302)),
    array[98302]::bigint[],
    'a rep sees the published tutorial and not the draft');

select is(
    (select count(*)::int from public.help_categories where id = 98301), 1,
    'a rep reads the categories');

select is(public.help_test_error_of(
    $$insert into public.help_categories (slug, title) values ('by-a-rep', 'By a rep')$$),
    '42501', 'a rep cannot add a category');

-- A denied UPDATE / DELETE under RLS matches no rows rather than raising, so
-- what the row still says is the only thing that proves anything here.
update public.help_tutorials set title = 'Rewritten' where id = 98302;
delete from public.help_tutorials where id = 98302;

reset role;

select is((select title from public.help_tutorials where id = 98302), 'A published one',
    'a rep can neither rewrite nor delete a tutorial');

select is(public.help_test_error_of(
    $$delete from public.help_categories where id = 98301$$),
    '23503', 'a category that still holds tutorials is not deleted from under them');

select * from finish();

rollback;
