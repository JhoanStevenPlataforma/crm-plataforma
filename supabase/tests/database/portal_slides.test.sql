--
-- Customer portal slides (docs/proposals/quote-portal-presentation.md §7).
--
--   * everyone signed in reads the deck, only admins change it, and `anon`
--     holds nothing on the table;
--   * a box is an image, a video or a text placed in percent, with exactly its
--     own keys; anything else is refused with a key the editor can show;
--   * a slide holds at most 20 boxes, a template at most 30 slides;
--   * the default template ships active and locked: nobody edits, renames or
--     deletes it, "save as" copies it, and exactly one template is active;
--   * media can be uploaded by admins only, under `slides/<uuid>.<ext>`;
--   * issuing a version freezes the ACTIVE template's slides, and a later
--     edit leaves the issued copy -- and what the customer's link serves --
--     unchanged.
--
begin;

select plan(30);

create function public.portal_test_error_of(p_sql text) returns text
    language plpgsql
as $$
declare
    v_detail text;
begin
    execute p_sql;
    return 'no error';
exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    return sqlstate || coalesce(':' || nullif(v_detail, ''), '');
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98200000-0000-0000-0000-000000000001', 'portal.slides.admin@test.local',
   '{"first_name":"Ada","last_name":"Admin"}'::jsonb),
  ('98200000-0000-0000-0000-000000000002', 'portal.slides.manager@test.local',
   '{"first_name":"Mia","last_name":"Manager"}'::jsonb),
  ('98200000-0000-0000-0000-000000000003', 'portal.slides.rep@test.local',
   '{"first_name":"Rui","last_name":"Rep"}'::jsonb);

update public.sales set id = 9821, role = 'admin'
 where user_id = '98200000-0000-0000-0000-000000000001';
update public.sales set id = 9822, role = 'manager'
 where user_id = '98200000-0000-0000-0000-000000000002';
update public.sales set id = 9823, role = 'rep'
 where user_id = '98200000-0000-0000-0000-000000000003';

insert into public.companies (id, name, sales_id, logo)
values (9821, 'Slides Customer', 9823, '{}'::jsonb);
insert into public.products (id, sku, name, currency, list_price)
values (9821, 'SLIDES-1', 'Setup', 'COP', 100);
insert into public.quotes (id, company_id, sales_id, currency, valid_until)
values (9821, 9821, 9823, 'COP', current_date + 10),
       (9822, 9821, 9823, 'COP', current_date + 10);
insert into public.quote_lines (version_id, product_id, quantity, unit_price, description)
select v.id, 9821, 1, 100, 'Setup' from public.quote_versions v where v.quote_id in (9821, 9822);

--
-- 1. Who may write.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.portal_templates (id, name) overriding system value
values (98201, 'Test template');
select public.activate_portal_template(98201);

insert into public.portal_slides (id, template_id, position, elements) overriding system value values
  (98201, 98201, 9001, '[
     {"id":"pic","kind":"image","x":0,"y":0,"w":60,"h":100,"path":"slides/0b7c1f3e-8a1d-4c61-9f3a-2d5e6f708192.webp","alt":"Our plant"},
     {"id":"txt","kind":"text","x":62,"y":20,"w":35,"h":40,"text":"Who we are","size":"xl","align":"left","color":"light"}
   ]'::jsonb);

select is((select jsonb_array_length(elements) from public.portal_slides where id = 98201), 2,
    'an admin adds a slide with a picture and a text');

select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is((select count(*)::int from public.portal_slides where id = 98201), 1,
    'a rep reads the deck');

select is(public.portal_test_error_of(
    $$insert into public.portal_slides (template_id, position) values (98201, 9002)$$),
    '42501', 'a rep cannot add a slide');

select is(public.portal_test_error_of(
    $$select public.activate_portal_template(98201)$$),
    '42501', 'a rep cannot choose the active template');

update public.portal_slides set elements = '[]'::jsonb where id = 98201;
delete from public.portal_slides where id = 98201;
select is((select jsonb_array_length(elements) from public.portal_slides where id = 98201), 2,
    'a rep can neither empty nor delete a slide');

select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(public.portal_test_error_of(
    $$insert into public.portal_slides (template_id, position) values (98201, 9002)$$),
    '42501', 'a manager cannot add a slide either: the deck is the admins''');

reset role;

select ok(not has_table_privilege('anon', 'public.portal_slides', 'select'),
    'anon cannot read the table');

--
-- 2. The shape of a box.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(public.portal_test_error_of($$update public.portal_slides set elements =
    '[{"id":"a","kind":"image","x":0,"y":0,"w":10,"h":10,"path":"slides/0b7c1f3e-8a1d-4c61-9f3a-2d5e6f708192.webp","onclick":"x"}]'
    where id = 98201$$),
    '23514:portal_slide_elements_invalid', 'a key the renderer does not know is refused');

select is(public.portal_test_error_of($$update public.portal_slides set elements =
    '[{"id":"a","kind":"image","x":0,"y":0,"w":10,"h":10,"path":"slides/../brand/logo.svg"}]'
    where id = 98201$$),
    '23514:portal_slide_elements_invalid', 'a path outside slides/<uuid>.<ext> is refused');

select is(public.portal_test_error_of($$update public.portal_slides set elements =
    '[{"id":"a","kind":"video","x":0,"y":0,"w":10,"h":10,"path":"slides/0b7c1f3e-8a1d-4c61-9f3a-2d5e6f708192.webp"}]'
    where id = 98201$$),
    '23514:portal_slide_elements_invalid', 'a video must point at a video file');

