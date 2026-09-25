import { CancelButton } from "@/components/admin/cancel-button";
import { FormDirtyState, SaveButton } from "@/components/admin/form";

/**
 * The action bar at the foot of a record form: full-bleed to the edges of the
 * card (or dialog) it sits in, a hairline above, and sticky, so Save stays in
 * reach on a long form without scrolling to the end — the pattern of every
 * record form in HubSpot, Attio or Linear. Same anatomy as the `SimpleForm`
 * footer, so the two kinds of form end the same way.
 *
 * The negative margins undo the 1.5rem padding both `Card` (py-6 / px-6 via
 * `CardContent`) and `DialogContent` (p-6) apply.
 */
export const FormToolbar = ({ saveLabel }: { saveLabel?: string }) => (
  <div
    role="toolbar"
    className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-8 flex flex-row items-center justify-end gap-2 rounded-b-[inherit] border-t border-border/70 bg-card/95 px-6 py-3 backdrop-blur"
  >
    <FormDirtyState className="max-sm:hidden" />
    <CancelButton />
    <SaveButton label={saveLabel} />
  </div>
);
