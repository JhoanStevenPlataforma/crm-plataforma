import type { Team } from "../types";
import { TeamCreate } from "./TeamCreate";
import { TeamEdit } from "./TeamEdit";
import { TeamList } from "./TeamList";

export default {
  list: TeamList,
  create: TeamCreate,
  edit: TeamEdit,
  recordRepresentation: (record: Team) => record.name,
};
