import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('EVD rest evidence is fail-closed', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/escalas-evd.ts'), 'utf8');

  it('never maps missing presentation or previous cutoff to ok=true', () => {
    expect(source).toContain("if (!horaApresentacao) return { minutos: null, ok: null }");
    expect(source).toContain("if (!ultimoCorte?.hora_corte_motor) return { minutos: null, ok: null }");
    expect(source).not.toContain("if (!horaApresentacao) return { minutos: null, ok: true }");
    expect(source).not.toContain("if (!ultimoCorte?.hora_corte_motor) return { minutos: null, ok: true }");
  });

  it('blocks publication when rest evidence is unknown', () => {
    expect(source).toContain("code: 'REST_UNKNOWN'");
    expect(source).toContain('if (voo.repouso_minimo_ok == null)');
    expect(source).toContain("MSG_REST_UNKNOWN = 'Repouso mínimo não pôde ser comprovado.'");
  });

  it('stores unknown rest state as null instead of conforming by default', () => {
    expect(source).toContain('let repousoOk: number | null = null;');
    expect(source).not.toContain('let repousoOk = 1;');
  });
});
