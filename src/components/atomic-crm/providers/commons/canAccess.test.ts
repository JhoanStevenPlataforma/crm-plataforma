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

  test("only admins reach the user and configuration screens", () => {
    const roles: CrmRole[] = ["admin", "manager", "rep"];

    const allowed = roles.filter((role) =>
      canAccess(role, { action: "list", resource: "sales" }),
    );

    expect(allowed).toEqual(["admin"]);
  });
});
