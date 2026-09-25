import {
  RecordRepresentation,
  Translate,
  useGetResourceLabel,
  useLocaleState,
  useResourceContext,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";

import { Breadcrumb } from "@/components/admin/breadcrumb";
import { PageHeader } from "@/components/admin/page-header";

/**
 * Breadcrumb and title for a create / edit screen that draws its own form
 * (instead of the kit's `Create` / `Edit`, which bring both). Without it those
 * screens opened on a bare form: no name, and no trail back to the list.
 */
export const FormPageHeader = ({ mode }: { mode: "create" | "edit" }) => {
  const resource = useResourceContext();
  const translate = useTranslate();
  const getResourceLabel = useGetResourceLabel();
  const [locale = "en"] = useLocaleState();
  if (!resource) return null;
  // Sentence case in the title ("Crear contacto", not "Crear Contacto"): the
  // resource label is capitalised for menus, and every locale this CRM ships
  // writes common nouns in lower case mid-sentence.
  const singular = getResourceLabel(resource, 1).toLocaleLowerCase(locale);

  return (
    <>
      <Breadcrumb>
        <Breadcrumb.Item>
          <Link to="/">
            <Translate i18nKey="ra.page.dashboard">Home</Translate>
          </Link>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <Link to={`/${resource}`}>{getResourceLabel(resource, 2)}</Link>
        </Breadcrumb.Item>
        <Breadcrumb.PageItem>
          {mode === "create" ? (
            <Translate i18nKey="ra.action.create">Create</Translate>
          ) : (
            <RecordRepresentation />
          )}
        </Breadcrumb.PageItem>
      </Breadcrumb>
      <PageHeader
        title={
          mode === "create" ? (
            translate("ra.page.create", { name: singular })
          ) : (
            <RecordRepresentation />
          )
        }
        description={translate(
          mode === "create"
            ? "crm.form_page.create_hint"
            : "crm.form_page.edit_hint",
        )}
      />
    </>
  );
};
