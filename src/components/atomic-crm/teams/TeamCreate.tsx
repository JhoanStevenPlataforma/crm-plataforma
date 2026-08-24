import { Create } from "@/components/admin/create";
import { SimpleForm } from "@/components/admin/simple-form";

import { TeamInputs } from "./TeamInputs";

export function TeamCreate() {
  return (
    <Create redirect="edit">
      <SimpleForm>
        <TeamInputs />
      </SimpleForm>
    </Create>
  );
}
