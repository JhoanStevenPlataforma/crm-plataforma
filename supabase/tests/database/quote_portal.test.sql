--
-- Quotes module, the customer portal (docs/proposals/quotes-cpq-module.md §6, Phase 7).
--
--   * the payload discloses exactly its named keys, and nothing the team keeps
--     to itself: the internal notes of the quote and of its products, internal
--     and deleted comments, the deal, the team's email, the email a customer
--     signed a comment with, the customer's address, the token and its hash;
--   * the thread is the shared comments, oldest first, and stays open while the
--     quote is negotiable, whichever version the customer reads;
--   * opening the live document records a view and moves `sent` to `viewed`
--     once; opening a superseded version moves nothing;
--   * a link is the QUOTE's (2026-09-29): it opens the version on offer, lists
--     every issued version and never a draft, opens an older one on request,
--     and an answer names the version on screen, so a superseded one is
--     refused; a refused quotation reopened for renegotiation keeps its link;
--   * accepting and declining write the version, the status and both trails in
--     one transaction, are signed as the input rules say, and a version is
--     answered once;
--   * a refusal that raises leaves nothing behind;
--   * a dead link is one answer whatever killed it, and leaves a trace when it
--     names a quote;
--   * a link pulled faster than a person reads is throttled, and the refusal is
--     recorded once per window, not once per request.
--
-- The portal functions are called as `service_role`, the role the edge function
-- holds, so their grants are exercised as well as their logic.
--
begin;

select plan(47);

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
-- out. The raw token itself never reaches these functions.
create function public.quotes_test_hash_of(p_setting text) returns bytea
    language sql stable
as $$
    select sha256(decode(current_setting(p_setting)::jsonb ->> 'token', 'hex'));
$$;

-- An object's keys, sorted and joined: an exact key set in one comparable value.
-- Sorted byte-wise: a linguistic collation ignores the underscore and would put
-- `issued_at` before `is_superseded` on one machine and after it on another.
create function public.quotes_test_keys_of(p_object jsonb) returns text
    language sql immutable
as $$
    select coalesce(string_agg(k, ',' order by k collate "C"), '')
      from jsonb_object_keys(p_object) as k;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('98010000-0000-0000-0000-000000000001', 'quotes.portal.owner@test.local',
   '{"first_name":"Paula","last_name":"Portal"}'::jsonb);

update public.sales set id = 9801, role = 'rep'
 where user_id = '98010000-0000-0000-0000-000000000001';

insert into public.companies (id, name, sales_id, logo, address, city, tax_identifier)
values (9801, 'Portal Customer', 9801, '{}'::jsonb, 'Calle 80 # 11-42', 'Bogota', '900.555.123-4');

insert into public.contacts (id, first_name, last_name, company_id, sales_id, email_jsonb)
values (9801, 'Lucia', 'Gomez', 9801, 9801,
        '[{"email":"lucia@portal.test","type":"Work"}]'::jsonb);

insert into public.deals (id, name, stage, amount, sales_id, company_id, index)
values (9801, 'SECRET-DEAL-NAME', 'opportunity', 1000, 9801, 9801, 0);

insert into public.products (id, sku, name, currency, list_price, internal_notes)
values (9801, 'PORTAL-1', 'Annual support', 'COP', 150, 'SECRET-PRODUCT-NOTE');

-- 9801 is accepted, 9802 declined and then renegotiated, 9803 revised (its
-- first version is then opened through the version selector, and through a
-- per-version link minted after the fact), 9804's link is revoked, 9805's
-- lapses, 9806's is hammered, and 9807 is never issued.
insert into public.quotes (id, company_id, contact_id, deal_id, sales_id, currency, valid_until, title, internal_notes) values
  (9801, 9801, 9801, 9801, 9801, 'COP', current_date + 10, 'Renewal 2027', 'SECRET-QUOTE-NOTE'),
  (9802, 9801, 9801, null, 9801, 'COP', current_date + 10, null, null),
  (9803, 9801, null, null, 9801, 'COP', current_date + 10, null, null),
  (9804, 9801, null, null, 9801, 'COP', current_date + 10, null, null),
  (9805, 9801, null, null, 9801, 'COP', current_date + 10, null, null),
  (9806, 9801, null, null, 9801, 'COP', current_date + 10, null, null),
  (9807, 9801, null, null, 9801, 'COP', current_date + 10, null, null);

