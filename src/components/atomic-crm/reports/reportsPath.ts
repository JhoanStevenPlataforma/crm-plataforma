/**
 * Routes of the reports module.
 *
 * Three, and the split is the product: `/reports` is the library (what
 * questions exist), `/reports/new` is the builder (ask a new one), and
 * `/reports/:id` opens a saved one. `/analytics` stays what it is — the
 * executive summary — and links INTO here for the investigation.
 *
 * Not a `<Resource name="reports">`, even though `reports` is a real table:
 * react-admin's resource pages are list/edit/show over records, and a report is
 * edited by a builder rather than by a form. The table is still reachable
 * through the data provider for the saving, which is all it is needed for.
 *
 * Its own module so the navigation can link here without importing a page
 * component, which would pull the builder and every chart into the layout
 * chunk.
 */
export const REPORTS_PATH = "/reports";
export const REPORT_NEW_PATH = "/reports/new";
export const REPORT_DETAIL_PATH = "/reports/:reportId";
/**
 * Several reports rendered as one printable document.
 *
 * Declared BEFORE `/reports/:reportId` would match it, which react-router
 * already handles by ranking static segments above dynamic ones — but the two
 * being adjacent here is what makes the pair obvious to the next reader.
 */
export const REPORT_PRINT_PATH = "/reports/print";

/** Link to a saved report. */
export const reportPath = (id: number | string) => `${REPORTS_PATH}/${id}`;

/**
 * Link to the builder pre-loaded with a spec.
 *
 * This is the drill-down entry point: a KPI on `/analytics` hands over the
 * question it summarises, already scoped to the period the reader was looking
 * at, so they go from "there is a problem" to "the problem is these two people"
 * without retyping a filter.
 */
export const reportBuilderPath = (specParam: string) =>
  `${REPORT_NEW_PATH}?spec=${encodeURIComponent(specParam)}`;

/** One PDF holding the given reports, in the order they are listed. */
export const reportPrintPath = (ids: number[]) =>
  `${REPORT_PRINT_PATH}?ids=${ids.join(",")}`;
