--
-- Quotes module, the comment thread (docs/proposals/quotes-cpq-module.md §2.5, Phase 8).
--
--   * the team's comment is internal unless its author shares it, and the
--     author, the date, the read mark and the depth of the thread are the
--     server's, whatever the request says;
--   * its author edits the body, which is stamped, and deletes it softly;
--     nothing else about a comment changes, and nobody hard-deletes one;
--   * a customer comment arrives only through the portal, signed, shared and
--     filed under the version the link opens, and nobody rewrites it: the team
--     marks it read;
--   * the thread closes to the customer with the negotiation, and one link
--     cannot flood it.
--
-- What the payload discloses of the thread is pinned in `quote_portal.test.sql`,
-- with the rest of the payload.
--
begin;

select plan(21);

create function public.quotes_test_error_of(p_sql text) returns text
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

-- The hash the edge function sends, computed from the raw token an issue handed
-- out.
create function public.quotes_test_hash_of(p_setting text) returns bytea
    language sql stable
as $$
    select sha256(decode(current_setting(p_setting)::jsonb ->> 'token', 'hex'));
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('97710000-0000-0000-0000-000000000001', 'quotes.comments.owner@test.local',
   '{"first_name":"Olga","last_name":"Owner"}'::jsonb),
  ('97710000-0000-0000-0000-000000000002', 'quotes.comments.other@test.local',
   '{"first_name":"Otto","last_name":"Other"}'::jsonb);

update public.sales set id = 9771, role = 'rep'
 where user_id = '97710000-0000-0000-0000-000000000001';
update public.sales set id = 9772, role = 'rep'
 where user_id = '97710000-0000-0000-0000-000000000002';

insert into public.companies (id, name, sales_id, logo)
values (9771, 'Cliente Comentarios', 9771, '{}'::jsonb);

-- 9771 is negotiated through its link, 9772 is accepted before anybody writes
-- on it, and 9773 is a colleague's.
insert into public.quotes (id, company_id, sales_id, currency, valid_until) values
  (9771, 9771, 9771, 'COP', current_date + 10),
  (9772, 9771, 9771, 'COP', current_date + 10),
  (9773, 9771, 9772, 'COP', current_date + 10);

insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Linea', 1, 100 from public.quote_versions v where v.quote_id between 9771 and 9773;

--
-- 1. The team's side.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97710000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- A colleague's remark on their own quote, for the reply that aims at it below.
insert into public.quote_comments (id, quote_id, body) values (97731, 9773, 'Nota del colega');

select set_config('request.jwt.claims',
    '{"sub":"97710000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Posts a name, a date and a read mark of its own. The server wins all three.
insert into public.quote_comments (id, quote_id, body, author_name, created_at, read_by_internal_at)
values (97711, 9771, 'Revisar el plazo con compras', 'Cliente', '2020-01-01', '2020-01-01');

select is(
    (select concat_ws('/', author_sales_id, coalesce(author_name, 'unsigned'), visibility,
                      (created_at > '2020-01-02')::text, coalesce(read_by_internal_at::text, 'unread'))
       from public.quote_comments where id = 97711),
    '9771/unsigned/internal/true/unread',
    'the author, the date and the read mark are the server''s, and a comment is internal unless shared');

insert into public.quote_comments (id, quote_id, parent_id, body)
values (97712, 9771, 97711, 'Ya hable con compras');
insert into public.quote_comments (id, quote_id, parent_id, body)
values (97713, 9771, 97712, 'Gracias');

select is(
    (select parent_id from public.quote_comments where id = 97713),
    97711::bigint,
    'a reply to a reply hangs off the root: the thread is one level deep');

select is(
    public.quotes_test_error_of(
        $$insert into public.quote_comments (quote_id, parent_id, body) values (9771, 97731, 'Cruzado')$$),
    '23514:quote_comment_parent_invalid',
    'a reply cannot hang off another quote''s comment');

update public.quote_comments set body = 'Revisar el plazo de entrega con compras' where id = 97711;

select is(
    (select body || '/' || (edited_at is not null)::text from public.quote_comments where id = 97711),
    'Revisar el plazo de entrega con compras/true',
    'its author edits the body, and the edit is stamped');

select is(
    public.quotes_test_error_of($$update public.quote_comments set visibility = 'shared' where id = 97711$$),
    '23514:quote_comment_column_protected',
    'a comment keeps the audience it was written for: an internal remark is never shared after the fact');

select is(
    public.quotes_test_error_of($$update public.quote_comments set edited_at = null where id = 97711$$),
    '23514:quote_comment_column_protected',
    'nor does its author hide that it was edited');

select is(
    public.quotes_test_error_of($$delete from public.quote_comments where id = 97713$$),
    '42501',
    'nobody hard-deletes a comment, its author included');

update public.quote_comments set deleted_at = '2020-01-01' where id = 97713;

select is(
    (select (deleted_at > '2020-01-02')::text from public.quote_comments where id = 97713),
    'true',
    'a comment is deleted softly, on the server''s clock');

select is(
    public.quotes_test_error_of($$update public.quote_comments set body = 'Resucitado' where id = 97713$$),
    '23514:quote_comment_column_protected',
    'a deleted comment is a tombstone: it cannot be edited back');

--
-- 2. The customer's side.
--
select set_config('comments_test.link', public.issue_quote_version(9771)::text, true);
select set_config('comments_test.accepted', public.issue_quote_version(9772)::text, true);
reset role;

set local role service_role;

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_comment(%L::bytea, '   ', 'Lucia Gomez')$$,
        public.quotes_test_hash_of('comments_test.link'))),
    '22023:quote_portal_body_required',
    'a customer comment has something to say');

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_comment(%L::bytea, 'Hola', ' ')$$,
        public.quotes_test_hash_of('comments_test.link'))),
    '22023:quote_portal_name_required',
    'and a name to sign it with');

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_comment(%L::bytea, repeat('x', 4001), 'Lucia Gomez')$$,
        public.quotes_test_hash_of('comments_test.link'))),
    '22023:quote_portal_input_too_long',
    'and says it in at most four thousand characters');