insert into public.quote_lines (version_id, product_id, quantity, unit_price, description)
select v.id, 9801, 2, 150, '8x5 support' from public.quote_versions v
 where v.quote_id between 9801 and 9807;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98010000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- A remark for the team. It must stay with the team.
insert into public.quote_comments (quote_id, body) values (9801, 'SECRET-INTERNAL-COMMENT');
-- A message for the customer, and one its author took back.
insert into public.quote_comments (quote_id, visibility, body) values (9801, 'shared', 'We can start in October.');
insert into public.quote_comments (quote_id, visibility, body) values (9801, 'shared', 'SECRET-DELETED-COMMENT');
update public.quote_comments set deleted_at = now()
 where quote_id = 9801 and body = 'SECRET-DELETED-COMMENT';

-- The issue results are kept in transaction-local settings: the raw token is
-- returned exactly once and the token table is unreadable to the rep.
select set_config('portal_test.accept',   public.issue_quote_version(9801)::text, true);
select set_config('portal_test.reject',   public.issue_quote_version(9802)::text, true);
select set_config('portal_test.revised',  public.issue_quote_version(9803)::text, true);
select set_config('portal_test.revoked',  public.issue_quote_version(9804)::text, true);
select set_config('portal_test.expired',  public.issue_quote_version(9805)::text, true);
select set_config('portal_test.hammered', public.issue_quote_version(9806)::text, true);

select public.revoke_quote_token((current_setting('portal_test.revoked')::jsonb ->> 'token_id')::bigint);
select public.revise_quote(9803, 'Scope change');
select public.issue_quote_version(9803);
reset role;

-- A per-version link to version 1, as every link was before links became the
-- quote's -- minted afterwards, as the service role.
select set_config('portal_test.superseded',
    public.mint_quote_token(
        (select id from public.quote_versions where quote_id = 9803 and version_number = 1))::text,
    true);

-- 9805's link lapses. A test cannot wait for it, so the date moves.
update public.quote_access_tokens set expires_at = now() - interval '1 second'
 where id = (current_setting('portal_test.expired')::jsonb ->> 'token_id')::bigint;

-- The installation's branding, as the settings screen stores it (`{src}`).
insert into public.configuration (id, config)
values (1, '{"title": "Plataforma Portal", "lightModeLogo": {"src": "data:image/png;base64,UE9SVEFM"}}'::jsonb)
on conflict (id) do update set config = excluded.config;

set local role service_role;
-- The customer writes before the page is opened again. The email they sign
-- with stays with the team.
select public.quote_portal_comment(public.quotes_test_hash_of('portal_test.accept'),
    'Could you start in September?', 'Lucia Gomez', 'lucia.private@portal.test');
select set_config('portal_test.view',
    public.quote_portal_view(public.quotes_test_hash_of('portal_test.accept'),
                             '203.0.113.7', 'PortalTest/1.0')::text,
    true);
reset role;

--
-- 1. What the payload discloses, and what it does not.
--
select is(
    public.quotes_test_keys_of(current_setting('portal_test.view')::jsonb),
    'acceptance,actions,branding,comments,etag,lines,parties,quote,slides,standard_presentation,terms,totals,versions',
    'the payload has exactly the groups of the document, and the etag of them');

select is(
    public.quotes_test_keys_of(current_setting('portal_test.view')::jsonb -> 'quote'),
    'currency,is_superseded,issued_at,number,status,title,valid_until,version_number',
    'the quote group names the document, and no id, owner or deal');

select is(
    (select concat_ws(' | ',
                public.quotes_test_keys_of(v -> 'parties'),
                public.quotes_test_keys_of(v -> 'parties' -> 'company'),
                public.quotes_test_keys_of(v -> 'parties' -> 'contact'),
                public.quotes_test_keys_of(v -> 'parties' -> 'owner'))
       from (select current_setting('portal_test.view')::jsonb as v) p),
    'company,contact,owner | address,city,country,name,phone_number,state_abbr,tax_identifier,website,zipcode | email,first_name,last_name,phone,title | name',
    'the parties are picked from the snapshot key by key, and the owner is a display name');

select is(
    public.quotes_test_keys_of(current_setting('portal_test.view')::jsonb -> 'lines' -> 0),
    'description,discount_percent,line_total,name,position,quantity,sku,tax_rate_percent,unit,unit_price',
    'a line carries what the document prints, and no line or product id');

