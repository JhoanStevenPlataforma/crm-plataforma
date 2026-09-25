import * as React from "react";
import type { ReactNode } from "react";
import { Children } from "react";
import type { FormProps } from "ra-core";
import { Form } from "ra-core";
import { cn } from "@/lib/utils";
import { CancelButton } from "@/components/admin/cancel-button";
import { FormDirtyState, SaveButton } from "@/components/admin/form";

/**
 * A simple form layout with vertical stacking, validation, and default toolbar.
 *
 * Automatically includes a toolbar with Cancel and Save buttons unless you provide a custom toolbar.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/simpleform/ SimpleForm documentation}
 *
 * @example
 * import { Create, SimpleForm, TextInput } from '@/components/admin';
 *
 * const PostCreate = () => (
 *   <Create>
 *     <SimpleForm>
 *       <TextInput source="title" />
 *       <TextInput source="body" />
 *     </SimpleForm>
 *   </Create>
 * );
 */
export const SimpleForm = ({
  children,
  className,
  toolbar = defaultFormToolbar,
  ...rest
}: SimpleFormProps) => (
  <Form
    // On its own surface: a form floating on the page ground reads as
    // unfinished. Forms already inside a Card pass `FORM_IN_CARD_CLASS`.
    className={cn(
      "flex w-full flex-col gap-4 rounded-xl border border-border/80 bg-card p-6 shadow-card",
      FORM_EDGE_CLASS,
      className,
    )}
    {...rest}
  >
    {children}
    {toolbar}
  </Form>
);

/**
 * A sticky form toolbar with default Cancel and Save buttons.
 *
 * Provides a consistent action bar for forms that sticks to the bottom of the viewport. By default,
 * renders Cancel and Save buttons, but you can provide custom buttons as children.
 *
 * @example
 * import { FormToolbar, CancelButton, SaveButton } from '@/components/admin';
 *
 * const CustomToolbar = () => (
 *     <FormToolbar>
 *         <CancelButton />
 *         <SaveButton label="Publish" />
 *     </FormToolbar>
 * );
 */
export const FormToolbar = ({
  children,
  className,
  ...rest
}: FormToolbarProps) => (
  <div
    {...rest}
    className={cn(
      "sticky pt-4 pb-4 md:block md:pt-2 md:pb-0 bottom-0 bg-linear-to-b from-transparent to-card to-10%",
      className,
    )}
    role="toolbar"
  >
    {Children.count(children) === 0 ? (
      <div className="flex flex-row items-center gap-2 justify-end">
        <FormDirtyState className="max-sm:hidden" />
        <CancelButton />
        <SaveButton />
      </div>
    ) : (
      children
    )}
  </div>
);

export type SimpleFormProps = {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
} & FormProps;

export interface FormToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

// The form's own footer: full-bleed to the card edges, a hairline above,
// and sticky so Save stays reachable on a long form.
const defaultFormToolbar = (
  <FormToolbar className="-mx-6 -mb-6 mt-2 rounded-b-xl border-t border-border/70 bg-card/95 bg-none px-6 py-3 backdrop-blur md:py-3" />
);

/** For a `SimpleForm` already inside a Card: drops its own surface. */
export const FORM_IN_CARD_CLASS =
  "rounded-none border-0 bg-transparent p-0 shadow-none before:hidden";

/**
 * The amber hairline along the top of a record form's card: the brand as
 * light on an edge, as on the portal, never as a fill. No `overflow-hidden`
 * to clip it, which would break the sticky footer, so it is inset instead.
 */
export const FORM_EDGE_CLASS =
  "relative before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-brand/60 before:to-transparent";
