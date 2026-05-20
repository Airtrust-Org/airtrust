-- Migration 0291: Add color column to tipos_sessao
-- Date: 2026-03-25
-- Purpose: Add automatic color support for session types

ALTER TABLE tipos_sessao ADD COLUMN cor TEXT DEFAULT '#3B82F6';

-- Assign different colors based on id (color palette has 8 colors)
-- Use CASE with modulo to distribute colors evenly
UPDATE tipos_sessao
SET cor = CASE ((id - 1) % 8)
  WHEN 0 THEN '#3B82F6'  -- blue
  WHEN 1 THEN '#EF4444'  -- red
  WHEN 2 THEN '#10B981'  -- green
  WHEN 3 THEN '#8B5CF6'  -- purple
  WHEN 4 THEN '#F59E0B'  -- yellow
  WHEN 5 THEN '#6366F1'  -- indigo
  WHEN 6 THEN '#EC4899'  -- pink
  WHEN 7 THEN '#14B8A6'  -- teal
  ELSE '#3B82F6'
END
WHERE cor IS NULL OR cor = '#3B82F6';