select is(
    (select concat_ws(' | ',
                public.quotes_test_keys_of(v -> 'totals'),
                public.quotes_test_keys_of(v -> 'branding'),
                public.quotes_test_keys_of(v -> 'actions'),
                public.quotes_test_keys_of(v -> 'acceptance'))
       from (select current_setting('portal_test.view')::jsonb as v) p),
    'discount_total,subtotal,tax_total,total | logo_url,title | can_accept,can_comment,can_reject | accepted_at,accepted_by_name,rejected_at',
    'the totals, branding, actions and acceptance groups carry exactly their keys');

select is(
    public.quotes_test_keys_of(current_setting('portal_test.view')::jsonb -> 'comments' -> 0),
    'author_kind,author_name,body,created_at,edited_at',
    'a comment carries what the thread prints: no id, no audience, no email');

select is(
    (select string_agg(c ->> 'author_kind' || ':' || (c ->> 'author_name') || ':' || (c ->> 'body'),
                       ' | ' order by n)
       from jsonb_array_elements(current_setting('portal_test.view')::jsonb -> 'comments')
            with ordinality as t(c, n)),
    'internal:Paula Portal:We can start in October. | customer:Lucia Gomez:Could you start in September?',
    'the thread is the shared comments, oldest first, each signed with a display name');

select is(
    (select coalesce(array_agg(s order by s), '{}')
       from unnest(array[
            'SECRET-QUOTE-NOTE', 'SECRET-PRODUCT-NOTE', 'SECRET-INTERNAL-COMMENT',
            'SECRET-DELETED-COMMENT', 'SECRET-DEAL-NAME', 'quotes.portal.owner@test.local',
            'lucia.private@portal.test', '203.0.113.7',
            current_setting('portal_test.accept')::jsonb ->> 'token',
            encode(public.quotes_test_hash_of('portal_test.accept'), 'hex')]) as s
      where strpos(current_setting('portal_test.view'), s) > 0),
    '{}'::text[],
    'nothing the team keeps to itself is in it: notes, internal or deleted comments, the deal, the team''s email, a commenter''s email, the address, the token or its hash');

select is(
    (select (v -> 'totals' ->> 'total') || '/' || jsonb_array_length(v -> 'lines')
            || '/' || (v -> 'lines' -> 0 ->> 'line_total')
       from (select current_setting('portal_test.view')::jsonb as v) p),
    (select qv.total || '/1/' || l.line_total
       from public.quote_versions qv
       join public.quote_lines l on l.version_id = qv.id
      where qv.quote_id = 9801),
    'the figures are the frozen ones, as stored');

select is(
    (select concat_ws(' / ',
                v -> 'parties' -> 'owner' ->> 'name',
                v -> 'parties' -> 'contact' ->> 'email',
                v -> 'branding' ->> 'title',
                v -> 'branding' ->> 'logo_url')
       from (select current_setting('portal_test.view')::jsonb as v) p),
    'Paula Portal / lucia@portal.test / Plataforma Portal / data:image/png;base64,UE9SVEFM',
    'the owner by name, the addressee, and the branding from the configuration');

select is(
    (select concat_ws('/', v -> 'actions' ->> 'can_accept', v -> 'actions' ->> 'can_reject',
                      v -> 'actions' ->> 'can_comment', v -> 'quote' ->> 'is_superseded')
       from (select current_setting('portal_test.view')::jsonb as v) p),
    'true/true/true/false',
    'the live document offers both answers, and the thread');

--
-- 2. Opening the link.
--
select is(
    (select status_key from public.quotes where id = 9801),
    'viewed',
    'the first look moves a sent offer to viewed');

select is(
    (select from_status || '>' || to_status || '/' || actor_kind || '/' || coalesce(sales_id::text, 'none')
       from public.quote_status_changes where quote_id = 9801 and to_status = 'viewed'),
    'sent>viewed/customer/none',
    'the move is the customer''s, attributed to nobody on the team');

select is(
    (select host(ip_address) || '/' || user_agent
            || '/' || (token_id = (current_setting('portal_test.accept')::jsonb ->> 'token_id')::bigint)::text
            || '/' || (version_id = (current_setting('portal_test.accept')::jsonb ->> 'version_id')::bigint)::text
       from public.quote_portal_events where quote_id = 9801 and event_type = 'viewed'),
    '203.0.113.7/PortalTest/1.0/true/true',
    'the view is on the portal trail with the address and the browser, which only that table holds');

