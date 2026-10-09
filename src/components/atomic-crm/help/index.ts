import type { HelpCategory, HelpTutorial } from "../types";
import {
  HelpCategoryCreate,
  HelpCategoryEdit,
  HelpCategoryList,
} from "./HelpCategoryAdmin";
import {
  HelpTutorialCreate,
  HelpTutorialEdit,
  HelpTutorialList,
} from "./HelpTutorialAdmin";

export const helpCategories = {
  list: HelpCategoryList,
  create: HelpCategoryCreate,
  edit: HelpCategoryEdit,
  recordRepresentation: (record: HelpCategory) => record.title,
};

export const helpTutorials = {
  list: HelpTutorialList,
  create: HelpTutorialCreate,
  edit: HelpTutorialEdit,
  recordRepresentation: (record: HelpTutorial) => record.title,
};
