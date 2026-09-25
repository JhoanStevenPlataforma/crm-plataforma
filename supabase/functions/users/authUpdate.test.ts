// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildAuthUserUpdate } from "./authUpdate";

describe("buildAuthUserUpdate", () => {
  it("omits email on a non-admin self-edit (audit AUD-004)", () => {
    const update = buildAuthUserUpdate({
      isAdmin: false,
      email: "attacker-controlled@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(update.email).toBeUndefined();
    expect(update.user_metadata).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
    });
  });

  it("does not disable the account on a non-admin self-edit", () => {
    const update = buildAuthUserUpdate({
      isAdmin: false,
      disabled: true,
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(update.ban_duration).toBeUndefined();
  });

  it("lets an admin change the email", () => {
    const update = buildAuthUserUpdate({
      isAdmin: true,
      email: "new@example.com",
      firstName: "Grace",
      lastName: "Hopper",
    });

    expect(update.email).toBe("new@example.com");
  });

  it("bans the auth user when an admin disables the account", () => {
    expect(
      buildAuthUserUpdate({ isAdmin: true, disabled: true }).ban_duration,
    ).toBe("87600h");
  });

  it("clears the ban when an admin enables the account", () => {
    expect(
      buildAuthUserUpdate({ isAdmin: true, disabled: false }).ban_duration,
    ).toBe("none");
  });

  it("always applies the name change", () => {
    const update = buildAuthUserUpdate({
      isAdmin: false,
      firstName: "Edsger",
      lastName: "Dijkstra",
    });

    expect(update.user_metadata).toEqual({
      first_name: "Edsger",
      last_name: "Dijkstra",
    });
  });
});
