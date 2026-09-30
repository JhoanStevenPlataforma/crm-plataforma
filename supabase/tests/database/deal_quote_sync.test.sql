--
-- The pipeline follows its quotations (quotes module, deal sync).
--
--   * each quotation event moves its deal to the stage the rules name, and the
--     move is recorded with `source = 'quote'` and the quotation;
--   * a customer's comment opens the negotiation;
--   * a deal in a closing stage (won, lost) is never reopened -- except by the
--     renegotiation of the quotation whose refusal closed it, when nothing
--     else has moved the deal since;
--   * a refusal closes the deal only when no other quotation is still open,
--     an acceptance always does;
--   * the deal's amount follows the version sent and is fixed once accepted;
--   * the completed-task rule of manual moves does not block an automatic one;
--   * the rules are read by everybody and written by admins only.
--
begin;

select plan(27);

create function public.dq_test_error_of(p_sql text) returns text
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

create function public.dq_test_hash_of(p_setting text) returns bytea
    language sql stable
as $$
    select sha256(decode(current_setting(p_setting)::jsonb ->> 'token', 'hex'));
$$;

create function public.dq_test_stage(p_deal_id bigint) returns text
    language sql stable security definer
    set search_path to ''
as $$
    select stage from public.deals where id = p_deal_id;
$$;

-- The rules as the migration seeds them, whatever this database holds.
delete from public.deal_quote_stage_rules where trigger_key is not null;
insert into public.deal_quote_stage_rules (trigger_key, to_stage, closes, only_if_no_open_quote) values
    ('sent', 'proposal-sent', false, false), ('viewed', 'proposal-sent', false, false),
    ('negotiating', 'in-negociation', false, false), ('commented', 'in-negociation', false, false),
    ('accepted', 'won', true, false), ('rejected', 'lost', true, true),
    ('expired', 'delayed', false, true);
-- The completed-task rule, on for every stage the quotations move to: it must
-- not stand in the way of an automatic move.
insert into public.deal_stage_requirements (to_stage, min_completed_tasks, enforced_from)
select s, 1, '2000-01-01'::timestamptz
  from unnest(array['proposal-sent', 'in-negociation', 'won', 'lost', 'delayed']) s
on conflict (to_stage) do update set min_completed_tasks = 1, enforced_from = '2000-01-01';

insert into auth.users (id, email, raw_user_meta_data) values
  ('97400000-0000-0000-0000-000000000001', 'dq.rep@test.local', '{"first_name":"Rita","last_name":"Rep"}'::jsonb),
  ('97400000-0000-0000-0000-000000000002', 'dq.adm@test.local', '{"first_name":"Ada","last_name":"Admin"}'::jsonb);
update public.sales set id = 9781, role = 'rep'   where user_id = '97400000-0000-0000-0000-000000000001';
update public.sales set id = 9782, role = 'admin' where user_id = '97400000-0000-0000-0000-000000000002';

insert into public.companies (id, name, sales_id, logo) values (9781, 'Cliente Pipeline', 9781, '{}'::jsonb);

-- 9781: the happy path. 9782: closed by hand. 9783: two quotations, one refused.
-- 9784: refused alone. 9785: no quotation touches it (a quote without deal).
insert into public.deals (id, name, stage, amount, sales_id, company_id, index) values
  (9781, 'Renovación', 'opportunity', 1, 9781, 9781, 0),
  (9782, 'Cerrada a mano', 'lost', 1, 9781, 9781, 0),
  (9783, 'Dos propuestas', 'opportunity', 1, 9781, 9781, 1),
  (9784, 'Una propuesta', 'opportunity', 1, 9781, 9781, 2);

insert into public.quotes (id, company_id, deal_id, sales_id, currency, valid_until) values
  (9781, 9781, 9781, 9781, 'COP', current_date + 10),
  (9782, 9781, 9782, 9781, 'COP', current_date + 10),
  (9783, 9781, 9783, 9781, 'COP', current_date + 10),
  (9784, 9781, 9783, 9781, 'COP', current_date + 10),
  (9785, 9781, 9784, 9781, 'COP', current_date + 10),
  (9786, 9781, null, 9781, 'COP', current_date + 10);
insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Soporte', 3, 1234.60 from public.quote_versions v
 where v.quote_id between 9781 and 9786;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000001","role":"authenticated"}', true);

--
-- 1. Sent: the proposal stage, and the amount of the version sent.
--
select set_config('dq.q1', public.issue_quote_version(9781)::text, true);

select is(public.dq_test_stage(9781), 'proposal-sent',
    'issuing a quotation moves its deal to the proposal stage');
select is(
    (select jsonb_build_object('source', sc.source, 'quote_id', sc.quote_id,
                               'reason', sc.reason, 'sales_id', sc.sales_id)
       from public.deal_stage_changes sc where sc.deal_id = 9781
      order by sc.id desc limit 1),
    '{"source": "quote", "quote_id": 9781, "reason": "quote:sent", "sales_id": 9781}'::jsonb,
    'the move is recorded as the quotation''s, by the rep who issued it');
select is(
    (select jsonb_build_array(d.amount, d.amount_source_quote_id) from public.deals d where d.id = 9781),
    '[3704, 9781]'::jsonb,
    'the deal''s amount becomes the total sent (3 × 1,234.60, rounded)');
select ok(
    (select d.index < 0 from public.deals d where d.id = 9781),
    'the moved deal lands on top of its new column');

--
-- 2. The customer opens, writes, and accepts.
--
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
select public.quote_portal_view(public.dq_test_hash_of('dq.q1'), '203.0.113.9', 'Test/1');
select is(public.dq_test_stage(9781), 'proposal-sent',
    'the customer opening the link keeps it in the proposal stage');
select public.quote_portal_comment(public.dq_test_hash_of('dq.q1'),
    '¿Pueden empezar en octubre?', 'Lucía Gómez', 'lucia@cliente.test', '203.0.113.9', 'Test/1');
select is(public.dq_test_stage(9781), 'in-negociation',
    'the customer writing back opens the negotiation');
select public.quote_portal_accept(public.dq_test_hash_of('dq.q1'),
    'Lucía Gómez', 'lucia@cliente.test', '203.0.113.9', 'Test/1');
select is(public.dq_test_stage(9781), 'won',
    'the customer accepting wins the deal');
select is(
    (select sc.sales_id from public.deal_stage_changes sc
      where sc.deal_id = 9781 and sc.to_stage = 'won'),
    null,
    'nobody signed in made that move: it carries no user');
select is(
    (select array_agg(sc.to_stage order by sc.id) from public.deal_stage_changes sc
      where sc.deal_id = 9781 and sc.source = 'quote'),
    array['proposal-sent', 'in-negociation', 'won'],
    'every step is in the deal''s history, once, and nothing moved to where it already was');
reset role;

--
-- 3. A closed deal stays closed.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.issue_quote_version(9782);
select is(public.dq_test_stage(9782), 'lost',
    'a deal closed by hand is never reopened by a quotation');
select is(
    (select d.amount from public.deals d where d.id = 9782), 1::bigint,
    'nor is its amount rewritten');

--
-- 4. Two quotations on one deal: one refusal is not the end of the deal.
--
select set_config('dq.q3', public.issue_quote_version(9783)::text, true);
select set_config('dq.q4', public.issue_quote_version(9784)::text, true);
select is(
    (select d.amount_source_quote_id from public.deals d where d.id = 9783), 9784::bigint,
    'the amount follows the latest quotation sent');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
select public.quote_portal_reject(public.dq_test_hash_of('dq.q3'), 'price', 'Muy caro');
select is(public.dq_test_stage(9783), 'proposal-sent',
    'a refusal while another quotation is still open does not close the deal');
select public.quote_portal_accept(public.dq_test_hash_of('dq.q4'), 'Lucía Gómez', 'lucia@cliente.test');
select is(public.dq_test_stage(9783), 'won',
    'the other one accepted wins it');
reset role;

--
-- 5. Refused alone: lost. A quotation with no deal touches nothing.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('dq.q5', public.issue_quote_version(9785)::text, true);
select set_config('dq.q6', public.issue_quote_version(9786)::text, true);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '', true);
select public.quote_portal_reject(public.dq_test_hash_of('dq.q5'), 'price');
select is(public.dq_test_stage(9784), 'lost',
    'the only quotation refused loses the deal');
