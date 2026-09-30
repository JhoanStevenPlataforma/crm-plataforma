--
-- Quotes module, versioning and immutability (docs/proposals/quotes-cpq-module.md §4).
--
-- The guiding rule of the module: a quote the customer was shown must render
-- identically in a year. So:
--
--   * issuing freezes the version -- its lines, its header, its snapshot of the
--     customer -- and nothing can edit or delete it afterwards;
--   * the one hole in the freeze is keyed on a single version id;
--   * revising COPIES the last document into a new draft, rather than editing
--     what was sent, and keeps the quotation's one link;
--   * a draft's system-owned columns (issue stamp, totals) are not writable by a
--     client, while its header is;
--   * the quote's `valid_until` / `terms` mirror the version being worked on,
--     and are not a second place to edit them;
--   * once a quote has left 'draft' its lines are locked, because they are what
--     an approval signed off on.
--
begin;

select plan(37);

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

create function public.quotes_test_draft_of(p_quote_id bigint) returns bigint
    language sql security definer
    set search_path to ''
as $$
    select v.id from public.quote_versions v
     where v.quote_id = p_quote_id and v.issued_at is null;
$$;

alter table public.contacts disable trigger "20_contact_saved";

insert into auth.users (id, email, raw_user_meta_data) values
  ('97440000-0000-0000-0000-000000000001', 'quotes.version@test.local', '{"first_name":"Vera","last_name":"Version"}'::jsonb);
update public.sales set id = 9741, role = 'rep'
 where user_id = '97440000-0000-0000-0000-000000000001';

insert into public.companies (id, name, address, city, country, tax_identifier, sales_id, logo)
values (9741, 'Constructora Andes', 'Calle 10 # 5-20', 'Bogota', 'Colombia', '900123456-7', 9741, '{}'::jsonb);

insert into public.contacts (id, first_name, last_name, company_id, sales_id, email_jsonb)
values (9741, 'Lucia', 'Compras', 9741, 9741,
        '[{"email":"lucia@andes.test","type":"Work"}]'::jsonb);

insert into public.quotes (id, company_id, contact_id, sales_id, currency, valid_until, terms)
values (9741, 9741, 9741, 9741, 'COP', current_date + 10, 'Pago a 30 dias');

-- 2 x 500 at 19% = 1190.00, plus 1 x 250 less 20% untaxed = 200.00 -> 1390.00.
insert into public.quote_lines
    (version_id, name, quantity, unit_price, discount_percent, tax_rate_percent, "position")
select v.id, l.name, l.qty, l.price, l.disc, l.tax, l.pos
  from public.quote_versions v
 cross join (values ('Cemento', 2, 500, 0, 19, 1),
                    ('Transporte', 1, 250, 20, 0, 2)) as l(name, qty, price, disc, tax, pos)
 where v.quote_id = 9741;

--
-- 1. Issue.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97440000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
    $$select public.issue_quote_version(9741, 30, 'Compras')$$,
    'the owner issues the draft');

reset role;

select is(
    (select status_key from public.quotes where id = 9741),
    'sent',
    'issuing moves the quote to sent');

select is(
    (select issued_by from public.quote_versions where quote_id = 9741 and version_number = 1),
    9741::bigint,
    'the issuer is recorded from the session');

select is(
    (select count(*)::int from public.quote_versions where quote_id = 9741 and issued_at is null),
    0,
    'no editable draft remains once the version is issued');

select is(
    (select (party_snapshot #>> '{company,name}') || ' / ' || (party_snapshot #>> '{contact,email}')
       from public.quote_versions where quote_id = 9741 and version_number = 1),
    'Constructora Andes / lucia@andes.test',
    'the snapshot records the customer as they were on the day of issue');

select is(
    (select party_snapshot #>> '{owner,name}'
       from public.quote_versions where quote_id = 9741 and version_number = 1),
    'Vera Version',
    'the owner appears in the snapshot as a display name');

select ok(
    (select position('quotes.version@test.local' in party_snapshot::text) = 0
            and not (party_snapshot -> 'owner' ? 'id')
       from public.quote_versions where quote_id = 9741 and version_number = 1),
    'the snapshot carries no sales email and no internal id');

update public.companies set name = 'Andes Holding' where id = 9741;

select is(
    (select party_snapshot #>> '{company,name}'
       from public.quote_versions where quote_id = 9741 and version_number = 1),
    'Constructora Andes',
    'renaming the company afterwards does not rewrite the document');

--
-- 2. The freeze.
--
select is(
    public.quotes_test_error_of($$update public.quote_lines set unit_price = 1 where quote_id = 9741$$),
    '23514:quote_version_frozen',
    'the lines of an issued version cannot be edited, even by the table owner');

select is(
    public.quotes_test_error_of(format(
        $$insert into public.quote_lines (version_id, name, quantity, unit_price) values (%s, 'Colada', 1, 1)$$,
        (select id from public.quote_versions where quote_id = 9741 and version_number = 1))),
    '23514:quote_version_frozen',
    'no line can be added to an issued version');

select is(
    public.quotes_test_error_of(
        $$update public.quote_versions set terms = 'Pago a 90 dias' where quote_id = 9741 and version_number = 1$$),
    '23514:quote_version_frozen',
    'the header of an issued version cannot be rewritten');

select is(
    public.quotes_test_error_of($$delete from public.quote_versions where quote_id = 9741$$),
    '23514:quote_version_frozen',
    'an issued version cannot be deleted');

select set_config('app.quote_version_unfreeze', '0', true);

select is(
    public.quotes_test_error_of(
        $$update public.quote_versions set terms = 'x' where quote_id = 9741 and version_number = 1$$),
    '23514:quote_version_frozen',
    'the unfreeze hole is keyed on one version id, not switched on like a flag');

select set_config('app.quote_version_unfreeze', '', true);

--
-- 3. Revise.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97440000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9741)$$),
    'P0002:quote_no_draft',
    'an issued quote has nothing left to issue');

