import type { TranslateFunction } from "ra-core";

/**
 * "1 won / 3 lost" as message arguments, each count pluralised on its own.
 *
 * A single template carrying two numbers cannot be pluralised (Polyglot
 * inflects on `smart_count` alone), which is how "1 ganadas" reached the
 * screen. The templates that use this (`crm.analytics.kpi.decided`,
 * `crm.teams_dashboard.decided_deals`) only arrange the two phrases.
 */
export const decidedCounts = (
  translate: TranslateFunction,
  won: number,
  lost: number,
): { won: string; lost: string } => ({
  won: translate("crm.common.won_n", { smart_count: won }),
  lost: translate("crm.common.lost_n", { smart_count: lost }),
});
