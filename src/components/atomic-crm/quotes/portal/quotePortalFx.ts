/**
 * The portal's visual refinements, one switch each, numbered as they were
 * proposed and approved (2026-09-23).
 *
 * TO TURN ONE OFF, set it to `false` here: every use reads `fx(n)`, and the
 * portal renders as it did before that refinement. To remove one for good,
 * search the code for its tag (`FX-07`) — every site that implements it
 * carries the tag, including the rules in `quotePortal.css`.
 *
 * These are presentation only. None changes what the quotation says, what the
 * customer can do, or what prints: every one of them is off on paper.
 */
export const PORTAL_FX = {
  // Cover
  1: true, // Slow zoom on the cover photograph
  2: true, // Heading appears word by word
  3: true, // Amber halo behind the heading
  4: true, // Animated mouse as the scroll hint
  5: true, // Fine film grain over the photograph
  // Slides
  6: true, // Giant faint slide number behind the copy
  7: true, // Alternating ground and a lit divider between slides
  8: true, // Picture frame: fine border, corner light, amber shadow
  9: true, // Picture tilts in 3D and straightens as it enters
  10: true, // An icon on every highlight
  11: true, // Highlights glow and lift on hover
  12: true, // Staggered entrance: eyebrow, heading, copy, then each highlight
  13: true, // Amber rule drawn beside the eyebrow
  // Into the quotation
  14: true, // Dark-to-light fade into the quotation
  15: true, // Quotation heading: giant faint number and an amber rule
  // Quotation card
  16: true, // Amber letterhead strip across the top of the card
  17: true, // Alternating row tint in the line table
  18: true, // Larger total with an amber glow
  19: true, // Tilted status stamp on the card
  20: true, // Deeper shadow, rounder corners
  // Conversation
  21: true, // Dark header on the conversation panel
  22: true, // Pulsing "online" dot
  23: true, // Pill-shaped fields and a round send button
  // General
  24: true, // A light sweeping along the progress bar
  25: true, // Letterhead bar shrinks once the reader scrolls
  26: true, // Label always shown beside the active navigation dot
  27: true, // Amber ring following the pointer (desktop only)
  28: true, // Display typeface (General Sans) for headings
} as const;

export type PortalFx = keyof typeof PORTAL_FX;

/** Whether refinement `n` is on. */
export const fx = (n: PortalFx): boolean => PORTAL_FX[n];
