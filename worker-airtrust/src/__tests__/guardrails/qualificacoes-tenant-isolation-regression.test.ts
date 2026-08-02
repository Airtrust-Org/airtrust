import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = resolve(__dirname, '../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(SRC_DIR, relativePath), 'utf8');
}

describe('Qualificações tenant-isolation regression guards', () => {
  it('keeps certificate template admin operations tenant-scoped', () => {
    const source = readSource('middleware/legacy-tenant-boundaries.ts');

    expect(source).toContain("const prefix = '/api/certificados/admin/'");
    expect(source).toContain("operation === 'empresas-com-templates'");
    expect(source).toContain("operation === 'copiar-template'");
    expect(source).toContain("operation === 'ativar-template' || operation === 'templates'");
    expect(source).toContain('fromEmpresa !== empresaId || toEmpresa !== empresaId');
    expect(source).toContain('targetEmpresaId !== empresaId');
    expect(source).toContain('TENANT_SCOPE_FORBIDDEN');
  });

  it('validates matrix qualification type IDs inside the authenticated tenant', () => {
    const source = readSource('middleware/legacy-tenant-boundaries.ts');

    expect(source).toContain("pathname === '/api/matriz-treinamento/registros'");
    expect(source).toContain("pathname === '/api/matriz-treinamento/registros/bulk'");
    expect(source).toContain('FROM qualificacoes_tipos');
    expect(source).toContain('WHERE empresa_id = ?');
    expect(source).toContain('.bind(empresaId, ...normalizedIds)');
    expect(source).toContain('Number(row?.total || 0) !== normalizedIds.length');
  });

  it('validates reclassification target types inside the authenticated tenant', () => {
    const source = readSource('routes/qualificacoes-reclass.ts');

    expect(source).toContain(
      'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
    );
    expect(source).toContain('.bind(body.target_tipo_id, empresaId)');
  });

  it('limits reclassification suggestions to qualification types from the same tenant', () => {
    const source = readSource('routes/qualificacoes-reclass.ts');

    expect(source).toContain('WHERE empresa_id = ? AND deleted_at IS NULL AND categoria = ?');
    expect(source).toContain('.bind(empresaId, categoria)');
  });
});