select is(
    public.quotes_test_error_of($$select public.revise_quote(9741, '   ')$$),
    '23514:quote_reason_required',
    'a revision needs a reason');

select lives_ok(
    $$select public.revise_quote(9741, 'El cliente pidio otra cantidad')$$,
    'the owner revises the issued quote');

select is(
    (select array_agg(version_number::int || ':' || (issued_at is null)::text order by version_number)
       from public.quote_versions where quote_id = 9741),
    array['1:false', '2:true'],
    'revising opens version 2 as a draft beside the frozen version 1');

select is(
    (select array_agg(total order by version_number) from public.quote_versions where quote_id = 9741),
    array[1390.00, 1390.00]::numeric[],
    'the draft starts as an exact copy of the last issued document');

select is(
    (select count(*)::int from public.quote_lines where version_id = public.quotes_test_draft_of(9741)),
    2,
    'every line is cloned into the new draft');

select is(
    (select status_key from public.quotes where id = 9741),
    'draft',
    'revising moves the quote back to draft');

select is(
    public.quotes_test_error_of($$select public.revise_quote(9741, 'Otra vez')$$),
    '23514:quote_draft_exists',
    'a second draft is refused with an answer the UI can render');

--
-- 4. A draft is editable, but not all of it.
--
select is(
    public.quotes_test_error_of(
        $$update public.quote_versions set issued_at = now(), issued_by = 9741
           where quote_id = 9741 and version_number = 2$$),
    '23514:quote_version_column_protected',
    'a client cannot stamp its own draft as issued and skip the gate');

select is(
    public.quotes_test_error_of(
        $$update public.quote_versions set total = 1 where quote_id = 9741 and version_number = 2$$),
    '23514:quote_version_column_protected',
    'a client cannot write the total the server computes');

select lives_ok(
    $$update public.quote_versions v
         set terms = 'Pago a 45 dias', subtotal = v.subtotal, valid_until = current_date + 20
       where quote_id = 9741 and version_number = 2$$,
    'the draft header is editable, even when the whole record is posted back');

select is(
    (select valid_until || '/' || terms from public.quotes where id = 9741),
    (current_date + 20) || '/Pago a 45 dias',
    'the quote header mirrors the draft it is working on');

select is(
    public.quotes_test_error_of(
        $$update public.quotes set valid_until = current_date + 90 where id = 9741$$),
    '23514:quote_header_derived',
    'validity is edited on the draft version, never typed a second time on the header');

select lives_ok(
    $$update public.quotes q
         set title = 'Obra norte', valid_until = q.valid_until, terms = q.terms
       where id = 9741$$,
    'the header posted back unchanged still saves');

update public.quote_lines set unit_price = 600
 where "position" = 1 and version_id = public.quotes_test_draft_of(9741);

select is(
    (select array_agg(total order by version_number) from public.quote_versions where quote_id = 9741),
    array[1390.00, 1628.00]::numeric[],
    'editing the draft moves its total and leaves the issued document alone');

--
-- 5. Lines are locked once the quote leaves draft.
--
select lives_ok(
    $$select public.transition_quote(9741, 'pending_approval')$$,
    'the owner requests approval on the revision');

select is(
    public.quotes_test_error_of(format(
        $$insert into public.quote_lines (version_id, name, quantity, unit_price) values (%s, 'Tras pedir aprobacion', 1, 1)$$,
        public.quotes_test_draft_of(9741))),
    '23514:quote_not_draft',
    'lines pending approval are what is being signed off, so they are locked');

select is(
    public.quotes_test_error_of($$select public.issue_quote_version(9741)$$),
    '23514:quote_transition_illegal',
    'a quote pending approval cannot be issued past the approval');

select lives_ok(
    $$select public.transition_quote(9741, 'draft', 'Ajuste de condiciones')$$,
    'the owner takes the quote back to draft');

select lives_ok(
    $$select public.issue_quote_version(9741)$$,
    'version 2 is issued');

reset role;

select is(
    (select array_agg((superseded_at is not null)::text || '/' || (issued_at is not null)::text
                      order by version_number)
       from public.quote_versions where quote_id = 9741),
    array['true/true', 'false/true'],
    'issuing version 2 supersedes version 1, and only then');

-- The link is the QUOTE's (2026-09-29): revising revoked nothing, and issuing
-- version 2 handed back the link minted with version 1 instead of a new one.
select is(
    (select string_agg(concat_ws('/', v.version_number, (t.token is not null)::text,
                                 (t.revoked_at is null)::text), ',')
       from public.quote_access_tokens t
       join public.quote_versions v on v.id = t.version_id
      where t.quote_id = 9741),
    '1/true/true',
    'the quotation kept its one permanent link through the revision and the second issue');

--
-- 6. An accepted quote is a commitment.
--
select public.apply_quote_status(9741, 'accepted', null, 'customer');

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97440000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
    public.quotes_test_error_of($$select public.revise_quote(9741, 'Cambiar lo aceptado')$$),
    '23514:quote_transition_illegal',
    'an accepted quote cannot be revised');

reset role;

select is(
    (select max(version_number)::int from public.quote_versions where quote_id = 9741),
    2,
    'the refused revision copied nothing');

select * from finish();
rollback;
