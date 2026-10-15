/**
 * Interface text scale, as a percentage of the default root font size.
 *
 * Tailwind's size utilities are rem-based, so scaling the document root scales
 * the whole UI at once — text, controls and icons follow it together.
 */

export const TEXT_SCALE_OPTIONS = [80, 90, 100, 110, 120, 130, 140, 150] as const;

export const TEXT_SCALE_DEFAULT = 100;

const TEXT_SCALE_MIN = TEXT_SCALE_OPTIONS[0];
const TEXT_SCALE_MAX = TEXT_SCALE_OPTIONS[TEXT_SCALE_OPTIONS.length - 1];

const ROOT_FONT_SIZE_PX = 16;

export function clampTextScale(value: number): number {
  if (!Number.isFinite(value)) return TEXT_SCALE_DEFAULT;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(value)));
}

export function scalePixels(basePx: number, scale: number): number {
  return (basePx * clampTextScale(scale)) / 100;
}

/** Applies the scale to the document root; the default restores the browser size. */
export function applyTextScale(scale: number): void {
  const root = document.documentElement;
  const clamped = clampTextScale(scale);
  if (clamped === TEXT_SCALE_DEFAULT) {
    root.style.removeProperty("font-size");
  } else {
    root.style.fontSize = `${scalePixels(ROOT_FONT_SIZE_PX, clamped)}px`;
  }
}
