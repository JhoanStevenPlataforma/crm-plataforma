/**
 * The help centre: short video tutorials grouped in categories
 * (docs/proposals/help-center.md).
 */

import type { Identifier } from "ra-core";

export type HelpCategory = {
  id: Identifier;
  slug: string;
  title: string;
  description?: string | null;
  /** A key of `HELP_ICONS`; an unknown one renders the default icon. */
  icon: string;
  rank: number;
  created_at?: string;
  updated_at?: string;
};

export type HelpTutorial = {
  id: Identifier;
  category_id: Identifier;
  slug: string;
  title: string;
  description?: string | null;
  steps: string[];
  /** Storage paths in the `help-media` bucket, never addresses. */
  video_path?: string | null;
  poster_path?: string | null;
  captions_path?: string | null;
  duration_seconds?: number | null;
  rank: number;
  /** A draft is visible to admins only (RLS). */
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
};