select set_config('comments_test.posted',
    public.quote_portal_comment(public.quotes_test_hash_of('comments_test.link'),
        E' Pueden mejorar\nel plazo? ', ' Lucia Gomez ', 'lucia@comentarios.test',
        '203.0.113.7', 'CommentTest/1.0')::text,
    true);

select is(
    public.quotes_test_error_of(
        $$update public.quote_comments set body = 'Aceptamos sin cambios'
           where quote_id = 9771 and author_kind = 'customer'$$),
    '23514:quote_comment_column_protected',
    'nobody rewrites a customer''s words, not even the service role');

reset role;

select is(
    (select string_agg(c ->> 'author_kind' || ':' || (c ->> 'author_name') || ':' || (c ->> 'body'), ' | ')
       from jsonb_array_elements(current_setting('comments_test.posted')::jsonb -> 'comments') c),
    E'customer:Lucia Gomez:Pueden mejorar\nel plazo?',
    'the answer is the document with the comment in its thread, trimmed, and without the team''s internal remarks');

select is(
    (select concat_ws('/', c.author_kind, coalesce(c.author_sales_id::text, 'nobody'), c.visibility,
                      c.author_email,
                      (c.version_id = (current_setting('comments_test.link')::jsonb ->> 'version_id')::bigint)::text)
       from public.quote_comments c where c.quote_id = 9771 and c.author_kind = 'customer'),
    'customer/nobody/shared/lucia@comentarios.test/true',
    'it is the customer''s, attributed to nobody on the team, shared, and filed under the version the link opens');

select is(
    (select concat_ws('/', host(e.ip_address), e.user_agent, e.actor_name)
       from public.quote_portal_events e where e.quote_id = 9771 and e.event_type = 'commented'),
    '203.0.113.7/CommentTest/1.0/Lucia Gomez',
    'the portal trail records it with the address and the browser, which the comment itself does not carry');

--
-- 3. Reading what the customer wrote.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97710000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.mark_quote_comments_read(9771)$$),
    '42501',
    'a colleague who cannot see the quote cannot mark its thread read');

select set_config('request.jwt.claims',
    '{"sub":"97710000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    (select nb_unanswered_customer_comments from public.quotes_summary where id = 9771),
    1::bigint,
    'the list counts the customer comment nobody has read');

select set_config('comments_test.marked', public.mark_quote_comments_read(9771)::text, true);
select set_config('comments_test.marked_again', public.mark_quote_comments_read(9771)::text, true);

select is(
    current_setting('comments_test.marked') || '/' || current_setting('comments_test.marked_again')
        || '/' || (select nb_unanswered_customer_comments from public.quotes_summary where id = 9771),
    '1/0/0',
    'the owner marks it read once, a second mark finds nothing, and the list stops counting it');

--
-- 4. The thread closes with the negotiation, and a link cannot flood it.
--
reset role;
set local role service_role;

select public.quote_portal_accept(public.quotes_test_hash_of('comments_test.accepted'),
                                  'Lucia Gomez', 'lucia@comentarios.test');

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_comment(%L::bytea, 'Una cosa mas', 'Lucia Gomez')$$,
        public.quotes_test_hash_of('comments_test.accepted'))),
    '23514:quote_portal_comments_closed',
    'once the quote is accepted the customer reads the thread but no longer writes to it');

do $$
begin
    for i in 1..19 loop
        perform public.quote_portal_comment(public.quotes_test_hash_of('comments_test.link'),
                                            'Mensaje ' || i, 'Lucia Gomez');
    end loop;
end;
$$;

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_comment(%L::bytea, 'Uno mas', 'Lucia Gomez')$$,
        public.quotes_test_hash_of('comments_test.link'))),
    '23514:quote_portal_comment_limit',
    'one link writes at most twenty comments an hour: nobody could remove what a leaked link floods in');

reset role;

select * from finish();
rollback;
