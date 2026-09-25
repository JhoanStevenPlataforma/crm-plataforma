import { useMutation } from "@tanstack/react-query";
import {
  RecordContextProvider,
  useDataProvider,
  useEditController,
  useNotify,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";

import { FormPage } from "../misc/FormPage";
import { FormPageHeader } from "../misc/FormPageHeader";
import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { SalesInputs } from "./SalesInputs";

export function SalesEdit() {
  const { record } = useEditController();

  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const redirect = useRedirect();
  const translate = useTranslate();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      if (!record) {
        throw new Error(
          translate("resources.sales.edit.record_not_found", {
            _: "Record not found",
          }),
        );
      }
      return dataProvider.salesUpdate(record.id, data);
    },
    onSuccess: () => {
      redirect("/sales");
      notify("resources.sales.edit.success", {
        messageArgs: {
          _: "User updated successfully",
        },
      });
    },
    onError: () => {
      notify("resources.sales.edit.error", {
        type: "error",
        messageArgs: {
          _: "An error occurred. Please try again.",
        },
      });
    },
  });

  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    // The header names the user through the record context, which
    // `useEditController` alone does not provide.
    <RecordContextProvider value={record}>
      <FormPage narrow>
        <FormPageHeader mode="edit" />
        <SimpleForm onSubmit={onSubmit as SubmitHandler<any>} record={record}>
          <SalesInputs />
        </SimpleForm>
      </FormPage>
    </RecordContextProvider>
  );
}