select is(public.portal_test_error_of($$update public.portal_slides set elements =
    '[{"id":"a","kind":"text","x":0,"y":0,"w":10,"h":10,"text":"Hi","size":"md","align":"left","color":"light","path":"slides/0b7c1f3e-8a1d-4c61-9f3a-2d5e6f708192.webp"}]'
    where id = 98201$$),
    '23514:portal_slide_elements_invalid', 'a text box carries no media');

select is(public.portal_test_error_of($$update public.portal_slides set elements =
    '[{"id":"a","kind":"text","x":95,"y":0,"w":0.5,"h":10,"text":"Hi","size":"md","align":"left","color":"light"}]'
    where id = 98201$$),
    '23514:portal_slide_elements_invalid', 'a box narrower than 1% is refused');

select is(public.portal_test_error_of($$update public.portal_slides set elements =
    '[{"id":"a","kind":"text","x":"10","y":0,"w":10,"h":10,"text":"Hi","size":"md","align":"left","color":"light"}]'
    where id = 98201$$),
    '23514:portal_slide_elements_invalid', 'a position must be a number, not a string');

select is(public.portal_test_error_of(format($$update public.portal_slides set elements = %L where id = 98201$$,
    (select jsonb_agg(jsonb_build_object('id', 't' || n, 'kind', 'text', 'x', 0, 'y', 0,
                                         'w', 10, 'h', 10, 'text', 'x', 'size', 'sm',
                                         'align', 'left', 'color', 'dark'))
       from generate_series(1, 21) n))),
    '23514:portal_slide_elements_invalid', 'a slide holds at most 20 boxes');

select is(public.portal_test_error_of(format(
    $$insert into public.portal_slides (template_id, position) select 98201, 9100 + n from generate_series(1, %s) n$$,
    31 - (select count(*) from public.portal_slides where template_id = 98201))),
    '23514:portal_slide_limit', 'a template holds at most 30 slides');

--
-- 2b. The default template.
--
select set_config('portal_test.default',
    (select id::text from public.portal_templates where is_system), true);

select is((select count(*)::int from public.portal_slides
            where template_id = current_setting('portal_test.default')::bigint), 4,
    'the default template ships the four slides of the original presentation');

select is(public.portal_test_error_of(format(
    $$update public.portal_slides set elements = '[]' where template_id = %s$$,
    current_setting('portal_test.default'))),
    '23514:portal_template_locked', 'nobody edits a slide of the default template');

select is(public.portal_test_error_of(format(
    $$update public.portal_templates set name = 'Mine' where id = %s$$,
    current_setting('portal_test.default'))),
    '23514:portal_template_locked', 'nobody renames the default template');

select is(public.portal_test_error_of(format(
    $$delete from public.portal_templates where id = %s$$,
    current_setting('portal_test.default'))),
    '23514:portal_template_locked', 'nobody deletes the default template');

select set_config('portal_test.copy',
    public.duplicate_portal_template(current_setting('portal_test.default')::bigint,
                                     'Copy of the default')::text, true);

select is((select count(*)::int from public.portal_slides
            where template_id = current_setting('portal_test.copy')::bigint), 4,
    '"save as" copies every slide into a template that can be changed');

select is(public.portal_test_error_of(format(
    $$update public.portal_slides set elements = '[]' where template_id = %s$$,
    current_setting('portal_test.copy'))),
    'no error', 'and the copy is editable');

select is((select count(*)::int from public.portal_templates where is_active), 1,
    'exactly one template is active after switching'); 

--
-- 3. Media uploads.
--
select is(public.portal_test_error_of(
    $$insert into storage.objects (bucket_id, name) values ('portal-media', 'slides/5e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.mp4')$$),
    'no error', 'an admin uploads a video under slides/<uuid>.<ext>');

select is(public.portal_test_error_of(
    $$insert into storage.objects (bucket_id, name) values ('portal-media', 'slides/logo.svg')$$),
    '42501', 'nor a name the editor did not generate, nor an SVG');

select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(public.portal_test_error_of(
    $$insert into storage.objects (bucket_id, name) values ('portal-media', 'slides/6e1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp')$$),
    '42501', 'a rep cannot upload portal media');

--
-- 4. Frozen at issue.
--
select set_config('portal_test.issued', public.issue_quote_version(9821)::text, true);

select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.portal_slides set elements = '[]'::jsonb where id = 98201;
reset role;

select ok(
    (select v.slides from public.quote_versions v
      where v.quote_id = 9821 and v.version_number = 1)
    @> '[{"elements":[{"id":"pic","kind":"image"},{"id":"txt","text":"Who we are"}]}]'::jsonb,
    'the issued version keeps the deck as it stood, after the deck was emptied');

select ok(
    (public.quote_portal_document(
        (select v.id from public.quote_versions v where v.quote_id = 9821 and v.version_number = 1))
     -> 'slides')
    @> '[{"elements":[{"id":"txt","text":"Who we are"}]}]'::jsonb,
    'and the customer''s link serves that frozen copy');

select ok(
    not (select v.standard_presentation from public.quote_versions v
          where v.quote_id = 9821 and v.version_number = 1),
    'a version issued with a template of free-form slides is not the standard presentation');

-- The default template active again: the designed presentation, no boxes.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.activate_portal_template(current_setting('portal_test.default')::bigint);
select set_config('request.jwt.claims',
    '{"sub":"98200000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.issue_quote_version(9822);
reset role;

select is(
    (select jsonb_build_object('standard', v.standard_presentation, 'slides', v.slides)
       from public.quote_versions v where v.quote_id = 9822 and v.version_number = 1),
    '{"standard": true, "slides": []}'::jsonb,
    'issued under the default template: the standard presentation, and no free-form slides');

select is(
    public.quote_portal_document(
        (select v.id from public.quote_versions v where v.quote_id = 9822 and v.version_number = 1))
     -> 'standard_presentation',
    'true'::jsonb,
    'and the customer''s link says so');

select * from finish();
rollback;
