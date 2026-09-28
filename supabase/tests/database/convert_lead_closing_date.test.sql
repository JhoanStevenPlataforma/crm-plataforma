--
-- convert_lead() dates the deal it creates (QA audit M2, migration
-- 20260929130000). A converted deal used to be born with no closing date,
-- which the deal page rendered as "Invalid date".
--
begin;

select plan(4);

select is(
    (select count(*)::int from pg_proc
      where proname = 'convert_lead' and pronamespace = 'public'::regnamespace),
    1,
    'only one convert_lead exists (the old overload is gone)'
);

insert into public.leads (id, first_name, last_name)
overriding system value
values (-910001, 'Dated', 'Lead'), (-910002, 'Undated', 'Lead');

select lives_ok(
    $$select public.convert_lead(-910001, true, 'QA dated', 100, '2026-12-15')$$,
    'a closing date can be passed'
);
select is(
    (select d.expected_closing_date from public.deals d
       join public.leads l on l.converted_deal_id = d.id
      where l.id = -910001),
    '2026-12-15'::date,
    'the deal carries the closing date given at conversion'
);

select public.convert_lead(-910002, true);
select is(
    (select d.expected_closing_date from public.deals d
       join public.leads l on l.converted_deal_id = d.id
      where l.id = -910002),
    null::date,
    'without a date the deal stays undated (old callers keep working)'
);

select * from finish();
rollback;
