import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SCORM fresh enrollment must respect deployed D1 schema', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/services/lms-matricula-cycle.ts'), 'utf8');
  const productionSchema = readFileSync(resolve(process.cwd(), 'migrations/0337_lms_progresso_scorm.sql'), 'utf8');

  it('preserves the NOT NULL last_commit_at contract when clearing old runtime', () => {
    expect(productionSchema).toContain('last_commit_at TEXT NOT NULL');
    expect(source).toContain("last_commit_at = datetime('now')");
    expect(source).not.toContain('last_commit_at = NULL');
    expect(source).toContain('cmi_json = NULL');
    expect(source).toContain('suspend_data = NULL');
    expect(source).toContain('session_count = 0');
  });

  it('clears the 41/41 cursor when a new 37-unit edition starts', () => {
    expect(source).toContain('ultimo_slide = 0');
    expect(source).toContain('ultima_pagina = 0');
    expect(source).toContain("status = 'NAO_INICIADO'");
    expect(source).toContain('progresso_pct = 0');
  });
});
