import { CELL, Q1, Q2 } from './escalaTokens';

export const QUINZENA_TOKENS = {
  Q1,
  Q2,
} as const;

export const GEOMETRY_TOKENS = {
  DAY_CELL_WIDTH: CELL.width,
  DAY_CELL_HEIGHT: CELL.height,
  DAY_CELL_RADIUS: CELL.radius,
  DAY_CELL_GAP_X: CELL.gap,
  DAY_CELL_GAP_Y: CELL.rowGap,
  DAY_CELL_INNER_BAR_HEIGHT: CELL.pillHeight,
  DAY_CELL_INNER_BAR_RADIUS: CELL.pillRadius,
  DAY_ROW_MIN_HEIGHT: CELL.rowHeight,
  DAY_ROW_PADDING_Y: CELL.rowPaddingY,
};
