import { Create } from "@/components/admin/create";
import { SimpleForm } from "@/components/admin/simple-form";

import { QuoteInputs } from "./QuoteInputs";

/**
 * A new quotation.
 *
 * `redirect="edit"` rather than the list: a quote with no lines is not a
 * document, so the save lands the rep exactly where the work continues. The
 * database seeds version 1 as the editable draft on insert, so the line editor
 * has something to write to the moment this form returns.
 *
 * `valid_until` and `terms` are posted to `quotes` HERE and nowhere else: on
 * insert they seed version 1, and afterwards the header is a server-kept mirror
 * that refuses a changed value (§13.2).
 */
export const QuoteCreate = () => (
  <Create redirect="edit">
    <SimpleForm>
      <QuoteInputs />
    </SimpleForm>
  </Create>
);