set local role service_role;
select public.quote_portal_view(public.quotes_test_hash_of('portal_test.accept'),
                                '203.0.113.7', 'PortalTest/1.0');
reset role;

select is(
    (select count(*)::int
            || '/' || (select status_key from public.quotes where id = 9801)
            || '/' || (select t.view_count || '/' || (t.last_seen_at is not null)::text
                         from public.quote_access_tokens t
                        where t.id = (current_setting('portal_test.accept')::jsonb ->> 'token_id')::bigint)
       from public.quote_status_changes where quote_id = 9801 and to_status = 'viewed'),
    '1/viewed/2/true',
    'every open is counted on the link; the status moves once');

--
-- 3. Accepting.
--
set local role service_role;

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_accept(%L::bytea, '   ', 'lucia@portal.test')$$,
        public.quotes_test_hash_of('portal_test.accept'))),
    '22023:quote_portal_name_required',
    'an acceptance needs a name to be signed with');

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_accept(%L::bytea, 'Lucia Gomez', 'not-an-email')$$,
        public.quotes_test_hash_of('portal_test.accept'))),
    '22023:quote_portal_email_invalid',
    'and an email address that is one');

select set_config('portal_test.accepted',
    public.quote_portal_accept(public.quotes_test_hash_of('portal_test.accept'),
        ' Lucia Gomez ', 'lucia@portal.test', '203.0.113.9', 'PortalTest/1.0')::text,
    true);

reset role;

select is(
    (select concat_ws('/', v -> 'acceptance' ->> 'accepted_by_name',
                      ((v -> 'acceptance' ->> 'accepted_at') is not null)::text,
                      v -> 'actions' ->> 'can_accept', v -> 'actions' ->> 'can_reject',
                      v -> 'actions' ->> 'can_comment', v -> 'quote' ->> 'status')
       from (select current_setting('portal_test.accepted')::jsonb as v) p),
    'Lucia Gomez/true/false/false/false/accepted',
    'the answer returns the document as it now stands, with nothing left to answer or to say');

select is(
    (select concat_ws('/', accepted_by_name, accepted_by_email, host(accepted_ip), acceptance_method,
                      acceptance_evidence ->> 'total', acceptance_evidence ->> 'version_number')
       from public.quote_versions where quote_id = 9801),
    'Lucia Gomez/lucia@portal.test/203.0.113.9/portal_click/300.00/1',
    'the version records who accepted, from where, how, and the figure they accepted');

select is(
    (select from_status || '>' || to_status || '/' || actor_kind
       from public.quote_status_changes where quote_id = 9801 and to_status = 'accepted'),
    'viewed>accepted/customer',
    'the status moved through the status machine, as the customer');

select is(
    (select concat_ws('/', actor_name, actor_email, payload ->> 'total')
       from public.quote_portal_events where quote_id = 9801 and event_type = 'accepted'),
    'Lucia Gomez/lucia@portal.test/300.00',
    'the acceptance is on the portal trail, signed');

select is(
    (select strpos(t.payload::text, '203.0.113') || '/' || strpos(t.payload::text, 'PortalTest')
       from public.timeline_events t
      where t.entity_type = 'quote' and t.entity_id = 9801 and t.event_type = 'quote.accepted'),
    '0/0',
    'the timeline the team reads carries neither the address nor the browser');

set local role service_role;

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_accept(%L::bytea, 'Lucia Gomez', 'lucia@portal.test')$$,
        public.quotes_test_hash_of('portal_test.accept'))),
    '23514:quote_version_answered',
    'a second click is refused: a version is answered once');

--
-- 4. Declining.
--
select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_reject(%L::bytea, 'too_expensive')$$,
        public.quotes_test_hash_of('portal_test.reject'))),
    '22023:quote_portal_reason_code_invalid',
    'a decline names one of the reasons the version can record');

select set_config('portal_test.rejected',
    public.quote_portal_reject(public.quotes_test_hash_of('portal_test.reject'),
        'price', ' Over budget this quarter ', null, null, '203.0.113.9', 'PortalTest/1.0')::text,
    true);

reset role;

select is(
    (select concat_ws('/', ((v -> 'acceptance' ->> 'rejected_at') is not null)::text,
                      v -> 'quote' ->> 'status', v -> 'actions' ->> 'can_accept')
       from (select current_setting('portal_test.rejected')::jsonb as v) p),
    'true/rejected/false',
    'a customer may decline without giving a name, and the document says it was declined');

