import { createFrankfurterProvider } from "./ecbFrankfurter.ts";
import { createTrmProvider } from "./trmCo.ts";
import type { RateProvider } from "./types.ts";

/**
 * Every implemented provider, by the key its `exchange_rate_providers` row
 * carries. A row whose key is not here is reported as a failed run (so the
 * health panel shows it), never silently ignored.
 */
export const createProviderRegistry = (urls: {
  trm?: string;
  frankfurter?: string;
}): Record<string, RateProvider> => {
  const providers = [
    createTrmProvider(urls.trm),
    createFrankfurterProvider(urls.frankfurter),
  ];
  return Object.fromEntries(providers.map((p) => [p.key, p]));
};
