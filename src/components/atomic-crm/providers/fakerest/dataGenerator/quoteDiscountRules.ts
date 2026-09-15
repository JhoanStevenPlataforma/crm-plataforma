import type { QuoteDiscountRule } from "../../../types";

/**
 * The discount ceilings `20260913120000_quotes_module.sql` seeds (quotes §3.1).
 *
 * `enforced_from` is null in all three rows, exactly as the migration ships
 * them: THE RULE STARTS SWITCHED OFF. Turning it on here would make demo mode
 * refuse issues the real backend allows, and — worse — would hide the fact that
 * a fresh installation has no ceiling until an admin sets one. A story that
 * wants the gate to bite sets `enforced_from` on the row it cares about.
 */
export const DEMO_QUOTE_DISCOUNT_RULES: QuoteDiscountRule[] = [
  {
    id: 1,
    role: "rep",
    max_discount_percent: 10,
    requires_reason_above: 5,
    enforced_from: null,
  },
  {
    id: 2,
    role: "manager",
    max_discount_percent: 25,
    requires_reason_above: 15,
    enforced_from: null,
  },
  {
    id: 3,
    role: "admin",
    max_discount_percent: 100,
    requires_reason_above: null,
    enforced_from: null,
  },
];
