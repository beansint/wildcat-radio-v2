/**
 * BrandPattern — the repeating "wildcat" wordmark texture, rendered as an inline
 * SVG <pattern> so it can do a TRUE brick offset (alternate columns shifted half a
 * cell) that plain CSS vertical text can't. Inline SVG uses the document's fonts, so
 * it renders in Poppins (Hurme Geometric Sans when licensed). Low opacity lets the
 * tonally-varied maroon gradient bleed through each letter → organic, like the brand
 * swatch. Replaces the raster brand-pattern-maroon.jpg.
 *
 * The tile holds two rows: row A at x=0 and row B offset by half a word (two halves
 * so it tiles seamlessly). `textLength` forces a fixed word width so the rows tile
 * with no seams regardless of the rendered font metrics. `patternTransform` rotates
 * the whole grid so the words read bottom→top (the brand's vertical, CCW lean), which
 * also turns the horizontal brick offset into the vertical column offset of the mockup.
 */
interface BrandPatternProps {
  className?: string;
  /** glyph size in SVG px (default tuned for a hero/auth pane) */
  fontSize?: number;
  /** layer opacity — keep low so the gradient shows through (prototype used ~.2) */
  opacity?: number;
}

export function BrandPattern({ className, fontSize = 110, opacity = 0.2 }: BrandPatternProps) {
  const W = Math.round(fontSize * 4.4); // forced word width (≈ natural "wildcat." width)
  const H = Math.round(fontSize * 1.04); // row pitch — rows nearly touch (interlocking)
  const id = "wc-brick";
  const textProps = {
    textLength: W,
    lengthAdjust: "spacingAndGlyphs" as const,
    fontFamily: '"Hurme Geometric Sans 4", "Poppins", system-ui, sans-serif',
    fontWeight: 800,
    fontSize,
    fill: "#2c0000",
  };
  const baseline = Math.round(fontSize * 0.78);

  return (
    <svg
      className={className}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none", zIndex: 0 }}
    >
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={W} height={H * 2} patternTransform="rotate(-90)">
          {/* row A — continuous */}
          <text x={0} y={baseline} {...textProps}>wildcat.</text>
          {/* row B — offset half a word (two halves cover the tile seamlessly) → brick */}
          <text x={-W / 2} y={baseline + H} {...textProps}>wildcat.</text>
          <text x={W / 2} y={baseline + H} {...textProps}>wildcat.</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
