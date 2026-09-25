import type { EditBaseProps } from "ra-core";
import {
  EditBase,
  Translate,
  useCreatePath,
  useEditContext,
  useGetRecordRepresentation,
  useGetResourceLabel,
  useHasDashboard,
  useResourceContext,
  useResourceDefinition,
  useTranslate,
} from "ra-core";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/admin/breadcrumb";
import { cn } from "@/lib/utils";
import { ShowButton } from "@/components/admin/show-button";
import { DeleteButton } from "./delete-button";

export interface EditProps extends EditViewProps, EditBaseProps {}

/**
 * A complete edit page with breadcrumb, title, and default actions.
 *
 * Combines data fetching, form context, and UI layout for editing records. Renders breadcrumb,
 * page title, Show and Delete buttons, and wraps your form components.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/edit/ Edit documentation}
 *
 * @example
 * import { Edit, SimpleForm, BooleanInput, TextInput } from "@/components/admin";
 * import { required } from 'ra-core';
 *
 * export const CustomerEdit = () => (
 *   <Edit>
 *     <SimpleForm>
 *       <TextInput source="first_name" validate={required()} />
 *       <TextInput source="last_name" validate={required()} />
 *       <TextInput source="email" validate={required()} />
 *       <BooleanInput source="has_ordered" />
 *       <TextInput multiline source="notes" />
 *     </SimpleForm>
 *   </Edit>
 * );
 */
export const Edit = ({
  actions,
  children,
  className,
  contentClassName,
  disableBreadcrumb,
  title,
  ...rest
}: EditProps) => (
  <EditBase {...rest}>
    <EditView
      actions={actions}
      className={className}
      contentClassName={contentClassName}
      disableBreadcrumb={disableBreadcrumb}
      title={title}
    >
      {children}
    </EditView>
  </EditBase>
);

export interface EditViewProps {
  /** Width of the centred column; `max-w-4xl` by default. Wider for a
   *  screen with tables beside its form (a quote's lines, a price list). */
  contentClassName?: string;
  disableBreadcrumb?: boolean;
  title?: ReactNode | string | false;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * The view component for Edit pages with layout and UI.
 *
 * @internal
 */
export const EditView = ({
  contentClassName = "max-w-4xl",
  disableBreadcrumb,
  title,
  actions,
  className,
  children,
}: EditViewProps) => {
  const context = useEditContext();

  const resource = useResourceContext();
  if (!resource) {
    throw new Error(
      "The EditView component must be used within a ResourceContextProvider",
    );
  }
  const getResourceLabel = useGetResourceLabel();
  const translate = useTranslate();
  const listLabel = getResourceLabel(resource, 2);
  const createPath = useCreatePath();
  const listLink = createPath({
    resource,
    type: "list",
  });

  const getRecordRepresentation = useGetRecordRepresentation(resource);
  const recordRepresentation = getRecordRepresentation(context.record);

  const { hasShow } = useResourceDefinition({ resource });
  const hasDashboard = useHasDashboard();

  if (context.isLoading || !context.record) {
    return null;
  }

  return (
    // Centred, like every record form: title and form share one axis.
    <div className={cn("mx-auto flex w-full flex-col", contentClassName)}>
      {!disableBreadcrumb && (
        <Breadcrumb>
          {hasDashboard && (
            <BreadcrumbItem>
              <Link to="/">
                <Translate i18nKey="ra.page.dashboard">Home</Translate>
              </Link>
            </BreadcrumbItem>
          )}
          <BreadcrumbItem>
            <Link to={listLink}>{listLabel}</Link>
          </BreadcrumbItem>
          <BreadcrumbPage>{recordRepresentation}</BreadcrumbPage>
        </Breadcrumb>
      )}
      <div
        className={cn(
          "mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
          className,
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[1.75rem] leading-tight font-semibold">
            {title !== undefined ? title : context.defaultTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate("crm.form_page.edit_hint", { _: "" })}
          </p>
        </div>
        {actions ?? (
          <div className="flex justify-end items-center gap-2">
            {hasShow ? <ShowButton /> : null}
            <DeleteButton />
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
};
