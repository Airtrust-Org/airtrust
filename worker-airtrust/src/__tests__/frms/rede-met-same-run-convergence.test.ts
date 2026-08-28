import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('FRMS REDEMET same-run convergence contract', () => {
  it('persists fresh weather evidence before exactly one final canonical recalculation', () => {
    const source = read('src/lib/frms/frms-iogp-shadow-caller.ts');
    const persistAt = source.indexOf('await persistFrmsJornadaAvaliacao(db, empresaId, result.snapshot)');
    const dynamicImportAt = source.indexOf("await import('./db-service-jornadas')");
    const finalRecalcAt = source.indexOf('await recalcularPipeline(db, jornada as FrmsJornada, LIMITES_DEFAULT)');

    expect(persistAt).toBeGreaterThan(0);
    expect(dynamicImportAt).toBeGreaterThan(persistAt);
    expect(finalRecalcAt).toBeGreaterThan(dynamicImportAt);
    expect(source.match(/await recalcularPipeline\(db, jornada as FrmsJornada, LIMITES_DEFAULT\)/g)).toHaveLength(1);
  });

  it('does not recursively invoke the shadow pipeline from recalcularPipeline itself', () => {
    const source = read('src/lib/frms/db-service-jornadas.ts');
    const functionStart = source.indexOf('export async function recalcularPipeline(');
    const nextFunction = source.indexOf('export async function calcularDiaDoCiclo(', functionStart);
    const body = source.slice(functionStart, nextFunction);

    expect(functionStart).toBeGreaterThan(0);
    expect(nextFunction).toBeGreaterThan(functionStart);
    expect(body).not.toContain('runFrmsIogpShadowForJornada');
  });

  it('keeps the observer call outside the canonical function so the second pass cannot loop', () => {
    const source = read('src/lib/frms/db-service-jornadas.ts');
    const reprocessStart = source.indexOf('export async function reprocessarTripulanteCompleto(');
    const reprocessBody = source.slice(reprocessStart);

    expect(reprocessStart).toBeGreaterThan(0);
    expect(reprocessBody).toContain('const result = await recalcularPipeline(db, j, limites)');
    expect(reprocessBody).toContain('await runFrmsIogpShadowForJornada(');
  });
});
