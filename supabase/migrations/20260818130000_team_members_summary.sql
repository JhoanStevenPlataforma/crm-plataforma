--
-- The team roster the budget dashboard drills into: who is in a team, and what
-- each of them is carrying.
--
-- ADD-only. A brand new view, so nothing existing is recreated.
--
-- The deal figures are scoped to BOTH the member's ownership and the team's
-- budget period, which is what makes the roster reconcile with the team header
-- in `teams_summary`: sum `won_amount` over a team's members and you get the
-- team's `won_amount`, to the cent. A roster whose rows do not add up to the
-- total they sit under is worse than no roster, because it is the total that
-- ends up doubted.
--
-- Deliberately NOT scoped that way:
--   * `nb_contacts` / `nb_companies` — those records have no team and no
--     period. They answer "what does this person own", which is the question a
--     manager is actually asking when drilling into a member.
--   * `nb_deals_all` — every live deal they own, including ones attributed to
--     another team. The gap against `nb_deals` is the signal that somebody is
--     selling outside the team they are rostered in.
--
-- Every counter is a scalar subquery, per the rule documented on
-- `contacts_summary`. security_invoker stays on, so a rep sees only what their
-- own RLS allows and a manager sees the team as it really is.
--
create or replace view public.team_members_summary
with (security_invoker = on) as
select
    m.id,
    m.team_id,
    m.sales_id,
    m.created_at,
    s.first_name,
    s.last_name,
    s.email,
    s.role,
    s.disabled,
    (select count(*) from public.contacts c
      where c.sales_id = m.sales_id) as nb_contacts,
    (select count(*) from public.companies co
      where co.sales_id = m.sales_id) as nb_companies,
    (select count(*) from public.deals d
      where d.sales_id = m.sales_id and d.archived_at is null) as nb_deals_all,
    (select count(*) from public.deals d
      where d.sales_id = m.sales_id
        and d.team_id = m.team_id
        and d.archived_at is null) as nb_deals,
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.sales_id = m.sales_id
        and d.team_id = m.team_id
        and d.archived_at is null
        and d.stage <> 'won'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as pipeline_amount,
    (select coalesce(sum(d.amount), 0) from public.deals d
      where d.sales_id = m.sales_id
        and d.team_id = m.team_id
        and d.archived_at is null
        and d.stage = 'won'
        and d.expected_closing_date between b.period_start and b.period_end
    ) as won_amount,
    (select count(*) from public.tasks tk
      join public.task_statuses st on st.id = tk.status_id
     where tk.owner_sales_id = m.sales_id
       and st.is_open
       and tk.deleted_at is null
       and tk.archived_at is null) as nb_open_tasks
from public.team_members m
join public.sales s on s.id = m.sales_id
left join lateral (
    select tb.period_start, tb.period_end
      from public.team_budgets tb
     where tb.team_id = m.team_id
       and current_date between tb.period_start and tb.period_end
     order by tb.period_start desc
     limit 1
) b on true;

grant select on table public.team_members_summary to authenticated;
grant select on table public.team_members_summary to service_role;
