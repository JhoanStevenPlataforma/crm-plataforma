import { describe, expect, test } from "vitest";

import { contactsLinkFor, dealsLinkFor } from "./teamsDashboardLinks";

/** Reads the `filter` query parameter back as the object the list will parse. */
const filterOf = (url: string) =>
  JSON.parse(
    decodeURIComponent(new URLSearchParams(url.split("?")[1]).get("filter")!),
  );

describe("dealsLinkFor", () => {
  test("filters on the team when drilling from a team row", () => {
    expect(filterOf(dealsLinkFor({ teamId: 7 }))).toEqual({ team_id: 7 });
  });

  test("filters on both team and owner when drilling from a member row", () => {
    expect(filterOf(dealsLinkFor({ teamId: 7, salesId: 3 }))).toEqual({
      team_id: 7,
      sales_id: 3,
    });
  });

  test("omits a missing id rather than filtering on null", () => {
    // `{"sales_id": null}` is not "no filter" to PostgREST — it is a filter
    // that matches nothing, so the list would come back empty and the count it
    // was reached from would look wrong.
    expect(filterOf(dealsLinkFor({ salesId: 3 }))).toEqual({ sales_id: 3 });
    expect(filterOf(dealsLinkFor({}))).toEqual({});
  });

  test("points at the deals list", () => {
    expect(dealsLinkFor({ teamId: 7 }).startsWith("/deals?filter=")).toBe(true);
  });
});

describe("contactsLinkFor", () => {
  test("filters the contacts list on the owner", () => {
    const url = contactsLinkFor(3);

    expect(url.startsWith("/contacts?filter=")).toBe(true);
    expect(filterOf(url)).toEqual({ sales_id: 3 });
  });
});
