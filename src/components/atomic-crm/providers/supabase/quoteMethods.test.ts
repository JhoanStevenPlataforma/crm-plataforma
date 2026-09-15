import { QUOTE_ERROR, isQuoteRpcError } from "../commons/quoteRpc";
import { createQuoteMethods, type QuoteRpcClient } from "./quoteMethods";

/**
 * What a data-provider method is allowed to be: a call to the one function that
 * owns the operation, with the parameters that function declares (quotes
 * §13.4).
 *
 * The assertions are about the CALL, not about the answer, because that is
 * where this layer can be wrong in a way nothing else catches: a misspelled
 * `p_token_days` is accepted by PostgREST as a missing argument, the default
 * applies, and a link quietly lasts thirty days instead of the seven a rep
 * asked for.
 */
const recorder = () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let answer: { data: unknown; error: unknown } = { data: null, error: null };

  const client: QuoteRpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return answer as { data: unknown; error: null };
    },
  };

  return {
    calls,
    methods: createQuoteMethods(() => client),
    answers: (next: { data?: unknown; error?: unknown }) => {
      answer = { data: next.data ?? null, error: next.error ?? null };
    },
  };
};

describe("quote data-provider methods", () => {
  it("asks the same function the issue will ask, for the discount gate", async () => {
    const { calls, methods, answers } = recorder();
    answers({ data: { ok: true, max_allowed: null } });

    await methods.getQuoteDiscountGate(7);

    expect(calls).toEqual([
      { fn: "quote_discount_gate", args: { p_quote_id: 7 } },
    ]);
  });

  it("sends every issue parameter, including the two different written motives", async () => {
    const { calls, methods, answers } = recorder();
    answers({ data: { quote_id: 7, token: "ab" } });

    await methods.issueQuoteVersion(7, {
      tokenDays: 7,
      tokenLabel: "Compras",
      reason: "Cierre de trimestre",
      overrideReason: "Autorizado por direccion",
    });

    expect(calls[0]).toEqual({
      fn: "issue_quote_version",
      args: {
        p_quote_id: 7,
        p_token_days: 7,
        p_token_label: "Compras",
        p_override_reason: "Autorizado por direccion",
        p_reason: "Cierre de trimestre",
      },
    });
  });

  it("defaults the link window to thirty days rather than leaving it unsaid", async () => {
    const { calls, methods, answers } = recorder();
    answers({ data: {} });

    await methods.createQuoteLink(7);

    expect(calls[0].args).toEqual({
      p_quote_id: 7,
      p_token_days: 30,
      p_token_label: null,
    });
  });

  it("moves a status through the RPC, which is the only path there is", async () => {
    const { calls, methods, answers } = recorder();
    answers({ data: { id: 7, status_key: "pending_approval" } });

    await methods.transitionQuote(7, "pending_approval");

    expect(calls[0]).toEqual({
      fn: "transition_quote",
      args: {
        p_quote_id: 7,
        p_to_status: "pending_approval",
        p_reason: null,
      },
    });
  });

  it("passes the revision reason, which the database refuses to do without", async () => {
    const { calls, methods, answers } = recorder();
    answers({ data: { id: 11, version_number: 2 } });

    await methods.reviseQuote(7, "El cliente pidio otro alcance");

    expect(calls[0]).toEqual({
      fn: "revise_quote",
      args: { p_quote_id: 7, p_reason: "El cliente pidio otro alcance" },
    });
  });

  it("turns a refusal into the shared error type, key and all", async () => {
    const { methods, answers } = recorder();
    answers({
      error: {
        message: "quote 7 grants 15 percent discount",
        details: "quote_discount_exceeds_limit",
        hint: JSON.stringify({ effective_discount_percent: 15, ok: false }),
      },
    });

    const failure = await methods.issueQuoteVersion(7).catch((error) => error);

    expect(isQuoteRpcError(failure)).toBe(true);
    expect(failure.key).toBe(QUOTE_ERROR.discountExceedsLimit);
    expect(failure.gate?.effective_discount_percent).toBe(15);
  });

  it("hands back nothing from a revocation: the token row carries the hash", async () => {
    const { methods, answers } = recorder();
    answers({ data: { token_hash: "should never reach a browser" } });

    await expect(methods.revokeQuoteToken(3)).resolves.toBeUndefined();
  });
});
