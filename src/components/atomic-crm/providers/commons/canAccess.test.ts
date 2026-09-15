import { describe, expect, test } from "vitest";

import type { CrmRole } from "../../types";
import { ASSIGN_ACTION, canAccess } from "./canAccess";

const OWNED_RESOURCES = ["contacts", "companies", "deals", "tasks"];

describe("canAccess", () => {
  describe("admin", () => {
    test.each([...OWNED_RESOURCES, "sales", "configuration"])(
      "reaches every action on %s",
      (resource) => {
        for (const action of ["list", "show", "edit", "create", "delete"]) {
          expect(canAccess("admin", { action, resource })).toBe(true);
        }
      },
    );

    test("may reassign a record owner", () => {
      expect(
        canAccess("admin", { action: ASSIGN_ACTION, resource: "contacts" }),
      ).toBe(true);
    });
  });

  describe("manager", () => {
    test.each(OWNED_RESOURCES)("works on %s like any user", (resource) => {
      for (const action of ["list", "show", "edit", "create", "delete"]) {
        expect(canAccess("manager", { action, resource })).toBe(true);
      }
    });

    test("may reassign a record owner", () => {
      expect(
        canAccess("manager", { action: ASSIGN_ACTION, resource: "deals" }),
      ).toBe(true);
    });

    test("cannot manage users", () => {
      expect(canAccess("manager", { action: "list", resource: "sales" })).toBe(
        false,
      );
    });

    test("cannot reach application configuration", () => {
      expect(
        canAccess("manager", { action: "edit", resource: "configuration" }),
      ).toBe(false);
    });
  });

  describe("rep", () => {
    test.each(OWNED_RESOURCES)("still works on %s", (resource) => {
      for (const action of ["list", "show", "edit", "create", "delete"]) {
        expect(canAccess("rep", { action, resource })).toBe(true);
      }
    });

    test("cannot reassign a record owner", () => {
      expect(
        canAccess("rep", { action: ASSIGN_ACTION, resource: "contacts" }),
      ).toBe(false);
    });

    test("cannot manage users", () => {
      expect(canAccess("rep", { action: "list", resource: "sales" })).toBe(
        false,
      );
    });

    test("cannot reach application configuration", () => {
      expect(
        canAccess("rep", { action: "edit", resource: "configuration" }),
      ).toBe(false);
    });
  });

  describe("the quotes catalogue", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];
    const catalogue = [
      "products",
      "price_lists",
      "price_list_items",
      "tax_rates",
    ];
    const allowed = (action: string, resource: string) =>
      roles.filter((role) => canAccess(role, { action, resource }));

    test.each(catalogue)(
      "every role reads %s, which reps quote from",
      (resource) => {
        for (const action of ["list", "show"]) {
          expect(allowed(action, resource)).toEqual(roles);
        }
      },
    );

    test.each(catalogue)("only managers and admins write %s", (resource) => {
      for (const action of ["create", "edit"]) {
        expect(allowed(action, resource)).toEqual(["admin", "manager"]);
      }
    });

    test.each(["price_lists", "price_list_items", "tax_rates"])(
      "only managers and admins delete from %s",
      (resource) => {
        expect(allowed("delete", resource)).toEqual(["admin", "manager"]);
      },
    );

    test("nobody is offered to delete a product, admins included", () => {
      expect(allowed("delete", "products")).toEqual([]);
    });

    test("everyone reads the discount ceilings and only admins tune them", () => {
      for (const action of ["list", "show"]) {
        expect(allowed(action, "quote_discount_rules")).toEqual(roles);
      }
      for (const action of ["create", "edit", "delete"]) {
        expect(allowed(action, "quote_discount_rules")).toEqual(["admin"]);
      }
    });
  });

  describe("quotations", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];
    const allowed = (action: string, resource: string) =>
      roles.filter((role) => canAccess(role, { action, resource }));

    test("every role raises and edits a quote; RLS decides whose", () => {
      for (const action of ["list", "show", "create", "edit"]) {
        expect(allowed(action, "quotes")).toEqual(roles);
      }
    });

    test("nobody is offered to delete a quote, admins included", () => {
      // The database answers 42501: there is no delete policy and no DELETE
      // privilege. A quote ends as `canceled` (quotes §13.2).
      expect(allowed("delete", "quotes")).toEqual([]);
    });

    test("only a manager reassigns a quote", () => {
      expect(allowed(ASSIGN_ACTION, "quotes")).toEqual(["admin", "manager"]);
    });

    test("a version is neither created nor deleted by a client", () => {
      // `issue_quote_version()` and `revise_quote()` own both, and the table has
      // no insert and no delete policy at all.
      for (const action of ["create", "delete"]) {
        expect(allowed(action, "quote_versions")).toEqual([]);
      }
      for (const action of ["list", "show", "edit"]) {
        expect(allowed(action, "quote_versions")).toEqual(roles);
      }
    });

    test("lines follow their quote, deletion included", () => {
      for (const action of ["list", "show", "create", "edit", "delete"]) {
        expect(allowed(action, "quote_lines")).toEqual(roles);
      }
    });

    test("everyone reads the status machine and only admins tune it", () => {
      for (const resource of ["quote_statuses", "quote_transitions"]) {
        for (const action of ["list", "show"]) {
          expect(allowed(action, resource)).toEqual(roles);
        }
        for (const action of ["create", "edit", "delete"]) {
          expect(allowed(action, resource)).toEqual(["admin"]);
        }
      }
    });

    test("the price book is read-only for everybody: it is a view", () => {
      for (const action of ["list", "show"]) {
        expect(allowed(action, "price_book")).toEqual(roles);
      }
      for (const action of ["create", "edit", "delete"]) {
        expect(allowed(action, "price_book")).toEqual([]);
      }
    });
  });

  test("only admins reach the user and configuration screens", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];

    const allowed = roles.filter((role) =>
      canAccess(role, { action: "list", resource: "sales" }),
    );

    expect(allowed).toEqual(["admin"]);
  });
});
