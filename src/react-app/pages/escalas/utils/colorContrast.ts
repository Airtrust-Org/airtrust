// FIX: [BUG 2] - Utility for contrast-safe text on solid event backgrounds.

function expandShortHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  if (hex.length === 5) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}${hex[4]}${hex[4]}`;
  }

  return hex;
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } | null {
  if (!hex.startsWith('#')) return null;

  const normalized = expandShortHex(hex.trim());
  if (normalized.length !== 7 && normalized.length !== 9) return null;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }

  return { red, green, blue };
}

// Uses the YIQ perceptual brightness formula, which aligns better with how
// humans perceive color than pure WCAG luminance for saturated hues (red, blue, purple).
// YIQ >= 128 → background is perceptually light → use dark text.
// YIQ <  128 → background is perceptually dark  → use white text.
export function getTextColorForBackground(hex: string | null | undefined): '#FFFFFF' | '#000000' {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return '#000000';

  const yiq = (rgb.red * 299 + rgb.green * 587 + rgb.blue * 114) / 1000;

  return yiq >= 128 ? '#000000' : '#FFFFFF';
}
