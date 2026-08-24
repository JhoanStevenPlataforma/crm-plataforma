import { useTranslate } from "ra-core";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Team } from "../types";
import { memberNameOf } from "./teamMemberName";
import { contactsLinkFor, dealsLinkFor } from "./teamsDashboardLinks";
import { memberStatsLinkFor } from "./teamsDashboardPath";
import { attainmentRatio, formatAttainment, formatMoney } from "./teamBudget";
import { onTimeRate, workloadOf } from "./taskWorkload";
import { useTeamRoster } from "./useTeamRoster";

/**
 * Who is in a team and what each of them is carrying.
 *
 * Loaded lazily — only when the manager expands a team — so the dashboard's
 * first paint is one request for the team totals, not one per team plus one per
 * member. Every figure comes from `team_members_summary`, so expanding a team of
 * twenty is still a single round trip.
 *
 * The deal columns are scoped to this team and its budget period, so they add up
 * to the team header above. `nb_deals_all` is not, which is the point: when it
 * exceeds `nb_deals` the member is carrying deals booked to another team, and
 * the roster says so instead of hiding it.
 *
 * Two attainment columns, deliberately, because they answer different
 * questions: `attainment` is against the member's own quota — what the person is
 * held to — and `contribution` is their share of the team target, which is what
 * says whether the team's number rides on one person. A member with no quota
 * still has a contribution, so collapsing the two would blank the row.
 */
export const TeamRoster = ({ team }: { team: Team }) => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();

  const { data: members, isPending, error } = useTeamRoster(team.id);

  if (isPending) {
    return (
      <p className="text-sm text-muted-foreground p-3">
        {translate("ra.page.loading")}
      </p>
    );
  }

  // A failed roster must not fall through to the empty state: "nobody is in
  // this team" and "we could not ask" are different facts, and only one of them
  // is about the team.
  if (error) {
    return (
      <p className="text-sm text-destructive p-3">
        {translate("crm.teams_dashboard.load_error")}
      </p>
    );
  }

  if (!members?.length) {
    return (
      <p className="text-sm text-muted-foreground p-3">
        {translate("resources.teams.members.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="text-left font-medium p-2">
              {translate("crm.teams_dashboard.member")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.quota")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("resources.teams.fields.won_amount")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.attainment")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("resources.teams.fields.pipeline_amount")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.contribution")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.deals")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.tasks_pending")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.tasks_overdue")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.on_time_rate")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.contacts")}
            </th>
            <th className="text-right font-medium p-2">
              {translate("crm.teams_dashboard.companies")}
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const outsideTeam =
              (member.nb_deals_all ?? 0) - (member.nb_deals ?? 0);
            const workload = workloadOf(member);
            return (
              <tr key={member.id} className="border-b last:border-0">
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <Link
                      to={memberStatsLinkFor(member.id)}
                      className="font-medium hover:underline"
                    >
                      {memberNameOf(member)}
                    </Link>
                    {member.role && member.role !== "rep" ? (
                      <Badge variant="secondary">{member.role}</Badge>
                    ) : null}
                    {member.disabled ? (
                      <Badge variant="outline">
                        {translate("crm.teams_dashboard.disabled")}
                      </Badge>
                    ) : null}
                  </div>
                  {member.email ? (
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  ) : null}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {/* An unallocated member is not a member with a quota of
                      zero: say so, the way the team row says it. */}
                  {member.budget_amount == null
                    ? "—"
                    : formatMoney(member.budget_amount, currency)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(member.won_amount, currency)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatAttainment(
                    attainmentRatio(member.won_amount, member.budget_amount),
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatMoney(member.pipeline_amount, currency)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatAttainment(
                    attainmentRatio(member.won_amount, team.budget_amount),
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  <Link
                    to={dealsLinkFor({
                      teamId: team.id,
                      salesId: member.sales_id,
                    })}
                    className="hover:underline"
                  >
                    {member.nb_deals ?? 0}
                  </Link>
                  {outsideTeam > 0 ? (
                    <span
                      className="text-xs text-muted-foreground ml-1"
                      title={translate("crm.teams_dashboard.outside_team", {
                        count: outsideTeam,
                      })}
                    >
                      (+{outsideTeam})
                    </span>
                  ) : null}
                </td>
                {/* Pending EXCLUDES the overdue ones, which have their own
                    column: printing both raw would show the same late task
                    twice and the two columns would not add up to the workload
                    the member actually has. */}
                <td className="p-2 text-right tabular-nums">
                  {workload.pending}
                  {workload.dueSoon > 0 ? (
                    <span
                      className="text-xs text-muted-foreground ml-1"
                      title={translate(
                        "crm.teams_dashboard.tasks_due_soon_hint",
                        { count: workload.dueSoon },
                      )}
                    >
                      ({workload.dueSoon})
                    </span>
                  ) : null}
                </td>
                {/* The one figure on this row that is a problem in itself,
                    which is why it is the only one that gets the colour. */}
                <td
                  className={`p-2 text-right tabular-nums ${
                    workload.overdue > 0 ? "text-destructive font-medium" : ""
                  }`}
                >
                  {workload.overdue}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatAttainment(
                    onTimeRate(
                      member.nb_tasks_completed,
                      member.nb_tasks_completed_on_time,
                    ),
                  )}
                  <span className="text-xs text-muted-foreground ml-1">
                    {member.nb_tasks_completed ?? 0}
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums">
                  <Link
                    to={contactsLinkFor(member.sales_id)}
                    className="hover:underline"
                  >
                    {member.nb_contacts ?? 0}
                  </Link>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {member.nb_companies ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
