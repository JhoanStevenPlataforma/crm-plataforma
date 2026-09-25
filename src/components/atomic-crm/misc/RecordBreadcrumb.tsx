import { RecordRepresentation, Translate, useGetResourceLabel } from "ra-core";
import { Link } from "react-router";

import { Breadcrumb } from "@/components/admin/breadcrumb";

/**
 * Home › Resource › Record, in the topbar.
 *
 * Detail screens that draw their own layout (instead of the kit's `Show`)
 * left the topbar's breadcrumb slot empty, so a user deep in a record had
 * no trail back to the list it came from. Reads the record from context.
 */
export const RecordBreadcrumb = ({ resource }: { resource: string }) => {
  const getResourceLabel = useGetResourceLabel();
  return (
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
        <RecordRepresentation resource={resource} />
      </Breadcrumb.PageItem>
    </Breadcrumb>
  );
};
