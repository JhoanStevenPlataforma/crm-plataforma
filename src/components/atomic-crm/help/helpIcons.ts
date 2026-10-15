import {
  BookOpen,
  FileSignature,
  type LucideIcon,
  MessageCircle,
  Package,
  Rocket,
  Settings,
  Tags,
  Target,
  Users,
} from "lucide-react";

/**
 * The icons a category may carry. `help_categories.icon` stores the key, so
 * this is a closed set on purpose: a name typed into a form cannot pull an
 * arbitrary component into the page.
 */
export const HELP_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  rocket: Rocket,
  "file-signature": FileSignature,
  package: Package,
  tags: Tags,
  users: Users,
  "message-circle": MessageCircle,
  target: Target,
  settings: Settings,
};

export const HELP_ICON_CHOICES = Object.keys(HELP_ICONS).map((id) => ({
  id,
  name: id,
}));

export const helpIconOf = (name: string): LucideIcon =>
  HELP_ICONS[name] ?? BookOpen;