select is(
    (select concat_ws('/', v.rejected_reason_code, v.rejected_reason,
                      (select sc.from_status || '>' || sc.to_status || ':' || sc.reason
                         from public.quote_status_changes sc
                        where sc.quote_id = 9802 and sc.to_status = 'rejected'),
                      (select e.payload ->> 'reason_code'
                         from public.quote_portal_events e
                        where e.quote_id = 9802 and e.event_type = 'rejected'))
       from public.quote_versions v where v.quote_id = 9802),
    'price/Over budget this quarter/sent>rejected:Over budget this quarter/price',
    'the reason lands on the version, on the move and on the portal trail');

set local role service_role;

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_accept(%L::bytea, 'Lucia Gomez', 'lucia@portal.test')$$,
        public.quotes_test_hash_of('portal_test.reject'))),
    '23514:quote_version_answered',
    'a declined version cannot then be accepted: that takes a revision');

--
-- 5. One link, every version: the selector.
--
-- 9803's link was minted with version 1 and handed back again by the issue of
-- version 2. The customer asks for version 1.
select set_config('portal_test.superseded_view',
    public.quote_portal_view(public.quotes_test_hash_of('portal_test.revised'), null, null, 1)::text,
    true);

reset role;

select is(
    (select concat_ws('/', v -> 'quote' ->> 'version_number', v -> 'quote' ->> 'is_superseded',
                      v -> 'actions' ->> 'can_accept', v -> 'actions' ->> 'can_reject',
                      v -> 'actions' ->> 'can_comment')
       from (select current_setting('portal_test.superseded_view')::jsonb as v) p),
    '1/true/false/false/true',
    'an older version opens on request, says it was superseded, offers no answer, and the thread stays open');

select is(
    (select q.status_key || '/' || (select count(*) from public.quote_status_changes sc
                                     where sc.quote_id = 9803 and sc.to_status = 'viewed')
       from public.quotes q where q.id = 9803),
    'sent/0',
    'opening it moves nothing: an older document is not news about the one in play');

select is(
    (select public.quotes_test_keys_of(v -> 'versions' -> 0) || ' | '
            || string_agg(concat_ws(':', x ->> 'number', x ->> 'is_current'), ',' order by n)
       from (select current_setting('portal_test.superseded_view')::jsonb as v) p,
            jsonb_array_elements(v -> 'versions') with ordinality as t(x, n)
      group by v),
    'is_current,issued_at,number,outcome | 2:true,1:false',
    'the selector lists every issued version, newest first, and which one is on offer');

set local role service_role;

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_accept(%L::bytea, 'Lucia Gomez', 'lucia@portal.test', null, null, 1)$$,
        public.quotes_test_hash_of('portal_test.revised'))),
    '23514:quote_version_superseded',
    'the answer names the version on screen, and a superseded one cannot be accepted');

select is(
    public.quotes_test_error_of(format(
        $$select public.quote_portal_accept(%L::bytea, 'Lucia Gomez', 'lucia@portal.test')$$,
        public.quotes_test_hash_of('portal_test.superseded'))),
    '23514:quote_version_superseded',
    'a page from before the selector answers the version its link was minted for, which is superseded');

reset role;

select is(
    (select (select count(*) from public.quote_portal_events e
              where e.quote_id = 9803 and e.event_type = 'accepted')
            || '/' || (v.accepted_at is null)::text
       from public.quote_versions v where v.quote_id = 9803 and v.version_number = 1),
    '0/true',
    'and the refusal left nothing behind');

set local role service_role;

-- The customer writes while reading version 1: the thread is the quote's, so
-- it is filed under the document on offer.
select public.quote_portal_comment(public.quotes_test_hash_of('portal_test.superseded'),
    'Why was version 1 cheaper?', 'Lucia Gomez');

select is(
    (select concat_ws('/', v -> 'quote' ->> 'version_number', v -> 'quote' ->> 'is_superseded')
       from (select public.quote_portal_view(
                        public.quotes_test_hash_of('portal_test.superseded'), null, null) as v) p),
    '2/false',
    'an older per-version link now opens the version on offer');

reset role;

select is(
    (select v.version_number::int from public.quote_comments c
       join public.quote_versions v on v.id = c.version_id
      where c.quote_id = 9803 and c.body = 'Why was version 1 cheaper?'),
    2,
    'a comment written from any version is filed under the one on offer');

-- 9802 was declined. The owner reopens it to renegotiate: a revision of the
-- same quotation, not a new one.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"98010000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.revise_quote(9802, 'The customer will reconsider at a lower price');
reset role;

