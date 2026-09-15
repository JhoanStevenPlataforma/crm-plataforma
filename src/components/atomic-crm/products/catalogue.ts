import { regex } from "ra-core";

import type { LabeledValue, ProductKind } from "../types";

/** `public.products.kind`, in the order its check constraint lists them. */
export const PRODUCT_KINDS: ProductKind[] = [
  "product",
  "service",
  "plan",
  "subscription",
  "concept",
];

/** Choices for a `SelectInput`, which translates `name` itself. */
export const PRODUCT_KIND_CHOICES = PRODUCT_KINDS.map((kind) => ({
  id: kind,
  name: `resources.products.kinds.${kind}`,
}));

/**
 * The label a configured value carries, or the raw value when the list no
 * longer has it. A unit removed from Settings stays on the products that use
 * it, and rendering nothing would read as "no unit".
 */
export const labelOf = (
  choices: LabeledValue[],
  value: string | null | undefined,
): string =>
  value == null || value === ""
    ? ""
    : (choices.find((choice) => choice.value === value)?.label ?? value);

/**
 * The same rule as the `currency ~ '^[A-Z]{3}$'` check on products, price lists
 * and quotes, so the form refuses what the database would.
 */
export const validateCurrencyCode = regex(
  /^[A-Z]{3}$/,
  "resources.products.validation.currency",
);

/**
 * A price list's `valid_to` may not precede its `valid_from`: the table's own
 * check constraint, said before the save instead of after it. ISO dates
 * compare correctly as strings.
 */
export const validatePeriod = (
  value: string | null | undefined,
  values: { valid_from?: string | null } | undefined,
) =>
  value && values?.valid_from && value < values.valid_from
    ? "resources.price_lists.validation.period"
    : undefined;

/** Currency inputs accept lower case and store the ISO form. */
export const toCurrencyCode = (value: string | null | undefined): string =>
  (value ?? "").trim().toUpperCase();
