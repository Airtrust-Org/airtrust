import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('operational reliability audit round 3 guards', () => {
  it('keeps the frontend delete route admin-only', () => {
    const source = read('src/routes/pasta-virtual.ts');
    expect(source).toContain("app.delete('/delete/:id', auth(), requireRole('admin')");
  });

  it('keeps server ficha PDF pagination and atomic optimistic writes', () => {
    const pdf = read('src/services/pdf-ficha.service.ts');
    const route = read('src/routes/simuladores-fichas.ts');
    expect((pdf.match(/pdfDoc\.addPage/g) || []).length).toBeGreaterThan(1);
    expect(pdf).toContain('addContinuationPage');
    expect(pdf).toContain('rowHeight');
    expect(route).toContain('FICHA_SEM_MANOBRAS');
    expect(route).toContain('FICHA_CONCURRENT_UPDATE');
    expect(route).toContain("const rawUpdatedAt = a['updated_at']");
    expect(route).not.toContain('(a as any).updated_at');
    expect(route).toContain('const headerStatementIndex = statements.length');
    expect(route).toContain('const batchResults = await c.env.DB.batch(statements)');
    expect(route).toContain('batchResults[headerStatementIndex]?.meta?.changes');
  });

  it('normalizes legacy document categories before standard naming', () => {
    const nomenclature = read('src/utils/nomenclatura-padronizada.ts');
    const legacyRoute = read('src/routes/pasta-virtual-extra.ts');
    expect(nomenclature).toContain('normalizarTipoDocumento');
    expect(nomenclature).toContain("case 'SIMULADOR'");
    expect(nomenclature).toContain("return 'TREINAMENTO'");
    expect(legacyRoute).toContain('tipo: normalizarTipoDocumento(tipoDocumento)');
  });

  it('keeps tenant-scoped catalog and compliance mutations', () => {
    const aeronaves = read('src/routes/aeronaves.ts');
    const compliance = read('src/routes/compliance-requisitos.ts');
    expect(aeronaves).toContain('Aeronave em uso não pode ser excluída');
    expect(compliance).toMatch(/UPDATE requisitos_compliance[\s\S]*empresa_id = \?/);
  });
});
