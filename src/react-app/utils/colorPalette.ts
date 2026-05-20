/**
 * Color palette utility for consistent color assignment
 * Used for session types and other categorical data
 */

const COLOR_PALETTE = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#8B5CF6', // purple
  '#F59E0B', // yellow
  '#6366F1', // indigo
  '#EC4899', // pink
  '#14B8A6', // teal
];

/**
 * Get a color from the palette based on ID
 * Same ID will always return the same color
 */
export function getColorByIndex(id: number): string {
  const index = (id - 1) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

/**
 * Get all available colors in the palette
 */
export function getAllColors(): string[] {
  return COLOR_PALETTE;
}

/**
 * Get a contrasting text color (white for dark backgrounds, dark gray for light)
 */
export function getContrastTextColor(hexColor: string): string {
  // Simple luminance calculation
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
