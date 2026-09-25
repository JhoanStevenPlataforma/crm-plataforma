import { useId } from "react"

import { cn } from "@/lib/utils"

/*
 * The caduceus: two ribbons braided around a staff, Hermes' own sign (the
 * messenger, and the god of trade). The ribbons are the S-curves of the
 * Plataforma mark, so the loader belongs to the same family as the logo.
 *
 * Geometry is drawn vertically in a 40 x 120 box and computed once, at module
 * load. The motion is pure CSS: the braid is drawn a wavelength longer than the
 * box at each end and slides by exactly one wavelength, which lands it on an
 * identical picture, so the loop has no seam and no per-frame JavaScript.
 *
 * Depth is faked the way a helix projects: each ribbon is cut where it turns
 * round at the edge (depth 0), and the halves that face the viewer are drawn
 * over the staff, thicker and fully opaque; the far halves under it, thinner
 * and dimmer. The cuts sit at the turning points, where the change of weight
 * is least visible.
 */

const BOX_WIDTH = 40
const BOX_LENGTH = 120
const AXIS = BOX_WIDTH / 2
const AMPLITUDE = 11
const WAVELENGTH = 60
const SAMPLE_STEP = 2

type Piece = { d: string; ribbon: 0 | 1; isFront: boolean }

const buildPieces = (): Piece[] => {
  const pieces: Piece[] = []
  const quarter = WAVELENGTH / 4
  const half = WAVELENGTH / 2
  for (const ribbon of [0, 1] as const) {
    const phase = ribbon * Math.PI
    for (
      let start = -WAVELENGTH - quarter;
      start < BOX_LENGTH + WAVELENGTH;
      start += half
    ) {
      const end = start + half
      const points: string[] = []
      for (let t = start; t <= end + 0.001; t += SAMPLE_STEP) {
        const angle = (2 * Math.PI * t) / WAVELENGTH + phase
        const x = AXIS + AMPLITUDE * Math.sin(angle)
        points.push(`${x.toFixed(2)} ${t.toFixed(2)}`)
      }
      const middle = (2 * Math.PI * (start + quarter)) / WAVELENGTH + phase
      pieces.push({
        d: `M${points.join("L")}`,
        ribbon,
        isFront: Math.cos(middle) > 0,
      })
    }
  }
  return pieces
}

const PIECES = buildPieces()
const BACK_PIECES = PIECES.filter((piece) => !piece.isFront)
const FRONT_PIECES = PIECES.filter((piece) => piece.isFront)

// Ribbon 0 is the brand amber; ribbon 1 the lighter one in each theme
// (`brand-subtle` on white, `brand-strong` on ink), so the two stay apart.
const RIBBON_CLASS = ["text-brand", "text-brand-subtle dark:text-brand-strong"]

const SIZES = {
  // Below 16px thick the braid no longer reads as two ribbons.
  sm: { thickness: 16, length: 48 },
  md: { thickness: 20, length: 60 },
  lg: { thickness: 36, length: 108 },
} as const

export type HermesLoaderProps = {
  /** `vertical` for a page waiting on its content; `horizontal` inline, beside text. */
  orientation?: "vertical" | "horizontal"
  size?: keyof typeof SIZES
  /** Accessible name. Pass `null` when a visible label next to it already says it. */
  label?: string | null
  className?: string
}

/**
 * Hermes' loading indicator: a caduceus whose ribbons braid without end.
 *
 * Under `prefers-reduced-motion` the braid holds still and breathes instead.
 */
export const HermesLoader = ({
  orientation = "vertical",
  size = "md",
  label = "Loading",
  className,
}: HermesLoaderProps) => {
  // React's ids carry ":" or "«»", which `url(#…)` does not accept everywhere.
  const maskId = `hermes${useId().replace(/[^\w-]/g, "")}`
  const { thickness, length } = SIZES[size]
  const isVertical = orientation === "vertical"
  const width = isVertical ? thickness : length
  const height = isVertical ? length : thickness
  // Horizontal is the vertical drawing turned a quarter clockwise, so the
  // braid travels left to right, like a message on its way.
  const orient = isVertical
    ? undefined
    : `translate(${BOX_LENGTH} 0) rotate(90)`

  const drawPieces = (pieces: Piece[], isFront: boolean) =>
    pieces.map((piece, index) => (
      <path
        key={`${isFront ? "f" : "b"}${index}`}
        d={piece.d}
        className={RIBBON_CLASS[piece.ribbon]}
        stroke="currentColor"
        strokeWidth={isFront ? 5.5 : 3.5}
        strokeOpacity={isFront ? 1 : 0.5}
      />
    ))

  return (
    <svg
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      // Inline, not attributes: buttons and item media size every child `svg`
      // as a 16px icon, which would squash the horizontal braid to a speck.
      style={{ width, height }}
      viewBox={
        isVertical
          ? `0 0 ${BOX_WIDTH} ${BOX_LENGTH}`
          : `0 0 ${BOX_LENGTH} ${BOX_WIDTH}`
      }
      fill="none"
      strokeLinecap="round"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <defs>
        {/* The ends fade out, so the ribbons appear from and vanish into the
            staff instead of being sliced off by the box. */}
        <linearGradient
          id={`${maskId}-fade`}
          x1="0"
          y1="0"
          x2={isVertical ? "0" : "1"}
          y2={isVertical ? "1" : "0"}
        >
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.16" stopColor="white" />
          <stop offset="0.84" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        {/* Drawn in the final (viewBox) space and applied OUTSIDE the rotated
            group: Chrome resolves a mask inside a rotated group in the space
            before the rotation, which cut the horizontal braid to a stub. */}
        <mask id={`${maskId}-mask`} maskUnits="userSpaceOnUse">
          <rect
            x={isVertical ? -10 : 0}
            y={isVertical ? 0 : -10}
            width={isVertical ? BOX_WIDTH + 20 : BOX_LENGTH}
            height={isVertical ? BOX_LENGTH : BOX_WIDTH + 20}
            fill={`url(#${maskId}-fade)`}
          />
        </mask>
      </defs>
      <g mask={`url(#${maskId}-mask)`}>
        <g transform={orient}>
          <g className="animate-hermes-braid motion-reduce:animate-hermes-breathe">
            {drawPieces(BACK_PIECES, false)}
          </g>
          <line
            x1={AXIS}
            x2={AXIS}
            y1={6}
            y2={BOX_LENGTH - 6}
            className="text-border-strong"
            stroke="currentColor"
            strokeWidth={2.5}
          />
          <g className="animate-hermes-braid motion-reduce:animate-hermes-breathe">
            {drawPieces(FRONT_PIECES, true)}
          </g>
        </g>
      </g>
    </svg>
  )
}
