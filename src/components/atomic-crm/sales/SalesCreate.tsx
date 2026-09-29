import { useMutation } from "@tanstack/react-query";
import { useDataProvider, useNotify, useRedirect, useTranslate } from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";

import { FormPage } from "../misc/FormPage";
import { FormPageHeader } from "../misc/FormPageHeader";
import type { CrmDataProvider } from "../providers/types";
import type { SalesFormData } from "../types";
import { SalesInputs } from "./SalesInputs";

/** How the `users` edge function (and the demo) refuses a taken email. */
const EMAIL_TAKEN = /already exists/i;

export function SalesCreate() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const translate = useTranslate();
  const redirect = useRedirect();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async (data: SalesFormData) => {
      return dataProvider.salesCreate(data);
    },
    onSuccess: () => {
      notify("resources.sales.create.success", {
        messageArgs: {
          _: "User created. They will soon receive an email to set their password.",
        },
      });
      redirect("/sales");
    },
    onError: (error) => {
      // The `users` function answers in English; show the one refusal a user
      // can act on in their language, and the generic message otherwise.
      notify(
        EMAIL_TAKEN.test(error.message ?? "")
          ? "resources.sales.create.email_taken"
          : translate("resources.sales.create.error", {
              _: "An error occurred while creating the user.",
            }),
        { type: "error" },
      );
    },
  });
  const onSubmit: SubmitHandler<SalesFormData> = async (data) => {
    mutate(data);
  };

  return (
    // The same page anatomy as every other record form: breadcrumb and title
    // above, the form on its own card. A user has few fields, hence `narrow`.
    <FormPage narrow>
      <FormPageHeader mode="create" />
      <SimpleForm onSubmit={onSubmit as SubmitHandler<any>}>
        <SalesInputs />
      </SimpleForm>
    </FormPage>
  );
}