set local role service_role;
select set_config('portal_test.renegotiating',
    public.quote_portal_view(public.quotes_test_hash_of('portal_test.reject'), null, null, 2)::text,
    true);
reset role;

select is(
    (select concat_ws('/', v -> 'quote' ->> 'version_number', v -> 'quote' ->> 'status',
                      jsonb_array_length(v -> 'versions'), v -> 'versions' -> 0 ->> 'outcome')
       from (select current_setting('portal_test.renegotiating')::jsonb as v) p),
    '1/draft/1/rejected',
    'while a new version is drafted the link still opens the declined one, and the draft is neither listed nor opened');

select is(
    (select concat_ws('/', v -> 'actions' ->> 'can_accept', v -> 'actions' ->> 'can_reject',
                      v -> 'actions' ->> 'can_comment')
       from (select current_setting('portal_test.renegotiating')::jsonb as v) p),
    'false/false/true',
    'a renegotiation reopens the conversation but offers nothing to answer until the new version is sent');

-- And the other way round: the link minted with 9803's version 1 answers the
-- version on screen, version 2.
set local role service_role;
select is(
    public.quote_portal_accept(public.quotes_test_hash_of('portal_test.revised'),
        'Lucia Gomez', 'lucia@portal.test', null, null, 2) -> 'quote' ->> 'status',
    'accepted',
    'a link minted with an older version accepts the version on the customer''s screen');
reset role;

--
-- 6. Dead links.
--
set local role service_role;

select is(
    public.quote_portal_view(public.quotes_test_hash_of('portal_test.revoked'), null, null),
    '{"error": "quote_link_invalid"}'::jsonb,
    'a revoked link is not found');

select is(
    public.quote_portal_view(public.quotes_test_hash_of('portal_test.expired'), null, null),
    '{"error": "quote_link_invalid"}'::jsonb,
    'an expired link is not found either, with the same answer');

reset role;
select set_config('portal_test.events_before',
    (select count(*) from public.quote_portal_events)::text, true);
set local role service_role;

select is(
    public.quote_portal_view(sha256('never minted'::bytea), null, null),
    '{"error": "quote_link_invalid"}'::jsonb,
    'nor is a hash nobody ever minted: one answer, whatever killed the link');

reset role;

select is(
    (select count(*) from public.quote_portal_events)::text,
    current_setting('portal_test.events_before'),
    'an unknown hash names no quote, so it leaves no event');

select is(
    (select (select count(*) from public.quote_portal_events
              where quote_id = 9804 and event_type = 'token_invalid')
            || '/' || (select count(*) from public.quote_portal_events
                        where quote_id = 9805 and event_type = 'token_invalid')),
    '1/1',
    'a dead link that names a quote leaves a trace on it');

set local role service_role;

select is(
    (select (public.quote_portal_accept(public.quotes_test_hash_of('portal_test.revoked'),
                                        'Lucia Gomez', 'lucia@portal.test') ->> 'error')
            || '/' || (select status_key from public.quotes where id = 9804)),
    'quote_link_invalid/sent',
    'a dead link cannot answer');

--
-- 7. Throttling.
--
do $$
begin
    for i in 1..30 loop
        perform public.quote_portal_view(public.quotes_test_hash_of('portal_test.hammered'), null, null);
    end loop;
end;
$$;

select is(
    public.quote_portal_view(public.quotes_test_hash_of('portal_test.hammered'), null, null),
    '{"error": "quote_portal_throttled", "retry_after_seconds": 60}'::jsonb,
    'the thirty-first request in a minute is refused');

select public.quote_portal_view(public.quotes_test_hash_of('portal_test.hammered'), null, null);
select public.quote_portal_view(public.quotes_test_hash_of('portal_test.hammered'), null, null);

reset role;

select is(
    (select (select count(*) from public.quote_portal_events
              where quote_id = 9806 and event_type = 'throttled')
            || '/' || (select view_count from public.quote_access_tokens
                        where id = (current_setting('portal_test.hammered')::jsonb ->> 'token_id')::bigint)),
    '1/30',
    'the refusal is recorded once per window, and refused requests are not views');

--
-- 8. A draft is not a document.
--
select is(
    public.quote_portal_document((select id from public.quote_versions where quote_id = 9807)),
    null,
    'there is no payload for a version that was never issued');

select * from finish();
rollback;
