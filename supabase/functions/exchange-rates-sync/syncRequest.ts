const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDER_KEY = /^[a-z][a-z0-9_]*$/;
/** A backfill longer than this is split by the caller; one call stays short. */
export const MAX_BACKFILL_DAYS = 366;

export type SyncRequest = {
  provider?: string;
  from?: string;
  to?: string;
};

type Parsed = { ok: true; value: SyncRequest } | { ok: false; error: string };

const isDate = (value: unknown): value is string =>
  typeof value === "string" &&
  ISO_DATE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** The request body, validated: never trust what reaches a public endpoint. */
export const parseSyncRequest = (body: unknown): Parsed => {
  const input = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const value: SyncRequest = {};

  if (input.provider !== undefined && input.provider !== null) {
    if (
      typeof input.provider !== "string" ||
      !PROVIDER_KEY.test(input.provider)
    ) {
      return { ok: false, error: "provider must be a provider key" };
    }
    value.provider = input.provider;
  }

  const hasFrom = input.from !== undefined && input.from !== null;
  const hasTo = input.to !== undefined && input.to !== null;
  if (hasFrom || hasTo) {
    if (!isDate(input.from) || !isDate(input.to)) {
      return { ok: false, error: "from and to must both be YYYY-MM-DD dates" };
    }
    const days =
      (Date.parse(`${input.to}T00:00:00Z`) -
        Date.parse(`${input.from}T00:00:00Z`)) /
      86_400_000;
    if (days < 0) {
      return { ok: false, error: "from must not be after to" };
    }
    if (days > MAX_BACKFILL_DAYS) {
      return {
        ok: false,
        error: `a backfill covers at most ${MAX_BACKFILL_DAYS} days`,
      };
    }
    value.from = input.from;
    value.to = input.to;
  }

  return { ok: true, value };
};
