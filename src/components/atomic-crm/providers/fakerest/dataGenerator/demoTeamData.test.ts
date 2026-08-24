import { describe, expect, test } from "vitest";

import type { Deal } from "../../../types";
import generateData from "./index";
import { generateTeamDealStats } from "./teamDealStats";
import type { Db } from "./types";

/**
 * The demo-mode stand-ins for `teams_summary.allocated_amount`,
 * `team_members_summary.budget_amount` and the `team_deal_stats` cube.
 *
 * These are computed in TypeScript here and in SQL against the real backend, so
 * the thing worth pinning is the invariant both are supposed to hold: every
 * breakdown adds up to the total it sits under. A demo where it does not reads
 * as a bug in the product rather than in the fixtures.
 *
 * The order of the generators matters too — the allocations exist before the
 * teams are decorated, the deals before the cube — and getting it wrong
 * produces zeroes rather than an error, which is exactly what these assertions
 * catch.
 */
describe("generated team demo data", () => {
  test("the allocated total is the sum of the members' quotas", () => {
    // Arrange / Act
    const db = generateData();
    const team = db.teams[0];

    // Assert
    const allocated = db.team_member_budgets
      .filter((row) => row.budget_id === team.budget_id)
      .reduce((total, row) => total + row.amount, 0);
    expect(allocated).toBeGreaterThan(0);
    expect(team.allocated_amount).toBe(allocated);
  });

  test("leaves part of the target unallocated, so the remainder is visible", () => {
    // A demo whose split already adds up hides the number the allocation panel
    // exists to show.
    const db = generateData();
    const team = db.teams[0];

    expect(team.allocated_amount).toBeLessThan(team.budget_amount ?? 0);
  });

  test("gives every rostered member their own quota", () => {
    const db = generateData();
    const team = db.teams[0];
    const members = db.team_members.filter((m) => m.team_id === team.id);

    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      expect(member.budget_amount).toBeGreaterThan(0);
    }
  });

  test("the deal stats cube reconciles with the team header", () => {
    // Arrange
    const db = generateData();
    const team = db.teams[0];

    // Act
    const cubeWon = db.team_deal_stats
      .filter((row) => row.team_id === team.id && row.stage === "won")
      .reduce((total, row) => total + row.amount, 0);

    // Assert
    expect(cubeWon).toBe(team.won_amount);
  });
});

/**
 * The cube's scoping, on a fixture rather than on the random demo data.
 *
 * Every rule below is a way the drill-down charts could disagree with the
 * header above them, and none of them is reliably exercised by generated deals
 * — which is precisely why they get a fixture that guarantees each case exists.
 */
describe("generateTeamDealStats", () => {
  const year = new Date().getFullYear();

  const dbWith = (deals: Array<Partial<Deal>>): Db =>
    ({
      team_budgets: [
        {
          id: 1,
          team_id: 1,
          period_start: `${year}-01-01`,
          period_end: `${year}-12-31`,
          amount: 1_000_000,
        },
      ],
      deals: deals.map((deal, index) => ({
        id: index + 1,
        name: `Deal ${index + 1}`,
        stage: "won",
        amount: 100,
        team_id: 1,
        sales_id: 1,
        expected_closing_date: `${year}-03-15`,
        ...deal,
      })),
    }) as unknown as Db;

  test("counts only the deals closing inside the budget period", () => {
    // Arrange: one inside, one two years out.
    const db = dbWith([
      { expected_closing_date: `${year}-03-15`, amount: 500 },
      { expected_closing_date: `${year + 2}-03-15`, amount: 900 },
    ]);

    // Act
    const cube = generateTeamDealStats(db);

    // Assert
    expect(cube.reduce((total, row) => total + row.amount, 0)).toBe(500);
  });

  test("leaves archived deals out, like the view does", () => {
    const db = dbWith([
      { amount: 500 },
      { amount: 900, archived_at: new Date().toISOString() },
    ]);

    expect(
      generateTeamDealStats(db).reduce((t, row) => t + row.amount, 0),
    ).toBe(500);
  });

  test("skips a deal booked to no team or with no closing date", () => {
    // Neither can be placed on a team's chart, and guessing a month for them
    // would put money in a period nobody closed it in.
    const db = dbWith([
      { team_id: null },
      { expected_closing_date: undefined },
      { amount: 700 },
    ]);

    expect(
      generateTeamDealStats(db).reduce((t, row) => t + row.amount, 0),
    ).toBe(700);
  });

  test("groups by month and stage, keeping the two apart", () => {
    // Arrange
    const db = dbWith([
      { expected_closing_date: `${year}-03-15`, stage: "won", amount: 100 },
      { expected_closing_date: `${year}-03-20`, stage: "won", amount: 200 },
      {
        expected_closing_date: `${year}-03-25`,
        stage: "opportunity",
        amount: 50,
      },
      { expected_closing_date: `${year}-04-01`, stage: "won", amount: 400 },
    ]);

    // Act
    const cube = generateTeamDealStats(db);

    // Assert
    expect(cube).toHaveLength(3);
    const marchWon = cube.find(
      (row) => row.month === `${year}-03-01` && row.stage === "won",
    );
    expect(marchWon?.amount).toBe(300);
    expect(marchWon?.nb_deals).toBe(2);
  });

  test("falls back to the calendar year for a team with no budget", () => {
    // An empty chart there would read as "sold nothing" rather than "no period
    // to report on".
    const db = { ...dbWith([{ amount: 300 }]), team_budgets: [] } as Db;

    expect(
      generateTeamDealStats(db).reduce((t, row) => t + row.amount, 0),
    ).toBe(300);
  });
});

