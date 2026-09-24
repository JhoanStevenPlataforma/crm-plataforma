import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Team budgets and the sales manager's dashboard.
 *
 * What only an e2e can prove: the budget survives the round trip through two
 * tables. The form writes `teams` and `team_budgets` in two calls, and reads
 * back through `teams_summary` — a unit test on the maths cannot catch the
 * budget being written to a column nobody reads.
 *
 * The second test is the access one. `canAccess` hides the menu entry, but the
 * reason a rep sees no budgets is the RLS policy on `team_budgets`, and the two
 * layers have to agree.
 */
test.describe("team budgets", () => {
  const signIn = async (page: Page, email: string) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("link", { name: "Tasks", exact: true }),
    ).toBeVisible();
  };

  test.beforeEach(async ({ createSales }) => {
    await createSales({
      first_name: "Ada",
      last_name: "Admin",
      email: "ada@doe.com",
      password: "password",
      role: "admin",
    });

    await createSales({
      first_name: "Rita",
      last_name: "Rep",
      email: "rita@doe.com",
      password: "password",
      role: "rep",
    });
  });

  test("a budget set on a new team shows up on the dashboard", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teams administration is a desktop screen");

    await signIn(page, "ada@doe.com");

    await page.goto("/#/teams");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "New team" }).click();
    await page.getByLabel("Name *").fill("Renewals");
    await page.getByLabel("Budget", { exact: true }).fill("1000000");
    await page.getByLabel("Period start").fill("2026-01-01");
    await page.getByLabel("Period end").fill("2026-12-31");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    // Written to `team_budgets` and read back: the history panel lists it.
    await expect(
      page.getByRole("heading", { name: "Budget history" }),
    ).toBeVisible();
    await expect(page.getByText("2026-01-01")).toBeVisible();

    // And it reaches the dashboard through `teams_summary`.
    await page.goto("/#/teams-dashboard");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Team performance" }),
    ).toBeVisible();
    // Exact: the row also carries "See the statistics of Renewals" and "See the
    // deals of Renewals", both added after this spec was written, and an
    // accessible name that CONTAINS the team name is not the team's own link.
    await expect(
      page.getByRole("link", { name: "Renewals", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Total budget")).toBeVisible();
  });

  test("expanding a team reveals its members and their workload", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teams administration is a desktop screen");

    await signIn(page, "ada@doe.com");

    // A team with one member, so the roster has something to show.
    await page.goto("/#/teams");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "New team" }).click();
    await page.getByLabel("Name *").fill("Renewals");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Add a member").click();
    await page.getByRole("option", { name: "Rita Rep" }).click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/#/teams-dashboard");
    await page.waitForLoadState("networkidle");

    // The roster is lazy: nothing about the member is on screen until the row
    // is expanded. That is the behaviour worth pinning — it is what keeps the
    // dashboard at one request instead of one per team.
    await expect(page.getByText("Rita Rep")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Show the members of Renewals" })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Rita Rep")).toBeVisible();

    // THE ROSTER's columns, not the page's. The team table above it grew an
    // "Overdue" column of its own, so an unscoped `columnheader` matches both
    // and fails on strict mode. The roster is the table keyed on a member.
    // The roster is NESTED inside the teams table — it renders in the expanded
    // row — so "the table with a Member column" matches the outer one too.
    // `hasNot` on the teams table's own first column is what separates them.
    const roster = page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Member" }) })
      .filter({
        hasNot: page.getByRole("columnheader", { name: "Name", exact: true }),
      });

    // Pending and overdue are separate columns and not two ways of saying the
    // same thing: overdue is a subset of open, and the pending column has
    // already had it subtracted out, so a late task is never counted twice.
    await expect(
      roster.getByRole("columnheader", { name: "Pending" }),
    ).toBeVisible();
    await expect(
      roster.getByRole("columnheader", { name: "Overdue" }),
    ).toBeVisible();
  });

  /**
   * What only an e2e can prove: the dashboard's headline figures survive a
   * round trip through FOUR views. The money comes from `teams_summary`, the
   * workload from `team_workload_summary` (a separate view, so the plain team
   * list does not pay for counters it never shows), and the two are joined in
   * the browser on the team id. A unit test on the folding cannot catch the
   * join being made against a column PostgREST does not return.
   */
  test("the dashboard reports pace, win rate and workload alongside the money", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teams administration is a desktop screen");

    await signIn(page, "ada@doe.com");

    await page.goto("/#/teams");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "New team" }).click();
    await page.getByLabel("Name *").fill("Renewals");
    await page.getByLabel("Budget", { exact: true }).fill("1000000");
    await page.getByLabel("Period start").fill("2026-01-01");
    await page.getByLabel("Period end").fill("2026-12-31");
    await page.getByRole("button", { name: "Save" }).click();
    // Wait for the SAVE to land, not for the network to fall quiet. `Edit`
    // redirects after the mutation resolves, and under a hash router that
    // redirect is a fragment change — so a `goto` fired while it was still in
    // flight got overwritten and this test carried on asserting against the
    // editor it thought it had left. The budget-history panel only renders once
    // the row is in `team_budgets`, which is exactly the moment it is safe to
    // navigate.
    await expect(
      page.getByRole("heading", { name: "Budget history" }),
    ).toBeVisible();

    await page.goto("/#/teams-dashboard");
    await page.waitForLoadState("networkidle");

    // The health row: figures that turn a total into a judgement. Pace is the
    // one that matters most — 45% of target is excellent in March and alarming
    // in November, and attainment alone renders the two identically.
    //
    // On the OVERVIEW that judgement is "Teams at risk", whose hint names the
    // rule it applies; the per-team "Pace" tile this used to look for lives on
    // the drill-down (`TeamHealthTiles`), which the last test in this file
    // covers. Asserting the hint keeps the pace rule itself under test rather
    // than just the count beside it.
    await expect(page.getByText("Teams at risk")).toBeVisible();
    await expect(
      page.getByText("Behind the pace the period needs"),
    ).toBeVisible();
    await expect(page.getByText("Win rate", { exact: true })).toBeVisible();

    // The workload row, which comes from the second view.
    await expect(
      page.getByText("Overdue", { exact: true }).first(),
    ).toBeVisible();

    // A team with a budget but nothing won yet has no win rate: nothing has
    // reached a decision, and 0% would read as "we lose everything".
    await expect(page.getByText("—").first()).toBeVisible();
  });

  /**
   * What only an e2e can prove here: the split survives the round trip through
   * a third table. The panel writes `team_member_budgets` keyed on the budget
   * row and the member row, and the dashboard reads it back through two
   * different views — a unit test on the maths cannot catch a quota written
   * against a budget nobody reads.
   */
  test("a quota given to a member reaches the roster and the team total", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teams administration is a desktop screen");

    await signIn(page, "ada@doe.com");

    await page.goto("/#/teams");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "New team" }).click();
    await page.getByLabel("Name *").fill("Renewals");
    await page.getByLabel("Budget", { exact: true }).fill("1000000");
    await page.getByLabel("Period start").fill("2026-01-01");
    await page.getByLabel("Period end").fill("2026-12-31");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Add a member").click();
    await page.getByRole("option", { name: "Rita Rep" }).click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Quota of Rita Rep").fill("400000");
    await page.getByRole("button", { name: "Save the split" }).click();
    await page.waitForLoadState("networkidle");

    // The remainder is the panel's whole reason to exist: 600k of the 1M target
    // is still on nobody.
    await expect(page.getByText("still to allocate")).toBeVisible();

    await page.goto("/#/teams-dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Total allocated")).toBeVisible();

    await page
      .getByRole("button", { name: "Show the members of Renewals" })
      .click();
    await page.waitForLoadState("networkidle");

    // The quota reached `team_members_summary`, and attainment is now measured
    // against it rather than against the team target. Read in the ROSTER: the
    // same $400K is also a headline tile, a chart axis label and a cell of the
    // team table, so an unscoped match cannot say which one it found — and
    // three of those four would still render if the roster had not been given
    // the quota at all.
    // The roster is NESTED inside the teams table — it renders in the expanded
    // row — so "the table with a Member column" matches the outer one too.
    // `hasNot` on the teams table's own first column is what separates them.
    const roster = page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Member" }) })
      .filter({
        hasNot: page.getByRole("columnheader", { name: "Name", exact: true }),
      });

    await expect(
      roster.getByRole("columnheader", { name: "Quota" }),
    ).toBeVisible();
    await expect(roster.getByRole("cell", { name: "$400K" })).toBeVisible();
  });

  test("the dashboard drills down into a team and then into one member", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "teams administration is a desktop screen");

    await signIn(page, "ada@doe.com");

    await page.goto("/#/teams");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "New team" }).click();
    await page.getByLabel("Name *").fill("Renewals");
    await page.getByLabel("Budget", { exact: true }).fill("1000000");
    await page.getByLabel("Period start").fill("2026-01-01");
    await page.getByLabel("Period end").fill("2026-12-31");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Add a member").click();
    await page.getByRole("option", { name: "Rita Rep" }).click();
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/#/teams-dashboard");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("link", { name: "See the statistics of Renewals" })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Renewals", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Unallocated")).toBeVisible();

    // The roster is on the team page too, and each member links on to their own
    // scope — the same rep in two teams has two of these pages.
    await page.getByRole("link", { name: "Rita Rep" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Rita Rep" })).toBeVisible();

    // The member's own workload, scoped to this membership and this period —
    // the header above says which. "Open tasks" was one tile once; the workload
    // view split it into the stock figures the roster also reports, because
    // overdue is a SUBSET of open and one number could not say both.
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();
    await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  });

  test("a rep is not offered the dashboard and cannot reach it by URL", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the user menu differs on mobile");

    await signIn(page, "rita@doe.com");

    // The user menu's trigger is an avatar with no stable accessible name, so
    // it is located as the last control in the header rather than by label.
    await page.locator("header").getByRole("button").last().click();
    await expect(
      page.getByRole("menuitem", { name: "Team performance" }),
    ).toHaveCount(0);
    // The control: the menu did open, so the absence is a decision and not a
    // missed click.
    await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.goto("/#/teams-dashboard");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Team performance" }),
    ).toHaveCount(0);
  });
});
