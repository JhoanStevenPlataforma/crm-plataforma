import {
  QUOTE_ERROR,
  QuoteRpcError,
  isQuoteRpcError,
  parseQuoteGate,
  quoteErrorMessage,
  quoteRpcError,
} from "./quoteRpc";

/**
 * The contract this file defends is one sentence from quotes §13.5: MATCH ON
 * THE KEY, NEVER ON THE MESSAGE.
 *
 * Every assertion below is about the difference between those two, because the
 * failure mode is silent in exactly one direction — a screen that reads the
 * message keeps working until somebody rewords a `raise exception`, and then
 * tells the user "something went wrong" about the one refusal they could have
 * acted on.
 */
describe("quoteRpcError", () => {
  it("takes the key from the details, which is where PostgREST puts it", () => {
    const error = quoteRpcError(
      {
        message: "quote 7 has no lines to issue",
        details: "quote_empty",
      },
      "fallback",
    );

    expect(error.key).toBe(QUOTE_ERROR.empty);
    expect(isQuoteRpcError(error)).toBe(true);
  });

  it("carries the gate the database attached, so the dialog needs no second call", () => {
    const error = quoteRpcError(
      {
        message: "above the limit",
        details: "quote_discount_exceeds_limit",
        hint: JSON.stringify({
          quote_id: 7,
          role: "rep",
          max_allowed: 10,
          effective_discount_percent: 15,
          ok: false,
          reason_required: false,
          requires_reason_above: 5,
          since: null,
          offending_line_ids: [1, 2],
        }),
      },
      "fallback",
    );

    expect(error.key).toBe(QUOTE_ERROR.discountExceedsLimit);
    expect(error.gate?.effective_discount_percent).toBe(15);
    expect(error.gate?.offending_line_ids).toEqual([1, 2]);
  });

  it("still recognises the refusal when only the message survived the trip", () => {
    // A proxy that reshapes the body must not be able to turn an actionable
    // refusal into a generic failure.
    const error = quoteRpcError(
      { message: "error: quote_draft_exists while revising", details: null },
      "fallback",
    );

    expect(error.key).toBe(QUOTE_ERROR.draftExists);
  });

  it("reports no key for a failure that is not one of ours", () => {
    const error = quoteRpcError(
      { message: "Failed to fetch", details: null },
      "fallback",
    );

    expect(error.key).toBeNull();
    expect(error.message).toBe("Failed to fetch");
  });

  it("falls back to the given message when the backend said nothing", () => {
    expect(quoteRpcError(undefined, "Failed to issue the quote").message).toBe(
      "Failed to issue the quote",
    );
  });

  it("survives a hint that is not JSON, because the refusal still stands", () => {
    const error = quoteRpcError(
      {
        message: "above the limit",
        details: "quote_discount_exceeds_limit",
        hint: "{not json",
      },
      "fallback",
    );

    expect(error.key).toBe(QUOTE_ERROR.discountExceedsLimit);
    expect(error.gate).toBeUndefined();
  });

  it("reads nothing out of an absent hint", () => {
    expect(parseQuoteGate(null)).toBeUndefined();
    expect(parseQuoteGate("")).toBeUndefined();
  });
});

describe("quoteErrorMessage", () => {
  it("names a catalogue entry per refusal, so each one can say something useful", () => {
    const error = new QuoteRpcError("x", QUOTE_ERROR.validityElapsed);

    expect(quoteErrorMessage(error)).toBe(
      "resources.quotes.errors.quote_validity_elapsed",
    );
  });

  it("sends an unrecognised failure to one generic sentence, not to Postgres prose", () => {
    expect(quoteErrorMessage(new Error("relation does not exist"))).toBe(
      "resources.quotes.errors.generic",
    );
  });
});
