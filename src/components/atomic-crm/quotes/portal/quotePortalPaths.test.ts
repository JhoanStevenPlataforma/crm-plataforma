import {
  isQuotePortalLocation,
  repairedQuotePortalHash,
  tokenFromHash,
} from "./quotePortalPaths";

const TOKEN = "ab".repeat(32);

describe("isQuotePortalLocation", () => {
  it("recognises the portal under the hash router and under a browser router", () => {
    expect(
      isQuotePortalLocation({ pathname: "/", hash: `#/quote#${TOKEN}` }),
    ).toBe(true);
    expect(
      isQuotePortalLocation({ pathname: "/quote", hash: `#${TOKEN}` }),
    ).toBe(true);
    expect(isQuotePortalLocation({ pathname: "/crm/quote", hash: "" })).toBe(
      true,
    );
  });

  // The session check is skipped on the portal. A prefix test would skip it on
  // every screen of the quotes module as well.
  it("never mistakes a screen of the quotes module for the portal", () => {
    for (const location of [
      { pathname: "/", hash: "#/quotes" },
      { pathname: "/", hash: "#/quotes/1/show" },
      { pathname: "/", hash: "#/quote-templates" },
      { pathname: "/quotes/1/show", hash: "" },
      { pathname: "/", hash: "" },
    ]) {
      expect(isQuotePortalLocation(location)).toBe(false);
    }
  });
});

describe("tokenFromHash", () => {
  it("reads the token from the fragment, with or without its #", () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash(TOKEN)).toBe(TOKEN);
  });

  it("reads nothing that is not a token", () => {
    for (const hash of [
      "",
      "#",
      "#abc",
      `#${TOKEN.toUpperCase()}`,
      `#${TOKEN}0`,
    ]) {
      expect(tokenFromHash(hash)).toBeNull();
    }
  });
});

describe("repairedQuotePortalHash", () => {
  it("puts back the # a mail provider percent-encoded in a customer link", () => {
    expect(repairedQuotePortalHash(`#/quote%23${TOKEN}`)).toBe(
      `#/quote#${TOKEN}`,
    );
  });

  it("leaves every other address alone", () => {
    for (const hash of [
      `#/quote#${TOKEN}`,
      "#/quote%23abc",
      `#/quotes%23${TOKEN}`,
      `#/quote%23${TOKEN}0`,
      "#/quotes/1/show",
      "",
    ]) {
      expect(repairedQuotePortalHash(hash)).toBeNull();
    }
  });
});
