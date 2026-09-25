import {
  Award,
  BadgeCheck,
  Cpu,
  GraduationCap,
  Handshake,
  Lightbulb,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * FX-10: the icons a highlight may carry — a closed list of names, never a free
 * string, so a deck can only name an icon the portal knows how to draw.
 */
export const QUOTE_PORTAL_ICONS = {
  award: Award,
  idea: Lightbulb,
  team: Users,
  growth: TrendingUp,
  chip: Cpu,
  rocket: Rocket,
  badge: BadgeCheck,
  shield: ShieldCheck,
  graduation: GraduationCap,
  handshake: Handshake,
} as const satisfies Record<string, LucideIcon>;

export type QuotePortalIconName = keyof typeof QUOTE_PORTAL_ICONS;
