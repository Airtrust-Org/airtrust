import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Fix de regressão de progressão SCORM (AW139)', () => {
  it('injeta cicloId no LOCAL_RESUME_KEY para isolar matrículas', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toContain('cicloId: ciclo?.id ?? 0,');
    expect(source).toContain('var CICLO_ID = ${cicloId};');
    expect(source).toContain(
      "var LOCAL_RESUME_KEY = MATRICULA_ID == null ? null : 'airtrust:scorm:resume:' + String(MATRICULA_ID) + ':' + String(CICLO_ID);",
    );
  });

  it('migra de forma segura o localStorage legado (sem ciclo) para a nova chave (com ciclo)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toContain(
      "var LEGACY_RESUME_KEY = MATRICULA_ID == null ? null : 'airtrust:scorm:resume:' + String(MATRICULA_ID);",
    );
    expect(source).toContain('if (!raw && LEGACY_RESUME_KEY) {');
    expect(source).toContain('raw = localStorage.getItem(LEGACY_RESUME_KEY);');
    expect(source).toContain('localStorage.setItem(LOCAL_RESUME_KEY, raw);');
    expect(source).toContain('localStorage.removeItem(LEGACY_RESUME_KEY);');
  });

  it('limpa ambas as chaves em clearLocalResumeBackup', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toContain('localStorage.removeItem(LOCAL_RESUME_KEY);');
    expect(source).toContain('if (LEGACY_RESUME_KEY) {');
    expect(source).toContain('localStorage.removeItem(LEGACY_RESUME_KEY);');
  });
});
