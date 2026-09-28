import type { Contact } from "../types";
import { contactDisplayName } from "./contactName";
import { ContactCreate } from "./ContactCreate";
import { ContactEdit } from "./ContactEdit";
import { ContactList } from "./ContactList";
import { ContactShow } from "./ContactShow";

export default {
  list: ContactList,
  show: ContactShow,
  edit: ContactEdit,
  create: ContactCreate,
  recordRepresentation: (record: Contact) => contactDisplayName(record),
};
