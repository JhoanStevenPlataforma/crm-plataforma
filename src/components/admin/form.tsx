import * as React from "react";
import type { MouseEventHandler } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import type {
  CreateParams,
  RaRecord,
  TransformData,
  UpdateParams,
} from "ra-core";
import {
  setSubmissionErrors,
  useSaveContext,
  useTranslate,
  ValidationError,
  warning,
} from "ra-core";
import { CircleAlert, Loader2, Save } from "lucide-react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import { FormProvider, useFormContext, useFormState } from "react-hook-form";
import type { UseMutationOptions } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const Form = FormProvider;

type FormItemContextValue = {
  id: string;
  name: string;
};

const FormItemContext = createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

const useFormField = () => {
  const { getFieldState, formState } = useFormContext();
  const { id, name } = useContext(FormItemContext);

  const fieldState = getFieldState(name, formState);

  return useMemo(
    () => ({
      formItemId: id,
      formDescriptionId: `${id}-description`,
      formMessageId: `${id}-message`,
      ...fieldState,
    }),
    [id, fieldState],
  );
};

function FormField({ className, id, name, ...props }: FormItemProps) {
  const contextValue: FormItemContextValue = useMemo(
    () => ({
      id,
      name,
    }),
    [id, name],
  );

  return (
    <FormItemContext.Provider value={contextValue}>
      <div
        data-slot="form-item"
        // `content-start`: stretched beside a taller sibling (one with helper text),
        // the grid would spread the spare height between label and input.
        className={cn("grid content-start gap-2", className)}
        role="group"
        {...props}
      />
    </FormItemContext.Provider>
  );
}

type FormItemProps = Omit<React.ComponentProps<"div">, "id"> & {
  id: string;
  name: string;
};

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      // The required marker ra-core's FieldTitle appends (an aria-hidden
      // "*") takes the destructive hue, so required fields read at a glance.
      className={cn(
        "data-[error=true]:text-destructive [&_span[aria-hidden=true]]:text-destructive",
        className,
      )}
      htmlFor={formItemId}
      {...props}
    />
  );
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();

  return (
    <div
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-xs leading-relaxed", className)}
      {...props}
    />
  );
}

const FormError = ({ className, ...props }: React.ComponentProps<"p">) => {
  const { invalid, error, formMessageId } = useFormField();

  const err = error?.root?.message ?? error?.message;
  if (!invalid || !err) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn(
        "text-destructive flex items-center gap-1.5 text-xs font-medium",
        className,
      )}
      {...props}
    >
      <CircleAlert className="size-3.5 shrink-0" aria-hidden />
      <ValidationError error={err} />
    </p>
  );
};

/**
 * A button that saves form data with loading state and validation.
 *
 * Automatically handles form submission, validation, and loading states. Shows a spinner during
 * save operations and can be disabled when the form is pristine or invalid.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/savebutton/ SaveButton documentation}
 *
 * @example
 * import { SimpleForm, SaveButton } from '@/components/admin';
 *
 * const PostEdit = () => (
 *   <Edit>
 *     <SimpleForm toolbar={<SaveButton />}>
 *       // form inputs here
 *     </SimpleForm>
 *   </Edit>
 * )
 */
const SaveButton = <RecordType extends RaRecord = RaRecord>(
  props: SaveButtonProps<RecordType>,
) => {
  const {
    className,
    icon = defaultIcon,
    label = "ra.action.save",
    onClick,
    mutationOptions,
    disabled: disabledProp,
    type = "submit",
    transform,
    variant = "default",
    ...rest
  } = props;
  const translate = useTranslate();
  const form = useFormContext();
  const saveContext = useSaveContext();
  const { isValidating, isSubmitting, disabled: formDisabled } = useFormState();
  const disabled = disabledProp || isValidating || isSubmitting || formDisabled;

  warning(
    type === "submit" &&
      ((mutationOptions &&
        (mutationOptions.onSuccess || mutationOptions.onError)) ||
        transform),
    'Cannot use <SaveButton mutationOptions> props on a button of type "submit". To override the default mutation options on a particular save button, set the <SaveButton type="button"> prop, or set mutationOptions in the main view component (<Create> or <Edit>).',
  );

  const handleSubmit = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (values: any) => {
      let errors;
      if (saveContext?.save) {
        errors = await saveContext.save(values, {
          ...mutationOptions,
          transform,
        });
      }
      if (errors != null) {
        setSubmissionErrors(errors, form.setError);
      }
    },
    [form.setError, saveContext, mutationOptions, transform],
  );

  const handleClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    async (event) => {
      if (onClick) {
        onClick(event);
      }
      if (event.defaultPrevented) {
        return;
      }
      if (type === "button") {
        // this button doesn't submit the form, so it doesn't trigger useIsFormInvalid in <FormContent>
        // therefore we need to check for errors manually
        event.stopPropagation();
        await form.handleSubmit(handleSubmit)(event);
      }
    },
    [onClick, type, form, handleSubmit],
  );

  const displayedLabel = label && translate(label, { _: label });

  return (
    <Button
      variant={variant}
      type={type}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className,
      )}
      {...rest}
    >
      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon}
      {displayedLabel}
    </Button>
  );
};

const defaultIcon = <Save className="h-4 w-4" />;

/**
 * The left end of a form's action bar: says the form holds edits Save has not
 * written yet, so leaving the page is a decision rather than an accident. The
 * live region is always mounted so the change is announced.
 */
const FormDirtyState = ({ className }: { className?: string }) => {
  const translate = useTranslate();
  const { watch } = useFormContext();
  const { isDirty, isSubmitting } = useFormState();
  // `isDirty` alone lights up on a create form before anybody types: defaults
  // that arrive after mount (the current user as owner) count as edits. Only
  // a change the user made (`type === "change"`; `setValue` has no type) does.
  const [hasUserEdited, setHasUserEdited] = React.useState(false);
  React.useEffect(() => {
    const subscription = watch((_values, { type }) => {
      if (type === "change") setHasUserEdited(true);
    });
    return () => subscription.unsubscribe();
  }, [watch]);
  const isShown = hasUserEdited && isDirty && !isSubmitting;

  return (
    <div role="status" className={cn("mr-auto flex items-center", className)}>
      {isShown ? (
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground animate-in fade-in-0">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-brand ring-[3px] ring-brand/20"
          />
          {translate("crm.form_page.unsaved_changes", {
            _: "Unsaved changes",
          })}
        </span>
      ) : null}
    </div>
  );
};

interface Props<
  RecordType extends RaRecord = RaRecord,
  MutationOptionsError = unknown,
> {
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  label?: string;
  mutationOptions?: UseMutationOptions<
    RecordType,
    MutationOptionsError,
    CreateParams<RecordType> | UpdateParams<RecordType>
  >;
  transform?: TransformData;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
}

export type SaveButtonProps<RecordType extends RaRecord = RaRecord> =
  Props<RecordType> & React.ComponentProps<"button">;

export {
  // eslint-disable-next-line react-refresh/only-export-components
  useFormField,
  Form,
  FormField,
  FormLabel,
  FormControl,
  FormDescription,
  FormError,
  FormDirtyState,
  SaveButton,
};
