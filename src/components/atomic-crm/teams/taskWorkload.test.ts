import { describe, expect, test } from "vitest";

import type { TeamMember } from "../types";
import {
  onTimeRate,
  sumWorkload,
  workloadByMember,
  workloadByTeam,
  workloadOf,
} from "./taskWorkload";

/**
 * The invariant under test is one line long and easy to lose: overdue tasks are
 * a SUBSET of open tasks. Every assertion here exists because stacking the two
 * raw counters draws each late task twice and totals to a number that is not a
 * total of anything.
 */

const member = (overrides: Partial<TeamMember>): TeamMember => ({
  id: 1,
  team_id: 1,
  sales_id: 1,
  ...overrides,
});

describe("workloadOf", () => {
  test("splits open tasks into on-time and overdue without counting twice", () => {
    // Arrange: 10 open, 4 of them late.
    const source = { nb_open_tasks: 10, nb_tasks_overdue: 4 };

    // Act
    const workload = workloadOf(source);

    // Assert: the two bars add back up to the 10 open tasks.
    expect(workload.pending).toBe(6);
    expect(workload.overdue).toBe(4);
    expect(workload.pending + workload.overdue).toBe(10);
  });

  test("absorbs a counter race instead of rendering a negative bar", () => {
    // Arrange: the four counters are independent subqueries, so a task
    // completed between two of them can make overdue exceed open.
    const workload = workloadOf({ nb_open_tasks: 3, nb_tasks_overdue: 5 });

    // Assert
    expect(workload.pending).toBe(0);
    expect(workload.overdue).toBe(3);
  });

  test("reads a member with no tasks as zeroes, not as missing data", () => {
    const workload = workloadOf({});

    expect(workload).toEqual({
      pending: 0,
      overdue: 0,
      completed: 0,
      dueSoon: 0,
    });
  });

  test("carries completed and due-soon through untouched", () => {
    const workload = workloadOf({
      nb_open_tasks: 8,
      nb_tasks_overdue: 2,
      nb_tasks_completed: 21,
      nb_tasks_due_next_7d: 3,
    });

    expect(workload.completed).toBe(21);
    expect(workload.dueSoon).toBe(3);
  });
});

describe("workloadByMember", () => {
  const nameOf = (m: TeamMember) => m.last_name ?? "";

  test("puts the most overdue member first, because that is why it was opened", () => {
    // Arrange
    const members = [
      member({
        id: 1,
        last_name: "Quiet",
        nb_open_tasks: 2,
        nb_tasks_overdue: 0,
      }),
      member({
        id: 2,
        last_name: "Buried",
        nb_open_tasks: 20,
        nb_tasks_overdue: 14,
      }),
      member({
        id: 3,
        last_name: "Busy",
        nb_open_tasks: 30,
        nb_tasks_overdue: 1,
      }),
    ];

    // Act
    const points = workloadByMember(members, nameOf);

    // Assert
    expect(points.map((point) => point.name)).toEqual([
      "Buried",
      "Busy",
      "Quiet",
    ]);
  });

  test("falls back to the pending count when nobody is late", () => {
    const points = workloadByMember(
      [
        member({ id: 1, last_name: "Light", nb_open_tasks: 3 }),
        member({ id: 2, last_name: "Heavy", nb_open_tasks: 9 }),
      ],
      nameOf,
    );

    expect(points.map((point) => point.name)).toEqual(["Heavy", "Light"]);
  });

  test("returns an empty list for a team whose roster has not loaded", () => {
    expect(workloadByMember(undefined, nameOf)).toEqual([]);
  });
});

describe("workloadByTeam", () => {
  test("joins the two views and subtracts exactly as the roster does", () => {
    // Arrange: the money and the workload are two requests now, joined here.
    const points = workloadByTeam(
      [{ id: 1, name: "Renewals" }],
      [
        {
          id: 1,
          team_id: 1,
          nb_open_tasks: 12,
          nb_tasks_overdue: 5,
          nb_tasks_due_next_7d: 2,
          nb_tasks_completed: 30,
        },
      ],
    );

    // Assert
    expect(points).toEqual([
      {
        teamId: 1,
        name: "Renewals",
        pending: 7,
        overdue: 5,
        completed: 30,
        dueSoon: 2,
      },
    ]);
  });

  test("leaves out a team whose workload has not arrived", () => {
    // Charting it at zero would claim the team has nothing to do, which is a
    // statement about the team rather than about the request.
    expect(workloadByTeam([{ id: 1, name: "Renewals" }], undefined)).toEqual(
      [],
    );
  });
});

describe("onTimeRate", () => {
  test("reports the share of completed work that met its due date", () => {
    expect(onTimeRate(20, 15)).toBe(0.75);
  });

  test("returns null when nothing was completed, rather than zero", () => {
    // Zero reads as "everything was late", which is not what no data means.
    expect(onTimeRate(0, 0)).toBeNull();
    expect(onTimeRate(undefined, undefined)).toBeNull();
  });

  test("never exceeds 100%, whatever the two counters disagree about", () => {
    expect(onTimeRate(5, 7)).toBe(1);
  });
});

describe("sumWorkload", () => {
  test("totals the folded values so the tiles match the bars above them", () => {
    // Arrange: summing the RAW counters here would double count the late ones.
    const points = [
      workloadOf({
        nb_open_tasks: 10,
        nb_tasks_overdue: 4,
        nb_tasks_completed: 2,
      }),
      workloadOf({
        nb_open_tasks: 5,
        nb_tasks_overdue: 1,
        nb_tasks_completed: 3,
      }),
    ];

    // Act
    const totals = sumWorkload(points);

    // Assert
    expect(totals.pending).toBe(10);
    expect(totals.overdue).toBe(5);
    expect(totals.completed).toBe(5);
    expect(totals.pending + totals.overdue).toBe(15);
  });
});