reset role;
select is(
    (select count(*)::int from public.deal_stage_changes sc where sc.quote_id = 9786),
    0,
    'a quotation raised against no deal moves nothing');

--
-- 5b. Renegotiating a refused quotation (2026-09-29).
--
-- The rep reopens 9785 -- the refusal that lost deal 9784 -- at a lower price
-- and sends it again: the same negotiation going on, so the deal comes back.
-- 9783 was refused too, but its deal was then WON by another quotation: sending
-- 9783 again must not touch it.
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.revise_quote(9785, 'Renegotiating at a lower price');
update public.quote_lines set unit_price = 1000
 where version_id = (select v.id from public.quote_versions v
                     where v.quote_id = 9785 and v.issued_at is null);
select public.issue_quote_version(9785);
select public.revise_quote(9783, 'One more try');
select public.issue_quote_version(9783);
reset role;

select is(
    (select jsonb_build_array(d.stage, d.amount) from public.deals d where d.id = 9784),
    '["proposal-sent", 3000]'::jsonb,
    'sending the renegotiated quotation reopens the deal its own refusal lost, at the new total');
select is(
    (select jsonb_build_object('from', sc.from_stage, 'reason', sc.reason, 'quote_id', sc.quote_id)
       from public.deal_stage_changes sc where sc.deal_id = 9784
      order by sc.changed_at desc, sc.id desc limit 1),
    '{"from": "lost", "reason": "quote:sent", "quote_id": 9785}'::jsonb,
    'the reopening is recorded as the quotation''s move');
select is(
    (select jsonb_build_array(d.stage, d.amount) from public.deals d where d.id = 9783),
    '["won", 3704]'::jsonb,
    'a quotation never reopens a deal that something else closed after it');

--
-- 6. The rep's negotiation, and the expiry (as the sweeper applies it).
--
insert into public.deals (id, name, stage, amount, sales_id, company_id, index) values
  (9785, 'Negocia', 'opportunity', 1, 9781, 9781, 3),
  (9786, 'Vence', 'opportunity', 1, 9781, 9781, 4);
insert into public.quotes (id, company_id, deal_id, sales_id, currency, valid_until) values
  (9787, 9781, 9785, 9781, 'COP', current_date + 10),
  (9788, 9781, 9786, 9781, 'COP', current_date + 10);
insert into public.quote_lines (version_id, name, quantity, unit_price)
select v.id, 'Soporte', 1, 500 from public.quote_versions v where v.quote_id in (9787, 9788);
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.issue_quote_version(9787);
select public.issue_quote_version(9788);
select public.transition_quote(9787, 'negotiating');
select is(public.dq_test_stage(9785), 'in-negociation',
    'the rep moving the quotation to negotiation moves the deal too');
reset role;
select set_config('request.jwt.claims', '', true);
-- Exactly the call `sweep_expired_quotes()` makes for a lapsed offer.
select public.apply_quote_status(9788, 'expired', 'validity elapsed', 'system');
select is(public.dq_test_stage(9786), 'delayed',
    'an expired quotation, the only one of its deal, delays the deal');

select is(
    (select d.amount from public.deals d where d.id = 9783), 3704::bigint,
    'the accepted quotation''s total is the deal''s amount');

--
-- 7. The rules: readable by everyone, written by admins.
--
set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.deal_quote_stage_rules), 7,
    'a rep reads the rules');
update public.deal_quote_stage_rules set to_stage = 'won' where trigger_key = 'sent';
select is((select to_stage from public.deal_quote_stage_rules where trigger_key = 'sent'),
    'proposal-sent', 'but cannot change them');
select set_config('request.jwt.claims',
    '{"sub":"97400000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
    public.dq_test_error_of($$update public.deal_quote_stage_rules set to_stage = 'propuesta' where trigger_key = 'sent'$$),
    'no error', 'an admin can');
select matches(
    public.dq_test_error_of($$select public.sync_deal_from_quote(9781, 'sent')$$),
    '^42501', 'nobody signed in calls the sync directly');
reset role;

select is(
    (select count(*)::int from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and table_name = 'deal_quote_stage_rules'),
    0, 'anon holds no privilege on the rules');

select * from finish();
rollback;