/**
 * The workload half of the dashboards, in demo mode.
 *
 * Every generated task used to be `pending` with `completed_at: null` and a due
 * date in the future, so every task chart and every task counter rendered as
 * zero — a demo that undersold the feature and, worse, would have hidden any
 * bug in it. These assertions exist so that cannot come back silently.
 */
describe("generated task workload", () => {
  test("produces open, overdue and completed tasks rather than only pending ones", () => {
    // Arrange / Act
    const db = generateData();

    // Assert
    const completed = db.tasks.filter((task) => task.completed_at != null);
    const overdue = db.tasks.filter(
      (task) =>
        task.completed_at == null &&
        task.due_date != null &&
        new Date(task.due_date).getTime() < Date.now(),
    );

    expect(completed.length).toBeGreaterThan(0);
    expect(overdue.length).toBeGreaterThan(0);
  });

  test("records a completion on both the columns and the status", () => {
    // The database CHECK ties `completed_at` to `completed_by`, and the view
    // counts on the columns while the list renders the status: a demo where the
    // two disagree would show a completed task in the open bucket.
    const db = generateData();
    const completed = db.tasks.filter((task) => task.completed_at != null);

    expect(completed.every((task) => task.completed_by != null)).toBe(true);
    expect(completed.every((task) => task.status_key === "completed")).toBe(
      true,
    );
  });

  test("mixes late completions in, so the on-time rate is not a flat 100%", () => {
    const db = generateData();
    const late = db.tasks.filter(
      (task) =>
        task.completed_at != null &&
        task.due_date != null &&
        new Date(task.completed_at).getTime() >
          new Date(task.due_date).getTime(),
    );

    expect(late.length).toBeGreaterThan(0);
  });

  test("the team workload report adds up to its roster", () => {
    // The same invariant the real backend holds between
    // `team_workload_summary` and `team_members_summary`.
    const db = generateData();
    const team = db.teams[0];
    const workload = db.team_workload_summary.find(
      (row) => row.team_id === team.id,
    );
    const rosterOpen = db.team_members
      .filter((member) => member.team_id === team.id)
      .reduce((total, member) => total + (member.nb_open_tasks ?? 0), 0);

    expect(workload?.nb_open_tasks).toBe(rosterOpen);
  });

  test("the task cube files creations and completions in the period", () => {
    const db = generateData();
    const created = db.team_task_stats.reduce(
      (total, row) => total + row.nb_created,
      0,
    );
    const completed = db.team_task_stats.reduce(
      (total, row) => total + row.nb_completed,
      0,
    );

    expect(created).toBeGreaterThan(0);
    expect(completed).toBeGreaterThan(0);
    // Nothing can be completed that was never created.
    expect(completed).toBeLessThanOrEqual(created);
  });
});
