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

  describe("help centre", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];
    const allowed = (action: string, resource: string) =>
      roles.filter((role) => canAccess(role, { action, resource }));

    test.each(["help_categories", "help_tutorials"])(
      "everyone reads %s and only admins write it",
      (resource) => {
        for (const action of ["list", "show"]) {
          expect(allowed(action, resource)).toEqual(roles);
        }
        for (const action of ["create", "edit", "delete"]) {
          expect(allowed(action, resource)).toEqual(["admin"]);
        }
      },
    );
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

  describe("currencies and exchange rates", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];
    const allowed = (action: string, resource: string) =>
      roles.filter((role) => canAccess(role, { action, resource }));

    test("everyone reads the currencies and the current rates, which every quote uses", () => {
      for (const resource of [
        "currencies",
        "current_exchange_rates",
        "exchange_rates",
      ]) {
        expect(allowed("list", resource)).toEqual(roles);
      }
    });

    test("only admins configure currencies, providers and settings", () => {
      for (const resource of [
        "currencies",
        "exchange_rate_providers",
        "exchange_rate_settings",
      ]) {
        expect(allowed("edit", resource)).toEqual(["admin"]);
      }
      expect(allowed("create", "currencies")).toEqual(["admin"]);
    });

    test("managers and admins add manual rates; nobody edits or deletes one", () => {
      expect(allowed("create", "exchange_rates")).toEqual(["admin", "manager"]);
      expect(allowed("edit", "exchange_rates")).toEqual([]);
      expect(allowed("delete", "exchange_rates")).toEqual([]);
    });

    test("nobody deletes a currency or creates a provider: those are deactivated or seeded", () => {
      expect(allowed("delete", "currencies")).toEqual([]);
      expect(allowed("create", "exchange_rate_providers")).toEqual([]);
    });

    test("the sync runs, the audit log and the health panel are not a rep's", () => {
      expect(allowed("list", "exchange_rate_sync_runs")).toEqual([
        "admin",
        "manager",
      ]);
      expect(allowed("list", "exchange_rate_audit_logs")).toEqual([
        "admin",
        "manager",
      ]);
      expect(allowed("list", "fx_health")).toEqual(["admin", "manager"]);
    });
  });

  describe("outbound email", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];
    const allowed = (action: string, resource: string) =>
      roles.filter((role) => canAccess(role, { action, resource }));

    test("everybody reads the messages; nobody creates, edits or deletes one", () => {
      expect(allowed("list", "email_messages")).toEqual([
        "admin",
        "manager",
        "rep",
      ]);
      for (const action of ["create", "edit", "delete"]) {
        expect(allowed(action, "email_messages")).toEqual([]);
      }
    });

    test("the history page and the suppression list are for managers and admins", () => {
      expect(allowed("list", "email_history")).toEqual(["admin", "manager"]);
      expect(allowed("list", "email_suppressions")).toEqual([
        "admin",
        "manager",
      ]);
      for (const action of ["create", "delete"]) {
        expect(allowed(action, "email_suppressions")).toEqual(["admin"]);
      }
      // An entry is added or removed, never edited -- by anybody.
      expect(allowed("edit", "email_suppressions")).toEqual([]);
    });

    test("what a provider reported is read, never written", () => {
      expect(allowed("list", "email_message_events")).toEqual([
        "admin",
        "manager",
        "rep",
      ]);
      for (const action of ["create", "edit", "delete"]) {
        expect(allowed(action, "email_message_events")).toEqual([]);
      }
    });

    test("the automations are read by managers, switched by admins, and nobody adds or removes one", () => {
      expect(allowed("list", "email_automations")).toEqual([
        "admin",
        "manager",
      ]);
      expect(allowed("edit", "email_automations")).toEqual(["admin"]);
      for (const action of ["create", "delete"]) {
        expect(allowed(action, "email_automations")).toEqual([]);
      }
    });

    test("the provider settings and the templates are an admin's to write", () => {
      for (const action of ["list", "edit"]) {
        expect(allowed(action, "email_settings")).toEqual(["admin"]);
      }
      expect(allowed("list", "email_templates")).toEqual([
        "admin",
        "manager",
        "rep",
      ]);
      for (const action of ["create", "edit", "delete"]) {
        expect(allowed(action, "email_templates")).toEqual(["admin"]);
      }
    });
  });
});
