import { Eye, EyeOff, Lock } from "lucide-react";
import type { InputProps } from "ra-core";
import {
  FieldTitle,
  useInput,
  useResourceContext,
  useTranslate,
} from "ra-core";
import { useState } from "react";

import {
  FormControl,
  FormError,
  FormField,
  FormLabel,
} from "@/components/admin/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a lock, a reveal toggle, and room for a link.
 *
 * Built on `useInput` exactly as `admin/text-input.tsx` is, so it takes part in
 * the same form context and validation — it is a sibling of that component, not
 * a replacement for it. It lives in `login/` because the reveal toggle is a
 * sign-in affordance: on the auth screens the user is typing a password they
 * half-remember, with no other field to check it against.
 *
 * `action` puts the "forgot password?" link on the label's own line, which is
 * where a person looks for it — after the third failed attempt, not at the
 * bottom of the form.
 *
 * The toggle is `type="button"` and carries an `aria-label` that names the
 * result, not the icon: a screen reader announcing "eye" says nothing about
 * what pressing it does.
 */
export type PasswordInputProps = InputProps &
  React.ComponentProps<"input"> & {
    /** Rendered on the right of the label row, e.g. a recovery link. */
    action?: React.ReactNode;
  };

export const PasswordInput = (props: PasswordInputProps) => {
  const resource = useResourceContext(props);
  const {
    label,
    source,
    className,
    action,
    validate: _validate,
    format: _format,
    ...rest
  } = props;
  const { id, field, isRequired } = useInput(props);
  const translate = useTranslate();
  const [visible, setVisible] = useState(false);

  return (
    <FormField id={id} className={className} name={field.name}>
      <div className="flex items-baseline justify-between gap-2">
        {label !== false && (
          <FormLabel>
            <FieldTitle
              label={label}
              source={source}
              resource={resource}
              isRequired={isRequired}
            />
          </FormLabel>
        )}
        {action}
      </div>
      {/* `FormControl` is a `Slot`: it puts the field id on its DIRECT child.
          The wrapper has to sit OUTSIDE it, or the id lands on the div and the
          label points at something that is not the input — which silently
          breaks both the click-to-focus and every `getByLabel` query. */}
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <FormControl>
          <Input
            {...rest}
            {...field}
            type={visible ? "text" : "password"}
            className="px-9"
          />
        </FormControl>
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={translate(
            visible ? "crm.auth.hide_password" : "crm.auth.show_password",
          )}
          className={cn(
            "absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center",
            "rounded-md text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <FormError />
    </FormField>
  );
};
