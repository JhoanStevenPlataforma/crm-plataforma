import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/admin/breadcrumb";
import type { CreateBaseProps } from "ra-core";
import {
  CreateBase,
  Translate,
  useCreatePath,
  useGetResourceLabel,
  useHasDashboard,
  useLocaleState,
  useResourceContext,
  useTranslate,
} from "ra-core";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export type CreateProps = CreateViewProps & CreateBaseProps;

/**
 * A complete create page with breadcrumb, title, and actions.
 *
 * Combines data fetching, form context, and UI layout for creating new records. Renders breadcrumb
 * navigation, page title, and wraps your form components.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/create/ Create documentation}
 *
 * @example
 * import { Create, SimpleForm, TextInput } from '@/components/admin';
 *
 * export const PostCreate = () => (
 *   <Create>
 *     <SimpleForm>
 *       <TextInput source="title" />
 *       <TextInput source="body" />
 *     </SimpleForm>
 *   </Create>
 * );
 */
export const Create = ({
  actions,
  children,
  className,
  contentClassName,
  disableBreadcrumb,
  title,
  ...rest
}: CreateProps) => (
  <CreateBase {...rest}>
    <CreateView
      actions={actions}
      className={className}
      contentClassName={contentClassName}
      disableBreadcrumb={disableBreadcrumb}
      title={title}
    >
      {children}
    </CreateView>
  </CreateBase>
);

export type CreateViewProps = {
  /** Width of the centred column; `max-w-4xl` by default. Wider for a
   *  screen with tables beside its form (a quote's lines, a price list). */
  contentClassName?: string;
  actions?: ReactNode;
  disableBreadcrumb?: boolean;
  children: ReactNode;
  className?: string;
  title?: ReactNode | string | false;
};

/**
 * The view component for Create pages with layout and UI.
 *
 * @internal
 */
export const CreateView = ({
  contentClassName = "max-w-4xl",
  actions,
  disableBreadcrumb,
  title,
  children,
  className,
}: CreateViewProps) => {
  const resource = useResourceContext();
  if (!resource) {
    throw new Error(
      "The CreateView component must be used within a ResourceContextProvider",
    );
  }
  const getResourceLabel = useGetResourceLabel();
  const listLabel = getResourceLabel(resource, 2);
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  // ra-core's default title keeps the menu's capital ("Crear Producto");
  // sentence case reads as a sentence, in every locale this CRM ships.
  const defaultTitle = translate("ra.page.create", {
    name: getResourceLabel(resource, 1).toLocaleLowerCase(locale),
  });
  const createPath = useCreatePath();
  const listLink = createPath({
    resource,
    type: "list",
  });
  const hasDashboard = useHasDashboard();

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
          <BreadcrumbPage>
            <Translate i18nKey="ra.action.create">Create</Translate>
          </BreadcrumbPage>
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
            {title !== undefined ? title : defaultTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate("crm.form_page.create_hint", { _: "" })}
          </p>
        </div>
        {actions}
      </div>
      <div>{children}</div>
    </div>
  );
};
